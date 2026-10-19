import { alignChunks } from './align.js';
import { guessGuides } from './offline.js';
import {
  fetchWithRetry, parseJsonLoose, chunkArray, mapLimit, stripMarkers, isInTargetScript, throwIfAborted, normalizeForCompare
} from './utils.js';
import {
  translationSystemPrompt, romanizationSystemPrompt, repairPrompt, detectSourceScripts
} from './prompts.js';

const MAX_ATTEMPTS = 3;
const TRANSLATE_BATCH = 50;
const ROMANIZE_BATCH = 25;

export const AI_PROVIDERS = ['gemini', 'openrouter'];

async function callGemini({ settings, system, messages, signal }) {
  const model = settings.geminiModel;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.2 }
  };
  if (!/gemma/i.test(model)) body.generationConfig.responseMimeType = 'application/json';
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.geminiApiKey },
      body: JSON.stringify(body)
    },
    { signal, retries: 2 }
  );
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('');
  if (!text) throw new Error(data?.promptFeedback?.blockReason ? `Blocked: ${data.promptFeedback.blockReason}` : 'Empty Gemini response');
  return text;
}

async function callOpenRouter({ settings, system, messages, signal }) {
  const send = async (jsonMode) => {
    const body = {
      model: settings.openRouterModel,
      temperature: 0.2,
      messages: [{ role: 'system', content: system }, ...messages]
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    const res = await fetchWithRetry(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.openRouterApiKey}` },
        body: JSON.stringify(body)
      },
      { signal, retries: 2 }
    );
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error(data?.error?.message || 'Empty OpenRouter response');
    return text;
  };
  try {
    return await send(true);
  } catch (error) {
    if (error.status === 400) return send(false);
    throw error;
  }
}

const CALLERS = { gemini: callGemini, openrouter: callOpenRouter };

export function hasAiKey(provider, settings) {
  if (provider === 'gemini') return !!settings.geminiApiKey;
  if (provider === 'openrouter') return !!settings.openRouterApiKey;
  return false;
}

async function converse({ provider, settings, system, firstMessage, validate, signal }) {
  const call = CALLERS[provider];
  const messages = [{ role: 'user', content: firstMessage }];
  const accepted = new Map();
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    throwIfAborted(signal);
    let reply;
    try {
      reply = await call({ settings, system, messages, signal });
      const { valid, missing } = validate(parseJsonLoose(reply), accepted);
      valid.forEach((value, key) => accepted.set(key, value));
      if (missing.length === 0) return accepted;
      messages.push({ role: 'assistant', content: reply }, { role: 'user', content: repairPrompt(validate.label, missing) });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      if (error.status === 401 || error.status === 403 || error.status === 404) throw error;
      if (reply) messages.push({ role: 'assistant', content: reply }, { role: 'user', content: 'That was not valid JSON for the requested schema. Return only the JSON object.' });
    }
  }
  if (accepted.size === 0) throw lastError || new Error('AI returned no usable result');
  return accepted;
}

function translationValidator(expected) {
  const validate = (json, accepted) => {
    const items = Array.isArray(json?.translations) ? json.translations : Array.isArray(json) ? json : [];
    const valid = new Map();
    for (const item of items) {
      const i = Number(item?.i);
      const t = typeof item?.t === 'string' ? item.t.trim() : '';
      if (expected.has(i) && t && !accepted.has(i)) valid.set(i, t);
    }
    const missing = [...expected].filter((i) => !accepted.has(i) && !valid.has(i));
    return { valid, missing };
  };
  validate.label = 'translation';
  return validate;
}

export async function aiTranslate(texts, { provider, settings, langCode, langName, song, signal, onProgress }) {
  const indexed = texts.map((text, i) => ({ i, text })).filter((x) => x.text && x.text.trim());
  const system = translationSystemPrompt({ langCode, langName, song });
  const batches = chunkArray(indexed, TRANSLATE_BATCH);
  const out = new Array(texts.length).fill('');
  let done = 0;

  await mapLimit(batches, 2, async (batch) => {
    const expected = new Set(batch.map((x) => x.i));
    const payload = JSON.stringify({ lines: batch.map((x) => ({ i: x.i, text: x.text })) });
    const result = await converse({
      provider, settings, system, signal,
      firstMessage: `Translate these ${batch.length} lines.\n${payload}`,
      validate: translationValidator(expected)
    });
    result.forEach((t, i) => { out[i] = t; });
    done += batch.length;
    if (onProgress) onProgress(done, indexed.length);
  }, signal);

  return out;
}

const LETTERS = /[\p{L}\p{N}]/gu;
const letterCount = (text) => (String(text || '').match(LETTERS) || []).length;

// Weak models (e.g. flash-lite) often return chunks that join back to the line text but are
// misplaced: a punctuation-only chunk ("'"), or one chunk swallowing its neighbours.
function chunksLookSane(chunkTexts, syllables) {
  let guides;
  try { guides = guessGuides(syllables); } catch { guides = syllables; }
  for (let k = 0; k < syllables.length; k++) {
    if (!syllables[k].trim()) continue;
    const n = letterCount(chunkTexts[k]);
    if (letterCount(syllables[k]) > 0 && n === 0) return false;
    const g = letterCount(guides[k]);
    if (g >= 2 && n > g * 4 + 4) return false;
  }
  return true;
}

function romanizationValidator(items, targetScript) {
  const byIndex = new Map(items.map((x) => [x.i, x]));
  const validate = (json, accepted) => {
    const list = Array.isArray(json?.romanized_lyrics) ? json.romanized_lyrics : [];
    const valid = new Map();
    for (const entry of list) {
      const i = Number(entry?.original_line_index);
      const src = byIndex.get(i);
      if (!src || accepted.has(i) || typeof entry?.text !== 'string' || !entry.text.trim()) continue;
      if (!isInTargetScript(entry.text, targetScript)) continue;
      let chunks = null;
      if (src.syllables.length) {
        const raw = Array.isArray(entry.chunk) ? entry.chunk : [];
        const sorted = [...raw].sort((a, b) => (a?.chunkIndex ?? 0) - (b?.chunkIndex ?? 0));
        const texts = sorted.map((c) => (typeof c?.text === 'string' ? c.text : ''));
        if (texts.length === src.syllables.length && texts.every((t, k) => t.trim() || !src.syllables[k].trim())) {
          if (targetScript !== 'latin' && !texts.every((t, k) => !src.syllables[k].trim() || isInTargetScript(t.trim(), targetScript))) continue;
          // Weak models repeat or drop words inside chunks (e.g. "Shollallahu | allah | 'ala"):
          // if the chunks don't spell the same line as "text", discard them entirely.
          const sameLine = normalizeForCompare(texts.join('')) === normalizeForCompare(entry.text);
          chunks = sameLine && chunksLookSane(texts, src.syllables) ? texts : null;
        }
      }
      valid.set(i, { text: entry.text, chunks });
    }
    const missing = items.map((x) => x.i).filter((i) => !accepted.has(i) && !valid.has(i));
    return { valid, missing };
  };
  validate.label = 'romanization';
  return validate;
}

function finalizeRomanization(item, result) {
  const { text, chunks } = result;
  if (!item.syllables.length) return { text, chunks: [] };
  if (chunks && chunks.join('') === text) return { text, chunks };
  const guides = chunks || guessGuides(item.syllables);
  const aligned = alignChunks(text, guides, item.syllables);
  return { text: aligned.join(''), chunks: aligned };
}

export async function aiRomanize(lines, { provider, settings, targetScript = 'latin', targetLang, song, signal, onProgress }) {
  const items = lines.map((l, i) => ({
    i,
    text: stripMarkers(l.text),
    syllables: (l.syllables || []).map(stripMarkers)
  })).filter((x) => x.text.trim());

  const scripts = detectSourceScripts(items.map((x) => x.text));
  const system = romanizationSystemPrompt({ scripts, targetScript, targetLang, song });
  const out = new Array(lines.length).fill(null);
  let done = 0;

  await mapLimit(chunkArray(items, ROMANIZE_BATCH), 2, async (batch) => {
    const payload = batch.map((x) => ({
      original_line_index: x.i,
      text: x.text,
      ...(x.syllables.length ? { chunk: x.syllables.map((t, k) => ({ chunkIndex: k, text: t })) } : {})
    }));
    const result = await converse({
      provider, settings, system, signal,
      firstMessage: `Transliterate these ${batch.length} lines.\n${JSON.stringify({ lyrics: payload })}`,
      validate: romanizationValidator(batch, targetScript)
    });
    batch.forEach((item) => {
      const r = result.get(item.i);
      if (r) out[item.i] = finalizeRomanization(item, r);
    });
    done += batch.length;
    if (onProgress) onProgress(done, items.length);
  }, signal);

  return out;
}
