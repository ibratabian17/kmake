const LATIN_ONLY = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]*$/u;

const SCRIPT_TESTS = {
  japanese: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  korean: /\p{Script=Hangul}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  devanagari: /\p{Script=Devanagari}/u,
  arabic: /\p{Script=Arabic}/u,
  hebrew: /\p{Script=Hebrew}/u,
  greek: /\p{Script=Greek}/u,
  thai: /\p{Script=Thai}/u,
  latin: /\p{Script=Latin}/u
};

export const stripMarkers = (text) => (text || '').replace(/]/g, '');

export const isPurelyLatin = (text) => LATIN_ONLY.test(text);

export const containsScript = (text, script) => !!text && !!SCRIPT_TESTS[script] && SCRIPT_TESTS[script].test(text);

export const isInTargetScript = (text, targetScript) => {
  if (!text) return false;
  if (!targetScript || targetScript === 'latin') return isPurelyLatin(text);
  return containsScript(text, targetScript);
};

export const baseLang = (code) => String(code || '').toLowerCase().split(/[-_]/)[0].trim();

export const normalizeForCompare = (text) => (text || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Int32Array(b.length + 1);
  let curr = new Int32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

export class AbortError extends Error {
  constructor() {
    super('Aborted');
    this.name = 'AbortError';
  }
}

export const throwIfAborted = (signal) => {
  if (signal && signal.aborted) throw new AbortError();
};

export const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal && signal.aborted) return reject(new AbortError());
  const timer = setTimeout(resolve, ms);
  if (signal) {
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new AbortError());
    }, { once: true });
  }
});

export async function mapLimit(items, limit, fn, signal) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      throwIfAborted(signal);
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function fetchWithRetry(url, init = {}, { retries = 3, baseDelay = 500, signal } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    throwIfAborted(signal);
    try {
      const response = await fetch(url, { ...init, signal });
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      let detail = response.statusText;
      try {
        const body = await response.clone().json();
        detail = body?.error?.message || body?.message || detail;
      } catch {}
      lastError = new Error(`HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
      lastError.status = response.status;
      if (!retryable) throw lastError;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      if (error.status && error.status < 500 && error.status !== 429) throw error;
    }
    if (attempt < retries) await sleep(baseDelay * 2 ** attempt, signal);
  }
  throw lastError;
}

export function parseJsonLoose(text) {
  if (!text) throw new Error('Empty response');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw error;
  }
}

export function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
