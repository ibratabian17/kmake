const GREEK_SINGLE_MAP = {
  '\u03B1': 'a',  '\u0391': 'A',
  '\u03B2': 'v',  '\u0392': 'V',
  '\u03B3': 'g',  '\u0393': 'G',
  '\u03B4': 'd',  '\u0394': 'D',
  '\u03B5': 'e',  '\u0395': 'E',
  '\u03B6': 'z',  '\u0396': 'Z',
  '\u03B7': 'i',  '\u0397': 'I',
  '\u03B8': 'th', '\u0398': 'Th',
  '\u03B9': 'i',  '\u0399': 'I',
  '\u03BA': 'k',  '\u039A': 'K',
  '\u03BB': 'l',  '\u039B': 'L',
  '\u03BC': 'm',  '\u039C': 'M',
  '\u03BD': 'n',  '\u039D': 'N',
  '\u03BE': 'ks', '\u039E': 'Ks',
  '\u03BF': 'o',  '\u039F': 'O',
  '\u03C0': 'p',  '\u03A0': 'P',
  '\u03C1': 'r',  '\u03A1': 'R',
  '\u03C3': 's',  '\u03C2': 's',  '\u03A3': 'S',
  '\u03C4': 't',  '\u03A4': 'T',
  '\u03C5': 'y',  '\u03A5': 'Y',
  '\u03C6': 'f',  '\u03A6': 'F',
  '\u03C7': 'ch', '\u03A7': 'Ch',
  '\u03C8': 'ps', '\u03A8': 'Ps',
  '\u03C9': 'o',  '\u03A9': 'O',

  '\u03AC': 'a',  '\u0386': 'A',
  '\u03AD': 'e',  '\u0388': 'E',
  '\u03AE': 'i',  '\u0389': 'I',
  '\u03AF': 'i',  '\u038A': 'I',
  '\u03CA': 'i',  '\u03AA': 'I',
  '\u0390': 'i',
  '\u03CC': 'o',  '\u038C': 'O',
  '\u03CD': 'y',  '\u038E': 'Y',
  '\u03CB': 'y',  '\u03AB': 'Y',
  '\u03B0': 'y',
  '\u03CE': 'o',  '\u038F': 'O'
};

const VOICED_CHARS = new Set([
  'α', 'ά', 'ε', 'έ', 'η', 'ή', 'ι', 'ί', 'ϊ', 'ΐ', 'ο', 'ό', 'υ', 'ύ', 'ϋ', 'ΰ', 'ω', 'ώ',
  'β', 'γ', 'δ', 'ζ', 'λ', 'μ', 'ν', 'ρ',
  'Α', 'Ά', 'Ε', 'Έ', 'Η', 'Ή', 'Ι', 'Ί', 'Ϊ', 'Ο', 'Ό', 'Υ', 'Ύ', 'Ϋ', 'Ω', 'Ώ',
  'Β', 'Γ', 'Δ', 'Ζ', 'Λ', 'Μ', 'Ν', 'Ρ'
]);

export class GreekRomanizer {
  static romanize(text) {
    if (!text) return '';
    return this.romanizeLine(text);
  }

  static romanizeLine(lineText) {
    if (!lineText) return '';

    const tokens = lineText.match(/[\u0370-\u03FF\u1F00-\u1FFF]+|[^\u0370-\u03FF\u1F00-\u1FFF]+/gu) || [lineText];
    let result = '';

    for (const token of tokens) {
      if (/[\u0370-\u03FF\u1F00-\u1FFF]/u.test(token)) {
        result += this.romanizeWord(token);
      } else {
        result += token;
      }
    }

    return result;
  }

  static romanizeSyllables(syllables) {
    if (!Array.isArray(syllables)) return [];

    return syllables.map(s => {
      const origText = s.text || '';
      const match = origText.match(/^(\s*)(.*?)(\s*)$/);
      const leadingSpace = match ? match[1] : '';
      const coreText = match ? match[2] : origText;
      const trailingSpace = match ? match[3] : '';

      if (!coreText) return { text: origText };

      const romCore = this.romanizeLine(coreText).trim();
      return { text: leadingSpace + romCore + trailingSpace };
    });
  }

  static romanizeWord(word) {
    if (!word) return '';

    const normalized = word.normalize('NFD')
      .replace(/[\u0300\u0301\u0342]/g, '\u0301')
      .replace(/[\u0313\u0314\u0345]/g, '')
      .normalize('NFC');

    const chars = Array.from(normalized);
    const len = chars.length;
    let result = '';
    let i = 0;

    while (i < len) {
      const c = chars[i];
      const next = i + 1 < len ? chars[i + 1] : '';
      const lowerC = c.toLowerCase();
      const lowerNext = next.toLowerCase();

      if ((lowerC === 'α' || lowerC === 'ά') && (lowerNext === 'ι' || lowerNext === 'ί')) {
        const isUpper = (c === 'Α' || c === 'Ά');
        result += isUpper ? 'E' : 'e';
        i += 2;
        continue;
      }

      if (((lowerC === 'ε' || lowerC === 'έ') || (lowerC === 'ο' || lowerC === 'ό') || (lowerC === 'υ' || lowerC === 'ύ')) && (lowerNext === 'ι' || lowerNext === 'ί')) {
        const isUpper = (c === 'Ε' || c === 'Έ' || c === 'Ο' || c === 'Ό' || c === 'Υ' || c === 'Ύ');
        result += isUpper ? 'I' : 'i';
        i += 2;
        continue;
      }

      if ((lowerC === 'α' || lowerC === 'ά') && (lowerNext === 'υ' || lowerNext === 'ύ')) {
        const nextNext = i + 2 < len ? chars[i + 2] : '';
        const isVoiced = VOICED_CHARS.has(nextNext);
        const vSound = isVoiced ? 'v' : 'f';
        const isUpper = (c === 'Α' || c === 'Ά');
        result += isUpper ? ('A' + vSound) : ('a' + vSound);
        i += 2;
        continue;
      }

      if ((lowerC === 'ε' || lowerC === 'έ') && (lowerNext === 'υ' || lowerNext === 'ύ')) {
        const nextNext = i + 2 < len ? chars[i + 2] : '';
        const isVoiced = VOICED_CHARS.has(nextNext);
        const vSound = isVoiced ? 'v' : 'f';
        const isUpper = (c === 'Ε' || c === 'Έ');
        result += isUpper ? ('E' + vSound) : ('e' + vSound);
        i += 2;
        continue;
      }

      if ((lowerC === 'η' || lowerC === 'ή') && (lowerNext === 'υ' || lowerNext === 'ύ')) {
        const nextNext = i + 2 < len ? chars[i + 2] : '';
        const isVoiced = VOICED_CHARS.has(nextNext);
        const vSound = isVoiced ? 'v' : 'f';
        const isUpper = (c === 'Η' || c === 'Ή');
        result += isUpper ? ('I' + vSound) : ('i' + vSound);
        i += 2;
        continue;
      }

      if ((lowerC === 'ο' || lowerC === 'ό') && (lowerNext === 'υ' || lowerNext === 'ύ')) {
        const isUpper = (c === 'Ο' || c === 'Ό');
        result += isUpper ? 'Ou' : 'ou';
        i += 2;
        continue;
      }

      if (lowerC === 'μ' && lowerNext === 'π') {
        const isWordInitial = (i === 0);
        const isUpper = (c === 'Μ');
        if (isWordInitial) {
          result += isUpper ? 'B' : 'b';
        } else {
          result += isUpper ? 'Mb' : 'mb';
        }
        i += 2;
        continue;
      }

      if (lowerC === 'ν' && lowerNext === 'τ') {
        const isWordInitial = (i === 0);
        const isUpper = (c === 'Ν');
        if (isWordInitial) {
          result += isUpper ? 'D' : 'd';
        } else {
          result += isUpper ? 'Nd' : 'nd';
        }
        i += 2;
        continue;
      }

      if (lowerC === 'γ' && lowerNext === 'γ') {
        const isUpper = (c === 'Γ');
        result += isUpper ? 'Ng' : 'ng';
        i += 2;
        continue;
      }

      if (lowerC === 'γ' && lowerNext === 'κ') {
        const isWordInitial = (i === 0);
        const isUpper = (c === 'Γ');
        if (isWordInitial) {
          result += isUpper ? 'G' : 'g';
        } else {
          result += isUpper ? 'Ng' : 'ng';
        }
        i += 2;
        continue;
      }

      if (lowerC === 'γ' && lowerNext === 'χ') {
        const isUpper = (c === 'Γ');
        result += isUpper ? 'Nch' : 'nch';
        i += 2;
        continue;
      }

      if (lowerC === 'γ' && lowerNext === 'ξ') {
        const isUpper = (c === 'Γ');
        result += isUpper ? 'Nks' : 'nks';
        i += 2;
        continue;
      }

      if (lowerC === 'τ' && lowerNext === 'σ') {
        const isUpper = (c === 'Τ');
        result += isUpper ? 'Ts' : 'ts';
        i += 2;
        continue;
      }
      if (lowerC === 'τ' && lowerNext === 'ζ') {
        const isUpper = (c === 'Τ');
        result += isUpper ? 'Tz' : 'tz';
        i += 2;
        continue;
      }

      if (lowerC === 'ξ') {
        const isUpper = (c === 'Ξ');
        result += isUpper ? 'Ks' : 'ks';
        i++;
        continue;
      }

      if (GREEK_SINGLE_MAP[c] !== undefined) {
        result += GREEK_SINGLE_MAP[c];
      } else {
        result += c;
      }

      i++;
    }

    return result;
  }
}
