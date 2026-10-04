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

- 核心交互形态为**左侧任务与文件树、中部流式对话、右侧代码预览 / Diff** 的三栏布局；
- 重点展示 Electron + React + TypeScript 全链路桌面开发能力；
- 对话智能采用「真实 GLM API + 动态 Mock 兜底」双层架构；
- 文件浏览、窗口控制等能力对接真实文件系统与操作系统。

## 功能模块总览

| # | 模块 | 核心能力 |
|---|---|---|
| 1 | 登录与账户 | 登录页、登录态持久化、用户菜单 |
| 2 | 窗口与跨平台 | 平台差异化标题栏、窗口控制、外链拦截 |
| 3 | 任务管理 | 任务列表、新建 / 删除 / 重命名、SQLite 持久化 |
| 4 | 对话与消息 | Markdown 渲染、代码高亮、流式输出、运行耗时 |
| 5 | 工作模式 | Agent（默认）/ Plan（计划）/ Ask（仅问答） |
| 6 | 模型服务 | GLM API 真实调用 + Mock 动态兜底 |
| 7 | 工作空间与空间 | 目录授权、多空间管理、新建空间 |
| 8 | 权限管理 | 默认权限 / 完全访问权限 |
| 9 | 输入框与附件 | 拖拽添加文件、超长粘贴压缩 Chip、斜杠命令 |
| 10 | 文件浏览与预览 | 真实文件树、代码预览、系统打开 |
| 11 | Diff 代码对比 | 内联红删绿增视图 |
| 12 | 外观与布局 | 深浅主题、面板拖拽折叠、字体缩放 |
| 13 | 设置弹窗 | 语言、字体大小、存储信息、空间路径 |
| 14 | 全局搜索 | 任务 / 空间 / 产物文件关键字搜索 |
| 15 | 侧边栏与状态栏 | 分组列表、用户信息行、预览面板状态栏 |
| 16 | 国际化 | 简体中文 / English 双语切换 |

## 模块明细

### 1. 登录与账户

- 未登录时全屏展示登录页：居中吉祥物插画 + 标语 + 黑色胶囊登录按钮 + 底部隐私政策 / 服务条款入口；
- 点击登录进入三栏主界面，登录态持久化（重启保持）；用户菜单「退出登录」可返回登录页；
- 侧边栏底部用户信息行（头像 / 用户名 / 套餐），点击弹出用户菜单：用户名一键复制、体验版与积分余额、设置（⌘,/Ctrl+,）等入口。

### 2. 窗口与跨平台

- macOS 保留原生红绿灯（hiddenInset 靠左）；Windows 隐藏系统标题栏，由渲染层自绘最小化 / 最大化 / 关闭按钮（靠右）；
- 窗口控制 IPC：最小化 / 最大化还原切换 / 关闭，Windows 最大化状态变化实时同步到渲染层；
- 默认窗口 1280×820（最小 960×600），深色背景防白闪；window.open 外链一律交给系统浏览器打开。

### 3. 任务管理

- 侧边栏「任务」分组展示全部任务，执行中任务带绿色脉冲状态点，支持多任务并行与随时切换；
- 新建任务一键创建（默认 Agent 模式），首条用户消息自动截取前 24 字符作为标题，支持手动重命名、删除（删除后自动切换相邻任务）；
- 任务与消息经 SQLite 持久化：重启恢复任务列表、消息记录、设置与工作空间授权；空库首启自动播种示例任务；DB 损坏自动备份重建，极端情况降级内存态不阻塞使用。

### 4. 对话与消息

- 用户 / 助手消息气泡区分；助手消息支持 Markdown（表格、列表、引用等 GFM 扩展）与 Shiki 代码高亮，代码块一键复制；
- 流式打字机输出：真实 API chunk 聚合节流上屏，Mock 回复批量逐字输出；流式回复只在流结束后整条落库；
- 每条助手回复实时显示运行耗时，输出完成后定格；用户气泡携带发送时的工作模式徽标。

### 5. 工作模式（Agent / Plan / Ask）

- **Agent（默认）**：高效执行任务指令，可修改文件；
- **Plan（计划）**：先输出结构化方案卡片（步骤 + 影响范围），确认「开始执行」后进入执行流，可直接输入修改点反复迭代方案；
- **Ask（仅问答）**：只问答不执行、不产生文件改动；
- 通过输入框 + 菜单切换，三种模式互斥；非默认模式时输入框上方显示模式徽标，点击 × 退出回默认模式。

### 6. 模型服务

- 真实调用：主进程转发 OpenAI 兼容 /chat/completions 流式接口，默认 GLM（glm-4.6）；API Key / 接口地址 / 模型名在设置弹窗「模型服务」卡片配置；
- Mock 兜底：未配置 Key 或请求失败且零输出时，按用户输入动态生成回复（引用输入、按关键词 / 模式分支），失败尾部附灰色错误注；
- 输入框工具行内联模型选择器，按任务生效并在底部展示当前模型。

### 7. 工作空间与空间管理

- 授权模型：应用默认不读取任何本地文件；用户通过目录选择器显式选定目录 = 授权该目录可读可写，主进程 IPC 层强制白名单校验；
- 「空间」= 默认空间存储路径下的同名文件夹；侧边栏「空间」分组与 + 菜单均可新建空间（内联命名，主进程校验非法字符 / 长度 / 保留名），创建后自动授权并绑定任务；
- 项目说明由内置的「项目说明」空间承载（功能说明 / 技术说明两份 Markdown 文档，即本空间根目录下的文件）；普通新建空间不再生成「项目说明」文件夹；支持多空间并存，授权目录集合重启后从任务持久化全量恢复。

### 8. 权限管理

- 默认权限：文件修改等敏感操作需用户确认；
- 完全访问权限：+ 菜单全局开关，开启后减少确认步骤（高亮提示风险语义），关闭后恢复默认确认流程。

### 9. 输入框与附件

- 卡片式输入框：输入区在上、工具行在下（+ 菜单 / 默认权限 / 模型选择 / 麦克风占位 / 圆形发送按钮），placeholder 随模式变化；
- 拖拽文件到窗口任意位置出现提示层，松开后以附件卡片进入附件区（不自动发送）；中文输入法组合中的首次回车不误触发发送；
- 粘贴超过 3000 字符的文本自动压缩为 Chip（悬停预览、点击展开回输入框）；
- 斜杠命令：输入 / 唤起命令菜单（添加文件 / 添加目录 / 搜索代码 / 清空会话 / 解释代码 / 生成测试），支持模糊过滤与键盘 ↑↓ / Enter / Tab / Esc 操作。

### 10. 文件浏览与预览

- 预览面板三页签：preview（渲染预览）/ code（源码高亮）/ files（文件树）；
- 文件树由主进程递归扫描真实磁盘目录生成：过滤 node_modules / .git / dist 等与隐藏文件，深度上限 6 层，目录优先排序，条目带文件大小；
- 点击文件按路径读取内容并自动推断语言高亮展示；shell:open-path 系统默认方式打开、shell:show-in-folder 在访达 / 资源管理器中显示。

### 11. Diff 代码对比

- 自研 LCS 算法实现内联 Diff，红删绿增视图，用于展示代码修改前后对比。

### 12. 外观与布局

- 深色（默认）/ 浅色主题即时切换；侧边栏与预览面板宽度可拖拽调整（Resizer），均可整体折叠；
- 侧边栏折叠为窄栏后 hover 图标浮现自定义 tooltip（展开侧边栏 / 新建任务）；
- 字体大小三档（小 / 默认 / 大）经浏览器级缩放即时生效并持久化。

### 13. 设置弹窗

- 用户菜单「设置」或 ⌘,/Ctrl+, 打开；左侧分组导航 + 右侧内容页，非「通用」页为占位；
- 通用页真实生效项：语言（简体中文 / English，弹窗文案实时切换并持久化）、字体大小三档、字体缩放；
- 「存储」区展示真实数据：系统缓存目录路径与占用统计、磁盘总 / 剩余容量、默认工作空间存储路径（可更改并持久化）；
- 「模型服务」卡片配置 API Key / 接口地址 / 模型名。

### 14. 全局搜索

- 侧边栏顶部搜索按钮打开居中搜索弹窗；搜索范围：任务（标题 + 消息全文）、空间（授权目录名 / 路径）、产物文件（工作空间内文件名，带大小）；
- 结果按「最佳匹配 / 任务 / 空间 / 产物」分组展示，命中关键词高亮；键盘 ↑↓ 循环选择、Enter 打开、Ctrl/Cmd+Enter 切换类别、Esc 关闭。

### 15. 侧边栏与状态栏

- 侧边栏自上而下：顶部工具行（折叠 / 搜索 / 筛选）、品牌区（SmartDream + 版本号 + 发现应用）、主导航菜单、「任务 (n)」与「空间 (n)」可折叠分组、底部用户信息行；
- 预览面板底部状态栏：消息数 / 执行状态（就绪 / 执行中）/ 当前模型。

### 16. 国际化

- 全部 UI 文案走统一词典（约 190 键），简体中文 / English 双语随设置实时切换；品牌词（SmartDream / Plan / Ask / GLM 等）与示例对话正文不翻译。
`

const TECH_DOC = `# SmartDream 项目技术说明

> 本文档是空间的内置项目说明（技术篇），从技术角度描述 SmartDream 的整体架构、目录结构与关键实现。AI 助手在本空间的任务中可依据本文档回答项目的技术相关问题。

## 一、技术栈总览

| 层 | 技术 |
|---|---|
| 桌面运行时 | Electron 44（内置 Node 24，兼容 macOS 26） |
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
│   ├── lib/         # diff.ts（LCS Diff）、persistence.ts（IPC 持久化与种子播种）
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
| 工作空间 | fs:get-workspace、fs:authorize-workspace、fs:authorize-file、space:create |
| 系统选择器 | dialog:select-directory、dialog:select-file |
| Shell | shell:open-path、shell:show-in-folder |
| 窗口控制 | window:minimize / maximize / close / is-maximized、window:on-maximize-change |
| 持久化 | db:load、db:session-upsert、db:session-delete、db:message-upsert、db:messages-replace、db:settings-upsert、db:user-upsert |
| 聊天流 | chat:send、chat:on-chunk、chat:abort |

- 渲染层对所有可选 IPC 方法先做 typeof 函数防御再调用，避免新旧 preload 构建不一致导致整树崩溃；
- 文件类 IPC 在主进程做路径白名单强制校验（isPathAllowed：授权目录集合 / 授权文件 / 沙箱工作区），越权直接拒绝，渲染层无法绕过。

## 五、数据持久化（SQLite）

- 驱动：Node 内置 node:sqlite（Electron 44 内置 Node 24，同步 API），**零原生模块依赖**——macOS 本机即可直接打出 Windows 全功能安装包；
- DB 文件：存储根目录（安装目录下 SmartDream/，dev 为项目根 SmartDream/）workbuddy.db，4 张表：tasks / messages / app_settings（KV）/ users；
- 主进程单写者 + WAL 模式 + user_version 迁移位；手动 BEGIN/COMMIT 包装事务；DB 损坏自动备份重建，失败降级纯内存态；
- 流式回复只在流结束整条落库（不逐字写）；重启时 running 状态归一 idle；空库首启幂等播种示例任务；
- 渲染层经 IPC fire-and-forget 访问，不直接接触 DB。

## 六、对话链路（真实 LLM + Mock 兜底）

1. 渲染层 runAssistant（useStore.ts）：读取会话历史最后一条用户消息，组装 system + history 消息；会话绑定的工作空间若含「项目说明」文件夹，自动读取其中功能 / 技术说明注入 system 上下文；
2. preload chatStream：先同步订阅 chat:on-chunk 再 invoke chat:send，settle 后移除监听，返回 { result, cancel }；
3. 主进程 runChatStream（llm.ts）：Node 内置 fetch 请求 OpenAI 兼容 /chat/completions（stream: true），Web ReadableStream + TextDecoder 解析 SSE（跨帧半包缓冲、[DONE] 终止、401 归因），首包 / 空闲 30s 双超时，Map<requestId, AbortController> 管理中止；
4. delta 经 event.sender.send 推回渲染层，50ms 聚合节流上屏；流结束整条落库；
5. 兜底：无 API Key 或请求失败且零 chunk 时，generateMockReply 按用户输入与模式动态生成回复，保留打字机流式手感。

## 七、安全模型

- 渲染进程 contextIsolation 开启、nodeIntegration 关闭；主进程仅经 preload contextBridge 暴露白名单 API；
- 文件 / 目录读写一律过主进程路径白名单校验；外链 window.open 一律交系统浏览器；
- API Key 仅存本地 app_settings，经主进程转发请求，不经第三方。

## 八、构建与打包

- 开发：npm run dev（electron-vite dev，renderer HMR；改 preload / 主进程需完整重启）；
- 静态检查：npm run typecheck（node + web 双 tsconfig 工程）；
- 打包：npm run build:mac（dmg）/ npm run build:win -- --x64（NSIS），产物输出 release/；无原生模块依赖，跨平台交叉打包无障碍；
- Windows 版资源注入（图标 / 版本信息）用 afterPack 钩子 + resedit 纯 JS 实现，不依赖 wine。

## 九、本空间说明

- 本「项目说明」空间由应用内置：space:create 创建同名空间时由主进程播种文档至空间根目录；普通新建空间不再生成「项目说明」文件夹，文件缺失时不会影响空间使用；
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
