import type { LanguageId } from '@/constants/languages';

/**
 * 每次翻译的结果，只保留这次真正要的语言。
 * explanations 里用语言 id 当 key，比如 zh / en / ja。
 */
export interface TranslationResult {
  term: string;
  explanations: Partial<Record<LanguageId, string>>;
}

/** content script / popup 发给 background 的消息结构 */
export interface TranslateMessagePayload {
  type: 'TRANSLATE_TERM';
  term: string;
  contextText: string;
  languages?: readonly LanguageId[];
}

export interface TranslateResponseOk {
  ok: true;
  data: TranslationResult;
}

export interface TranslateResponseErr {
  ok: false;
  error: string;
}

export type TranslateResponse = TranslateResponseOk | TranslateResponseErr;

/**
 * 运行时兜底检查模型返回的内容
 * @param languageIds 本次请求的语言列表
 */
export function assertTranslationResult(
  value: unknown,
  languageIds: readonly LanguageId[]
): asserts value is TranslationResult {
  if (value === null || typeof value !== 'object') {
    throw new Error('Invalid TranslationResult: not an object');
  }
  const o = value as Record<string, unknown>;
  if (typeof o.term !== 'string') {
    throw new Error('Invalid TranslationResult: missing or invalid term');
  }
  if (typeof o.explanations !== 'object' || o.explanations === null) {
    throw new Error('Invalid TranslationResult: missing or invalid explanations');
  }
  const explanations = o.explanations as Record<string, unknown>;
  for (const id of languageIds) {
    if (typeof explanations[id] !== 'string') {
      throw new Error(`Invalid TranslationResult: missing or invalid explanations.${id}`);
    }
  }
}

/** 字段名到语言 id 的映射，方便兼容不同接口返回 */
const LEGACY_KEY_TO_LANG: Record<string, LanguageId> = {
  chinese_explanation: 'zh',
  chinese: 'zh',
  english_expression: 'en',
  english: 'en',
  japanese_expression: 'ja',
  japanese: 'ja',
  korean: 'ko',
  french: 'fr',
  german: 'de',
  spanish: 'es',
};

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

/** 键名模糊匹配 */
const FUZZY_KEY_PATTERNS: { pattern: RegExp; id: LanguageId }[] = [
  { pattern: /zh|chinese|中文/i, id: 'zh' },
  { pattern: /en|english|英文/i, id: 'en' },
  { pattern: /ja|japanese|日/i, id: 'ja' },
  { pattern: /ko|korean|韩/i, id: 'ko' },
  { pattern: /fr|french|法/i, id: 'fr' },
  { pattern: /de|german|德/i, id: 'de' },
  { pattern: /es|spanish|西/i, id: 'es' },
];

function collectByFuzzyKey(
  obj: Record<string, unknown>,
  languageIds: readonly LanguageId[],
  explanations: Partial<Record<LanguageId, string>>
): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'string' || key === 'term') continue;
    for (const { pattern, id } of FUZZY_KEY_PATTERNS) {
      if (languageIds.includes(id) && !explanations[id] && pattern.test(key)) {
        explanations[id] = value;
        break;
      }
    }
  }
}

/**
 * 从 API 返回的 JSON 中按本次请求的 languageIds 抽取 explanations。
 * 支持：explanations 对象、平铺 *_explanation、旧字段名（chinese_explanation 等）、Markdown 包裹。
 */
function normalizeToTranslationResult(
  parsed: Record<string, unknown>,
  languageIds: readonly LanguageId[]
): TranslationResult {
  const term = typeof parsed.term === 'string' ? parsed.term : '';
  const explanations: Partial<Record<LanguageId, string>> = {};

  const nested = parsed.explanations;
  if (nested !== null && typeof nested === 'object') {
    const obj = nested as Record<string, unknown>;
    for (const id of languageIds) {
      const s = getString(obj, id);
      if (s) explanations[id] = s;
    }
  }

  for (const id of languageIds) {
    if (explanations[id]) continue;
    const flatKey = `${id}_explanation`;
    const s = getString(parsed, flatKey);
    if (s) explanations[id] = s;
  }

  for (const [legacyKey, id] of Object.entries(LEGACY_KEY_TO_LANG)) {
    if (languageIds.includes(id) && !explanations[id]) {
      const s = getString(parsed, legacyKey);
      if (s) explanations[id] = s;
    }
  }

  if (nested !== null && typeof nested === 'object') {
    const obj = nested as Record<string, unknown>;
    for (const [legacyKey, id] of Object.entries(LEGACY_KEY_TO_LANG)) {
      if (languageIds.includes(id) && !explanations[id]) {
        const s = getString(obj, legacyKey);
        if (s) explanations[id] = s;
      }
    }
  }

  collectByFuzzyKey(parsed, languageIds, explanations);
  if (nested !== null && typeof nested === 'object') {
    collectByFuzzyKey(nested as Record<string, unknown>, languageIds, explanations);
  }

  const missingPlaceholder = 'No definition returned for this language. Please check the model output format.';
  for (const id of languageIds) {
    if (typeof explanations[id] !== 'string') {
      explanations[id] = missingPlaceholder;
    }
  }

  return { term, explanations };
}

/** 有些模型会用 ```json 包一层，需要进行提取 */
function extractJsonString(raw: string): string {
  const trimmed = raw.trim();
  const codeBlock = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const m = trimmed.match(codeBlock);
  return m ? m[1].trim() : trimmed;
}

/**
 * 把模型返回的 content 字符串解析成 TranslationResult。
 * 适配几种常见形态
 */
export function parseTranslationResult(
  rawContent: string,
  languageIds: readonly LanguageId[]
): TranslationResult {
  let jsonStr = extractJsonString(rawContent.trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'string') {
      jsonStr = parsed;
      parsed = JSON.parse(jsonStr);
    }
  } catch {
    throw new Error('Invalid TranslationResult: response is not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Invalid TranslationResult: not an object');
  }
  return normalizeToTranslationResult(parsed as Record<string, unknown>, languageIds);
}
