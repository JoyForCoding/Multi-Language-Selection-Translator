import type { TranslateMessagePayload, TranslateResponse } from '@/types/translation';
import { parseTranslationResult } from '@/types/translation';
import { buildTranslationSystemPrompt } from '@/constants/prompts';
import { normalizeSelectedLanguages } from '@/constants/languages';
import type { LanguageId } from '@/constants/languages';
import { STORAGE_KEYS } from '@/constants/storageKeys';

// 从 storage 里把云端 API 配置读出来
async function getCloudApiConfig(): Promise<{ url: string; key: string; model: string }> {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.cloudApiUrl,
    STORAGE_KEYS.cloudApiKey,
    STORAGE_KEYS.cloudModel,
  ]);

  const url = String(stored[STORAGE_KEYS.cloudApiUrl] ?? '').trim();
  const key = String(stored[STORAGE_KEYS.cloudApiKey] ?? '').trim();
  const model = String(stored[STORAGE_KEYS.cloudModel] ?? '').trim();

  return { url, key, model };
}

// 调用大模型 API，URL / Key / Model 来自弹窗配置
async function callCloudTranslation(
  term: string,
  contextText: string,
  languages: readonly LanguageId[]
) {
  const { url, key, model } = await getCloudApiConfig();
  if (!url || !key) {
    throw new Error('Cloud API is not configured: please click the extension icon and fill in the API endpoint and key in the popup.');
  }
  const effectiveModel = model || 'gpt-4o-mini';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  headers['Authorization'] = `Bearer ${key}`;

  const systemPrompt = buildTranslationSystemPrompt(languages);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: effectiveModel,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({ term, contextText }),
        },
      ],
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errMsg =
      (data?.error as { message?: string })?.message ??
      (typeof data?.error === 'string' ? data.error : null) ??
      `HTTP ${response.status}`;
    console.error('[background] Cloud API request failed:', response.status, data);
    throw new Error(`Cloud API request failed (${response.status}): ${errMsg}`);
  }

  const msg = typeof data?.message === 'string' ? data.message : '';
  if (
    msg &&
    (msg.includes('错误的请求方式') ||
      msg.includes('Welcome to the') ||
      msg.includes('Documentation'))
  ) {
    throw new Error(
      'Current API endpoint is not a chat-completions endpoint. Please use a full /v1/chat/completions URL, for example: https://api.chatanywhere.org/v1/chat/completions'
    );
  }

  const rawContent: string =
    (data?.choices as { message?: { content?: string } }[])?.[0]?.message?.content ??
    (data?.result as string) ??
    (data?.content as string) ??
    '{}';
  const raw = String(rawContent).trim();
  return parseTranslationResult(raw, languages);
}

chrome.runtime.onMessage.addListener(
  (message: TranslateMessagePayload, _sender, sendResponse: (response: TranslateResponse) => void) => {
    if (message?.type !== 'TRANSLATE_TERM') {
      return;
    }

    (async () => {
      try {
        const languages = normalizeSelectedLanguages(message.languages);
        const result = await callCloudTranslation(message.term, message.contextText, languages);
        sendResponse({ ok: true, data: result });
      } catch (error) {
        console.error('[background] cloud translation error:', error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();

    return true;
  }
);

