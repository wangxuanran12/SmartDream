# SmartDream

SmartDream 是一款基于 **Electron、React 和 TypeScript** 的 AI 编程助手桌面应用。支持兼容 OpenAI API 的真实流式对话；未配置 API Key 或请求失败时，自动使用动态 Mock 回复。

## ✨ 特性

- **跨平台**：一套代码同时支持 macOS 和 Windows，标题栏自动适配
  - macOS：原生红绿灯（靠左）
  - Windows：自绘「最小化/最大化/关闭」按钮（靠右）
- **三栏布局**：侧边栏（会话 + 文件树）／对话区／预览面板
- **真实文件系统**：通过 Electron IPC 读取真实磁盘目录树和文件内容
- **代码高亮**：Shiki 语法高亮 + 一键复制
- **内联 Diff**：自研 LCS 算法的 Codex 风格红删绿增 diff 视图
- **流式对话**：支持 OpenAI 兼容 API 流式输出；离线或未配置 API 时使用动态 Mock 回复
- **本地持久化**：使用 SQLite 保存会话、消息、设置和用户信息
- **斜杠命令**：`/` 触发命令菜单（文件、搜索、测试等）
- **主题切换**：深色（默认）/ 浅色
- **面板拖拽**：侧边栏和预览面板宽度可拖拽调整

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 桌面运行时 | Electron 44 |
| 构建 | electron-vite 2（Vite 5） |
| UI | React 18 + TypeScript 5 |
| 状态管理 | Zustand |
| 持久化 | SQLite（Node.js 内置 `node:sqlite`） |
| 模型接入 | OpenAI 兼容 Chat Completions API（SSE） |
| 样式 | Tailwind CSS 3 |
| 代码高亮 | Shiki |
| Markdown | react-markdown + remark-gfm |
| 图标 | lucide-react |
| 打包 | electron-builder |

## 📦 快速开始

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev
```

应用可在设置中配置 API Key、Base URL 和模型 ID。API Key 保存在本机应用数据中；请勿将其提交到代码仓库。

## 🚀 打包

```bash
# macOS（生成 .dmg）
npm run build:mac

# Windows（生成 NSIS 安装包 .exe）
npm run build:win

# 仅构建解包目录（不生成安装包，调试用）
npm run build:unpack
```

打包产物输出到 `release/` 目录。

## 🏗 项目结构

```
├── electron.vite.config.ts    # electron-vite 构建配置
├── electron-builder.yml        # 双平台打包配置
├── src/
│   ├── main/
│   │   ├── index.ts            # 主进程：窗口、文件访问授权、IPC handler
│   │   ├── db.ts               # SQLite 持久化
│   │   └── llm.ts              # OpenAI 兼容 API 流式转发
│   ├── preload/index.ts        # contextBridge 暴露白名单 API
│   ├── shared/types.ts         # 三端共享的类型 + IPC 契约
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── App.tsx         # 三栏布局组装
│           ├── components/     # 组件
│           ├── store/          # Zustand 状态
│           ├── lib/diff.ts     # LCS diff 算法
│           └── data/           # 示例数据与动态 Mock 回复
└── build/                      # 图标、打包资源
```

## 🔌 IPC 与安全

渲染进程仅通过 `preload` 的 `contextBridge` 调用白名单 API；应用开启 `contextIsolation`、关闭 `nodeIntegration`。本地文件访问由主进程验证授权路径。更多 IPC、持久化与架构细节见 [`docs/技术说明.md`](docs/技术说明.md)。

## 🔄 架构说明

```
┌─────────────────────────────────────────┐
│           React 渲染层（renderer）        │
│  三栏 UI + Zustand + Shiki + 自研 diff   │
└───────────────┬─────────────────────────┘
                │  window.electronAPI（contextBridge）
┌───────────────▼─────────────────────────┐
│           preload（桥接层）               │
│  白名单 API + 类型契约                    │
└───────────────┬─────────────────────────┘
                │  ipcRenderer.invoke / send
┌───────────────▼─────────────────────────┐
│           main（主进程）                  │
│     窗口管理 + 文件授权 + SQLite + LLM     │
└─────────────────────────────────────────┘
```

## 📝 说明

- 对话支持真实模型 API；未配置 API Key 时使用内置动态 Mock 回复。
- 文件系统能力通过 Electron IPC 实现，访问本机文件或文件夹前需要用户授权。
- 会话和设置存储在本机 SQLite 数据库中；本机运行数据不纳入版本控制。
- 功能说明见 [`docs/功能说明.md`](docs/功能说明.md)。
