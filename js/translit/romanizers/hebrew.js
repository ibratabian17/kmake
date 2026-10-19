const HEBREW_CONSONANTS = {
  '\u05D0': '',
  '\u05D1': 'v',
  '\u05D2': 'g',
  '\u05D3': 'd',
  '\u05D4': 'h',
  '\u05D5': 'v',
  '\u05D6': 'z',
  '\u05D7': 'ch',
  '\u05D8': 't',
  '\u05D9': 'y',
  '\u05DA': 'kh',
  '\u05DB': 'kh',
  '\u05DC': 'l',
  '\u05DD': 'm',
  '\u05DE': 'm',
  '\u05DF': 'n',
  '\u05E0': 'n',
  '\u05E1': 's',
  '\u05E2': '',
  '\u05E3': 'f',
  '\u05E4': 'f',
  '\u05E5': 'tz',
  '\u05E6': 'tz',
  '\u05E7': 'k',
  '\u05E8': 'r',
  '\u05E9': 'sh',
  '\u05EA': 't'
};

const HEBREW_VOWELS = {
  '\u05B0': 'e',
  '\u05B1': 'e',
  '\u05B2': 'a',
  '\u05B3': 'o',
  '\u05B4': 'i',
  '\u05B5': 'e',
  '\u05B6': 'e',
  '\u05B7': 'a',
  '\u05B8': 'a',
  '\u05B9': 'o',
  '\u05BA': 'o',
  '\u05BB': 'u',
  '\u05C7': 'o'
};

export class HebrewRomanizer {
  static romanize(text) {
    if (!text) return '';
    return this.romanizeLine(text);
  }

  static romanizeLine(lineText) {
    if (!lineText) return '';

    const tokens = lineText.match(/[\u0590-\u05FF]+|[^\u0590-\u05FF]+/gu) || [lineText];
    let result = '';

    for (const token of tokens) {
      if (/[\u0590-\u05FF]/u.test(token)) {
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

    const hasNiqqud = /[\u05B0-\u05C7]/u.test(word);
    if (hasNiqqud) {
      return this.romanizePointed(word);
    }

    return this.romanizeUnpointed(word);
  }

  static romanizePointed(word) {
    const chars = Array.from(word);
    const len = chars.length;
    let result = '';
    let i = 0;

    while (i < len) {
      const c = chars[i];

      if (c >= '\u0591' && c <= '\u05AF') {
        i++;
        continue;
      }

      if (HEBREW_VOWELS[c] !== undefined) {
        i++;
        continue;
      }

      let base = HEBREW_CONSONANTS[c] !== undefined ? HEBREW_CONSONANTS[c] : c;
      let hasDagesh = false;
      let isShin = true;
      let vowel = '';
      let j = i + 1;

      while (j < len && ((chars[j] >= '\u0591' && chars[j] <= '\u05AF') || HEBREW_VOWELS[chars[j]] !== undefined || chars[j] === '\u05BC' || chars[j] === '\u05C1' || chars[j] === '\u05C2')) {
        const mark = chars[j];
        if (mark === '\u05BC') {
          hasDagesh = true;
        } else if (mark === '\u05C1') {
          isShin = true;
        } else if (mark === '\u05C2') {
          isShin = false;
        } else if (HEBREW_VOWELS[mark] !== undefined) {
          vowel = HEBREW_VOWELS[mark];
        }
        j++;
      }

      if (c === '\u05E9') {
        base = isShin ? 'sh' : 's';
      }

      if (hasDagesh) {
        if (c === '\u05D1') base = 'b';
        else if (c === '\u05DB' || c === '\u05DA') base = 'k';
        else if (c === '\u05E4' || c === '\u05E3') base = 'p';
        else if (c === '\u05D5') {

          base = 'u';
          vowel = '';
        }
      }

      if (c === '\u05D5' && !vowel && !hasDagesh) {
        if (result.endsWith('o') || result.endsWith('u')) {
          base = '';
        }
      }

      if (c === '\u05D9' && !vowel && (result.endsWith('i') || result.endsWith('e'))) {
        base = '';
      }

      if (vowel === 'e' && j >= len) {
        vowel = '';
      }

      result += base + vowel;
      i = j;
    }

    return result;
  }

  static romanizeUnpointed(word) {

    const unpointedMap = {
      'שלום': 'shalom',
      'תודה': 'toda',
      'אהבה': 'ahava',
      'אתה': 'ata',
      'את': 'at',
      'אני': 'ani',
      'אנחנו': 'anachnu',
      'הוא': 'hu',
      'היא': 'hi',
      'הם': 'hem',
      'הן': 'hen',
      'מה': 'ma',
      'מי': 'mi',
      'איך': 'eikh',
      'למה': 'lama',
      'כי': 'ki',
      'אם': 'im',
      'עם': 'im',
      'על': 'al',
      'אל': 'el',
      'כל': 'kol',
      'לא': 'lo',
      'כן': 'ken',
      'יש': 'yesh',
      'אין': 'ein',
      'טוב': 'tov',
      'רע': 'ra',
      'יום': 'yom',
      'לילה': 'layla',
      'שיר': 'shir',
      'מוזיקה': 'muzika',
      'לב': 'lev',
      'עיניים': 'einayim',
      'ירושלים': 'yerushalayim',
      'ישראל': 'yisrael',
      'עולם': 'olam',
      'אלוהים': 'elohim',
      'רק': 'rak',
      'עוד': 'od',
      'בוא': 'bo',
      'בואי': 'boi',
      'שוב': 'shuv',
      'הכל': 'hakol',
      'תמיד': 'tamid',
      'עכשיו': 'akhshav',
      'חיים': 'chayim',
      'יפה': 'yafe',
      'רוצה': 'rotze',
      'יודע': 'yodea',
      'הנה': 'hine',
      'לבד': 'levad',
      'יחד': 'yachad',
      'דרך': 'derekh',
      'גשם': 'geshem',
      'שמש': 'shemesh',
      'אור': 'or',
      'זמן': 'zman'
    };

    if (unpointedMap[word]) return unpointedMap[word];

    let result = '';
    const chars = Array.from(word);
    const len = chars.length;

    for (let i = 0; i < len; i++) {
      const c = chars[i];
      let base = HEBREW_CONSONANTS[c] !== undefined ? HEBREW_CONSONANTS[c] : c;

      if (c === '\u05D5') {
        if (i === 0) base = 'v';
        else if (i === len - 1) base = 'o';
        else base = 'o';
      } else if (c === '\u05D9') {
        if (i === 0) base = 'y';
        else if (i === len - 1) base = 'i';
        else base = 'i';
      } else if (c === '\u05D0' && i === 0) {
        base = 'a';
      } else if (c === '\u05D4' && i === len - 1) {
        base = 'a';
      }

      result += base;
    }

    return result;
  }
}
