/**
 * 跟云端翻译打交道的一些小工具。
 * 一般跑在有 window 的环境里（content script / popup）。
 */
import type { TranslationResult } from '@/types/translation';
import type { LanguageId } from '@/constants/languages';

export type CloudTranslateFn = (
  term: string,
  contextText: string,
  languages: readonly LanguageId[]
) => Promise<TranslationResult>;

export interface CloudTranslateOptions {
  /** 这一轮要翻成哪些语言 */
  languages: readonly LanguageId[];
  /** 具体怎么请求云端，由外面传进来 */
  cloudFn: CloudTranslateFn;
}

/**
 * 很薄的一层包装，直接把参数丢给 cloudFn。
 */
export async function translateWithCloud(
  term: string,
  contextText: string,
  options: CloudTranslateOptions
): Promise<TranslationResult> {
  return options.cloudFn(term, contextText, options.languages);
}

/**
 * content script 里默认用的实现：
 * 通过 chrome.runtime.sendMessage 让 background 去打云端 API。
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
