import { romanizeOffline, detectLanguageContext } from './offline.js';
import { googleRomanize, googleTranslate } from './google.js';
import { aiRomanize, aiTranslate, hasAiKey, AI_PROVIDERS } from './ai.js';
import { languageName } from './languages.js';
import { stripMarkers, isInTargetScript, isPurelyLatin, normalizeForCompare, throwIfAborted } from './utils.js';

const SETTINGS_KEY = 'kmake_translit_settings_v1';

const DEFAULTS = {
  romanizationProvider: 'offline',
  translationProvider: 'google',
  targetLang: 'en',
  targetScript: 'latin',
  advancedRomanization: false,
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openRouterApiKey: '',
  openRouterModel: 'google/gemini-2.5-flash'
};

let current = null;

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = {
  get() {
    if (!current) current = load();
    return current;
  },
  set(patch) {
    current = { ...this.get(), ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
    } catch {}
    return current;
  },
  defaults: DEFAULTS
};

const cache = new Map();

const normalizeLine = (line) => {
  const syllables = (line.syllables || []).map(stripMarkers);
  const text = syllables.length ? syllables.join('') : stripMarkers(line.text);
  return { text, syllables };
};

const romanKey = (provider, script, line) => `${provider}|${script}|${line.text}|${line.syllables.join('\u0001')}`;

function providerChain(selected, kind, s) {
  const chain = [selected];
  if (kind === 'romanize') {
    if (selected !== 'offline') chain.push('offline');
    if (selected !== 'google') chain.push('google');
  } else if (selected !== 'google') {
    chain.push('google');
  }
  AI_PROVIDERS.forEach((p) => {
    if (!chain.includes(p) && hasAiKey(p, s)) chain.push(p);
  });
  return chain.filter((p) => !AI_PROVIDERS.includes(p) || hasAiKey(p, s));
}

async function runRomanizer(provider, lines, ctx) {
  const s = settings.get();
  if (provider === 'offline') {
    if (ctx.targetScript !== 'latin') return lines.map(() => null);
    return romanizeOffline(lines, { signal: ctx.signal });
  }
  if (provider === 'google') {
    if (ctx.targetScript !== 'latin') return lines.map(() => null);
    return googleRomanize(lines, { signal: ctx.signal });
  }
  return aiRomanize(lines, {
    provider, settings: s, targetScript: ctx.targetScript, targetLang: languageName(s.targetLang),
    song: ctx.song, signal: ctx.signal, onProgress: ctx.onProgress
  });
}

// Google (and some AI models) return scholarly marks for Arabic/Hebrew (yā habīb, ḥ, ʿ).
// Lyric romanization is plain Latin, so strip them: ā -> a, ḥ -> h, ʿ -> '.
const SEMITIC = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const toPlainLatin = (str) => String(str || '')
  .normalize('NFD').replace(/\p{M}/gu, '').replace(/[ʿʾʻʼ‘’`]/g, "'").normalize('NFC');

function plainifyResult(result, line, script) {
  if (!result || script !== 'latin' || !SEMITIC.test(line.text)) return result;
  return { ...result, text: toPlainLatin(result.text), chunks: (result.chunks || []).map(toPlainLatin) };
}

const isResolved = (result, line, targetScript) =>
  !!result && !!result.text && (targetScript === 'latin' ? isPurelyLatin(result.text) : isInTargetScript(result.text, targetScript));

export async function romanizeLines(rawLines, { provider, targetScript, song, signal, onProgress } = {}) {
  const s = settings.get();
  const selected = provider || s.romanizationProvider;
  const script = targetScript || s.targetScript;
  const lines = rawLines.map(normalizeLine);
  const results = new Array(lines.length).fill(null);

  const pending = [];
  lines.forEach((line, i) => {
    if (!line.text.trim() || isInTargetScript(line.text, script)) return;
    const hit = cache.get(romanKey(selected, script, line));
    if (hit) results[i] = hit;
    else pending.push(i);
  });

  let remaining = pending;
  let lastError = null;
  let chain = providerChain(selected, 'romanize', s);
  if (selected === 'offline' && script === 'latin' && pending.length) {
    const ctx = detectLanguageContext(pending.map((i) => lines[i].text));
    if (ctx === 'arabic' || ctx === 'hebrew') {
      chain = ['google', ...chain.filter((n) => n !== 'google' && n !== 'offline'), 'offline'];
    }
  }
  for (const name of chain) {
    if (!remaining.length) break;
    throwIfAborted(signal);
    if (name === 'offline' && script === 'latin') {
      const ctx = detectLanguageContext(remaining.map((i) => lines[i].text));
      if (ctx === 'unknown') continue;
    }
    try {
      const batch = remaining.map((i) => lines[i]);
      const out = (await runRomanizer(name, batch, { targetScript: script, song, signal, onProgress }))
        .map((res, k) => plainifyResult(res, batch[k], script));
      const next = [];
      remaining.forEach((lineIndex, k) => {
        if (isResolved(out[k], lines[lineIndex], script)) {
          results[lineIndex] = out[k];
          cache.set(romanKey(selected, script, lines[lineIndex]), out[k]);
        } else {
          next.push(lineIndex);
        }
      });
      remaining = next;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
    }
  }

  if (remaining.length && remaining.length === pending.length && lastError) throw lastError;
  return results;
}

export async function translateLines(rawTexts, { provider, targetLang, song, signal, onProgress } = {}) {
  const s = settings.get();
  const selected = provider || s.translationProvider;
  const lang = targetLang || s.targetLang;
  const texts = rawTexts.map(stripMarkers);
  const results = new Array(texts.length).fill('');
  const keyOf = (name, text) => `${name}|${lang}|${text}`;

  let remaining = [];
  texts.forEach((t, i) => {
    if (!t.trim()) return;
    const hit = cache.get(keyOf(selected, t));
    if (hit !== undefined) results[i] = hit;
    else remaining.push(i);
  });

  const total = remaining.length;
  let lastError = null;
  for (const name of providerChain(selected, 'translate', s)) {
    if (!remaining.length) break;
    throwIfAborted(signal);
    try {
      const batch = remaining.map((i) => texts[i]);
      const out = AI_PROVIDERS.includes(name)
        ? await aiTranslate(batch, {
          provider: name, settings: s, langCode: lang, langName: languageName(lang), song, signal,
          onProgress: (d) => onProgress && onProgress(total - remaining.length + d, total)
        })
        : await googleTranslate(batch, lang, {
          signal, onProgress: (d) => onProgress && onProgress(total - remaining.length + d, total)
        });
      const next = [];
      remaining.forEach((lineIndex, k) => {
        if (out[k]) {
          results[lineIndex] = out[k];
          cache.set(keyOf(selected, texts[lineIndex]), out[k]);
        } else {
          next.push(lineIndex);
        }
      });
      remaining = next;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
    }
  }

  if (remaining.length === total && total > 0 && lastError) throw lastError;
  return results.map((t, i) => (t && normalizeForCompare(t) !== normalizeForCompare(texts[i]) ? t : ''));
}

export { hasAiKey };
