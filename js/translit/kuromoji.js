const VERSION = '0.1.2';
const BASE = `https://cdn.jsdelivr.net/npm/kuromoji@${VERSION}`;

let loader = null;
let pending = null;

export function setTokenizerLoader(fn) {
  loader = fn;
  pending = null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Failed to load kuromoji'));
    document.head.appendChild(el);
  });
}

async function defaultLoader() {
  if (!window.kuromoji) await loadScript(`${BASE}/build/kuromoji.js`);
  return new Promise((resolve, reject) => {
    window.kuromoji.builder({ dicPath: `${BASE}/dict/` }).build((error, tokenizer) => {
      if (error) reject(error);
      else resolve(tokenizer);
    });
  });
}

export function getTokenizer() {
  if (!pending) {
    pending = (loader || defaultLoader)().catch((error) => {
      console.warn('[translit] Kuromoji unavailable, using kana-only fallback:', error.message);
      pending = null;
      return null;
    });
  }
  return pending;
}
