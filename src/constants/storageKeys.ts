export const STORAGE_KEYS = {
  selectedLanguages: 'selectedLanguages',
  triggerMode: 'triggerMode',
  cloudApiUrl: 'cloudApiUrl',
  cloudApiKey: 'cloudApiKey',
  cloudModel: 'cloudModel',
} as const;

export type TriggerMode = 'instant' | 'modifier';

export const DEFAULT_TRIGGER_MODE: TriggerMode = 'modifier';

export function normalizeTriggerMode(value: unknown): TriggerMode {
  if (value === 'instant' || value === 'modifier') return value;
  return DEFAULT_TRIGGER_MODE;
}
