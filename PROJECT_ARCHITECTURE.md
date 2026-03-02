## Multi-Language Selection Translator —— 架构与技术说明

### 一、整体定位

Multi-Language Selection Translator 是一个基于 **Chrome Manifest V3 + Vue 3 + Vite** 的浏览器划词多语言翻译扩展。  
核心能力是：用户在任意网页中选中文本后，自动调用配置好的云端大模型 API，将原文翻译/解释为多种目标语言，并以浮动卡片的形式在页面上展示，同时支持朗读与本地生词存储扩展。

整体分为四个主要子模块：

- **后台 Service Worker（Background）**：统一封装云端翻译 API 调用逻辑。
- **内容脚本（Content Scripts）**：负责监听划词事件，在页面上渲染翻译浮动卡片，并与后台交互。
- **弹窗配置页（Popup）**：负责云端 API 配置、触发模式与目标语言选择。
- **工具与领域模型（Utils & Types & Constants）**：包括翻译结果解析、语言配置、存储 Key 管理、生词本 DB 等。

---

### 二、架构分层与模块职责

#### 1. 浏览器扩展层（Manifest 与打包）

- `manifest.json`  
  - `manifest_version: 3`：基于 MV3 的 Service Worker 架构。
  - `background.service_worker: src/background/index.ts`：指定后台脚本入口（使用 ES module）。
  - `content_scripts: src/content_script/index.ts`：注入到 `<all_urls>`，用于监听页面内文本选择。
  - `action.default_popup: src/popup/index.html`：扩展图标对应的弹窗 UI。
  - 权限：`storage`（存储配置）、`activeTab` + `scripting`（操作当前页面）、`host_permissions: https://*/*`（访问云端 API）。

- `vite.config.ts`
  - 使用 `@crxjs/vite-plugin` 将 MV3 清单与源码打包为扩展。
  - 配置 `@` 别名指向 `/src`，统一模块引用。
  - 同时启用 `@vitejs/plugin-vue` 支持 Vue 3 单文件组件开发。

#### 2. 后台服务层（Background Service Worker）

- 文件：`src/background/index.ts`

主要职责：

- 从 `chrome.storage.local` 读取云端 API 配置：
  - `STORAGE_KEYS.cloudApiUrl`
  - `STORAGE_KEYS.cloudApiKey`
  - `STORAGE_KEYS.cloudModel`
- 封装通用的云端调用函数 `callCloudTranslation`：
  - 基于 `buildTranslationSystemPrompt` 构造系统提示，将前端选择的目标语言动态注入 Prompt 中。
  - 调用用户填入的 `chat-completions` 兼容接口：
    - 自动填充 `Authorization: Bearer <key>`。
    - 将 `{ term, contextText }` 以 JSON 字符串形式作为 user message 内容。
  - 针对常见配置错误进行前置校验与错误文案处理：
    - 未配置 URL/Key 时抛出「Cloud API is not configured」类错误。
    - 返回内容疑似非 chat-completions 接口（欢迎页/文档页标识）时，给出「当前 API endpoint 不是 chat-completions 接口」的友好提示。
  - 将大模型返回的 `content` 交给 `parseTranslationResult` 做强类型解析与容错。

- 消息总线：
  - 通过 `chrome.runtime.onMessage.addListener` 监听 Content Script 发起的 `TRANSLATE_TERM` 消息：
    - `TranslateMessagePayload` 中包含 `term`、`contextText` 与用户本次选择的 `languages`。
    - 使用 `normalizeSelectedLanguages` 做白名单校验与兜底。
    - 成功返回 `TranslateResponseOk`；失败时捕获异常并返回 `TranslateResponseErr`，同时打日志。
  - 通过 `return true` 使监听器支持异步 `sendResponse`。

> **总结**：Background 层将“调用大模型 + 格式对齐 + 错误兜底”统一收口，对外只暴露一个稳定的消息接口。

#### 3. 内容脚本层（Content Script + Floating Card + Speech）

##### 3.1 划词检测与挂载入口

- 文件：`src/content_script/index.ts`

核心流程：

1. **获取选择上下文**：  
   使用 `window.getSelection()` + `Range.getBoundingClientRect()` 计算被选中文本的内容与在页面中的绝对位置（考虑 `scrollX/scrollY`），构造：
   - `SelectionContext`：`text`、`rect`（位置尺寸）、`anchorNode`。

2. **Shadow DOM 承载浮动卡片**：
   - 通过 `ensureCardRoot` 创建一个全屏透明的 `host` 容器，使用 `attachShadow({ mode: 'open' })` 隔离样式。
   - 在 Shadow Root 中插入：
     - `backdrop`：透明全屏层，点击后关闭卡片。
     - 真正挂载 Vue 组件的 `root` 节点，并在 Shadow 内注入一段样式，保证卡片 UI 在任意页面上都稳定可控（不被站点 CSS 污染）。
   - 使用 `z-index: 2147483647` 确保浮动卡片始终位于最前。

3. **事件监听与触发模式**：
   - 监听 `window.addEventListener('mouseup', handleMouseUp)`：
     - 获取当前选择上下文；若无有效选择则直接返回。
     - 读取 `chrome.storage.sync` 中的：
       - `STORAGE_KEYS.triggerMode`：通过 `normalizeTriggerMode` 处理非法值。
       - `STORAGE_KEYS.selectedLanguages`：通过 `normalizeSelectedLanguages` 还原为限定长度的语言数组。
     - 若触发模式为 `modifier` 且当前未按住 `Alt` 键，则不触发翻译。
     - 否则调用 `mountFloatingCard`，将位置、文本与语言列表传递给浮动卡片组件。

##### 3.2 浮动卡片组件

- 文件：`src/content_script/FloatingCard.vue`

职责与实现要点：

- **展示层**：
  - 根据 `props.rect` 计算卡片的绝对定位样式（右下偏移固定像素，避免遮挡原文）。
  - 使用 `layout-rows-inner` 按行展示各目标语言释义，每行包含：
    - 语言短标签（如「中 / EN / 日」），来自 `getLanguageShortLabel`。
    - 对应语言的翻译文本 `result.explanations[langId]`。
    - 朗读按钮（若该语言文本可朗读）。

- **数据加载层**：
  - 在 `onMounted` 中调用 `translateWithCloud`：
    - `cloudFn` 由 `createCloudFnFromBackground()` 提供，实质是封装好的 `chrome.runtime.sendMessage` 请求。
    - 请求完成后写入 `result`，并关闭 `loading`。
  - 异常处理分支细化：
    - 扩展重载 / context 失效：提示用户刷新页面重新划词。
    - 云端未配置 / 暂不可用：给出“请配置云端 API”的文案，并通过 `showConfigHint` 控制是否显示引导说明。
    - 网络错误：提示检查网络或 API 配置。
    - 其它错误：直接暴露错误消息，方便排查。

- **朗读（TTS）集成**：
  - 使用 `speak(text, langId)` 与 `stopSpeaking()` 对接 Web Speech API。
  - 通过 `speakingLangId` 标记当前正在朗读的语言，用于按钮样式的“播放中”高亮。
  - 在组件卸载时解除语音事件监听并停止朗读。

##### 3.3 语音朗读模块

- 文件：`src/content_script/speech.ts`

功能概览：

- 基于 **Web Speech API (SpeechSynthesis)** 实现跨语言 TTS：
  - 使用 `getLanguageSpeechLocale` 将语言 id（如 `en`、`zh`）映射为 BCP 47 语言标签（如 `en-US`、`zh-CN`）。
  - 懒加载并缓存浏览器提供的 `SpeechSynthesisVoice` 列表，处理 Chrome 中 `voiceschanged` 异步触发的兼容问题。
  - `pickVoiceForLang` 先尝试完全匹配语言标签，再退化为前缀匹配，最后兜底为默认 voice。
- 文本过滤：
  - 统一使用 `isSpeakableText` 对空字符串、占位文案（如“该语言释义未返回”）做过滤，避免朗读无效内容。

---

### 三、配置与状态管理层（Popup + Storage）

#### 1. 弹窗页面

- 文件：`src/popup/App.vue`

主要功能：

- **Cloud API Settings**：
  - 允许用户配置：
    - `API endpoint`：兼容 OpenAI / 其他厂商的 `chat/completions` 接口地址。
    - `API Key`：以密码形式输入，不在界面中明文展示。
    - `Model`：模型名称，默认可使用 `gpt-4o-mini`。
  - 保存在 `chrome.storage.local` 中（仅本地浏览器，不随账号同步），通过 `STORAGE_KEYS.cloudApi*` 统一键名管理。

- **Trigger（触发方式）**：
  - 使用 `TriggerMode` 联合类型 + `normalizeTriggerMode` 管理两种模式：
    - `modifier`：按住 `Alt` 再划词才触发翻译。
    - `instant`：任意划词即触发翻译。
  - 配置存储于 `chrome.storage.sync`，自动在多设备间同步。

- **Languages（目标语言选择）**：
  - 展示 `SUPPORTED_LANGUAGES` 中配置的语言标签。
  - 通过 `normalizeSelectedLanguages` 和 `MAX_SELECTED_LANGUAGES`、`MIN_SELECTED_LANGUAGES` 控制可选范围（1～3 个）。
  - 点击切换语言 tag 即更新 `selectedLanguages`，并存入 `chrome.storage.sync`。

#### 2. 常量与类型

- `src/constants/languages.ts`：
  - 统一维护支持语言列表 `SUPPORTED_LANGUAGES`，同时提供：
    - `SelectedLanguages` 精确约束「长度 1～3 的只读数组」。
    - `getLanguageShortLabel` / `getLanguagePromptName` / `getLanguageSpeechLocale` 等工具函数。
  - 通过 `isSelectedLanguages` + `normalizeSelectedLanguages` 组合，将存储中读取的未知值收敛为安全、受限的类型。

- `src/constants/storageKeys.ts`：
  - `STORAGE_KEYS` 对所有存储字段统一命名，集中管理，避免散布硬编码字符串。
  - 提供 `TriggerMode` 与 `normalizeTriggerMode`，确保非法值自动回退到默认模式。

- `src/constants/prompts.ts`：
  - `buildTranslationSystemPrompt` 将「所选语言」转化为 instruct LLM 的系统提示：
    - 强制规范输出为**单一 JSON 对象**，避免 Markdown/多段文本污染。
    - 明确 `term` / `explanations` 的字段结构。
    - 允许对「单词」与「句子」采用不同风格（词语级表达 vs 句子级翻译）。

---

### 四、翻译结果解析与容错策略

- 文件：`src/types/translation.ts`

设计亮点：

- **强类型翻译结果模型**：
  - `TranslationResult` 中 `explanations` 使用 `Partial<Record<LanguageId, string>>`，既保证 key 来自受控枚举，又允许按需返回。

- **通用消息协议**：
  - `TranslateMessagePayload` / `TranslateResponse*` 定义了 Content Script 与 Background 之间的强类型 RPC 协议。

- **多层级 JSON 结构兼容**：
  - `parseTranslationResult` 支持多种大模型返回格式：
    - 顶层 `explanations` 对象。
    - 平铺的 `id_explanation` 字段（如 `en_explanation`）。
    - 旧字段名（如 `chinese_explanation`、`english_expression` 等），通过 `LEGACY_KEY_TO_LANG` 兼容。
    - key 名含语言特征词的模糊匹配（`zh/中文`、`en/english` 等），通过正则扫描兜底。
    - 被 Markdown 代码块包裹时（```json ... ```）自动剥离。
    - 双重 JSON 字符串（内容被再次 stringify）时自动解套。
  - 对于缺失的语言释义统一填充占位文案 `"（该语言释义未返回，请检查模型输出格式）"`，既避免抛错又方便用户感知问题。

> **价值**：在面对不同厂商/网关包装后的大模型返回格式时，前端几乎无需改动，只需通过 Prompt 约束或轻量调整解析策略即可稳定运行。

---

### 五、本地生词本扩展能力

- 文件：`src/utils/db.ts`

功能说明：

- 基于 **Dexie** 对 IndexedDB 做了轻量封装：
  - 数据库名：`VocabDB`。
  - 表结构：`vocabularies`，字段包括：
    - `term` 原词
    - `chinese` / `english` / `japanese` 等固定语言释义
    - `context` 语境（原句/使用场景）
    - `created_at` 创建时间（用于排序）
  - 提供：
    - `addVocabulary`：插入新词（自动补 `created_at`）。
    - `getAllVocabularies`：按创建时间倒序获取全部词条。

当前项目中 UI 未完全打通，但该模块为后续「生词本/收藏夹」功能预留了完整的数据层能力。

---

### 六、技术亮点总结（可用于简历/项目介绍）

项目名称：Multi-Language Selection Translator 浏览器划词翻译扩展

项目简介：

该项目基于 **Chrome Manifest V3 + Vue3 + Vite** 构建，实现了任意网页文本划词后自动调用云端大模型进行多语言翻译的能力。通过内容脚本 + Shadow DOM 浮动卡片形式无侵入地展示结果，并结合 Web Speech API 与 IndexedDB，为后续生词本与语音学习场景提供了扩展空间。

工作内容：

1. 设计并落地 **MV3 扩展分层架构**：将后台 Service Worker、内容脚本与弹窗配置页进行职责拆分，统一通过 `TranslateMessagePayload / TranslateResponse` 消息协议解耦前后端，确保云端翻译能力在多页面、多上下文中稳定复用。

2. 构建 **高鲁棒性的 LLM 翻译结果解析链路**：通过 `buildTranslationSystemPrompt` 强约束返回结构，并在 `parseTranslationResult` 中兼容 Markdown 包裹、双重 JSON 字符串、平铺字段名与模糊 key 匹配等多种返回格式，在上游模型不可控的前提下仍保证前端数据结构稳定。

3. 实现 **基于 Shadow DOM 的页面无侵入浮动卡片 UI**：内容脚本通过独立 Shadow Root 注入 Vue 组件，并结合全屏透明遮罩与最高层级 z-index 管理，避免站点 CSS 污染和交互冲突，实现跨任意网站的一致翻译体验。

4. 集成 **多语言 Web Speech TTS 能力**：基于 Web Speech API 和 `getLanguageSpeechLocale` 自动选择最合适的语音与地区，并对不可朗读内容做统一过滤与状态回调，为多语言听力/发音学习场景提供即开即用的朗读功能。

5. 预埋 **IndexedDB 生词本数据层**：使用 Dexie 抽象 IndexedDB 表结构与访问方法，设计 `Vocabulary` 领域模型与时间序排序方案，为后续在弹窗或独立页面中构建收藏生词、复习列表等复杂功能提供可扩展的数据基础。

