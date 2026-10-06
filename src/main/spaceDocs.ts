// 空间内置「项目说明」文档：新建空间时由主进程自动播种到空间目录下。
// 文档内容描述本项目（SmartDream）的功能与技术架构，空间内任务的 AI 助手
// 可读取这两份文档，以助手身份复述、解答项目相关问题。
import { basename, join } from 'path'
import { mkdir, writeFile } from 'fs/promises'

/** 空间内项目说明文件夹名 */
export const PROJECT_DOCS_DIRNAME = '项目说明'

const FEATURE_DOC = `# SmartDream 项目功能说明

> SmartDream 是一款 AI 编程助手桌面应用，基于 Electron + React + TypeScript 构建，支持 macOS 与 Windows 双平台，当前产品版本 v1.1.10。
>
> 本文档是空间的内置项目说明（功能篇），按功能模块划分。AI 助手在本空间的任务中可依据本文档，以助手身份复述、解答项目的功能相关问题。

## 产品定位

- 核心交互形态为**左侧任务与文件树、中部流式对话、右侧文件树 / 源码内容**的三栏布局；
- 重点展示 Electron + React + TypeScript 全链路桌面开发能力；
- 对话智能采用「真实 GLM API + 动态 Mock 兜底」双层架构；
- 文件浏览、窗口控制等能力对接真实文件系统与操作系统。

## 功能模块总览

| # | 模块 | 核心能力 |
|---|---|---|
| 1 | 登录与账户 | 本地演示登录态、用户菜单（无账号认证服务） |
| 2 | 窗口与平台适配 | 平台差异化标题栏、窗口控制、外链拦截；安装行为待目标系统验收 |
| 3 | 任务管理 | 任务列表、新建 / 删除 / 重命名、SQLite 持久化 |
| 4 | 对话与消息 | Markdown 渲染、代码高亮、流式输出、运行耗时 |
| 5 | 工作模式 | Agent（默认）/ Plan（计划）/ Ask（仅问答） |
| 6 | 模型服务 | GLM API 真实调用 + Mock 动态兜底 |
| 7 | 工作空间与空间 | 目录授权、多空间管理、新建空间 |
| 8 | 权限设置占位 | 默认权限 / 完全访问权限仅为 UI 状态，不授权文件写入或命令执行 |
| 9 | 输入框与附件 | 拖拽添加文件、超长粘贴压缩 Chip、斜杠命令 |
| 10 | 文件浏览与预览 | 真实文件树、代码预览、系统打开 |
| 11 | Diff 代码对比 | Markdown diff 代码块按原文显示，尚无真实文件差异对比 |
| 12 | 外观与布局 | 深浅主题、面板拖拽折叠、字体缩放 |
| 13 | 设置弹窗 | 语言、字体大小、存储信息、空间路径 |
| 14 | 全局搜索 | 任务 / 空间 / 产物文件关键字搜索 |
| 15 | 侧边栏与状态栏 | 分组列表、用户信息行、预览面板状态栏 |
| 16 | 国际化 | 简体中文 / English 双语切换 |

## 实现状态核对

| 能力 | 状态 | 实际行为 |
|---|---|---|
| 模型与附件 | 已实现（受限） | 会话模型进入 OpenAI 兼容请求；附件需主进程授权，未配置真实模型时不读取文件 |
| Agent / Plan | 对话已实现，执行未实现 | 提供建议；不会修改本地文件或运行命令 |
| 斜杠命令 | 部分实现 | 只有 \`/clear\` 是本地操作，其余命令不会触发本地文件动作 |
| 权限选项 | 演示占位 | 只保存 UI 状态，不参与主进程文件授权；聊天 Agent 未接入文件写入或命令执行 |
| 多任务 | 会话切换已实现，并行执行未实现 | 当前只有一个全局在途聊天请求 |
| Diff | 部分实现 | 聊天 diff 代码块原文显示；逐行 Diff 有规模限制但未接入文件变更 |
| 预览 | 部分实现 | 只有文件树和源码两个页签 |
| 平台安装 | 尚待验收 | macOS/Windows 安装、升级、卸载和数据目录行为仍需目标系统验收 |

## 模块明细

### 1. 登录与账户

- 未登录时全屏展示本地演示登录页：居中吉祥物插画 + 标语 + 登录按钮；当前没有账号认证服务；
- 点击登录进入三栏主界面，登录态持久化（重启保持）；用户菜单「退出登录」可返回登录页；
- 侧边栏底部用户信息行（头像 / 用户名 / 套餐），点击弹出用户菜单：用户名一键复制、体验版与积分余额、设置（⌘,/Ctrl+,）等入口。

### 2. 窗口与跨平台

- macOS 保留原生红绿灯（hiddenInset 靠左）；Windows 隐藏系统标题栏，由渲染层自绘最小化 / 最大化 / 关闭按钮（靠右）。安装、升级和卸载行为仍需在目标系统验收；
- 窗口控制 IPC：最小化 / 最大化还原切换 / 关闭，Windows 最大化状态变化实时同步到渲染层；
- 默认窗口 1280×820（最小 960×600），深色背景防白闪；window.open 外链一律交给系统浏览器打开。

### 3. 任务管理

- 侧边栏「任务」分组展示全部任务，执行中任务带绿色脉冲状态点；多个会话可切换，但聊天请求为全局单请求，新请求会中止前一个；
- 新建任务一键创建（默认 Agent 模式），首条用户消息自动截取前 24 字符作为标题，支持手动重命名、删除（删除后自动切换相邻任务）；
- 任务与消息经 SQLite 持久化：重启恢复任务列表、消息记录和设置；文件授权不跨重启恢复。可切换多个会话，但聊天流为全局单请求，新请求会中止前一个；空库首启自动播种示例任务。

### 4. 对话与消息

- 用户 / 助手消息气泡区分；助手消息支持 Markdown（表格、列表、引用等 GFM 扩展）与 Shiki 代码高亮，代码块一键复制；
- 流式打字机输出：真实 API chunk 聚合节流上屏，Mock 回复批量逐字输出；流式回复只在流结束后整条落库；
- 每条助手回复实时显示运行耗时，输出完成后定格；用户气泡携带发送时的工作模式徽标。

### 5. 工作模式（Agent / Plan / Ask）

- **Agent（默认）**：分析对话和已发送的附件并提供建议；当前没有本地文件写入或命令执行工具；
- **Plan（计划）**：先输出建议方案；「开始执行」会发送确认消息并继续对话，但不会实际修改文件或运行命令；
- **Ask（仅问答）**：只问答不执行、不产生文件改动；
- 通过输入框 + 菜单切换，三种模式互斥；非默认模式时输入框上方显示模式徽标，点击 × 退出回默认模式。

### 6. 模型服务

- 真实调用：主进程转发 OpenAI 兼容 /chat/completions 流式接口，默认 GLM（glm-4.6）；API Key / 接口地址 / 模型名在设置弹窗「模型服务」卡片配置；
- 会话模型选择随请求发送；选择 GLM 时使用设置中的模型 ID，其他选择将对应选择值作为模型 ID 发送；
- Mock 兜底：未配置 Key 或模型请求失败时，按用户输入生成演示回复并注明失败原因；演示回复不代表文件读取、修改或测试已执行；
- 输入框工具行内联模型选择器，按任务生效并在底部展示当前模型。实际可用的模型由配置的兼容 API 服务决定。

### 7. 工作空间与空间管理

- 授权模型：主进程直接打开系统选择器并登记授权；目录授权可读写，单文件授权仅可读，真实路径校验阻止符号链接逃逸；
- 授权仅在本次运行有效，重启后不会从会话记录恢复；历史路径可用于显示，再次访问前需重新授权；
- 「空间」= 主进程管理的空间存储根目录下的同名文件夹；侧边栏「空间」分组与 + 菜单均可新建空间（内联命名，主进程校验非法字符 / 长度），创建后绑定任务；自选空间根目录需通过系统选择器授权且仅在本次运行中生效；
- 仅内置「项目说明」空间在空间根目录播种两份 Markdown 文档；普通空间不自动生成说明文档，支持多空间并存。

### 8. 权限管理

- 默认权限 / 完全访问权限目前仅为可持久化的 UI 设置，未接入主进程文件授权决策；聊天 Agent 没有本地文件写入或命令执行工具。

### 9. 输入框与附件

- 卡片式输入框：输入区在上、工具行在下（+ 菜单 / 默认权限 / 模型选择 / 麦克风占位 / 圆形发送按钮），placeholder 随模式变化；
- 拖拽文件到窗口任意位置出现提示层，松开后以附件卡片进入附件区（不自动发送）；配置真实模型后，主进程只读取已授权的文本文件附件（单个最多 1 MiB、总计最多 4 MiB），不向模型发送本地路径；
- 粘贴超过 3000 字符的文本自动压缩为 Chip（悬停预览、点击展开回输入框）；发送时作为文本上下文，单个最多 1 MiB、总计最多 4 MiB；
- 斜杠命令：输入 / 唤起命令建议菜单，支持模糊过滤与键盘 ↑↓ / Enter / Tab / Esc；只有 \`/clear\` 会清空会话，其余建议不会本地搜索、创建文件或运行测试。

### 10. 文件浏览与预览

- 预览面板目前提供「文件」（文件树）与「内容」（源码高亮）两个页签；没有独立渲染预览页签；
- 文件树由主进程递归扫描真实磁盘目录生成：过滤 node_modules / .git / dist 等与隐藏文件，深度上限 6 层、总量上限 5000 项；达到上限会明确提示列表不完整；
- 点击文件按路径读取内容并自动推断语言高亮展示；读取失败显示错误，不回退到同名 Mock 文件；shell:open-path 系统默认方式打开、shell:show-in-folder 在访达 / 资源管理器中显示。

### 11. Diff 代码对比

- \`diff\` Markdown 代码块按其输入原文作为代码块展示；当前不解析 unified diff，也不展示模拟文件差异。

### 12. 外观与布局

- 深色（默认）/ 浅色主题即时切换；侧边栏与预览面板宽度可拖拽调整（Resizer），均可整体折叠；
- 侧边栏折叠为窄栏后 hover 图标浮现自定义 tooltip（展开侧边栏 / 新建任务）；
- 字体大小三档（小 / 默认 / 大）经浏览器级缩放即时生效并持久化。

### 13. 设置弹窗

- 用户菜单「设置」或 ⌘,/Ctrl+, 打开；左侧分组导航 + 右侧内容页，非「通用」页为占位；
- 通用页真实生效项：语言（简体中文 / English，弹窗文案实时切换并持久化）、字体大小三档、字体缩放；
- 「存储」区展示真实数据：系统缓存目录路径与占用统计、磁盘总 / 剩余容量、默认工作空间存储路径；自选目录仅在本次运行中授权，重启后需重新选择；
- 「模型服务」卡片配置 API Key / 接口地址 / 模型名。

### 14. 全局搜索

- 侧边栏顶部搜索按钮打开居中搜索弹窗；搜索范围：任务（标题 + 消息全文）、空间（授权目录名 / 路径）、产物文件（工作空间内文件名，带大小）；
- 结果按「最佳匹配 / 任务 / 空间 / 产物」分组展示，命中关键词高亮；键盘 ↑↓ 循环选择、Enter 打开、Ctrl/Cmd+Enter 切换类别、Esc 关闭。

### 15. 侧边栏与状态栏

- 侧边栏自上而下：顶部工具行（折叠 / 搜索 / 筛选）、品牌区（SmartDream + 版本号 + 发现应用）、主导航菜单、「任务 (n)」与「空间 (n)」可折叠分组、底部用户信息行；
- 预览面板底部状态栏：消息数 / 执行状态（就绪 / 执行中）/ 当前模型。

### 16. 国际化

- 全部 UI 文案走统一词典（约 190 键），简体中文 / English 双语随设置实时切换；品牌词（SmartDream / Plan / Ask / GLM 等）与示例对话正文不翻译。

### 17. 本地数据目录与迁移

- 普通运行使用当前用户系统应用数据目录下的 \`SmartDream/\`，不写入安装目录；\`WORKBUDDY_DATA_DIR\` 是显式测试覆盖项，不是便携模式；
- 从旧版升级时，首次启动会将安装目录旁旧 \`SmartDream/\` 中缺失的文件复制到新位置，保留原目录且不覆盖已有文件；冲突会提示，复制失败会阻止启动；
- 新目录数据库副本中的旧版明文 API Key 会尝试迁移到系统安全存储；安全存储不可用时从新副本删除并提示重新录入。旧目录保留原样，可能仍含明文 Key；确认新数据和密钥状态后需用户手动删除旧目录。
`

const TECH_DOC = `# SmartDream 项目技术说明

> 本文档是空间的内置项目说明（技术篇），从技术角度描述 SmartDream 的整体架构、目录结构与关键实现。AI 助手在本空间的任务中可依据本文档回答项目的技术相关问题。

## 一、技术栈总览

| 层 | 技术 |
|---|---|
| 桌面运行时 | Electron 44（内置 Node 24） |
| 构建 | electron-vite 2（Vite 5），main / preload / renderer 三段式 |
| UI | React 18 + TypeScript 5 + Tailwind CSS 3 |
| 状态管理 | Zustand（会话态 useSessionStore + UI 态 useUIStore + 用户档案 useUserStore） |
| 持久化 | SQLite（Node 内置 node:sqlite，主进程单写者，WAL 模式） |
| 渲染增强 | Shiki 语法高亮、react-markdown + remark-gfm、lucide-react 图标 |
| 打包 | electron-builder（macOS dmg / Windows NSIS，productName = SmartDream） |

## 二、进程架构（Electron 三端）

- **主进程**（src/main/index.ts）：窗口创建与平台差异化标题栏、全部文件系统能力、SQLite 单写者（db.ts）、LLM 流式转发（llm.ts）、IPC 处理器注册；
- **预加载脚本**（src/preload/index.ts）：contextBridge 暴露白名单 API（window.electronAPI），是渲染层访问系统能力的唯一通道；
- **渲染进程**（src/renderer）：React 应用，contextIsolation 开启、nodeIntegration 关闭，零 Node 能力暴露；
- **共享契约**（src/shared/types.ts）：IPC 通道名常量（IPC 对象）与 ElectronAPI / ChatStreamPayload 等类型三端共用，通道名集中常量化避免字符串漂移。

## 三、目录结构

\`\`\`
src/
├── main/            # 主进程
│   ├── index.ts     # 入口：窗口、存储目录、IPC 注册（含 space:create）
│   ├── db.ts        # SQLite 单写者（node:sqlite，WAL + user_version 迁移）
│   ├── llm.ts       # LLM 流式转发（fetch + SSE 解析，30s 超时，AbortController）
│   └── spaceDocs.ts # 空间内置「项目说明」文档模板与播种逻辑
├── preload/
│   └── index.ts     # contextBridge 白名单 API（electronAPI）
├── renderer/src/
│   ├── components/  # UI 组件（Sidebar / Conversation / CommandBar / PreviewPanel /
│   │                #   MessageBubble / Markdown / CodeBlock / DiffView / FileTree /
│   │                #   SearchModal / SettingsModal / Login / TitleBar / Resizer）
│   ├── store/       # useStore.ts：Zustand 会话态 + UI 态 + 用户档案 + runAssistant 对话链路
│   ├── lib/         # diff.ts（有规模上限的 LCS 工具；Markdown diff 块当前按原文显示）、persistence.ts（IPC 持久化与种子播种）
│   ├── data/        # mockData.ts：示例对话、斜杠命令、动态 Mock 回复生成
│   ├── i18n.ts      # 唯一词典（扁平驼峰键，zh / en 双语约 190 键）
│   ├── App.tsx      # 三栏布局组装、全局拖拽、快捷键
│   └── assets/      # 吉祥物插画（SVG）
└── shared/
    └── types.ts     # IPC 通道常量 + 三端共享类型契约
\`\`\`

## 四、IPC 通信契约（约 30 个通道）

| 分组 | 通道 |
|---|---|
| 应用信息 | app:get-info、app:get-storage |
| 文件系统 | fs:read-directory、fs:read-file、fs:read-file-data-url、fs:write-file、fs:create-file |
| 工作空间 | fs:get-workspace、dialog:select-authorized-directory、dialog:select-authorized-file、dialog:select-workspace-root、space:create |
| Shell | shell:open-path、shell:show-in-folder |
| 窗口控制 | window:minimize / maximize / close / is-maximized、window:on-maximize-change |
| 持久化 | db:load、db:session-upsert、db:session-delete、db:message-upsert、db:messages-replace、db:settings-upsert、db:user-upsert |
| 聊天流 | chat:send、chat:on-chunk、chat:abort |

- 渲染层对所有可选 IPC 方法先做 typeof 函数防御再调用，避免新旧 preload 构建不一致导致整树崩溃；
- renderer 没有 Node.js 文件系统接口；主进程对每次文件 IPC 独立检查真实路径、访问模式和当前运行授权。renderer 可调用 preload API，因此安全保证来自主进程校验，而非 UI 隐藏或禁用；
- 文件授权由主进程打开系统选择器并登记；目录授权可读写，单文件授权只读，授权不会从任务记录跨重启恢复；
- 文件类 IPC 在主进程解析真实路径并用路径相对关系检查授权边界，拒绝符号链接逃逸、相似前缀路径和超出大小上限的文件；空间根目录由主进程管理，IPC 不接受 renderer 传入的父路径。

## 五、数据持久化（SQLite）

- 驱动：Node 内置 node:sqlite（Electron 44 内置 Node 24，同步 API），无需 SQLite 原生 npm 模块；
- DB 文件：当前用户系统应用数据目录下 \`SmartDream/workbuddy.db\`（macOS 通常为 \`~/Library/Application Support/SmartDream/\`，Windows 通常为 \`%APPDATA%\\SmartDream\\\`）；开发和打包默认使用相同根目录。\`WORKBUDDY_DATA_DIR\` 仅供测试覆盖并跳过迁移；
- 首次启动新版时会把旧安装目录旁 \`SmartDream/\` 中缺失的文件复制到新目录；旧目录保留，不覆盖已有文件，冲突会提示，复制失败会停止启动；
- DB 包含 5 张表：tasks / messages / app_settings（KV）/ secure_credentials / users；
- 新目录数据库副本中的旧版明文 API Key 会尝试迁移到系统安全存储；安全存储不可用时从新副本删除并提示重新录入。旧目录保留原样，可能仍含明文 Key；确认新数据和密钥状态后需用户手动删除旧目录；
- 主进程单写者 + WAL 模式 + user_version 迁移位；手动 BEGIN/COMMIT 包装事务；DB 损坏自动备份重建，失败降级纯内存态；
- 流式回复只在流结束整条落库（不逐字写）；重启时 running 状态归一 idle；空库首启幂等播种示例任务；
- 渲染层经 IPC 访问，不直接接触 DB；关键写入失败会记录诊断并在应用内显示保存失败提示；hydrate 使用共享 Promise，StrictMode 重复 effect 不会重复播种。

## 六、对话链路（真实 LLM + Mock 兜底）

1. 渲染层 runAssistant（useStore.ts）：按当前会话选择的模型组装 system + history；文本 Chip 作为用户上下文发送，配置真实模型时仅最新消息的文件附件交由主进程授权读取；内置「项目说明」空间从空间根目录读取功能 / 技术说明；
2. preload chatStream：先同步订阅 chat:on-chunk 再 invoke chat:send，settle 后移除监听，返回 { result, cancel }；
3. 主进程先校验附件授权、文本扩展名及 1 MiB 单文件 / 4 MiB 总量上限，再由 runChatStream 请求 OpenAI 兼容 /chat/completions；SSE 解析支持跨帧 UTF-8、CRLF 与 keepalive，连接阶段和首段等待 30s 超时、后续空闲 30s 超时；只有收到 \`[DONE]\` 才正常结束，异常 EOF 会报告失败；
4. delta 经 event.sender.send 推回渲染层，50ms 聚合节流上屏；流结束整条落库；
5. 兜底：无 API Key 或模型请求失败时，generateMockReply 按用户输入与模式生成演示回复并注明失败；演示回复不代表文件读取、修改或测试已执行。

## 七、安全模型

- 渲染进程 sandbox、contextIsolation 开启、nodeIntegration 关闭；主进程仅经 preload contextBridge 暴露白名单 API；
- 文件 / 目录读写与模型附件读取一律过主进程真实路径白名单校验；附件路径不会转发给模型；文件树最多返回 5000 项，截断状态由 UI 提示；
- API Key 由主进程安全凭据服务持有并转发请求，不返回 renderer，也不作为普通 app_settings 持久化。

## 八、构建与打包

- 开发：npm run dev（electron-vite dev，renderer HMR；改 preload / 主进程需完整重启）；
- 门禁：npm run typecheck、npm test、npm run build；GitHub Actions 先运行 npm ci，再执行相同命令；
- 打包目标：npm run build:mac（dmg）/ npm run build:win（NSIS），CI 构建不等同于目标操作系统安装、升级或卸载验收；
- Windows 版资源注入（图标 / 版本信息）用 afterPack 钩子 + resedit 纯 JS 实现，不依赖 wine。

## 九、本空间说明

- 本「项目说明」空间由应用内置：space:create 创建同名空间时由主进程播种文档至空间根目录；普通新建空间不再生成「项目说明」文件夹；读取失败时对话会提示未使用项目文档；
- 可直接编辑这两份 Markdown 补充团队 / 项目约定，AI 助手在任务中会按最新内容作答。
`

/** 空间内置项目说明文档清单（文件名 + 内容） */
const PROJECT_DOC_FILES: Array<{ name: string; content: string }> = [
  { name: '功能说明.md', content: FEATURE_DOC },
  { name: '技术说明.md', content: TECH_DOC }
]

/**
 * 在空间目录下播种「项目说明」文件夹与两份 Markdown 文档。
 * 已存在的文件跳过（不覆盖用户修改）；播种失败不阻塞空间创建，仅打印诊断日志。
 */
export async function seedProjectDocs(spaceDir: string): Promise<void> {
  // 空间本身名为「项目说明」（内置文档空间）时，文档直接放空间根目录，避免嵌套同名子文件夹
  const docsDir =
    basename(spaceDir) === PROJECT_DOCS_DIRNAME ? spaceDir : join(spaceDir, PROJECT_DOCS_DIRNAME)
  try {
    await mkdir(docsDir, { recursive: true })
    await Promise.all(
      PROJECT_DOC_FILES.map(async (file) => {
        try {
          await writeFile(join(docsDir, file.name), file.content, { encoding: 'utf-8', flag: 'wx' })
        } catch (err) {
          // 文件已存在（EEXIST）属预期：保留用户修改，其余错误向上抛出统一记录
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        }
      })
    )
  } catch (err) {
    console.warn('[SmartDream] 播种空间内置项目说明文档失败:', err)
  }
}
