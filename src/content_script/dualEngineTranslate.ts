/**
 * 云端翻译：通过 Background 调用配置的云端 API。
 * 必须在「有 window 的上下文」运行（Content Script / Popup），
 */
import type { TranslationResult } from '@/types/translation';
import type { LanguageId } from '@/constants/languages';

export type CloudTranslateFn = (
  term: string,
  contextText: string,
  languages: readonly LanguageId[]
) => Promise<TranslationResult>;

export interface CloudTranslateOptions {
  languages: readonly LanguageId[];
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
 * content script 里默认用的实现：
 * 通过 chrome.runtime.sendMessage 让 background 去调用云端 API。
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
