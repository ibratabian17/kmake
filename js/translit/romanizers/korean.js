const CHOSEONG = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's',
  'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'
];

const JUNGSEONG = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o',
  'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu',
  'eu', 'ui', 'i'
];

const JONGSEONG = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k',
  'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p',
  't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'
];

const JONGSEONG_SPLIT = [
  ['', ''], ['', 'g'], ['', 'kk'], ['k', 's'], ['', 'n'], ['n', 'j'], ['', 'n'], ['', 'd'], ['', 'r'], ['l', 'g'],
  ['l', 'm'], ['l', 'b'], ['l', 's'], ['l', 't'], ['l', 'p'], ['', 'r'], ['', 'm'], ['', 'b'], ['p', 's'],
  ['', 's'], ['', 'ss'], ['ng', ''], ['', 'j'], ['', 'ch'], ['', 'k'], ['', 't'], ['', 'p'], ['', '']
];

const HANGUL_BASE = 0xAC00;
const HANGUL_END = 0xD7A3;
const SILENT_ONSET = 11;
const ASPIRATED_ONSET = { 0: 'k', 3: 't', 12: 'ch' };
const H_FINALS = { 6: 'n', 15: 'l', 27: '' };
const WORD_CHAR = /[\p{L}\p{N}]/u;

const isHangul = (code) => code >= HANGUL_BASE && code <= HANGUL_END;

export class KoreanRomanizer {
  static decompose(charCode) {
    if (!isHangul(charCode)) return null;
    const offset = charCode - HANGUL_BASE;
    return {
      choseong: Math.floor(offset / 588),
      jungseong: Math.floor((offset % 588) / 28),
      jongseong: offset % 28
    };
  }

  static romanizeSyllables(syllables) {
    const texts = syllables.map((s) => s.text || '');
    const full = texts.join('');
    const pieces = new Array(full.length);
    let carry = null;

    for (let i = 0; i < full.length; i++) {
      const ch = full[i];
      const next = full[i + 1];
      const dec = this.decompose(ch.charCodeAt(0));

      if (!dec) {
        const nextIsHangul = next !== undefined && isHangul(next.charCodeAt(0));
        pieces[i] = ch + (nextIsHangul && WORD_CHAR.test(ch) ? ' ' : '');
        carry = null;
        continue;
      }

      const nextDec = next !== undefined ? this.decompose(next.charCodeAt(0)) : null;
      const carried = carry !== null && (dec.choseong === SILENT_ONSET || carry.force);
      const onset = carried ? carry.value : CHOSEONG[dec.choseong];
      let coda = JONGSEONG[dec.jongseong];
      carry = null;

      if (dec.jongseong > 0 && nextDec) {
        if (nextDec.choseong === SILENT_ONSET) {
          const [stay, move] = JONGSEONG_SPLIT[dec.jongseong];
          coda = stay;
          carry = { value: move, force: false };
        } else if (dec.jongseong in H_FINALS && nextDec.choseong in ASPIRATED_ONSET) {
          coda = H_FINALS[dec.jongseong];
          carry = { value: ASPIRATED_ONSET[nextDec.choseong], force: true };
        }
      }

      const followedByWord = next !== undefined && WORD_CHAR.test(next);
      pieces[i] = onset + JUNGSEONG[dec.jungseong] + coda + (followedByWord ? ' ' : '');
    }

    const out = [];
    let offset = 0;
    for (const text of texts) {
      out.push({ text: pieces.slice(offset, offset + text.length).join('') });
      offset += text.length;
    }
    return out;
  }

  static romanize(text) {
    if (!text) return '';
    return this.romanizeSyllables([{ text }])[0].text;
  }
}
