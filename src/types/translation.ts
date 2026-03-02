import type { LanguageId } from '@/constants/languages';

/**
 * 翻译结果：按「所选语言」动态，只包含用户请求的语言释义。
 * explanations 的 key 为语言 id，value 为该语言的释义文案。
 */
export interface TranslationResult {
  term: string;
  explanations: Partial<Record<LanguageId, string>>;
}

/** Content Script / Popup 发给 Background 的翻译请求 */
export interface TranslateMessagePayload {
  type: 'TRANSLATE_TERM';
  term: string;
  contextText: string;
  /** 本次请求的 1～3 种语言，未传则用默认（如中英日） */
  languages?: readonly LanguageId[];
}

/** Background 通过 sendResponse 返回的成功结构 */
export interface TranslateResponseOk {
  ok: true;
  data: TranslationResult;
}

/** Background 通过 sendResponse 返回的失败结构 */
export interface TranslateResponseErr {
  ok: false;
  error: string;
}

export type TranslateResponse = TranslateResponseOk | TranslateResponseErr;

/**
 * 运行时校验：将未知对象收窄为 TranslationResult（且包含指定语言的释义），否则抛错。
 * @param languageIds 本次请求的语言列表，explanations 中必须包含这些 key 且值为 string。
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

/** 旧版/常见字段名到 LanguageId 的映射，兼容大模型返回的不同 key */
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

/** 键名模糊匹配：含 zh/chinese 的 key 填 zh，含 en/english 填 en，依此类推 */
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

  const missingPlaceholder = '（该语言释义未返回，请检查模型输出格式）';
  for (const id of languageIds) {
    if (typeof explanations[id] !== 'string') {
      explanations[id] = missingPlaceholder;
    }
  }

  return { term, explanations };
}

/** 尝试从可能被 Markdown 代码块包裹的字符串中提取 JSON */
function extractJsonString(raw: string): string {
  const trimmed = raw.trim();
  const codeBlock = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const m = trimmed.match(codeBlock);
  return m ? m[1].trim() : trimmed;
}

/**
 * 从 API 返回的 content 字符串解析为 TranslationResult。
 * 支持 Markdown 代码块包裹、双重 JSON 字符串、explanations / 平铺 / 旧字段名。
 * 若某语言无对应字段，用占位文案填充，不抛错。
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
