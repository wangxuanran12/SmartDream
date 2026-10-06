import type { Session, SlashCommand, TaskMode } from '../types'

// ---- 斜杠命令注册表 ----
export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'file', trigger: '/file', label: '添加文件', description: '添加文件到上下文', icon: '📄' },
  { id: 'dir', trigger: '/dir', label: '添加目录', description: '添加整个目录', icon: '📁' },
  { id: 'search', trigger: '/search', label: '搜索代码', description: '在项目中搜索', icon: '🔍' },
  { id: 'clear', trigger: '/clear', label: '清空会话', description: '清空当前对话', icon: '🗑️' },
  { id: 'explain', trigger: '/explain', label: '解释代码', description: '解释选中的代码', icon: '💡' },
  { id: 'test', trigger: '/test', label: '生成测试', description: '为代码生成单元测试', icon: '🧪' }
]

// ---- 内置模型列表（对齐 WorkBuddy 任务栏的模型切换）----
export interface ModelOption {
  id: string
  name: string
  desc: string
}

export const MODELS: ModelOption[] = [
  { id: 'minimax', name: 'MiniMax', desc: '执行速度快，适合数据处理与文档生成' },
  { id: 'glm', name: '智谱 GLM', desc: '多步骤、长流程的复杂任务' },
  { id: 'kimi', name: 'Kimi', desc: '截图分析、图片转文档等视觉类任务' },
  { id: 'deepseek', name: 'DeepSeek', desc: '日常问答、文案撰写，响应快、成本低' },
  { id: 'hunyuan', name: '腾讯混元', desc: '中文写作、会议纪要、中文文档处理' }
]

// ---- 工作模式元数据 ----
export const MODE_META = {
  agent: { label: 'Agent', hint: '高效执行并完成你的任务指令，可修改文件' },
  plan: { label: '计划 Plan', hint: '先规划任务，等你确认后再执行' },
  ask: { label: '仅问答 Ask', hint: '适合问问题、找思路，不做执行' }
} as const

// ---- mock 回复：不同工作模式 ----
export const MOCK_REPLY = `我来分析一下你的需求。根据当前项目的结构，我会采用以下方案：

1. **数据层**：通过 Electron 主进程的 IPC 读取真实文件系统
2. **状态管理**：使用 Zustand 管理会话与 UI 状态
3. **代码高亮**：Shiki 提供语法高亮，diff 用自研 LCS 算法

\`\`\`ts
export const add = (a: number, b: number): number => a + b
\`\`\`

如果需要继续，可以告诉我更具体的需求。`

export const MOCK_ASK_REPLY = `这是个好问题，简单说：

- **概念层面**：核心在于职责边界——执行与规划分离，能让每一步都更可控
- **实践建议**：小改动直接做，多步骤任务先列方案再动手
- **延伸阅读**：可以参考项目里 \`src/shared/types.ts\` 的 IPC 契约设计

> 仅问答模式下我不会修改任何文件。`

export const MOCK_PLAN_REPLY = `## 📋 执行方案

**目标**：按你的描述完成对应改动，预计 3 个步骤

### 计划步骤
1. **分析现状** — 读取相关文件，确认改动范围
2. **实施修改** — 按最小改动原则修改代码，保持风格一致
3. **验证结果** — 运行 \`npm run typecheck\` 确认无类型错误

### 影响范围
| 文件 | 操作 |
|---|---|
| src/renderer/src/App.tsx | 修改 |
| src/renderer/src/store/useStore.ts | 修改 |

> 确认无误后点击「开始执行」；如需调整，直接说出修改点（删减 / 收窄 / 新增 / 调序），我会重新输出方案。`

export const MOCK_EXECUTE_REPLY = `收到，开始按方案执行 ✅

**Step 1/3** 分析现状 — 已读取 \`App.tsx\` 与 \`useStore.ts\`，改动范围确认无误

**Step 2/3** 实施修改 — 已完成最小改动，保持现有代码风格

**Step 3/3** 验证结果 —

\`\`\`bash
$ npm run typecheck
✔ typecheck:node 通过
✔ typecheck:web 通过
\`\`\`

任务完成。可以在右侧预览面板查看改动内容。`

// ---- 动态 mock 回复：根据用户最后一条输入与工作模式生成（无 API Key / 调用失败时兜底） ----

/** 摘引用户问题（压缩空白、超 30 字截断），让回复「看得见」用户的输入 */
function quoteQuestion(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > 30 ? `${t.slice(0, 30)}…` : t
}

/** 空间内置项目说明（由 runAssistant 从 <workspace>/项目说明/ 读取后传入，用于以助手身份复述项目文档） */
export interface MockProjectDocs {
  feature: string
  tech: string
}

export function generateMockReply(
  userText: string,
  mode: TaskMode,
  isExecute = false,
  projectDocs?: MockProjectDocs | null
): string {
  if (isExecute) return MOCK_EXECUTE_REPLY
  const q = quoteQuestion(userText)
  const lower = userText.toLowerCase()

  // Plan 模式：方案模板 + 引用目标
  if (mode === 'plan') {
    return `## 📋 执行方案

**目标**：${q || '按你的描述完成对应改动'}，预计 3 个步骤

### 计划步骤
1. **分析现状** — 读取相关文件，确认改动范围
2. **实施修改** — 按最小改动原则修改代码，保持风格一致
3. **验证结果** — 运行 \`npm run typecheck\` 确认无类型错误

### 影响范围
| 文件 | 操作 |
|---|---|
| src/renderer/src/App.tsx | 修改 |
| src/renderer/src/store/useStore.ts | 修改 |

> 确认无误后点击「开始执行」；如需调整，直接说出修改点（删减 / 收窄 / 新增 / 调序），我会重新输出方案。`
  }

  // 仅问答模式：不执行，只给思路
  if (mode === 'ask') {
    return `关于「${q}」，简单说说我的理解：

- **概念层面**：先界定问题边界——把大问题拆成可验证的小问题，逐个击破
- **实践建议**：可以从项目里已有的实现找参照，比从零开始更快
- **延伸阅读**：\`src/shared/types.ts\` 的 IPC 契约设计是个不错的切入点

> 仅问答模式下我不会修改任何文件。如果你希望我直接动手，切到 Agent 模式即可。`
  }

  // 空间内置项目说明复述：提问与项目本身相关时，按关键词挑选对应文档以助手身份复述（仅 Agent 模式）
  if (projectDocs) {
    const wantsTech = /技术|架构|技术栈|实现|stack|electron|react|sqlite|ipc/.test(lower)
    const wantsFeature = /功能|模块|能做|特色/.test(lower)
    const isProjectQ = /项目|这个应用|这个软件|介绍|说明|smartdream|workbuddy/.test(lower)
    if (wantsTech || wantsFeature || isProjectQ) {
      const pickFeature = !wantsTech || wantsFeature
      const pickTech = !wantsFeature || wantsTech
      const sections: string[] = []
      if (pickFeature) sections.push(projectDocs.feature)
      if (pickTech) sections.push(projectDocs.tech)
      return `我基于本空间的「项目说明」文档来回答 👇\n\n${sections.join('\n\n---\n\n')}`
    }
  }

  // Agent 模式：按关键词分支，覆盖常见意图
  if (/^(你好|hi|hello|嗨|在吗)/i.test(lower)) {
    return `你好！我是 SmartDream AI Assistant 👋

我可以帮你：
1. **读懂并修改代码** — 分析项目结构、定位 Bug、实现新功能
2. **执行多步任务** — 先规划再执行，每一步可确认
3. **答疑与方案设计** — 技术选型、架构建议、最佳实践

你刚才提到「${q}」，可以再说得具体一点，我来帮你落地。`
  }

  if (/测试|test|单测|用例/.test(lower)) {
    return `收到，围绕「${q}」我来生成测试方案：

1. **用例设计** — 覆盖正常路径、边界条件（空输入 / 极值 / 并发）与异常路径
2. **框架选型** — 组件用 Vitest + Testing Library，纯函数用 Vitest 直接断言
3. **可维护性** — 用数据驱动（\`it.each\`）减少重复用例

\`\`\`ts
import { describe, it, expect } from 'vitest'
import { add } from '../src/utils/math'

describe('add', () => {
  it('adds two numbers', () => expect(add(1, 2)).toBe(3))
  it.each([-1, 0, 1.5])('handles boundary %d', (n) => {
    expect(add(n, 0)).toBe(n)
  })
})
\`\`\`

如果需要继续，可以告诉我目标文件路径，我直接补齐测试代码。`
  }

  if (/bug|报错|修复|修一下|error|异常/i.test(lower)) {
    return `我来分析一下「${q}」这个问题。按以下顺序排查：

1. **定位根因** — 从报错堆栈 / 复现步骤入手，先确认触发条件
2. **最小修复** — 找到源头改一处，而不是在调用方层层补丁
3. **回归验证** — 修复后补一个能稳定复现原问题的测试用例，防止复发

\`\`\`ts
// 修复前：边界条件下越界
const first = items[0].id
// 修复后：空集合防护
const first = items[0]?.id
\`\`\`

把具体报错信息或相关文件发给我，我可以直接修复。`
  }

  if (/实现|写一|开发|新增|做一|搭一/.test(lower)) {
    return `好的，关于「${q}」，我的实现思路：

1. **数据层** — 先定义好状态与数据流向（本项目用 Zustand + SQLite 持久化）
2. **交互层** — 按现有组件风格搭 UI，保持间距 / 圆角 / 深浅色 token 一致
3. **收尾** — \`npm run typecheck\` 过一遍，补上必要的 i18n 词条

如果需要继续，可以告诉我更具体的界面或交互要求，我直接开写。`
  }

  if (/是什么|什么意思|为什么|怎么|如何|区别|对比/.test(lower)) {
    return `关于「${q}」，分三层来解释：

- **是什么**：本质是职责与边界的划分——先搞清楚概念在系统里的位置，再谈细节
- **为什么**：动机通常是把复杂问题拆解成可控的部分，让每一步可验证、可回滚
- **怎么做**：小改动直接做；多步骤任务建议先切 Plan 模式出方案，确认后再执行

> 需要我把结论落成代码或文档吗？切换到 Agent 模式说一声即可。`
  }

  // 默认分支：演示版提示（尚未接入真实大模型服务）
  return `温馨提示

您好，感谢您体验 SmartDream！

当前版本为功能演示版，仅用于展示产品的交互形态与核心流程，尚未接入真实的大模型服务。您看到的回复均为本地模拟生成的示例内容，仅供参考，不代表最终效果。

正式版本将接入 AI 大模型，提供完整的智能对话与任务执行能力。敬请期待，感谢您的理解与支持！`
}

// ---- mock 会话 ----
const MOCK_TSX = `export function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div className="counter">
      <button onClick={() => setCount(count - 1)}>-</button>
      <span>{count}</span>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  )
}`

const MOCK_TSX_FIXED = `export function Counter() {
  const [count, setCount] = useState(0)

  const increment = () => setCount((c) => c + 1)
  const decrement = () => setCount((c) => Math.max(0, c - 1))

  return (
    <div className="counter">
      <button onClick={decrement} disabled={count === 0}>-</button>
      <span className="value">{count}</span>
      <button onClick={increment}>+</button>
    </div>
  )
}`

export const INITIAL_SESSIONS: Session[] = [
  {
    id: 's1',
    title: 'AI Agent：是什么、有什么用、未来怎么发展',
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
    updatedAt: Date.now() - 1000 * 60 * 25,
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'AI Agent 到底是什么？它和我们平时用的 AI 聊天机器人有什么区别？'
      },
      {
        id: 'm2',
        role: 'assistant',
        content:
          '可以把 **AI Agent（智能体）** 理解为：以大模型为"大脑"，能够**自主感知、规划并使用工具完成目标任务**的软件系统。\n\n与普通聊天机器人的核心区别：\n\n| | 聊天机器人 | AI Agent |\n|---|---|---|\n| 工作方式 | 一问一答，被动响应 | 接到目标后自主拆解、多步执行 |\n| 是否用工具 | 一般不用 | 可调用搜索、代码执行、文件读写等 |\n| 结果形态 | 一段文字 | 一个完成的结果（改好的代码、生成的报告） |\n\n一个典型 Agent 的四个组成部分：\n\n1. **规划（Planning）** — 把"帮我修复这个 Bug"拆成读代码 → 定位 → 修改 → 验证\n2. **记忆（Memory）** — 记住上下文、偏好和历史操作\n3. **工具（Tools）** — 通过 Function Calling / MCP 调用外部能力\n4. **执行（Action）** — 真正去操作系统、写文件、发请求\n\n> 简单说：聊天机器人给你"答案"，Agent 给你"结果"。'
      },
      {
        id: 'm3',
        role: 'user',
        content: '那 AI Agent 实际能帮我做什么？有哪些典型的应用场景？'
      },
      {
        id: 'm4',
        role: 'assistant',
        content:
          '目前 Agent 落地最成熟的几类场景：\n\n1. **编程助手** — 读懂代码库、跨文件修改、自动跑测试修 Bug（如各类 IDE 的 Agent 模式）\n2. **办公自动化** — 收集资料 → 整理成表格 → 生成 PPT / 周报\n3. **数据分析** — 拿到需求后自己写 SQL、跑脚本、出图表和结论\n4. **客服与运营** — 查订单、退换货处理等需要调用多个内部系统的流程\n5. **个人助理** — 管理日程、订票、邮件分类回复\n\n以"整理会议录音"为例，Agent 的执行链路：\n\n```\n录音转写 → 提取待办事项 → 生成纪要 → 写入文档 → 邮件通知参会人\n```\n\n整个过程你只需要一句指令，中间每一步由 Agent 自主衔接。'
      },
      {
        id: 'm5',
        role: 'user',
        content: '现在主流的 Agent 技术方案和框架都有哪些？'
      },
      {
        id: 'm6',
        role: 'assistant',
        content:
          '主流的 Agent 技术方案大致分三层：\n\n**1. 交互范式（怎么思考和行动）**\n- **ReAct**：推理 + 行动交替进行，最经典的 Agent 循环\n- **Plan-and-Execute**：先出完整计划再逐步执行，适合长任务\n- **Reflection**：执行后自我检查、迭代改进\n\n**2. 工具接入（怎么调用外部能力）**\n- **Function Calling**：模型厂商原生支持的结构化工具调用\n- **MCP（Model Context Protocol）**：开放协议，统一连接文件、数据库、浏览器等工具生态\n\n**3. 开发框架**\n- **LangChain / LangGraph**：生态最大，LangGraph 擅长有状态的多步流程\n- **AutoGen（微软）**：多智能体对话式协作\n- **CrewAI**：按"角色分工"编排多个 Agent\n\n> 选型建议：简单任务 Function Calling 就够；复杂流程用 LangGraph；多角色协作试 AutoGen / CrewAI。'
      },
      {
        id: 'm7',
        role: 'user',
        content: 'AI Agent 未来会怎么发展？它会取代程序员吗？'
      },
      {
        id: 'm8',
        role: 'assistant',
        content:
          '几个比较确定的发展方向：\n\n1. **更长的自主任务** — 从"几步"进化到"几小时"的连续工作，可靠性大幅提升\n2. **多智能体协作** — 像团队一样分工：经理 Agent 派活、专家 Agent 执行、审查 Agent 验收\n3. **工具生态标准化** — MCP 等协议让 Agent 即插即用各类软件，形成"Agent 应用商店"\n4. **多模态** — 直接看屏幕、操作浏览器和 GUI，不再只靠 API\n5. **可信与安全** — 权限隔离、操作审计、关键步骤人工确认\n\n关于"会不会取代程序员"：\n\n- **会取代的**：重复性的样板代码、简单 Bug 修复、测试用例编写\n- **难取代的**：需求定义、架构决策、业务判断、对结果负责\n\n> 更可能的图景是**人机协作**：Agent 负责执行提效，人负责方向和质量把关。会用 Agent 的工程师，效率会是纯手工作业的好几倍。'
      }
    ]
  },
  {
    id: 's2',
    title: '进程、线程、协程：区别与应用场景',
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
    messages: [
      {
        id: 'm9',
        role: 'user',
        content: '进程、线程、协程分别是什么？能不能各用一个通俗的比喻解释一下？'
      },
      {
        id: 'm10',
        role: 'assistant',
        content:
          '用一家**工厂**来打比方：\n\n- **进程 = 一家独立的工厂**\n  有自己的厂房、设备和仓库（独立内存空间），工厂之间互不干扰，一家倒闭不影响另一家。\n- **线程 = 工厂里的工人**\n  多个工人共享同一家工厂的设备与仓库（共享内存），一个工人出事故可能殃及全厂。\n- **协程 = 会"暂停/续接"的工人**\n  遇到要等的事（等材料送达）先主动把工位让出来去干别的活，材料到了再回来接着干，全程不需要厂长（操作系统内核）介入。\n\n对应到严格定义：\n\n1. **进程**：操作系统**资源分配**的最小单位，拥有独立地址空间\n2. **线程**：操作系统**调度执行**的最小单位，同一进程内的线程共享内存\n3. **协程**：**用户态**的轻量执行单元，由程序（运行时 / 事件循环）自己调度，内核无感知'
      },
      {
        id: 'm11',
        role: 'user',
        content: '那它们之间的区别具体体现在哪些维度？比如资源占用、切换开销、并发数量这些。'
      },
      {
        id: 'm12',
        role: 'assistant',
        content:
          '核心维度对比：\n\n| 维度 | 进程 | 线程 | 协程 |\n|---|---|---|---|\n| 内存 | 独立地址空间 | 共享进程内存，独享栈（MB 级） | 极小（KB 级栈） |\n| 切换开销 | 大（切换页表等，μs 级） | 中（内核态切换，~μs） | 极小（用户态，ns 级） |\n| 调度者 | 操作系统 | 操作系统 | 程序自身（事件循环 / 运行时） |\n| 并发数量 | 数百个 | 数千个 | 单进程可到百万级 |\n| 通信方式 | 管道 / 消息队列 / 共享文件 | 共享内存 + 锁 | channel / await，天然规避锁 |\n| 容错隔离 | 强，崩溃互不影响 | 一个线程崩溃整个进程退出 | 同线程内相互影响 |\n| 利用多核 | 天然支持 | 天然支持 | 需要多进程 / 多线程配合（Go 运行时除外） |'
      },
      {
        id: 'm13',
        role: 'user',
        content: '实际开发中，什么场景该用哪个？能举一些真实产品的例子吗？'
      },
      {
        id: 'm14',
        role: 'assistant',
        content:
          '按任务类型选型：\n\n**进程 —— 隔离与稳定优先**\n- Chrome：每个标签页一个进程，一个页面崩溃不影响其他页\n- Nginx：Master + 多 Worker 进程，充分利用多核且互不拖累\n\n**线程 —— 共享数据的多核并行**\n- Java Web 服务器（Tomcat）：每个请求分配一个线程处理\n- 视频剪辑软件：解码、渲染、UI 分线程并行\n\n**协程 —— 海量 IO 并发**\n- Go 服务端：goroutine 承载数十万并发连接\n- Python asyncio：爬虫、网关等高并发 IO 任务\n- 前端 JS：单线程 + 事件循环，用 async/await 处理网络请求\n\n一句话总结：**怕崩用进程，并行用线程，高并发 IO 用协程**。'
      },
      {
        id: 'm15',
        role: 'user',
        content: '既然线程已经能并发了，为什么还要发明协程？协程到底解决了什么痛点？'
      },
      {
        id: 'm16',
        role: 'assistant',
        content:
          '线程有两大痛点，协程恰好对症：\n\n**痛点 1：切换太贵**\n线程切换要陷入内核态，保存 / 恢复上下文，高并发下光调度就消耗大量 CPU；协程在用户态由运行时直接切换，开销只有纳秒级，单机轻松做到百万并发。\n\n**痛点 2：并发编程太难**\n多线程共享内存 → 必须加锁 → 死锁、竞态、性能损失接踵而至。协程采用"协作式调度"：在 `await` 处主动让出，同一时刻逻辑上只有一个执行流在跑，**天然免锁**。\n\n另外协程还消灭了"回调地狱"：\n\n```js\n// 回调风格：层层嵌套，难以维护\ngetUser(id, (user) => {\n  getOrders(user, (orders) => { ... })\n})\n\n// 协程风格：同步的写法，异步的执行\nconst user = await getUser(id)\nconst orders = await getOrders(user)\n```\n\n> 本质：协程用**同步的代码形态**写**异步的并发逻辑**，同时把切换成本从内核态拉回用户态。Go / Kotlin / Python asyncio / JS async-await 都是这个思路。'
      }
    ]
  }
]

// ---- testDemo 示例空间：播种时在默认空间存储路径下创建同名文件夹并写入脚本 ----

export const DEMO_SPACE_NAME = 'testDemo'
export const DEMO_SYNC_FILENAME = 'fileSync.js'

/** 示例脚本：轮询式文件上传 / 下载同步（仅 Node 内置模块，无第三方依赖） */
export const DEMO_SYNC_SCRIPT = `/**
 * fileSync.js —— 轮询式文件上传 / 下载同步脚本
 *
 * 功能：
 *   1. 上传：轮询 outbox/ 目录，把新文件或有改动的文件自动上传到服务端
 *   2. 下载：轮询服务端文件列表，把远端新增 / 更新的文件下载到 inbox/
 *   3. 可靠性：失败自动退避重试；原子写入不留半截文件；本地未同步改动不会被覆盖
 *
 * 使用：node fileSync.js          （Ctrl+C 优雅退出）
 * 依赖：仅 Node.js 内置模块（18+），无第三方包
 */
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ---- 配置（均可通过环境变量覆盖）----
const CONFIG = {
  serverBase: process.env.SYNC_SERVER || 'http://localhost:3000/api/sync',
  token: process.env.SYNC_TOKEN || '',
  uploadDir: path.join(__dirname, 'outbox'),   // 待上传目录
  downloadDir: path.join(__dirname, 'inbox'),  // 下载落地目录
  manifestPath: path.join(__dirname, '.sync-manifest.json'),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 15000, // 基础轮询间隔
  backoffFactor: 2,         // 失败后轮询间隔放大倍数
  maxPollIntervalMs: 120000 // 退避上限
}

// ---- 同步清单：记录每个文件上次同步的内容指纹，用于去重与冲突判断 ----
let manifest = loadManifest()

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.manifestPath, 'utf8'))
  } catch {
    return {}
  }
}

// 原子写入：先写临时文件再 rename，进程中途被杀也不会产生半截文件
function atomicWrite(file, data) {
  const tmp = file + '.tmp-' + process.pid
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
}

function saveManifest() {
  atomicWrite(CONFIG.manifestPath, JSON.stringify(manifest, null, 2))
}

// 内容指纹：sha1 只看内容不看 mtime，复制/触碰导致的 mtime 变化不会引发重传
function fingerprint(file) {
  const stat = fs.statSync(file)
  const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex')
  return { size: stat.size, hash }
}

function headers() {
  return CONFIG.token ? { authorization: 'Bearer ' + CONFIG.token } : {}
}

// ---- 上传：outbox/ 中指纹变化的文件 → PUT 到服务端 ----
async function uploadOnce() {
  const names = fs.existsSync(CONFIG.uploadDir) ? fs.readdirSync(CONFIG.uploadDir) : []
  const failed = []

  for (const name of names) {
    const local = path.join(CONFIG.uploadDir, name)
    if (!fs.statSync(local).isFile()) continue
    const fp = fingerprint(local)
    const prev = manifest['up:' + name]
    if (prev && prev.hash === fp.hash) continue // 内容没变，跳过

    try {
      const url = CONFIG.serverBase + '/upload/' + encodeURIComponent(name)
      const res = await fetch(url, {
        method: 'PUT',
        headers: Object.assign(headers(), { 'content-type': 'application/octet-stream' }),
        body: fs.readFileSync(local)
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      manifest['up:' + name] = fp
      saveManifest()
      console.log('[upload] ' + name + ' (' + fp.size + ' bytes) ok')
    } catch (err) {
      failed.push(name)
      console.error('[upload] ' + name + ' 失败：' + err.message)
    }
  }

  if (failed.length > 0) throw new Error('上传失败 ' + failed.length + ' 个文件')
}

// ---- 下载：远端列表与本地清单比对，只拉取有变化的文件 ----
async function downloadOnce() {
  const res = await fetch(CONFIG.serverBase + '/files', { headers: headers() })
  if (!res.ok) throw new Error('获取文件列表失败：HTTP ' + res.status)
  const remoteFiles = await res.json() // [{ name, hash }]

  for (const rf of remoteFiles) {
    const local = path.join(CONFIG.downloadDir, rf.name)
    const prev = manifest['down:' + rf.name]
    if (prev && prev.hash === rf.hash) continue // 本地已是最新

    // 冲突保护：本地内容相对上次同步有改动 → 先改名保留，再落远端版本
    if (fs.existsSync(local)) {
      const localHash = fingerprint(local).hash
      if (!prev || prev.hash !== localHash) {
        const backup = local + '.conflict-' + Date.now()
        fs.renameSync(local, backup)
        console.log('[download] 本地 ' + rf.name + ' 有未同步改动，已备份为 ' + path.basename(backup))
      }
    }

    const dl = await fetch(CONFIG.serverBase + '/files/' + encodeURIComponent(rf.name), { headers: headers() })
    if (!dl.ok) throw new Error('下载 ' + rf.name + ' 失败：HTTP ' + dl.status)
    atomicWrite(local, Buffer.from(await dl.arrayBuffer()))
    manifest['down:' + rf.name] = { hash: rf.hash }
    saveManifest()
    console.log('[download] ' + rf.name + ' ok')
  }
}

// ---- 主循环：一轮全部成功则恢复基础间隔，失败按倍数退避 ----
let currentInterval = CONFIG.pollIntervalMs
let timer = null

async function tick() {
  try {
    await uploadOnce()
    await downloadOnce()
    currentInterval = CONFIG.pollIntervalMs
  } catch (err) {
    currentInterval = Math.min(currentInterval * CONFIG.backoffFactor, CONFIG.maxPollIntervalMs)
    console.error('[sync] 本轮未全部完成，' + Math.round(currentInterval / 1000) + 's 后重试（' + err.message + '）')
  }
  timer = setTimeout(tick, currentInterval)
}

fs.mkdirSync(CONFIG.uploadDir, { recursive: true })
fs.mkdirSync(CONFIG.downloadDir, { recursive: true })
console.log('[sync] 已启动，基础轮询间隔 ' + CONFIG.pollIntervalMs / 1000 + 's')
console.log('[sync] 上传目录：' + CONFIG.uploadDir)
console.log('[sync] 下载目录：' + CONFIG.downloadDir)
tick()

// Ctrl+C：停掉下一轮轮询，保存清单后退出
process.on('SIGINT', () => {
  clearTimeout(timer)
  saveManifest()
  console.log('[sync] 已退出')
  process.exit(0)
})
`
/** testDemo 空间内置脚本说明：描述 fileSync.js 的功能、使用与配置（播种时随示例空间写入） */
export const DEMO_SCRIPT_DOC_FILENAME = '脚本说明.md'
export const DEMO_SCRIPT_DOC = `# testDemo 空间脚本说明

> 本文档描述本空间内脚本的功能、使用方式与配置项。空间项目说明见独立的「项目说明」空间，本文档仅覆盖脚本本身。

## 脚本清单

| 脚本 | 功能 | 依赖 |
|---|---|---|
| fileSync.js | 轮询式文件上传 / 下载同步 | 仅 Node.js 内置模块（18+），无第三方包 |

## fileSync.js —— 轮询式文件同步

### 功能概览

- **上传**：轮询本地 \`outbox/\` 目录，自动将新增或有改动的文件 PUT 到服务端；
- **下载**：轮询服务端文件列表，将远端新增 / 更新的文件下载到本地 \`inbox/\`；
- **可靠性**：
  - 失败自动按倍数退避重试（2x 递增，上限 120s），一轮全部成功后恢复基础间隔；
  - 原子写入（先写临时文件再 rename），进程中途被杀也不会产生半截文件；
  - 基于内容 SHA1 指纹去重，复制 / 触碰文件导致的 mtime 变化不会引发重传；
  - 冲突保护：本地文件相对上次同步有未同步改动时，先改名备份（\`.conflict-时间戳\`）再落远端版本，不覆盖本地改动。

### 目录结构

\`\`\`
testDemo/
├── fileSync.js            # 同步脚本本体
├── outbox/                # 待上传目录（脚本启动时自动创建）
├── inbox/                 # 下载落地目录（脚本启动时自动创建）
└── .sync-manifest.json    # 同步清单（脚本自动维护，记录每个文件的同步指纹）
\`\`\`

### 使用方式

\`\`\`bash
node fileSync.js
\`\`\`

启动后进入轮询主循环，\`Ctrl+C\` 优雅退出（停止轮询并保存同步清单）。

### 配置项（环境变量覆盖）

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| \`SYNC_SERVER\` | \`http://localhost:3000/api/sync\` | 服务端同步接口地址 |
| \`SYNC_TOKEN\` | 空 | 鉴权 Token，非空时以 \`Authorization: Bearer <token>\` 携带 |
| \`POLL_INTERVAL_MS\` | \`15000\` | 基础轮询间隔（毫秒），失败后按倍数退避 |

### 服务端接口约定

| 接口 | 方法 | 说明 |
|---|---|---|
| \`/upload/:name\` | PUT | 上传文件，body 为文件二进制内容 |
| \`/files\` | GET | 获取远端文件列表，返回 \`[{ name, hash }]\` |
| \`/files/:name\` | GET | 下载单个文件 |

### 日志前缀

- \`[upload]\`：上传结果（成功带字节数，失败带原因）；
- \`[download]\`：下载结果及冲突备份提示；
- \`[sync]\`：启动信息、退避重试提示、退出信息。
`
export function buildDemoSpaceSession(demoDir: string): Session {
  return {
    id: 's3',
    title: 'fileSync.js：轮询上传下载脚本答疑',
    createdAt: Date.now() - 1000 * 60 * 60 * 50,
    updatedAt: Date.now() - 1000 * 60 * 60 * 47,
    workspace: demoDir,
    messages: [
      {
        id: 'm17',
        role: 'user',
        content:
          '我刚接手了 testDemo 里这个 fileSync.js 同步脚本，能帮我梳理一下它的整体工作流程吗？它是怎么做到自动上传和下载的？'
      },
      {
        id: 'm18',
        role: 'assistant',
        content:
          '这个脚本是一个**无第三方依赖的轮询式同步器**（只用 Node 内置的 `fs` / `path` / `crypto` 和全局 `fetch`），整体分三层：\n\n**1. 配置层（CONFIG）**\n- `uploadDir` = `outbox/`、`downloadDir` = `inbox/`，都在脚本同级目录下\n- 轮询间隔、退避倍数、服务端地址都支持环境变量覆盖，比如 `POLL_INTERVAL_MS=5000 node fileSync.js`\n\n**2. 数据层（manifest 清单）**\n- `.sync-manifest.json` 记录每个文件**上次同步时的 sha1 内容指纹**\n- 上传前比对 `up:文件名`、下载前比对 `down:文件名`，指纹没变就跳过——这是「不重复传输」的关键\n\n**3. 执行层（每轮 tick）**\n\n```\ntick() 每 15s 一轮\n ├─ uploadOnce()   扫描 outbox/，指纹变化的文件 PUT 上去\n └─ downloadOnce() 拉远端文件列表，只下载有变化的到 inbox/\n```\n\n启动方式就是 `node fileSync.js`；Ctrl+C 时会在 SIGINT 里停掉定时器、保存清单后退出。'
      },
      {
        id: 'm19',
        role: 'user',
        content: '现在固定 15 秒轮询一次，感觉有点死板。服务端挂掉的时候它还会傻傻地每 15 秒打一次，能不能失败时自动放慢节奏，恢复了再变快？'
      },
      {
        id: 'm20',
        role: 'assistant',
        content:
          '可以，脚本里已经内置了**自适应退避**，靠三个变量配合：\n\n```js\nlet currentInterval = CONFIG.pollIntervalMs   // 当前间隔，从 15s 起步\n\nasync function tick() {\n  try {\n    await uploadOnce()\n    await downloadOnce()\n    currentInterval = CONFIG.pollIntervalMs   // 全部成功 → 恢复基础间隔\n  } catch (err) {\n    // 任一环节失败 → 间隔翻倍，120s 封顶\n    currentInterval = Math.min(currentInterval * CONFIG.backoffFactor, CONFIG.maxPollIntervalMs)\n  }\n  timer = setTimeout(tick, currentInterval)   // setTimeout 链式调度，而不是 setInterval\n}\n```\n\n效果：连续失败时间隔 15s → 30s → 60s → 120s 封顶；一旦某轮全部成功就立刻回到 15s。\n\n两个细节值得注意：\n\n1. **用 `setTimeout` 链式递归而不是 `setInterval`** —— `setInterval` 不管上一轮有没有跑完都会到点触发，轮询里夹着网络请求，服务端一慢就容易堆积并发请求\n2. 想再讲究一点，可以在重试间隔上加随机抖动（jitter），避免大量客户端同时退避、又在同一时刻恢复，造成服务端流量尖峰'
      },
      {
        id: 'm21',
        role: 'user',
        content: '还有一个隐患：如果上传到一半进程被杀掉（断电或 kill -9），会不会在服务端留下半截文件？另外 manifest 是靠什么判断「要不要重传」的？'
      },
      {
        id: 'm22',
        role: 'assistant',
        content:
          '两个问题脚本里都有对应设计：\n\n**1. 不会留下半截文件 —— 原子写入**\n\n```js\nfunction atomicWrite(file, data) {\n  const tmp = file + \'.tmp-\' + process.pid  // 先写临时文件\n  fs.writeFileSync(tmp, data)\n  fs.renameSync(tmp, file)                  // rename 在同一分区是原子操作\n}\n```\n\nmanifest 和下载的文件都走 `atomicWrite`：`rename` 要么完整成功、要么完全不生效，所以任何时刻被打断，磁盘上要么是旧文件、要么是完整新文件，绝不会出现写了一半的状态。\n\n**2. 重传判断 —— 看内容指纹而不是 mtime**\n\n```js\nconst fp = fingerprint(local)               // { size, hash }，hash 是内容的 sha1\nconst prev = manifest[\'up:\' + name]\nif (prev && prev.hash === fp.hash) continue // 内容没变 → 跳过\n```\n\n判断依据是 **sha1 内容哈希**而不是文件修改时间：复制、同步工具触碰文件都会改 mtime 但内容没变，按 mtime 判断会造成大量无意义重传。\n\n至于「上传到一半被杀」：这种情况下 manifest 还没更新（更新在收到 2xx 之后），下一轮指纹仍然对不上，会自动完整重传一次，最终一致性是有保障的。'
      },
      {
        id: 'm23',
        role: 'user',
        content: '下载那边呢？如果 inbox 里某个文件被同事手动改过，下一轮轮询会不会直接用远端版本把它覆盖掉，改动就丢了？'
      },
      {
        id: 'm24',
        role: 'assistant',
        content:
          '不会直接覆盖，脚本里有**冲突保护**：\n\n```js\nif (fs.existsSync(local)) {\n  const localHash = fingerprint(local).hash\n  // 本地内容 ≠ 清单里「上次同步时」的内容 → 说明本地有未同步改动\n  if (!prev || prev.hash !== localHash) {\n    const backup = local + \'.conflict-\' + Date.now()\n    fs.renameSync(local, backup)   // 先把本地版本改名保留\n  }\n}\n```\n\n逻辑是三方比对：**远端指纹 vs 本地清单 vs 本地实际内容**——\n\n| 情况 | 处理 |\n|---|---|\n| 本地内容 = 清单记录（没人动过） | 安全覆盖，直接写入远端新版本 |\n| 本地内容 ≠ 清单记录（有人改过） | 本地先备份成 `xxx.conflict-时间戳`，再落远端版本 |\n\n> 需要说明：这是「保底不丢数据」的简单策略，冲突的两个版本要靠人工合并。生产级方案一般走 **ETag / If-None-Match 条件请求**或服务端版本号比对，甚至内容级自动 merge，那就超出这个轻量脚本的定位了。'
      }
    ]
  }
}

// ---- 「项目说明」内置空间：播种/兜底时创建同名空间，主进程 space:create 自动写入两份说明文档 ----

export const PROJECT_DOCS_SPACE_NAME = '项目说明'

/** 「项目说明」空间任务：绑定内置文档空间，1 条助手欢迎消息引导提问 */
export function buildProjectDocsSpaceSession(dir: string): Session {
  return {
    id: 's4',
    title: '项目说明',
    createdAt: Date.now() - 1000 * 60 * 60 * 20,
    updatedAt: Date.now() - 1000 * 60 * 60 * 19,
    workspace: dir,
    messages: [
      {
        id: 'm_proj_1',
        role: 'assistant',
        content:
          '欢迎来到「项目说明」空间 📚\n\n这里内置了两份项目文档（可直接在 files 页签打开预览），也可以在对话中让我复述项目情况：\n\n- **功能说明.md** — 按模块划分的功能总览与明细（16 个功能模块）\n- **技术说明.md** — 技术栈、Electron 三端架构、IPC 契约、持久化与构建打包\n\n试试问我：「这个项目有哪些功能模块？」或「项目的技术架构是什么？」'
      }
    ]
  }
}

// 初始工作目录：demo 里用 mock 目录树，真实磁盘文件树由 Electron 提供
export const MOCK_PROJECT_FILES = {
  name: 'my-react-app',
  path: '/Users/demo/my-react-app',
  isDirectory: true,
  children: [
    {
      name: 'src',
      path: '/Users/demo/my-react-app/src',
      isDirectory: true,
      children: [
        {
          name: 'components',
          path: '/Users/demo/my-react-app/src/components',
          isDirectory: true,
          children: [
            { name: 'Counter.tsx', path: '/Users/demo/my-react-app/src/components/Counter.tsx', isDirectory: false, extension: 'tsx' },
            { name: 'Header.tsx', path: '/Users/demo/my-react-app/src/components/Header.tsx', isDirectory: false, extension: 'tsx' },
            { name: 'Sidebar.tsx', path: '/Users/demo/my-react-app/src/components/Sidebar.tsx', isDirectory: false, extension: 'tsx' }
          ]
        },
        {
          name: 'utils',
          path: '/Users/demo/my-react-app/src/utils',
          isDirectory: true,
          children: [
            { name: 'format.ts', path: '/Users/demo/my-react-app/src/utils/format.ts', isDirectory: false, extension: 'ts' }
          ]
        },
        { name: 'App.tsx', path: '/Users/demo/my-react-app/src/App.tsx', isDirectory: false, extension: 'tsx' },
        { name: 'main.tsx', path: '/Users/demo/my-react-app/src/main.tsx', isDirectory: false, extension: 'tsx' }
      ]
    },
    { name: 'package.json', path: '/Users/demo/my-react-app/package.json', isDirectory: false, extension: 'json' },
    { name: 'vite.config.ts', path: '/Users/demo/my-react-app/vite.config.ts', isDirectory: false, extension: 'ts' },
    { name: 'README.md', path: '/Users/demo/my-react-app/README.md', isDirectory: false, extension: 'md' }
  ]
}

export const MOCK_FILE_CONTENT: Record<string, string> = {
  'src/components/Counter.tsx': MOCK_TSX,
  'src/components/Counter.fixed.tsx': MOCK_TSX_FIXED
}
