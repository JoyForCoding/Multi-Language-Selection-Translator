## Multi-Language Selection Translator

Multi-Language Selection Translator 是一个基于 Chrome Manifest V3 和 Vue 3 的浏览器扩展，在网页上「选中文本」即可同时翻译为多种语言，并以浮动卡片的形式展示结果。

### 功能特性

- **多语言同时翻译**：一次选择，自动翻译为你在设置中勾选的多种语言。
- **可配置触发方式**：
  - 仅在按住 `Alt` 键并拖动选择时触发翻译。
  - 或者任何文本选择完成后立即触发翻译。
- **自定义云端翻译 API**：
  - 在弹窗中配置自有的 Chat/LLM 接口（如兼容 OpenAI 的 `chat/completions` 接口）。
  - 支持自定义 API Endpoint、API Key 和 Model。
  - 所有配置仅存储在本地浏览器中，不会同步到云端。
- **轻量 UI**：
  - 设置页（扩展弹窗）使用 Vue 3 编写，简单直观。
  - 翻译结果通过内容脚本在页面上以浮动卡片展示，不影响原页面结构。

### 技术栈

- **运行环境**：Chrome / Chromium 系浏览器扩展，Manifest V3。
- **前端框架**：Vue 3 + TypeScript。
- **构建工具**：Vite。
- **存储**：
  - `chrome.storage.sync`：存储已选语言、触发模式等设置。
  - `chrome.storage.local`：存储云端 API 相关敏感信息（Endpoint / Key / Model）。
- **其它**：
  - `@crxjs/vite-plugin`：简化 MV3 扩展开发与打包。
  - `dexie`：封装 IndexedDB（视具体代码使用情况）。

### 目录结构（简要）

- **`manifest.json`**：Chrome 扩展清单，定义背景脚本、内容脚本、弹窗入口等。
- **`src/popup/App.vue`**：扩展弹窗页面，负责：
  - 选择/勾选需要支持的目标语言。
  - 选择触发模式（按住 Alt 选择 / 直接选择即翻译）。
  - 配置云端翻译 API（Endpoint、API Key、Model）。
- **`src/background/index.ts`**：Service Worker，负责接收内容脚本消息，调用云端翻译接口等（具体逻辑见源码）。
- **`src/content_script/index.ts` / `FloatingCard.vue` / `dualEngineTranslate.ts`**：
  - 注入到网页中的内容脚本。
  - 监听用户的文本选择与触发条件。
  - 通过 `chrome.runtime.sendMessage` 向 Background 发送翻译请求，并将结果展示为浮动卡片。
- **`src/constants/languages.ts`**：支持的语言列表、默认选中语言、最大可选数量等。
- **`src/constants/storageKeys.ts`**：扩展中统一使用的 storage key 常量及默认值。

### 安装与本地开发

#### 1. 克隆与依赖安装

```bash
git clone <your-repo-url>
cd Multi-Language-Selection-Translator
npm install
```

#### 2. 开发模式（推荐在打包后加载 dist）

开发时通常使用打包后的产物进行调试：

```bash
npm run build
```

打包完成后会生成 `dist/` 目录，其中包含：

- 构建好的 `manifest.json`
- 背景脚本、内容脚本、弹窗页面等静态资源

#### 3. 在 Chrome 中加载扩展

1. 打开 Chrome，访问 `chrome://extensions/`。
2. 右上角打开「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择项目根目录下的 `dist/` 文件夹。

加载成功后，你会在浏览器工具栏看到扩展图标。

### 使用说明

1. **第一次使用前配置云端 API**：
   - 点击浏览器工具栏中的扩展图标，打开弹窗。
   - 在「Cloud API Settings」中填写：
     - API endpoint（例如：`https://api.xxx.com/v1/chat/completions`）
     - API Key（例如：`sk-xxx`）
     - Model（例如：`gpt-4o-mini` 或其他兼容模型名）
   - 点击「Save settings」保存。
2. **选择目标语言**：
   - 在「Languages」区域选择你希望看到的目标语言（支持多选，有最大数量限制）。
3. **设置触发方式**：
   - 在「Trigger」中选择：
     - 仅在按住 `Alt` 选择时翻译，或
     - 任意选择文本后立即翻译。
4. **在网页中使用**：
   - 打开任意网页。
   - 按照你配置的触发方式，选择一段文本。
   - 稍等片刻，页面上会出现一个浮动卡片，展示多语言翻译结果。

### 开发脚本

在项目根目录的 `package.json` 中提供了以下脚本：

- **`npm run dev`**：启动 Vite 开发服务器（一般用于调试 popup/组件样式等）。
- **`npm run build`**：构建生产版本扩展，输出到 `dist/`。
- **`npm run preview`**：本地预览构建产物（主要用于页面层面预览）。
- **`npm run type-check`**：使用 `vue-tsc` 进行 TypeScript 类型检查。

### 注意事项

- **API Key 安全**：API Key 仅保存在本地浏览器的 `chrome.storage.local` 中，不会上传到任意服务器，也不会随 Chrome 同步账号同步。请勿将 Key 写入源码或提交到仓库。
- **权限说明**：
  - `activeTab` / `<all_urls>`：用于在用户当前页面上注入内容脚本、展示翻译结果。
  - `storage`：用于保存用户设置和 API 配置。
  - `scripting`：用于动态注入脚本（视具体实现）。
- **浏览器兼容性**：扩展基于 Manifest V3 开发，以 Chrome / Edge 为主。其它 Chromium 浏览器的兼容性视其 MV3 支持情况而定。

### 许可协议

如仓库中包含 `LICENSE` 文件，请以该文件为准；如未指定，可按需要补充开源协议说明（例如 MIT）。

# Vite + Vue3 Chrome Extension (MV3)

使用 Vite + Vue3 + TypeScript + CRXJS 初始化的 Chrome Manifest V3 插件工程。

## 主要技术栈

- Vite 6
- Vue 3
- TypeScript
- @crxjs/vite-plugin（Chrome MV3 打包）

## 目录结构

- `manifest.json`：Chrome MV3 清单文件
- `vite.config.ts`：Vite + CRXJS 配置
- `src/content_script/index.ts`：内容脚本入口
- `src/background/index.ts`：Service Worker（后台脚本）入口
- `src/popup/`：插件图标点击后弹出的 Popup 页面（Vue3）

## 使用方式

```bash
npm install
npm run dev
```

开发期间，使用 `npm run dev` 启动 Vite 开发服务器，然后在 Chrome 中加载 “开发者模式 → 加载已解压的扩展程序”，选择本项目根目录。

