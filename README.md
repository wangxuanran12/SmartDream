# SmartDream

SmartDream 是一款基于 **Electron、React 和 TypeScript** 的 AI 编程助手桌面应用。支持兼容 OpenAI API 的真实流式对话；未配置 API Key 或请求失败时，自动使用动态 Mock 回复。

## ✨ 特性

- **平台适配**：提供 macOS 与 Windows 的标题栏和打包目标；安装、升级与数据目录行为仍需在目标系统验收
  - macOS：原生红绿灯（靠左）
  - Windows：自绘「最小化/最大化/关闭」按钮（靠右）
- **三栏布局**：侧边栏（会话 + 文件树）／对话区／预览面板
- **真实文件系统**：通过 Electron IPC 读取真实磁盘目录树和文件内容
- **代码高亮**：Shiki 语法高亮 + 一键复制
- **Diff 边界**：内置受规模限制的逐行 Diff 算法；聊天中的 `diff` 代码块目前按原文显示，不是文件差异视图
- **流式对话**：支持 OpenAI 兼容 API 流式输出；离线或未配置 API 时使用动态 Mock 回复
- **本地持久化**：使用 SQLite 保存会话、消息、设置和用户信息
- **斜杠命令**：`/` 触发命令建议菜单；当前只有 `/clear` 会执行本地操作
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
# 按锁文件安装依赖
npm ci

# 开发模式运行
npm run dev
```

应用可在设置中配置 API Key、Base URL 和模型 ID。API Key 由主进程管理并优先存入系统安全存储；请勿将其提交到代码仓库。

## ✅ 检查与测试

```bash
npm run typecheck
npm test
npm run build
```

`npm test` 使用 Node.js 内置测试运行器，无需额外测试框架。GitHub Actions 在推送到 `main` 或 P2 整改分支、以及针对 `main` 的 Pull Request 上运行相同门禁。

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

渲染进程没有直接的 Node.js 文件系统能力，通过 `preload` 暴露的白名单 API 请求主进程操作；主进程对文件路径再次执行真实路径及本次运行授权校验。UI 中的权限选项不是文件写入/命令执行沙箱：当前 Agent 不具备本地文件修改或命令执行工具。更多细节见 [`docs/技术说明.md`](docs/技术说明.md)。

## 💾 本地数据

普通安装使用当前用户的系统应用数据目录下 `SmartDream/`（macOS 通常为 `~/Library/Application Support/SmartDream/`，Windows 通常为 `%APPDATA%\\SmartDream\\`），不再写入安装目录。升级后首次启动会把旧安装目录旁的 `SmartDream/` 数据复制到新位置；复制不删除旧目录，也不覆盖目标中已有文件，发生冲突时会提示。`WORKBUDDY_DATA_DIR` 仅供测试/自动化显式覆盖数据目录，设置后跳过迁移，不是便携模式。

API Key 由主进程管理，优先使用系统安全存储；若当前平台无法安全持久化，新输入的 Key 仅在本次运行有效。旧版数据库副本中的明文 Key 会尝试迁移到安全存储；安全存储不可用时会从新目录副本删除并提示重新录入。旧数据目录保留原样，可能仍含旧版明文 Key；确认新数据和密钥状态后，如需彻底删除旧副本，请手动移除旧目录。

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

## 📝 当前功能边界

- 可配置 OpenAI 兼容流式模型；没有 API Key 或调用失败时使用明确标注的演示回复。会话模型选择会进入请求。
- 附件只有在主进程确认授权后才会读取；文本附件和文件附件有大小上限。未配置真实模型时不会读取/发送文件附件。
- 多个会话可保存和切换，但当前聊天流为单个全局在途请求；启动新请求会中止前一请求，不代表后台并行执行。
- Plan、权限开关、搜索/测试等斜杠命令不执行本地修改或命令；普通命令目前作为输入提示发送，只有 `/clear` 是本地命令。
- 文件预览目前只有文件树与源码两页；项目说明文档存放于名为“项目说明”的工作空间根目录。
- 功能逐项说明见 [`docs/功能说明.md`](docs/功能说明.md)。
