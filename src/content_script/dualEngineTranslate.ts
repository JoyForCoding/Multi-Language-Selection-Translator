/**
 * 云端翻译：通过 Background 调用配置的云端 API。
 * 必须在「有 window 的上下文」运行（Content Script / Popup），
 * Background Service Worker 无 window，不能直接调用本模块。
 */
import type { TranslationResult } from '@/types/translation';
import type { LanguageId } from '@/constants/languages';

export type CloudTranslateFn = (
  term: string,
  contextText: string,
  languages: readonly LanguageId[]
) => Promise<TranslationResult>;

export interface CloudTranslateOptions {
  /** 本次请求的 1～3 种语言 */
  languages: readonly LanguageId[];
  /** 云端翻译：通常为向 Background 发 sendMessage 并返回 data */
  cloudFn: CloudTranslateFn;
}

/**
 * 使用云端 API 翻译，返回结果按 options.languages 动态（TranslationResult.explanations）。
 */
export async function translateWithCloud(
  term: string,
  contextText: string,
  options: CloudTranslateOptions
): Promise<TranslationResult> {
  return options.cloudFn(term, contextText, options.languages);
}

/**
 * Content Script 中使用的云端实现：通过 chrome.runtime.sendMessage 请求 Background 调用云端 API。
 */
export function createCloudFnFromBackground(): CloudTranslateFn {
  return (term: string, contextText: string, languages: readonly LanguageId[]) =>
    new Promise<TranslationResult>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'TRANSLATE_TERM', term, contextText, languages },
        (response: unknown) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && typeof response === 'object' && (response as { ok?: boolean }).ok === true) {
            const data = (response as { data: TranslationResult }).data;
            resolve(data);
          } else {
            const err = (response as { error?: string })?.error ?? 'Unknown error';
            reject(new Error(err));
          }
        }
      );
    });
}
