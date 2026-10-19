const VOWELS_INDEPENDENT = {
  '\u0904': 'e',
  '\u0905': 'a',
  '\u0906': 'aa',
  '\u0907': 'i',
  '\u0908': 'ee',
  '\u0909': 'u',
  '\u090A': 'oo',
  '\u090B': 'ri',
  '\u090C': 'li',
  '\u090D': 'e',
  '\u090E': 'e',
  '\u090F': 'e',
  '\u0910': 'ai',
  '\u0911': 'o',
  '\u0912': 'o',
  '\u0913': 'o',
  '\u0914': 'au'
};

const VOWELS_DEPENDENT = {
  '\u093E': 'aa',
  '\u093F': 'i',
  '\u0940': 'ee',
  '\u0941': 'u',
  '\u0942': 'oo',
  '\u0943': 'ri',
  '\u0944': 'ree',
  '\u0945': 'e',
  '\u0946': 'e',
  '\u0947': 'e',
  '\u0948': 'ai',
  '\u0949': 'o',
  '\u094A': 'o',
  '\u094B': 'o',
  '\u094C': 'au',
  '\u0962': 'li',
  '\u0963': 'lee'
};

const CONSONANTS = {
  '\u0915': 'k',   '\u0916': 'kh',  '\u0917': 'g',   '\u0918': 'gh',  '\u0919': 'ng',
  '\u091A': 'ch',  '\u091B': 'chh', '\u091C': 'j',   '\u091D': 'jh',  '\u091E': 'ny',
  '\u091F': 't',   '\u0920': 'th',  '\u0921': 'd',   '\u0922': 'dh',  '\u0923': 'n',
  '\u0924': 't',   '\u0925': 'th',  '\u0926': 'd',   '\u0927': 'dh',  '\u0928': 'n',
  '\u0929': 'n',   '\u092A': 'p',   '\u092B': 'ph',  '\u092C': 'b',   '\u092D': 'bh',
  '\u092E': 'm',   '\u092F': 'y',   '\u0930': 'r',   '\u0931': 'r',   '\u0932': 'l',
  '\u0933': 'l',   '\u0934': 'l',   '\u0935': 'v',   '\u0936': 'sh',  '\u0937': 'sh',
  '\u0938': 's',   '\u0939': 'h',

  '\u0958': 'q',   '\u0959': 'kh',  '\u095A': 'gh',  '\u095B': 'z',
  '\u095C': 'r',   '\u095D': 'rh',  '\u095E': 'f',   '\u095F': 'y'
};

const VIRAMA = '\u094D';
const NUKTA = '\u093C';
const ANUSVARA = '\u0902';
const CANDRABINDU = '\u0901';
const VISARGA = '\u0903';

export class DevanagariRomanizer {
  static romanize(text) {
    if (!text) return '';
    return this.romanizeLine(text);
  }

  static romanizeLine(lineText) {
    if (!lineText) return '';

    const tokens = lineText.match(/[\u0900-\u097F]+|[^\u0900-\u097F]+/gu) || [lineText];
    let result = '';

    for (const token of tokens) {
      if (/[\u0900-\u097F]/u.test(token)) {
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

    let result = '';
    const chars = Array.from(word);
    const len = chars.length;
    let i = 0;

    while (i < len) {
      const c = chars[i];

      if (VOWELS_INDEPENDENT[c] !== undefined) {
        result += VOWELS_INDEPENDENT[c];
        i++;
        continue;
      }

      if (VOWELS_DEPENDENT[c] !== undefined) {
        result += VOWELS_DEPENDENT[c];
        i++;
        continue;
      }

      if (c === ANUSVARA || c === CANDRABINDU) {
        result += 'n';
        i++;
        continue;
      }
      if (c === VISARGA) {
        result += 'h';
        i++;
        continue;
      }

      if (CONSONANTS[c] !== undefined) {
        let base = CONSONANTS[c];
        let j = i + 1;

        if (j < len && chars[j] === NUKTA) {
          if (c === '\u0915') base = 'q';
          else if (c === '\u0916') base = 'kh';
          else if (c === '\u0917') base = 'gh';
          else if (c === '\u091C') base = 'z';
          else if (c === '\u0921') base = 'r';
          else if (c === '\u0922') base = 'rh';
          else if (c === '\u092B') base = 'f';
          j++;
        }

        if (c === '\u091C' && j + 1 < len && chars[j] === VIRAMA && chars[j + 1] === '\u091E') {
          base = 'gy';
          j += 2;
        } else if (j < len && chars[j] === VIRAMA) {
          result += base;
          i = j + 1;
          continue;
        }

        let matra = '';
        if (j < len && VOWELS_DEPENDENT[chars[j]] !== undefined) {
          matra = VOWELS_DEPENDENT[chars[j]];
          j++;
        }

        let nasal = '';
        if (j < len && (chars[j] === ANUSVARA || chars[j] === CANDRABINDU)) {
          nasal = 'n';
          j++;
        } else if (j < len && chars[j] === VISARGA) {
          nasal = 'h';
          j++;
        }

        if (matra) {
          result += base + matra + nasal;
        } else {

          const isWordFinal = j >= len;
          let dropSchwa = isWordFinal;

          if (!isWordFinal && i > 0 && j < len) {

            let k = j;
            if (CONSONANTS[chars[k]] !== undefined) {
              k++;
              if (k < len && chars[k] === NUKTA) k++;
              if (k < len && VOWELS_DEPENDENT[chars[k]] !== undefined) {
                dropSchwa = true;
              }
            }
          }

          const vowel = dropSchwa ? '' : 'a';
          result += base + vowel + nasal;
        }

        i = j;
        continue;
      }

      result += c;
      i++;
    }

    return result;
  }
}
