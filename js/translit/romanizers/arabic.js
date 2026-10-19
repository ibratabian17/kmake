
const ARABIC_CHAR_MAP = {
  '\u0621': "'",
  '\u0622': 'aa',
  '\u0623': 'a',
  '\u0624': "'",
  '\u0625': 'i',
  '\u0626': "'",
  '\u0627': 'a',
  '\u0671': 'a',
  '\u0670': 'aa',

  '\u0628': 'b',
  '\u0629': 'a',
  '\u062A': 't',
  '\u062B': 'th',
  '\u062C': 'j',
  '\u062D': 'h',
  '\u062E': 'kh',
  '\u062F': 'd',
  '\u0630': 'dh',
  '\u0631': 'r',
  '\u0632': 'z',
  '\u0633': 's',
  '\u0634': 'sh',
  '\u0635': 's',
  '\u0636': 'd',
  '\u0637': 't',
  '\u0638': 'z',
  '\u0639': "'",
  '\u063A': 'gh',
  '\u0640': '',
  '\u0641': 'f',
  '\u0642': 'q',
  '\u0643': 'k',
  '\u0644': 'l',
  '\u0645': 'm',
  '\u0646': 'n',
  '\u0647': 'h',
  '\u0648': 'w',
  '\u0649': 'a',
  '\u064A': 'y',

  '\u0660': '0', '\u0661': '1', '\u0662': '2', '\u0663': '3', '\u0664': '4',
  '\u0665': '5', '\u0666': '6', '\u0667': '7', '\u0668': '8', '\u0669': '9',

  '\u060C': ',', '\u061B': ';', '\u061F': '?'
};

const SUN_LETTERS = new Set([
  '\u062A',
  '\u062B',
  '\u062F',
  '\u0630',
  '\u0631',
  '\u0632',
  '\u0633',
  '\u0634',
  '\u0635',
  '\u0636',
  '\u0637',
  '\u0638',
  '\u0644',
  '\u0646'
]);

const SUN_LETTER_ROMAN = {
  '\u062A': 't',
  '\u062B': 'th',
  '\u062F': 'd',
  '\u0630': 'dh',
  '\u0631': 'r',
  '\u0632': 'z',
  '\u0633': 's',
  '\u0634': 'sh',
  '\u0635': 's',
  '\u0636': 'd',
  '\u0637': 't',
  '\u0638': 'z',
  '\u0644': 'l',
  '\u0646': 'n'
};

const HARAKAT = {
  '\u064B': 'an',
  '\u064C': 'un',
  '\u064D': 'in',
  '\u064E': 'a',
  '\u064F': 'u',
  '\u0650': 'i',
  '\u0651': 'SHADDAH',
  '\u0652': 'SUKUN',
  '\u0670': 'aa'
};

export class ArabicRomanizer {

  static options = { longVowels: 'double', dropCaseEndings: 'pause' };

  static romanize(text) {
    return this.romanizeVocalizedLine(text || '');
  }

  static romanizeLine(lineText) {
    return this.romanizeVocalizedLine(lineText || '');
  }

  static romanizeSyllables(syllables) {
    if (!Array.isArray(syllables)) return [];

    const textAt = k => syllables[k]?.text || '';
    const countLetters = t => (t.match(/[\u0621-\u064A\u0671]/gu) || []).length;

    return syllables.map((s, idx) => {
      const origText = textAt(idx);
      const match = origText.match(/^(\s*)(.*?)(\s*)$/);
      const leadingSpace = match ? match[1] : '';
      const coreText = match ? match[2] : origText;
      const trailingSpace = match ? match[3] : '';

      if (!coreText) return { text: origText };

      const prevSyllableText = idx > 0 ? textAt(idx - 1) : '';
      const prevWord = prevSyllableText.trim().replace(/[\u064B-\u0652\u0670\u0640]/g, '');

      let pauseAfter = true;
      for (let k = idx + 1; k < syllables.length; k++) {
        if (/[\u0621-\u064A\u0671]/u.test(textAt(k))) { pauseAfter = false; break; }
      }

      let wordLen = countLetters(coreText);
      for (let k = idx - 1; k >= 0; k--) {
        if (/^\s/.test(textAt(k + 1)) || /\s$/.test(textAt(k))) break;
        wordLen += countLetters(textAt(k));
      }

      const romCore = this.romanizeVocalizedLine(coreText, prevWord, prevSyllableText, false, { pauseAfter, wordLen }).trim();
      return { text: leadingSpace + romCore + trailingSpace };
    });
  }

  static romanizeVocalizedLine(lineText, initialPrevWord = '', initialPrevRaw = '', force = false, ctx = {}) {
    if (!lineText) return '';

    const tokens = lineText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+|[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/gu) || [lineText];

    let result = '';
    let lastWord = initialPrevWord;
    let lastRaw = initialPrevRaw;
    let gap = '';

    for (let idx = 0; idx < tokens.length; idx++) {
      const token = tokens[idx];
      if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u.test(token)) {
        const connectedRaw = /^[ \t\u00A0]*$/.test(gap) ? lastRaw : '';
        let k = idx + 1, between = '';
        while (k < tokens.length && !/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u.test(tokens[k])) { between += tokens[k]; k++; }
        let pause = /[^ \t\u00A0]/.test(between) || /[\u060C\u061B\u061F\u06D4]$/.test(token);
        if (!pause && k >= tokens.length) pause = ctx.pauseAfter !== undefined ? ctx.pauseAfter : true;
        result += this.romanizeWordOrPhrase(token, lastWord, connectedRaw, force, pause, ctx.wordLen || 0);
        lastWord = token.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
        lastRaw = token;
        gap = '';
      } else {
        result += token;
        gap += token;
      }
    }

    return result;
  }

  static romanizeWordOrPhrase(token, prevWord = '', prevRaw = '', force = false, pause = true, wordLen = 0) {
    if (!token) return '';

    const hasTashkeel = /[\u064B-\u0652\u0670]/u.test(token);
    if (hasTashkeel || force) {
      return this.romanizeVocalized(token, prevWord, prevRaw, pause, wordLen);
    }

    if (token === 'الله') {
      return 'Allah';
    }

    const isAfterPreposition = (prevWord === 'في' || prevWord === 'فِي' || prevWord === 'إلى' || prevWord === 'على' || prevWord === 'من');
    const artPrefix = isAfterPreposition ? 'il-' : 'al-';

    if (token.startsWith('ال') && token.length > 2) {
      const sunChar = token[2];
      const remainder = token.substring(2);

      if (SUN_LETTERS.has(sunChar)) {
        const s = SUN_LETTER_ROMAN[sunChar];
        return (isAfterPreposition ? 'i' : 'a') + s + '-' + this.phonotacticTransliterate(remainder);
      } else {
        return artPrefix + this.phonotacticTransliterate(remainder);
      }
    }

    return this.phonotacticTransliterate(token);
  }

  static findArticleEnd(chars, idx) {
    const len = chars.length;
    if (chars[idx] !== '\u0627' && chars[idx] !== '\u0671') return -1;
    let k = idx + 1;
    while (k < len && HARAKAT[chars[k]] !== undefined) k++;
    if (chars[k] !== '\u0644') return -1;
    k++;
    while (k < len && HARAKAT[chars[k]] !== undefined) {
      if (chars[k] !== '\u0652') return -1;
      k++;
    }
    return k < len ? k : -1;
  }

  static endsWithVowel(raw) {
    const s = (raw || '').replace(/[\s\u0640]+$/u, '');
    if (!s) return false;
    const arr = Array.from(s);
    let k = arr.length - 1;
    let vowel = false;
    while (k >= 0 && HARAKAT[arr[k]] !== undefined) {
      const h = HARAKAT[arr[k]];
      if (h === 'a' || h === 'i' || h === 'u' || h === 'aa') vowel = true;
      else if (h === 'SUKUN' || h === 'an' || h === 'un' || h === 'in') return false;
      k--;
    }
    if (k < 0 || !/[\u0621-\u064A\u0671]/u.test(arr[k])) return false;
    if (vowel) return true;
    const letter = arr[k];
    if (letter === '\u0627' || letter === '\u0649') return true;
    if (letter === '\u0648') return arr[k - 1] === '\u064F';
    if (letter === '\u064A') return arr[k - 1] === '\u0650';
    return false;
  }

  static romanizeVocalized(text, prevWord = '', prevRaw = '', pause = true, wordLen = 0) {
    if (!text) return '';

    const bare = text.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
    const caseEnding = text.endsWith('\u0650') ? 'i' : (text.endsWith('\u064F') ? 'u' : (text.endsWith('\u064E') ? 'a' : ''));
    if (bare === 'الله') return 'Allah' + caseEnding;
    if (bare === 'والله') return 'Wallah' + caseEnding;
    if (bare === 'بالله') return 'Billah' + caseEnding;
    if (bare === 'فالله') return 'Fallah' + caseEnding;
    if (bare === 'لله') return 'lillah' + caseEnding;

    let result = '';
    const chars = Array.from(text);
    const len = chars.length;
    let i = 0;
    let hasSunLetterPrefix = false;
    const wordEnd = len - (text.match(/[^\u0621-\u064A\u0671\u064B-\u0652\u0670]+$/u) || [''])[0].length;
    const letterCount = (bare.match(/[\u0621-\u064A\u0671]/gu) || []).length;

    const isAfterPreposition = (prevWord === 'في' || prevWord === 'فِي' || prevWord === 'إلى' || prevWord === 'على' || prevWord === 'من');

    const PREFIX_ROMAN = { '\u0641': 'f', '\u0648': 'w', '\u0628': 'b', '\u0643': 'k' };
    let prefix = '';
    let articleEnd = -1;
    const first = chars[0];

    if (PREFIX_ROMAN[first] !== undefined) {
      let k = 1;
      let pv = '';
      while (k < len && HARAKAT[chars[k]] !== undefined) {
        const h = HARAKAT[chars[k]];
        if (h === 'a' || h === 'i' || h === 'u') pv = h;
        k++;
      }
      const end = this.findArticleEnd(chars, k);
      if (end !== -1) {
        prefix = PREFIX_ROMAN[first] + (pv || (first === '\u0628' ? 'i' : 'a'));
        articleEnd = end;
      }
    } else if (first === '\u0644') {
      let k = 1;
      let ok = true;
      while (k < len && HARAKAT[chars[k]] !== undefined) {
        if (HARAKAT[chars[k]] !== 'i') ok = false;
        k++;
      }
      if (ok && chars[k] === '\u0644') {
        let m = k + 1;
        while (m < len && chars[m] === '\u0652') m++;
        if (m < len && HARAKAT[chars[m]] === undefined) {
          prefix = 'li';
          articleEnd = m;
        }
      }
    }

    if (!prefix) articleEnd = this.findArticleEnd(chars, 0);

    if (articleEnd !== -1) {
      const nextC = chars[articleEnd];
      const isSun = SUN_LETTERS.has(nextC);
      const cons = isSun ? SUN_LETTER_ROMAN[nextC] : 'l';
      let lead;
      if (prefix) lead = prefix + cons;
      else if (isAfterPreposition) lead = 'i' + cons;
      else if (this.endsWithVowel(prevRaw)) lead = cons;
      else lead = 'a' + cons;
      result += lead + '-';
      hasSunLetterPrefix = isSun;
      i = articleEnd;
    }

    while (i < len) {
      const c = chars[i];

      if (HARAKAT[c] !== undefined) {
        i++;
        continue;
      }

      let baseRom = ARABIC_CHAR_MAP[c] !== undefined ? ARABIC_CHAR_MAP[c] : c;
      let vowel = '';
      let hasShaddah = false;
      let isExplicitSukun = false;
      let j = i + 1;
      while (j < len && HARAKAT[chars[j]] !== undefined) {
        const dia = chars[j];
        if (dia === '\u0651') {
          hasShaddah = true;
        } else if (dia === '\u0652') {
          isExplicitSukun = true;
          vowel = '';
        } else {
          vowel = HARAKAT[dia];
        }
        j++;
      }

      if (!vowel && !isExplicitSukun && j < len) {
        const nextC = chars[j];
        if (c !== '\u0627' && c !== '\u0648' && c !== '\u064A' && c !== '\u0649' && c !== '\u0621' &&
            nextC !== '\u0627' && nextC !== '\u0648' && nextC !== '\u064A' && nextC !== '\u0649' && nextC !== '\u0629') {
          vowel = 'a';
        }
      }

      if (!vowel && !isExplicitSukun && i === 0 && c === '\u0648' && j < len &&
          !['\u0627', '\u0648', '\u064A', '\u0649', '\u0671'].includes(chars[j]) && HARAKAT[chars[j]] === undefined) {
        vowel = 'a';
      }

      if (hasSunLetterPrefix) {
        hasShaddah = false;
        hasSunLetterPrefix = false;
      }

      if (hasShaddah) {
        if (baseRom === 'sh') baseRom = 'shsh';
        else if (baseRom === 'th') baseRom = 'thth';
        else if (baseRom === 'kh') baseRom = 'khkh';
        else if (baseRom === 'dh') baseRom = 'dhdh';
        else if (baseRom === 'gh') baseRom = 'ghgh';
        else if (baseRom.length === 1 && /[a-zA-Z]/.test(baseRom)) baseRom = baseRom + baseRom;
      }

      if (j < len) {
        const nextChar = chars[j];
        const glideBare = !(j + 1 < len && HARAKAT[chars[j + 1]] !== undefined && chars[j + 1] !== '\u0652');
        const dbl = this.options.longVowels === 'double';
        if (vowel === 'a' && (nextChar === '\u0627' || nextChar === '\u0649')) {
          vowel = (dbl && nextChar === '\u0627') ? 'aa' : 'a';
          j++;
        } else if (vowel === 'i' && nextChar === '\u064A' && glideBare) {
          vowel = dbl ? 'ii' : 'i';
          j++;
        } else if (vowel === 'u' && nextChar === '\u0648' && glideBare) {
          vowel = dbl ? 'uu' : 'u';
          j++;
          if (j === len - 1 && chars[j] === '\u0627') j++;
        } else if (vowel === 'an' && (nextChar === '\u0627' || nextChar === '\u0649')) {
          j++;
        }
      }

      let prevLetterIdx = i - 1;
      while (prevLetterIdx >= 0 && HARAKAT[chars[prevLetterIdx]] !== undefined) prevLetterIdx--;
      const isWordInitial = prevLetterIdx < 0 || (prevLetterIdx === 0 && (chars[0] === '\u0648' || chars[0] === '\u0641'));
      if ((c === '\u0627' || c === '\u0671') && (vowel === 'a' || vowel === 'i' || vowel === 'u')) {
        baseRom = '';
      } else if (c === '\u0623' || c === '\u0625') {
        if (!isWordInitial) {
          baseRom = "'";
        } else {
          if (vowel === 'u') baseRom = 'u';
          else if (vowel === 'i') baseRom = 'i';
          else baseRom = 'a';
          vowel = '';
        }
      } else if (c === '\u0622') {
        baseRom = 'aa';
        vowel = '';
      } else if (c === '\u0639') {
        baseRom = vowel ? ("'" + vowel) : "'";
        vowel = '';
      } else if (c === '\u0629') {
        if (vowel) {

          baseRom = 't';
        } else {

          if (result.endsWith('a') || result.endsWith('aa')) baseRom = '';
          else baseRom = 'a';
          vowel = '';
        }
      } else if (c === '\u0649') {
        if (result.endsWith('a')) baseRom = '';
        else baseRom = 'a';
        vowel = '';
      } else if ((c === '\u0627' || c === '\u0649') && vowel === 'an') {
        baseRom = '';
      }

      const dropMode = this.options.dropCaseEndings;
      const dropHere = dropMode === 'all' || dropMode === true || (dropMode === 'pause' && pause);
      if (dropHere && j >= wordEnd && (wordLen || letterCount) >= 3 && c !== '\u0647' && c !== '\u0643') {
        if (c === '\u0629') {
          if (vowel === 'u' || vowel === 'i' || vowel === 'un' || vowel === 'in' || vowel === 'a') {
            baseRom = result.endsWith('a') ? '' : 'a';
            vowel = '';
          }
        } else if (vowel === 'u' || vowel === 'i' || vowel === 'un' || vowel === 'in') {
          vowel = '';
        }
      }

      result += baseRom + vowel;
      i = j;
    }

    return result;
  }

  static phonotacticTransliterate(word) {
    if (!word) return '';

    if (word.startsWith('فال') || word.startsWith('وال') || word.startsWith('بال') || word.startsWith('كال')) {
      const p = word[0];
      const pv = (p === 'ب' ? 'bi' : (p === 'ف' ? 'fa' : (p === 'و' ? 'wa' : 'ka')));
      const rem = word.substring(3);
      if (rem.length > 0 && SUN_LETTERS.has(rem[0])) {
        const s = SUN_LETTER_ROMAN[rem[0]];
        return pv + s + '-' + this.phonotacticTransliterate(rem);
      } else {
        return pv + 'l-' + this.phonotacticTransliterate(rem);
      }
    } else if (word.startsWith('ال') && word.length > 2) {
      const rem = word.substring(2);
      if (rem.length > 0 && SUN_LETTERS.has(rem[0])) {
        const s = SUN_LETTER_ROMAN[rem[0]];
        return 'a' + s + '-' + this.phonotacticTransliterate(rem);
      } else {
        return 'al-' + this.phonotacticTransliterate(rem);
      }
    } else if (word.startsWith('لل') && word.length > 2) {
      const rem = word.substring(2);
      if (rem.length > 0 && SUN_LETTERS.has(rem[0])) {
        const s = SUN_LETTER_ROMAN[rem[0]];
        return 'li' + s + '-' + this.phonotacticTransliterate(rem);
      } else {
        return 'lil-' + this.phonotacticTransliterate(rem);
      }
    }

    if (word === 'في' || word === 'فِي') return 'fi';
    if (word === 'على' || word === 'عَلَى') return "'ala";
    if (word === 'إلى' || word === 'الي' || word === 'إِلَى') return 'ila';
    if (word === 'عن' || word === 'عَنْ') return "'an";
    if (word === 'من' || word === 'مِنْ') return 'min';
    if (word === 'مع' || word === 'مَعَ') return "ma'a";
    if (word === 'قلبي' || word === 'قَلْبِي') return 'qalbi';
    if (word === 'مدينة' || word === 'مَدِينَة') return 'madina';
    if (word === 'ولى') return 'walla';
    if (word === 'صلى') return 'salla';
    if (word === 'خلى') return 'khalla';
    if (word === 'أرى' || word === 'ارى') return 'ara';
    if (word === 'يرى') return 'yara';
    if (word === 'ترى') return 'tara';
    if (word === 'هدى') return 'huda';
    if (word === 'ظلام') return 'zalam';
    if (word === 'شكر') return 'shukr';
    if (word === 'أحد' || word === 'احد') return 'ahad';
    if (word === 'أمور' || word === 'امور') return 'umoor';

    const len = word.length;

    if (len === 5 && word[2] === 'ي' && word[4] === 'ة') {
      const c1 = ARABIC_CHAR_MAP[word[0]] || word[0];
      const c2 = ARABIC_CHAR_MAP[word[1]] || word[1];
      const c3 = ARABIC_CHAR_MAP[word[3]] || word[3];
      return c1 + 'a' + c2 + 'i' + c3 + 'a';
    }

    if (len === 4 && word[3] === 'ة') {
      const c1 = ARABIC_CHAR_MAP[word[0]] || word[0];
      const c2 = ARABIC_CHAR_MAP[word[1]] || word[1];
      const c3 = ARABIC_CHAR_MAP[word[2]] || word[2];
      return c1 + 'a' + c2 + 'i' + c3 + 'a';
    }

    if (len === 4 && word[2] === 'ي') {
      const c1 = ARABIC_CHAR_MAP[word[0]] || word[0];
      const c2 = ARABIC_CHAR_MAP[word[1]] || word[1];
      const c3 = ARABIC_CHAR_MAP[word[3]] || word[3];
      return c1 + 'a' + c2 + 'ii' + c3;
    }

    if (len === 4 && word[2] === 'و') {
      let c1 = ARABIC_CHAR_MAP[word[0]] || word[0];
      const c2 = ARABIC_CHAR_MAP[word[1]] || word[1];
      const c3 = ARABIC_CHAR_MAP[word[3]] || word[3];
      if (word[0] === 'ع') c1 = "'u";
      else c1 = c1 + 'u';
      return c1 + c2 + 'uu' + c3;
    }

    if (len === 4 && word[2] === 'ا') {
      let c1 = ARABIC_CHAR_MAP[word[0]] || word[0];
      const c2 = ARABIC_CHAR_MAP[word[1]] || word[1];
      const c3 = ARABIC_CHAR_MAP[word[3]] || word[3];
      if (word[0] === 'ع') c1 = "'a";
      else c1 = c1 + 'a';
      return c1 + c2 + 'aa' + c3;
    }

    if (len === 5 && word[1] === 'ا' && word[4] === 'ا') {
      const c1 = ARABIC_CHAR_MAP[word[0]] || word[0];
      const c2 = ARABIC_CHAR_MAP[word[2]] || word[2];
      const c3 = ARABIC_CHAR_MAP[word[3]] || word[3];
      return c1 + 'aa' + c2 + 'i' + c3 + 'an';
    }

    if (len === 5 && word[2] === 'ي' && word[4] === 'ا') {
      let c1 = ARABIC_CHAR_MAP[word[0]] || word[0];
      if (word[0] === 'ع') c1 = "'a";
      else c1 = c1 + 'a';
      const c2 = ARABIC_CHAR_MAP[word[1]] || word[1];
      const c3 = ARABIC_CHAR_MAP[word[3]] || word[3];
      return c1 + c2 + 'ii' + c3 + 'an';
    }

    if (len === 5 && word[1] === 'ا' && word[4] === 'ة') {
      const c1 = ARABIC_CHAR_MAP[word[0]] || word[0];
      const c2 = ARABIC_CHAR_MAP[word[2]] || word[2];
      const c3 = ARABIC_CHAR_MAP[word[3]] || word[3];
      return c1 + 'aa' + c2 + 'i' + c3 + 'a';
    }

    if (len === 4 && (word[0] === 'أ' || word[0] === 'ا' || word[0] === 'إ')) {
      const c1 = ARABIC_CHAR_MAP[word[1]] || word[1];
      const c2 = ARABIC_CHAR_MAP[word[2]] || word[2];
      const c3 = ARABIC_CHAR_MAP[word[3]] || word[3];
      return 'a' + c1 + c2 + 'a' + c3;
    }

    let result = '';
    for (let i = 0; i < len; i++) {
      const c = word[i];
      if (c === 'ع') {
        result += (i === 0) ? "'a" : "'";
      } else {
        result += ARABIC_CHAR_MAP[c] !== undefined ? ARABIC_CHAR_MAP[c] : c;
      }
    }
    return result;
  }

  static stripTashkeel(text) {
    if (!text) return '';
    return text.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
  }
}