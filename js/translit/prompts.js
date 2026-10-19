export const SOURCE_RULES = {
  japanese: 'JAPANESE: modified Hepburn. Particles は=wa, へ=e, を=o. Long vowels as ou/ei/aa/ii/uu. っ doubles the next consonant. Keep natural word spacing (verb + auxiliaries stay joined, particles stay separate).',
  korean: 'KOREAN: Revised Romanization of the pronounced form. Apply liaison inside a word (좋을 -> jo eul, 맘은 -> ma meun) and separate every syllable block of a word with a single space (어쩌면 -> eo jjeo myeon).',
  chinese: 'CHINESE: Hanyu Pinyin with tone marks, one space between syllables of different words.',
  thai: 'THAI: RTGS, plain Latin letters only, no tone marks or diacritics.',
  hindi: 'HINDI/DEVANAGARI: apply schwa deletion (कमल -> kamal), keep vowel length (aa, ee, oo), render conjuncts as pronounced.',
  tamil: 'TAMIL: preserve long vowels (aa, ii, uu), ழ -> zh, casual film-song conventions.',
  telugu: 'TELUGU: preserve long vowels and aspirates, casual film-song conventions.',
  punjabi: 'PUNJABI/GURMUKHI: keep conventional written forms (ਘਰ -> ghar), long vowels aa/ee/oo.',
  russian: 'CYRILLIC: practical lyric-site romanization (ж zh, х kh, ц ts, ч ch, ш sh, щ shch, ю yu, я ya, й y), soft sign dropped.',
  hebrew: 'HEBREW: modern Israeli pronunciation, ח/כ -> kh, ע silent, no niqqud assumed.',
  greek: 'GREEK: pronounce digraphs (μπ b/mb, ντ d/nd, αυ af/av, ευ ef/ev), θ th, δ dh, χ ch.',
  arabic: 'ARABIC: infer the artist context. Egyptian/Levantine pop: ج g, ق \' (glottal). Indonesian/Malay nasheed or target id: ش sy, ث ts, ذ dz, ض dh, ص sh, ح h, ع \' (e.g. sholawat, \'alaik, Muhammad). Otherwise common Gulf/MSA lyric spelling. Add the short vowels the singer pronounces. Write long vowels as plain letters, never with macrons or accents (salam, habibi, Allah); ayn/hamza is a straight apostrophe attached to the following letters.'

};

const SOURCE_PATTERNS = {
  arabic: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/,
  japanese: /[\u3040-\u309F\u30A0-\u30FF]/,
  korean: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/,
  chinese: /[\u4E00-\u9FFF]/,
  thai: /[\u0E00-\u0E7F]/,
  hindi: /[\u0900-\u097F]/,
  tamil: /[\u0B80-\u0BFF]/,
  telugu: /[\u0C00-\u0C7F]/,
  punjabi: /[\u0A00-\u0A7F]/,
  russian: /[\u0400-\u04FF]/,
  hebrew: /[\u0590-\u05FF]/,
  greek: /[\u0370-\u03FF]/
};

export const TARGET_SCRIPTS = {
  latin: 'Latin',
  japanese: 'Japanese Katakana',
  korean: 'Korean Hangul',
  cyrillic: 'Cyrillic',
  devanagari: 'Devanagari',
  arabic: 'Arabic (no harakat)',
  hebrew: 'Hebrew (no niqqud)',
  greek: 'Greek',
  thai: 'Thai'
};

export function detectSourceScripts(texts) {
  const joined = texts.join('\n');
  const found = Object.keys(SOURCE_PATTERNS).filter((k) => SOURCE_PATTERNS[k].test(joined));
  if (found.includes('japanese')) return found.filter((k) => k !== 'chinese');
  return found;
}

const songBlock = (song) => (song && (song.title || song.artist)
  ? `Song: "${song.title || ''}" by ${song.artist || 'unknown'}${song.language ? ` (language: ${song.language})` : ''}.\n`
  : '');

export function translationSystemPrompt({ langCode, langName, song }) {
  return `You are an expert song-lyrics translator.
${songBlock(song)}Translate every input line into ${langName} (${langCode}). The lines are consecutive lyrics of one song: use neighbouring lines for context.

Rules:
1. Translate everything that is not already standard ${langName}, whatever its script or dialect (regional Latin-script languages included). Keep a line unchanged only if it is already standard ${langName}.
2. Translate meaning and tone; render idioms and slang naturally. Never invent words, subjects or verbs that the source does not imply.
3. Preserve repetition and interjections (la-la-la, ooh), punctuation, casing and parentheses.
4. Return exactly one item per input item, keeping its "i".

Respond with JSON only: {"translations":[{"i":0,"t":"translated line"}]}`;
}

export function romanizationSystemPrompt({ scripts, targetScript, targetLang, song }) {
  const latin = targetScript === 'latin';
  const label = TARGET_SCRIPTS[targetScript] || 'Latin';
  const rules = scripts.map((s) => SOURCE_RULES[s]).filter(Boolean).join('\n');
  return `You are a phonetic transliteration engine for song lyrics.
${songBlock(song)}Write how each line SOUNDS in natural singing, using ${label} script. This is not translation: never replace words with equivalents.${latin ? ` Follow the spelling conventions readers of ${targetLang || 'English'} expect.` : ''}

${rules ? `Source rules:\n${rules}\n\n` : ''}Structure rules (the output is machine-parsed):
1. One output item per input item, same "original_line_index".
2. "text" is the whole transliterated line.
3. If an input line has "chunk", output "chunk" with the same number of entries and the same "chunkIndex" values. Each entry is the transliteration of THAT chunk only, keeping its leading/trailing spaces, and all chunk texts joined together must equal "text" exactly. Never merge chunks, never leave one empty, and never output a chunk that is only punctuation: an apostrophe (hamza/ayn) belongs to the letters it precedes, inside the same chunk. When one spoken word covers two chunks (assimilation, liaison), cut the romanized word at the nearest syllable boundary between them instead of putting it all in one chunk.
4. Text already in ${label} script stays as is. Keep punctuation, digits and spacing.${latin ? `\n5. Use plain ASCII letters only (a-z, A-Z) plus the straight apostrophe. NEVER use diacritics, macrons, dots below or special letters (ā ī ū ḥ ṣ ḍ ṭ ẓ ġ š ʿ ʾ are forbidden). The only exception is Chinese Pinyin tone marks.` : `\n5. No source-script letters may remain; every chunk must contain ${label} letters.`}

Respond with JSON only: {"romanized_lyrics":[{"original_line_index":0,"text":"...","chunk":[{"chunkIndex":0,"text":"..."}]}]}`;
}

export const repairPrompt = (what, indices) =>
  `Your previous answer was missing, invalid or incomplete for ${what} index(es): [${indices.join(', ')}]. Return ONLY those items again as the same JSON object, nothing else.`;
