/**
 * 翻译内容 TTS：基于 Web Speech API，在 Content Script 中可用。
 */
import type { LanguageId } from '@/constants/languages';
import { getLanguageSpeechLocale } from '@/constants/languages';

let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve([]);
  }
  if (cachedVoices.length > 0) return Promise.resolve(cachedVoices);
  if (voicesReady) return voicesReady;

  voicesReady = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const synth = window.speechSynthesis;
    const list = synth.getVoices();
    if (list.length > 0) {
      cachedVoices = list;
      resolve(list);
      return;
    }
    const onVoicesChanged = () => {
      synth.removeEventListener('voiceschanged', onVoicesChanged);
      cachedVoices = synth.getVoices();
      resolve(cachedVoices);
    };
    synth.addEventListener('voiceschanged', onVoicesChanged);
    // Chrome 有时需要异步才触发 voiceschanged
    setTimeout(() => {
      if (cachedVoices.length === 0) {
        const again = synth.getVoices();
        if (again.length > 0) {
          cachedVoices = again;
          synth.removeEventListener('voiceschanged', onVoicesChanged);
          resolve(again);
        }
      }
    }, 100);
  });
  return voicesReady;
}

/** 为 BCP 47 语言标签选取最合适的语音（优先完全匹配，其次前缀匹配） */
function pickVoiceForLang(voices: SpeechSynthesisVoice[], langTag: string): SpeechSynthesisVoice | null {
  const exact = voices.find((v) => v.lang === langTag);
  if (exact) return exact;
  const prefix = langTag.split('-')[0];
  const byPrefix = voices.find((v) => v.lang === prefix || v.lang.startsWith(prefix + '-'));
  if (byPrefix) return byPrefix;
  return voices.find((v) => v.default) ?? voices[0] ?? null;
}

/** 是否为空或占位文案（不朗读） */
function isSpeakableText(text: string): boolean {
  if (!text || text.trim() === '' || text === '—') return false;
  if (text.includes('该语言释义未返回') || text.includes('请检查模型输出格式')) return false;
  return true;
}

/**
 * 朗读指定文本，使用对应语言的语音。
 * 会先取消当前正在播放的语音；若文本不可读则直接返回。
 */
export function speak(text: string, langId: LanguageId): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  if (!isSpeakableText(text)) return;

  const langTag = getLanguageSpeechLocale(langId);
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = langTag;
  utterance.rate = 0.95;
  utterance.volume = 1;

  loadVoices().then((voices) => {
    const voice = pickVoiceForLang(voices, langTag);
    if (voice) utterance.voice = voice;
    window.speechSynthesis!.speak(utterance);
  });
}

/** 停止当前朗读 */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/** 当前是否正在朗读（可用于 UI 高亮） */
export function isSpeaking(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis?.speaking;
}

