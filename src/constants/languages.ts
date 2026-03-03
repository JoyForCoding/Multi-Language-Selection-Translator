 export const SUPPORTED_LANGUAGES = [
  { id: 'zh', displayName: '\u4e2d\u6587', promptName: '\u7b80\u4f53\u4e2d\u6587' },  
  { id: 'en', displayName: 'English', promptName: 'English' },
  { id: 'ja', displayName: '\u65e5\u672c\u8a9e', promptName: 'Japanese' },           
  { id: 'ko', displayName: '\ud55c\uad6d\uc5b4', promptName: 'Korean' },             
  { id: 'fr', displayName: 'Fran\u00e7ais', promptName: 'French' },
  { id: 'de', displayName: 'Deutsch', promptName: 'German' },
  { id: 'es', displayName: 'Espa\u00f1ol', promptName: 'Spanish' },
] as const;

export type LanguageId = (typeof SUPPORTED_LANGUAGES)[number]['id'];

export type SelectedLanguages =
  | readonly [LanguageId]
  | readonly [LanguageId, LanguageId]
  | readonly [LanguageId, LanguageId, LanguageId];

export const DEFAULT_SELECTED_LANGUAGES: SelectedLanguages = ['en', 'ja'];

export const MAX_SELECTED_LANGUAGES = 3;
export const MIN_SELECTED_LANGUAGES = 1;

const SPEECH_LOCALE: Record<LanguageId, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
};

export function getLanguageSpeechLocale(id: LanguageId): string {
  return SPEECH_LOCALE[id] ?? id;
}

// 浮层里用的小标签文案，尽量简短一点。
export function getLanguageShortLabel(id: LanguageId): string {
  const labels: Record<LanguageId, string> = {
    zh: 'ZH',
    en: 'EN',
    ja: 'JA',
    ko: 'KO',
    fr: 'FR',
    de: 'DE',
    es: 'ES',
  };
  return labels[id] ?? id.toUpperCase();
}

export function getLanguagePromptName(id: LanguageId): string {
  const found = SUPPORTED_LANGUAGES.find((l) => l.id === id);
  return found?.promptName ?? id;
}

export function isSelectedLanguages(arr: unknown): arr is SelectedLanguages {
  if (!Array.isArray(arr) || arr.length < MIN_SELECTED_LANGUAGES || arr.length > MAX_SELECTED_LANGUAGES) {
    return false;
  }
  const ids = new Set(SUPPORTED_LANGUAGES.map((l) => l.id));
  return arr.every((item) => typeof item === 'string' && ids.has(item as LanguageId));
}

export function normalizeSelectedLanguages(arr: unknown): SelectedLanguages {
  if (!isSelectedLanguages(arr)) return DEFAULT_SELECTED_LANGUAGES;
  return arr;
}
