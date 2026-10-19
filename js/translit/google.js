import { alignChunks } from './align.js';
import { isPurelyLatin, mapLimit, fetchWithRetry, chunkArray, stripMarkers } from './utils.js';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const ROMANIZE_BATCH = 40;

async function requestTranslation(text, target, signal) {
  const url = `${ENDPOINT}?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
  const data = await (await fetchWithRetry(url, {}, { signal })).json();
  return (data?.[0] || []).map((seg) => seg?.[0] || '').join('') || text;
}

export async function googleTranslate(texts, target, { signal, onProgress } = {}) {
  const unique = [...new Set(texts.filter((t) => t && t.trim()))];
  const results = new Map();
  let done = 0;
  await mapLimit(unique, 6, async (text) => {
    results.set(text, await requestTranslation(text, target, signal));
    if (onProgress) onProgress(++done, unique.length);
  }, signal);
  return texts.map((t) => (t && t.trim() ? results.get(t) : ''));
}

async function requestRomanization(text, signal) {
  const url = `${ENDPOINT}?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`;
  const data = await (await fetchWithRetry(url, {}, { signal })).json();
  const full = (data?.[0] || []).map((seg) => seg?.[3] || seg?.[0] || '').join('');
  if (!full) return text.split('|');
  return full.replace(/\s*\|\s*/g, '|').split('|');
}

async function romanizeBatch(batch, signal) {
  const clean = batch.map((t) => t.replace(/\|/g, ' '));
  const parts = await requestRomanization(clean.join('|'), signal);
  if (parts.length === batch.length) return parts;
  return mapLimit(clean, 4, async (t) => (await requestRomanization(t, signal)).join(' '), signal);
}

async function romanizeTexts(texts, signal) {
  const unique = [...new Set(texts.filter((t) => t && t.trim() && !isPurelyLatin(t)))];
  const results = new Map();
  await mapLimit(chunkArray(unique, ROMANIZE_BATCH), 3, async (batch) => {
    const out = await romanizeBatch(batch, signal);
    batch.forEach((t, i) => results.set(t, out[i] || t));
  }, signal);
  return texts.map((t) => results.get(t) ?? t);
}

export async function googleRomanize(lines, { signal } = {}) {
  const texts = lines.map((l) => stripMarkers(l.text));
  const sylLists = lines.map((l) => (l.syllables || []).map(stripMarkers));
  const [full, isolated] = await Promise.all([
    romanizeTexts(texts, signal),
    romanizeTexts(sylLists.flat(), signal)
  ]);

  let cursor = 0;
  return lines.map((line, i) => {
    const syls = sylLists[i];
    const guides = isolated.slice(cursor, cursor + syls.length);
    cursor += syls.length;
    const fullRom = full[i] || texts[i];
    if (!syls.length) return { text: fullRom, chunks: [] };
    const chunks = alignChunks(fullRom, guides, syls);
    return { text: chunks.join(''), chunks };
  });
}
