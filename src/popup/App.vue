<template>
  <main class="popup">
    <h1>Multi-Language Selection Translator</h1>
    <p class="desc">Select text on any page to see translations in your chosen languages.</p>

    <section class="guide-section api-section">
      <h2>Cloud API Settings</h2>
      <p class="guide-desc">When configured, selection translation will use this API. The key is stored only on this device and is never synced.</p>
      <div class="api-fields">
        <label class="api-label">
          <span>API endpoint</span>
          <input v-model="cloudApiUrl" type="url" class="api-input" placeholder="https://api.xxx.com/v1/chat/completions" />
        </label>
        <label class="api-label">
          <span>API Key</span>
          <input v-model="cloudApiKey" type="password" class="api-input" placeholder="sk-xxx" autocomplete="off" />
        </label>
        <label class="api-label">
          <span>Model</span>
          <input v-model="cloudModel" type="text" class="api-input" placeholder="gpt-4o-mini" />
        </label>
      </div>
      <button type="button" class="btn-save" @click="saveCloudApi">Save settings</button>
      <p v-if="apiSaveStatus" class="api-status">{{ apiSaveStatus }}</p>
    </section>

    <section class="guide-section trigger-section">
      <h2>Trigger</h2>
      <div class="trigger-options">
        <label class="trigger-option">
          <input
            v-model="triggerMode"
            type="radio"
            value="modifier"
            @change="persistTriggerMode"
          />
          <span>Translate only when holding <kbd>Alt</kbd> while selecting</span>
        </label>
        <label class="trigger-option">
          <input
            v-model="triggerMode"
            type="radio"
            value="instant"
            @change="persistTriggerMode"
          />
          <span>Translate on selection</span>
        </label>
      </div>
    </section>

    <section class="guide-section lang-section">
      <h2>Languages</h2>
      <div class="lang-tags">
        <button
          v-for="lang in SUPPORTED_LANGUAGES"
          :key="lang.id"
          type="button"
          class="lang-tag"
          :class="{ active: selectedIds.includes(lang.id) }"
          :disabled="!selectedIds.includes(lang.id) && selectedIds.length >= MAX_SELECTED_LANGUAGES"
          @click="toggleLanguage(lang.id)"
        >
          {{ lang.displayName }}
        </button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  SUPPORTED_LANGUAGES,
  MAX_SELECTED_LANGUAGES,
  normalizeSelectedLanguages,
} from '@/constants/languages';
import type { LanguageId } from '@/constants/languages';
import {
  STORAGE_KEYS,
  DEFAULT_TRIGGER_MODE,
  normalizeTriggerMode,
  type TriggerMode,
} from '@/constants/storageKeys';

const selectedIds = ref<LanguageId[]>([]);
const triggerMode = ref<TriggerMode>(DEFAULT_TRIGGER_MODE);
const cloudApiUrl = ref('');
const cloudApiKey = ref('');
const cloudModel = ref('');
const apiSaveStatus = ref('');

function toLanguageIdArray(raw: unknown): LanguageId[] | null {
  if (Array.isArray(raw)) {
    return raw as LanguageId[];
  }
  if (raw && typeof raw === 'object') {
    // 有些环境下存进去的数组会被还原成 {0: 'en', 1: 'ja', ...} 这种形式，这里简单转一下
    const values = Object.values(raw);
    if (values.every((v) => typeof v === 'string')) {
      return values as LanguageId[];
    }
  }
  return null;
}

function persistSelected() {
  chrome.storage.sync.set({ [STORAGE_KEYS.selectedLanguages]: selectedIds.value });
}

function persistTriggerMode() {
  chrome.storage.sync.set({ [STORAGE_KEYS.triggerMode]: triggerMode.value });
}

function toggleLanguage(id: LanguageId) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    if (selectedIds.value.length <= 1) return;
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
  } else {
    if (selectedIds.value.length >= MAX_SELECTED_LANGUAGES) return;
    selectedIds.value = [...selectedIds.value, id];
  }
  persistSelected();
}

function saveCloudApi() {
  apiSaveStatus.value = '';
  chrome.storage.local.set(
    {
      [STORAGE_KEYS.cloudApiUrl]: cloudApiUrl.value.trim(),
      [STORAGE_KEYS.cloudApiKey]: cloudApiKey.value.trim(),
      [STORAGE_KEYS.cloudModel]: cloudModel.value.trim(),
    },
    () => {
      apiSaveStatus.value = 'saved';
      setTimeout(() => { apiSaveStatus.value = ''; }, 2000);
    }
  );
}

onMounted(() => {
  chrome.storage.sync.get(
    [STORAGE_KEYS.selectedLanguages, STORAGE_KEYS.triggerMode],
    (stored) => {
      const raw = stored?.[STORAGE_KEYS.selectedLanguages];
      const arr = toLanguageIdArray(raw);
      if (arr && arr.length >= 1 && arr.length <= MAX_SELECTED_LANGUAGES) {
        selectedIds.value = [...arr];
      } else {
        selectedIds.value = ['en', 'ja'];
        chrome.storage.sync.set({ [STORAGE_KEYS.selectedLanguages]: selectedIds.value });
      }
      triggerMode.value = normalizeTriggerMode(stored?.[STORAGE_KEYS.triggerMode]);
    }
  );

  chrome.storage.local.get(
    [STORAGE_KEYS.cloudApiUrl, STORAGE_KEYS.cloudApiKey, STORAGE_KEYS.cloudModel],
    (stored) => {
      cloudApiUrl.value = String(stored?.[STORAGE_KEYS.cloudApiUrl] ?? '');
      cloudApiKey.value = String(stored?.[STORAGE_KEYS.cloudApiKey] ?? '');
      cloudModel.value = String(stored?.[STORAGE_KEYS.cloudModel] ?? '');
    }
  );
});
</script>

<style scoped>
.popup {
  width: 320px;
  max-height: 480px;
  overflow-y: auto;
  padding: 16px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

h1 {
  font-size: 16px;
  margin: 0 0 4px;
}

.desc {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 16px;
}

.guide-section {
  margin-bottom: 16px;
}

.guide-section h2 {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 6px;
}

.guide-desc {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 8px;
  line-height: 1.4;
}

.guide-list {
  font-size: 12px;
  color: #374151;
  margin: 0;
  padding-left: 20px;
  line-height: 1.5;
}

.guide-list li {
  margin-bottom: 4px;
}

.guide-list strong {
  color: #111827;
}

.lang-section {
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.lang-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 6px;
}

.lang-tag {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #f9fafb;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.lang-tag:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.lang-tag.active {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}

.lang-tag:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.trigger-section {
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.trigger-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 0;
}

.trigger-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}

.trigger-option input {
  margin: 0;
}

.trigger-option kbd {
  padding: 2px 6px;
  font-size: 11px;
  border-radius: 4px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
}

.api-section {
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.api-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 10px;
}

.api-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #374151;
}

.api-label span {
  font-weight: 500;
  color: #111827;
}

.api-input {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
}

.api-input::placeholder {
  color: #9ca3af;
}

.api-hint {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.35;
  margin-top: 2px;
}

.btn-save {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #409eff;
  background: #409eff;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.btn-save:hover {
  background: #66b1ff;
  border-color: #66b1ff;
}

.api-status {
  margin: 6px 0 0;
  font-size: 12px;
  color: #16a34a;
}
</style>

