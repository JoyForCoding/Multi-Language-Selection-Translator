<template>
  <div class="floating-card" :style="cardStyle">
    <div v-if="loading" class="loading-wrap">
      <span class="loading-spinner"></span>
    </div>
    <template v-else-if="error">
      <p class="error">{{ error }}</p>
      <p v-if="showConfigHint" class="hint">For configuration instructions, please click the extension icon in the browser toolbar.</p>
    </template>
    <template v-else-if="result">
      <div class="layout-rows-inner">
        <div v-for="langId in languages" :key="langId" class="row">
          <span class="flag" :style="flagStyle">{{ getLanguageShortLabel(langId) }}</span>
          <span class="value">{{ result.explanations[langId] || '—' }}</span>
          <button
            v-if="isSpeakable(result.explanations[langId])"
            type="button"
            class="speak-btn"
            :class="{ speaking: speakingLangId === langId }"
            :aria-label="'Speak ' + (result.explanations[langId] || '')"
            @click="onSpeak(result.explanations[langId], langId)"
          >
            <svg class="speak-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { translateWithCloud, createCloudFnFromBackground } from './dualEngineTranslate';
import type { TranslationResult } from '@/types/translation';
import { getLanguageShortLabel } from '@/constants/languages';
import type { LanguageId, SelectedLanguages } from '@/constants/languages';
import { speak, stopSpeaking } from './speech';

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const props = defineProps<{
  rect: SelectionRect;
  term: string;
  contextText: string;
  languages: SelectedLanguages;
}>();

const OFFSET = 8;

// 标签徽标内联样式
const flagStyle = {
  display: 'inline-block',
  boxSizing: 'border-box' as const,
  minWidth: '26px',
  width: '26px',
  fontSize: '10px',
  fontWeight: '600',
  lineHeight: '1.4',
  padding: '2px 2px',
  marginRight: '5px',
  borderRadius: '3px',
  backgroundColor: '#e5e7eb',
  color: '#374151',
  border: '1px solid #d1d5db',
  textAlign: 'center' as const,
};

const loading = ref(true);
const result = ref<TranslationResult | null>(null);
const error = ref<string | null>(null);
const speakingLangId = ref<LanguageId | null>(null);

const languages = computed(() => props.languages);

function isSpeakable(text: string | undefined): boolean {
  if (!text || text.trim() === '' || text === '—') return false;
  if (text.includes('No definition returned for this language') || text.includes('Please check the model output format')) return false;
  return true;
}

function onSpeak(text: string | undefined, langId: LanguageId) {
  if (!text || !isSpeakable(text)) return;
  speakingLangId.value = langId;
  speak(text, langId);
}

function onSpeechEnd() {
  speakingLangId.value = null;
}

onMounted(() => {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const endHandler = () => onSpeechEnd();
  if (synth) synth.addEventListener('end', endHandler);
  onUnmounted(() => {
    if (synth) {
      synth.removeEventListener('end', endHandler);
      stopSpeaking();
    }
  });

  translateWithCloud(props.term, props.contextText, {
    languages: props.languages,
    cloudFn: createCloudFnFromBackground(),
  })
    .then((data) => {
      result.value = data;
      error.value = null;
    })
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Extension context invalidated')) {
        error.value = 'Extension has been reloaded. Please refresh this page and try again.';
      } else if (msg.includes('Cloud API is not configured') || msg.includes('CLOUD_API_URL')) {
        error.value = 'Translation unavailable (please configure the cloud API).';
      } else if (msg.includes('Failed to fetch') || msg.includes('fetch')) {
        error.value = 'Cloud translation unavailable: please check your network connection or API configuration.';
      } else {
        error.value = msg;
      }
    })
    .finally(() => {
      loading.value = false;
    });
});

const showConfigHint = computed(() => {
  const e = error.value;
  return e && (
    e.includes('cloud') ||
    e.includes('unavailable') ||
    e.includes('not configured') ||
    e.includes('API configuration')
  );
});

const cardStyle = computed(() => {
  const top = props.rect.y + props.rect.height + OFFSET;
  return {
    position: 'absolute' as const,
    left: `${props.rect.x}px`,
    top: `${top}px`,
    zIndex: '2147483647',
    background: '#ffffff',
    border: '1px solid #d1d5db',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.12)',
    minWidth: '200px',
    maxWidth: '420px',
    padding: '12px 16px',
    borderRadius: '8px',
    boxSizing: 'border-box' as const,
  };
});
</script>

<style scoped>
.layout-rows-inner .row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 6px;
}
.layout-rows-inner .row:last-child {
  margin-bottom: 0;
}
.row .value {
  flex: 1;
  min-width: 0;
}
.speak-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: #f3f4f6;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.speak-btn:hover {
  background: #e5e7eb;
  color: #374151;
}
.speak-btn.speaking {
  background: #dbeafe;
  color: #2563eb;
}
.speak-icon {
  width: 16px;
  height: 16px;
}
</style>


