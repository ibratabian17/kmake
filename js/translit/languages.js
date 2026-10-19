export const LANGUAGES = [
  ['en', 'English'], ['id', 'Indonesian'], ['ms', 'Malay'], ['es', 'Spanish'], ['fr', 'French'],
  ['de', 'German'], ['pt', 'Portuguese'], ['it', 'Italian'], ['nl', 'Dutch'], ['sv', 'Swedish'],
  ['pl', 'Polish'], ['tr', 'Turkish'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['el', 'Greek'],
  ['ar', 'Arabic'], ['he', 'Hebrew'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['ta', 'Tamil'],
  ['th', 'Thai'], ['vi', 'Vietnamese'], ['tl', 'Filipino'], ['ja', 'Japanese'], ['ko', 'Korean'],
  ['zh-CN', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)']
].map(([code, name]) => ({ code, name }));

export const languageName = (code) => (LANGUAGES.find((l) => l.code === code) || { name: code }).name;
