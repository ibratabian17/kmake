import { OfflineRomanizer } from './dispatcher.js';
import { getTokenizer } from './kuromoji.js';
import { stripMarkers, throwIfAborted } from './utils.js';

const COUNTED_SCRIPTS = [
  ['hebrew', /[\u0590-\u05FF]/g],
  ['devanagari', /[\u0900-\u097F]/g],
  ['thai', /[\u0E00-\u0E7F]/g],
  ['greek', /[\u0370-\u03FF\u1F00-\u1FFF]/g],
  ['arabic', /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g],
  ['korean', /[\uAC00-\uD7A3\u3131-\u318E]/g],
  ['cyrillic', /\p{Script=Cyrillic}/gu]
];

export function detectLanguageContext(texts) {
  const joined = texts.join(' ');
  const count = (re) => (joined.match(re) || []).length;
  const kana = count(/[\u3040-\u309F\u30A0-\u30FF]/g);
  const han = count(/[\u4E00-\u9FFF]/g);

  const scores = COUNTED_SCRIPTS.map(([name, re]) => [name, count(re)]);
  scores.push(['japanese', kana], ['chinese', kana > 0 ? 0 : han]);

  let best = 'unknown';
  let bestCount = 0;
  for (const [name, n] of scores) {
    if (n > bestCount) {
      best = name;
      bestCount = n;
    }
  }
  return best;
}

export function supportsOffline(context) {
  return context !== 'unknown';
}

export async function romanizeOffline(lines, { signal, languageHint } = {}) {
  const context = languageHint || detectLanguageContext(lines.map((l) => l.text));
  const tokenizer = context === 'japanese' ? await getTokenizer() : null;

  return lines.map((line) => {
    throwIfAborted(signal);
    const text = stripMarkers(line.text);
    if (!text.trim()) return { text: '', chunks: [] };

    if (!line.syllables || line.syllables.length === 0) {
      const rom = OfflineRomanizer.romanizeLine(text, context, tokenizer);
      return { text: rom, chunks: [] };
    }

    const syllables = line.syllables.map((t) => ({ text: stripMarkers(t) }));
    const chunks = OfflineRomanizer.romanizeLineSyllables(syllables, text, context, tokenizer)
      .map((c) => c.text);
    return { text: chunks.join(''), chunks };
  });
}

export function guessGuides(syllableTexts) {
  const clean = syllableTexts.map(stripMarkers);
  const text = clean.join('');
  try {
    const context = detectLanguageContext([text]);
    return OfflineRomanizer.romanizeLineSyllables(clean.map((t) => ({ text: t })), text, context, null).map((c) => c.text);
  } catch {
    return clean;
  }
}
