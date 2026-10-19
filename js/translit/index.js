import { settings, romanizeLines, translateLines, hasAiKey } from './service.js';
import { LANGUAGES, languageName } from './languages.js';
import { TARGET_SCRIPTS } from './prompts.js';
import { detectLanguageContext, guessGuides } from './offline.js';
import { alignChunks } from './align.js';
import { AbortError } from './utils.js';

window.KmakeTranslit = {
  settings,
  romanizeLines,
  translateLines,
  hasAiKey: (provider) => hasAiKey(provider, settings.get()),
  detectLanguageContext,
  alignChunks,
  guessGuides,
  languageName,
  LANGUAGES,
  TARGET_SCRIPTS,
  AbortError
};

document.body.classList.toggle('adv-rom', !!settings.get().advancedRomanization);
