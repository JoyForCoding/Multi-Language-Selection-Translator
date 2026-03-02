import { createApp } from 'vue';
import FloatingCard from './FloatingCard.vue';
import { DEFAULT_SELECTED_LANGUAGES, normalizeSelectedLanguages } from '@/constants/languages';
import type { SelectedLanguages } from '@/constants/languages';
import {
  STORAGE_KEYS,
  normalizeTriggerMode,
  type TriggerMode,
} from '@/constants/storageKeys';

console.log('[content_script] loaded');

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SelectionContext {
  text: string;
  rect: SelectionRect;
  anchorNode: Element | null;
}

const getSelectionContext = (): SelectionContext | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const text = selection.toString().trim();
  if (!text) return null;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  const absoluteX = rect.left + window.scrollX;
  const absoluteY = rect.top + window.scrollY;

  const selectionRect: SelectionRect = {
    x: absoluteX,
    y: absoluteY,
    width: rect.width,
    height: rect.height,
  };

  const container = range.commonAncestorContainer;
  const anchorNode =
    container.nodeType === Node.ELEMENT_NODE
      ? (container as Element)
      : container.parentElement;

  return {
    text,
    rect: selectionRect,
    anchorNode: anchorNode ?? null,
  };
};

let cardHost: HTMLDivElement | null = null;
let cardShadowRoot: ShadowRoot | null = null;
let cardApp: ReturnType<typeof createApp> | null = null;

function closeFloatingCard(): void {
  if (cardApp) {
    cardApp.unmount();
    cardApp = null;
  }
  if (cardHost?.parentNode) {
    cardHost.remove();
    cardHost = null;
    cardShadowRoot = null;
  }
}

function ensureCardRoot(): { host: HTMLDivElement; shadowRoot: ShadowRoot } {
  if (cardHost?.parentNode && cardShadowRoot) {
    return { host: cardHost, shadowRoot: cardShadowRoot };
  }
  if (cardHost) {
    cardHost.remove();
  }
  const host = document.createElement('div');
  host.style.setProperty('position', 'fixed');
  host.style.setProperty('inset', '0');
  host.style.setProperty('z-index', '2147483647');
  host.style.setProperty('pointer-events', 'auto');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:0;background:transparent;';
  backdrop.addEventListener('click', closeFloatingCard);
  const root = document.createElement('div');
  root.setAttribute('data-floating-card-mount', '');
  root.style.cssText = 'position:relative;z-index:1;pointer-events:none;';
  shadowRoot.appendChild(backdrop);
  shadowRoot.appendChild(root);
  const style = document.createElement('style');
  style.textContent = `
    div { background: transparent; }
    .floating-card, [class*="floating-card"] {
      background: #ffffff !important;
      border: 1px solid #d1d5db !important;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.12) !important;
      pointer-events: auto;
      min-width: 200px;
      max-width: 420px;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #111827;
      box-sizing: border-box;
      backdrop-filter: none;
    }
    .floating-card .layout-rows-inner {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .floating-card .layout-rows-inner .row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .floating-card .layout-rows-inner .flag {
      flex-shrink: 0;
      margin-right: 5px;
    }
    .floating-card .layout-rows-inner .value {
      flex: 1;
      min-width: 0;
      font-size: 12px;
      line-height: 1.4;
      word-break: break-word;
      color: #111827;
      margin: 0;
    }
    .floating-card .value { color: #111827 !important; margin: 0; }
    .floating-card .loading-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 12px 0;
    }
    .floating-card .loading-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid #e2e8f0;
      border-top-color: #64748b;
      border-radius: 50%;
      animation: floating-card-spin 0.7s linear infinite;
    }
    @keyframes floating-card-spin {
      to { transform: rotate(360deg); }
    }
    .floating-card .error { color: #dc2626; margin: 0; }
    .floating-card .hint { font-size: 11px; color: #6b7280; margin: 8px 0 0; }
    .floating-card .speak-btn {
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
    .floating-card .speak-btn:hover {
      background: #e5e7eb;
      color: #374151;
    }
    .floating-card .speak-btn.speaking {
      background: #dbeafe;
      color: #2563eb;
    }
    .floating-card .speak-icon {
      width: 16px;
      height: 16px;
    }
  `;
  shadowRoot.appendChild(style);
  document.documentElement.appendChild(host);
  cardHost = host;
  cardShadowRoot = shadowRoot;
  return { host, shadowRoot };
}

function mountFloatingCard(
  rect: SelectionRect,
  term: string,
  contextText: string,
  languages: SelectedLanguages = DEFAULT_SELECTED_LANGUAGES
): void {
  if (cardApp) {
    cardApp.unmount();
    cardApp = null;
  }
  const { shadowRoot } = ensureCardRoot();
  // 挂载到第二个子节点（第一个是 backdrop 透明层，第二个是卡片容器）
  const root = shadowRoot.children[1];
  if (!root || root.tagName !== 'DIV') return;
  const app = createApp(FloatingCard, {
    rect,
    term,
    contextText,
    languages,
  });
  app.mount(root);
  cardApp = app;
}

const handleMouseUp = (e: MouseEvent) => {
  const context = getSelectionContext();
  if (!context) return;
  chrome.storage.sync.get([STORAGE_KEYS.selectedLanguages, STORAGE_KEYS.triggerMode], (stored) => {
    const triggerMode = normalizeTriggerMode(stored?.[STORAGE_KEYS.triggerMode]);
    if (triggerMode === 'modifier' && !e.altKey) return;
    const languages = normalizeSelectedLanguages(stored?.[STORAGE_KEYS.selectedLanguages]);
    mountFloatingCard(context.rect, context.text, context.text, languages);
  });
};

window.addEventListener('mouseup', handleMouseUp);

