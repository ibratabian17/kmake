# Third-party origins

- `romanizers/*`, `dispatcher.js`, `align.js`: adapted from the YouLy+ background romanization services. Fixes applied: Japanese `で` table key, particle handling, token attach rules, 一人/二人 readings; Korean engine rewritten (liaison, aspiration, word spacing); Arabic diacritizer hooks removed.
- `romanizers/pinyin.js`: syllable table taken from tiny-pinyin 1.3.2 (MIT), which derives from the Android HanziToPinyin data. The YouLy+ copy was missing 10 entries, which shifted every lookup.
- Japanese uses kuromoji 0.1.2 (Apache-2.0), loaded lazily from jsDelivr on first use.
