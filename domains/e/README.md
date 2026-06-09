# e

`e` 是 OpenFX 的 Agent 执行框架包。它提供运行时无关的 TypeScript 内核，用来把用户输入、
模型决策、工具调用、审批边界、资源读取、会话、记忆、前台进度和后台执行串成可测试、可回放
的 Agent 工作流。

## 当前状态

`e` 已经从蓝图进入代码层。内核 MVP、DeepSeek reference adapter、端到端 reference
runtime、“前台交互 / 后台执行分离”的框架协议、`src/core` 下的原生扩展能力，以及从
AStudio 吸收的任务图、WorkOrder、Artifact、Workspace 边界与 runtime-neutral adapter
模式均已落地。`e` 也已从本地 Pi `agent-manager` 插件吸收 app 层协作经验：typed 子任务
runtime bridge、异步推测 peer 回复、串行/并行/审查协作 recipe，以及带实际验证证据的完成
判官。

AStudio 本轮不作为 Rust 产品迁移，也不引入 SQLite、daemon、微信 API 或翻译 Agent
源码。它的框架价值已经吸收到 `domains/e`；CLI、terminal control console、daemon/social
binding、translation agent 和微信入口继续只作为产品外壳启发。

可验证入口：

```bash
deno task --config domains/e/deno.json test
deno task check
```

## 设计原则

- **运行时无关优先**：`e` 的核心协议、状态机和 reference runtime 不能绑定 Deno、Node、
  Bun、浏览器或某个托管平台。仓库可以用 Deno
  作为测试与任务入口，但运行时能力必须通过接口注入。
- **框架先于产品外壳**：`domains/e` 提供协议、状态机和 reference runtime；`e-agent`
  等产品只负责 UI、CLI、语音、桌面或 Web 外壳。
- **前台交互与后台执行分离**：前台负责实时沟通、进度、打断和审批；后台负责模型调用、
  工具执行、文件/资源读取和测试。
- **KV 是事实来源**：会话、队列、记忆、状态、turn record 都围绕 `KvStore` 读写。 JSONL
  只用于导出、审计、迁移和 replay bundle。
- **结构化决策优先**：模型输出必须落入 `AgentDecision`，再由内核路由。
- **副作用先过边界**：文件修改、外部副作用和高风险动作先形成 `ProposedAction` /
  `BoundaryRequest`，再审批、apply、replay。
- **供应商无关，DeepSeek-first reference adapter**：内核不绑定 DeepSeek，但提供
  `DeepSeekProvider` 作为首个可测参考适配器。

## 目录结构

```text
src/
  app/
    collaboration-recipes.ts         # 串行 / 并行 / creator-reviewer 协作 recipe
    completion-judge.ts              # evidence-first 完成裁决与 verification artifact
    e-agent-runtime.ts              # 端到端 reference runtime
    git-timeline.ts                 # Git 状态 / diff / checkpoint / task branch adapter 契约
    mcp-gateway.ts                  # MCP tool discovery / invoke adapter 契约与参数边界清洗
    speculative-peer.ts             # 非阻塞 peer message + prediction / actual 校准记录
    subagent-runtime-bridge.ts       # SubagentTaskKernel -> runtime adapter 的执行桥
    workspace-toolkit.ts            # workspace read/write/list/command adapter 契约
  core/
    agent-policy.ts                # persona / memory / decision / boundary 策略收口
    agent-loop.ts                   # 单次 turn 主循环
    agent-state.ts                  # persona / memory / observer / heartbeat / cerebellum
    artifact.ts                     # Artifact 写入、查询与 artifact-first completion summary
    channel.ts                      # 多 Agent 共享频道与发言调度
    deepseek-adapter.ts             # DeepSeek reference provider
    dream-narrative.ts              # 睡眠期记忆叙事草稿
    event-engine.ts                 # handler 合并规则
    evolution-sandbox.ts            # 自进化提案沙箱验证报告
    evolution.ts                    # 自进化提案与对抗审计
    message-queue.ts                # priority + FIFO 队列
    model-runtime.ts                # 模型路由、fallback、reasoning 规范化
    observer-analytics.ts           # 事实流观察分析
    peer-communication.ts           # 平级 Agent-to-Agent 通信
    peer-tools.ts                   # peer_* 工具桥接
    replay-log.ts                   # JSONL replay/export
    safety-action-gate.ts           # 审批、stale、apply
    session-manager.ts              # 会话消息写入与 replay
    social-graph.ts                 # 最小协作关系图
    stream-guard.ts                 # 输出流规则守卫
    subagent-task.ts                # typed 子 Agent 任务
    task-graph.ts                   # AgentTask 状态机、ready 检测与 WorkOrder 校验
    tool-runner.ts                  # 工具生命周期
    types.ts                        # 公共核心类型
    workspace-boundary.ts           # 注入式 path resolver 与 workspace boundary request
    workspace-resources.ts          # file/memory/session/artifact 资源读取
    worldview.ts                    # WorldView 候选、合并与冲突标记
  foreground/
    foreground-session-controller.ts # 前台会话控制器
    progress-event.ts                # 进度事件和控制信号协议
    runtime-event-bridge.ts          # 后台 runtime -> 前台 progress stream
  interfaces/
    kv-store.ts                     # KvStore 与 InMemoryKvStore
tests/
  app/
  core/
  fixtures/
  foreground/
```

## 核心运行流

```text
ForegroundSessionController
  -> MessageQueue
  -> EAgentRuntime
  -> AgentLoop
  -> ModelRuntime
  -> ToolRunner / WorkspaceResources / SafetyActionGate
  -> SessionManager / AgentStateKernel / ReplayLog
  -> RuntimeEventBridge
```

### 前台与后台

`ForegroundSessionController` 是框架级能力，不绑定语音、WebRTC、CLI 或 UI。它只处理：

- 用户消息进入后台队列。
- 后台 step 转成 `ProgressEvent`。
- 前台发送 interrupt / approve / reject / pause / resume 控制信号。
- 后台执行保持静默、可 replay、可测试。

产品层可以用文本、桌面 UI、Web chat 或实时语音连接这套协议。

### Reference Runtime

`EAgentRuntime` 是 `e-agent` 产品外壳未来应调用的参考装配层。它已经跑通一个端到端场景：

1. 用户消息入队。
2. 模型返回 `call_tool: read_resource`。
3. `ToolRunner` 调用 `WorkspaceResources` 读取 `file://` 资源。
4. 工具结果写入 session，并作为 follow-up message 重新入队。
5. 模型返回 `complete`。
6. assistant 消息写入 session。
7. turn record、memory、session 可 replay。

`EAgentRuntime.registerSelf()` 可以把当前 runtime 注册为 `AgentCard`，供
`PeerCommunicationKernel` 的 `peer_list` 能力发现。

`EAgentRuntime` 现在也暴露可选注入项：`taskGraph`、`artifactKernel`、
`workspaceBoundary`、`workspaceToolAdapter`、`mcpGateway` 和
`gitTimeline`。这些注入项默认关闭；也不会自动改变 `processNext()`
的既有工具行为。产品外壳可以按需组合 `createWorkspaceToolkitToolDefinitions()` 或自己的
adapter 装配层。

### Pi Agent Manager 吸收项

Pi `agent-manager` 的源码没有整体迁入；`e` 只吸收运行时无关、可测试的框架模式：

- `SubagentRuntimeBridge`：把 `SubagentTaskKernel` 创建的 typed 子任务交给注入的
  `SubagentRuntimeAdapter` 执行。子任务默认不继承父 Agent 工具权限，adapter 必须显式接收
  `allowedTools`。
- `SpeculativePeerCoordinator`：支持非阻塞 peer message。发送方可以记录 prediction 和
  working context，稍后把 peer 实际回复同步回来并标记 `aligned / diverged / unknown`。
- `CollaborationRecipeRunner`：提供 sequential、parallel 和 critic-review 三种 app
  层协作 recipe，底层仍使用 typed 子任务和 schema 校验。
- `CompletionJudge`：要求执行方提交验证命令输出作为 evidence，再让 judge agent
  返回结构化 verdict 和评分；judge 不可用时默认 fail-closed，可显式配置 fail-open。

这些模块位于 `src/app`，不引入 Pi、Bun、Node 子进程、微信、Telegram 或 TUI 依赖。

## 关键类型

- `AgentDecision`：`think`、`call_tool`、`request_boundary`、`complete`、
  `ask_orchestrator`。
- `TurnRecord`：单次 turn
  的事实来源，包含事件、工具调用、审批、动作、模型路由、task/workOrder/artifact、
  adapter record 和最终状态。
- `AgentTask` / `TaskStatus` / `TaskPriority`：框架级任务图节点、状态机和优先级。
- `AgentWorkOrder`：给 agent 的可校验工作单，约束目标、允许路径、必交 artifact、
  验收标准和验证命令。
- `Artifact` / `ArtifactKind`：交付事实，支持 discovery、decision、patch summary、
  verification、boundary plan 等类型。
- `ModelRoute`：模型角色、供应商、fallback、token budget、latency budget 和 reasoning
  trace。
- `BoundaryRequest` / `ProposedAction`：副作用审批与预览。
- `WorkspaceBoundaryDecision`：inside workspace、outside workspace、external import
  的统一边界判定。
- `WorkspaceToolAdapter`：workspace read/write/list/run command 的平台注入接口。
- `McpClientAdapter`：MCP tool discovery / invoke 的平台注入接口。
- `GitTimelineAdapter`：Git status、diff、checkpoint、task branch 的平台注入接口。
- `RuntimeAdapterRecord`：workspace tool、MCP gateway、Git timeline 的 replay-friendly
  adapter 事实。
- `ProgressEvent`：前台展示后台进度的稳定协议。
- `AgentCard` / `PeerEnvelope` / `PeerMessage`：平级 Agent 通信协议。
- `SubagentTask`：父 Agent 派发给子 Agent 的 typed work order。
- `EvolutionProposal` / `AdversarialAudit`：自进化提案与独立审计记录。
- `AgentPolicy`：memory、工具权限、高风险边界升级等策略层。
- `ObserverAnalyticsReport` / `ObserverInsight`：只读观察分析与记忆提案。
- `EvolutionSandboxReport`：自进化提案的沙箱验证结果。
- `SocialRelation`：基于真实协作记录生成的最小关系数据。
- `Channel` / `ChannelMessage`：多 Agent 共享频道记录。
- `DreamNarrative`：睡眠期记忆整理草稿。
- `WorldViewProfile` / `WorldViewStatement`：长期偏好、价值排序和稳定判断方式。
- `QueuedMessage` / `SessionMessage`：队列和会话读写记录。

## 运行时边界

`e` 可以在 Deno 仓库中开发和测试，但不应被设计成 Deno-first 框架。

允许：

- 使用 `KvStore`、`FileResourceReader`、`ModelProvider` 等接口隔离运行时能力。
- 在测试或本仓库装配层中提供 Deno 实现。
- 让产品外壳为桌面、Web、CLI、语音或远程 worker 注入自己的 IO、网络和存储实现。

避免：

- 在核心循环中直接读取环境变量、文件系统、进程、WebSocket、WebRTC 或平台专属 API。
- 把 Deno KV、Node fs、Bun API、浏览器 storage 作为内核默认事实来源。
- 让传输层、UI 层或具体部署平台进入 `AgentDecision`、`TurnRecord` 等核心类型。

当前 `WorkspaceResources` 不再默认绑定 `Deno.readTextFile`。产品外壳或测试必须显式注入
`FileResourceReader`，才能读取 `file://` 资源。

`WorkspaceBoundaryKernel` 也不直接读取文件系统。它只消费注入的 path resolver
结果，用来判断 inside/outside、symlink escape
和外部资源导入意图。`workspace-toolkit`、`mcp-gateway`、`git-timeline` 都把外部路径、跨
workspace 或远端副作用转换为 `BoundaryRequest` / `ProposedAction`，并把 adapter
成功、失败或 boundary-required 记录成 `RuntimeAdapterRecord`。

`TaskGraphKernel`、`ArtifactKernel` 和 replay export 继续只使用 `KvStore`
保存事实；completion summary 默认优先使用 `patch_summary` 与 `verification`
artifact，而不是从产品 UI 或本地文件系统推断状态。

## 测试覆盖

当前测试覆盖：

- Agent Loop 决策解析、repair、阻断、TurnRecord。
- Agent Policy 的工具权限、高风险边界升级和 AgentLoop 接入。
- Tool Runner 参数校验、未授权阻断、副作用审批。
- SafetyActionGate 审批、拒绝、stale、apply、应用记录。
- WorkspaceResources 的 `file://`、`memory://`、`session://`。
- StreamGuard 阻断与 reminder。
- AgentState 的 persona、memory、heartbeat、小脑 insight。
- AgentState 的 WorldView statement 记录与 prompt 注入。
- Advanced WorldView 的候选提取、合并、冲突标记和 prompt 过滤。
- ModelRuntime fallback、DeepSeekProvider、reasoning trace。
- EventEngine handler 合并和冲突。
- MessageQueue、SessionManager、ReplayLog。
- ReplayLog 导出 task、workOrder、artifact、runtime adapter record。
- TaskGraphKernel 的状态机、依赖 ready 检测和 WorkOrder 校验。
- ArtifactKernel 的写入、按 task/turn 查询和 artifact-first completion summary。
- WorkspaceBoundaryKernel 的 inside/outside、symlink escape 和 external import
  boundary。
- workspace-toolkit 的安全 read/write/list、外部写入 boundary、command artifact 和
  adapter 错误。
- mcp-gateway 的 tool discovery、path 参数清洗、外部 path boundary 和失败降级。
- git-timeline 的 status、diff、checkpoint、task branch 注入调用、boundary 与失败记录。
- SubagentRuntimeBridge 的 typed 子任务执行、默认空工具权限和 schema fail-closed。
- SpeculativePeerCoordinator 的 pending reply、prediction 对齐和消费语义。
- CollaborationRecipeRunner 的 sequential 输出传递和 critic-review 迭代。
- CompletionJudge 的 evidence 预检、结构化裁决和 verification artifact 写入。
- ObserverAnalytics 的 replay facts 汇总和 memory proposal。
- PeerCommunicationKernel 的 AgentCard、peer message、inbox、超时与 await。
- peer_* tools 通过 ToolRunner 调用 PeerCommunicationKernel。
- SubagentTaskKernel 的任务状态机与 result schema 校验。
- EvolutionKernel 的 proposal、adversarial audit 和禁止自审规则。
- EvolutionSandbox 的 proposal -> draft action report。
- SocialGraph 的 peer/subagent 协作关系生成与排序。
- ChannelKernel 的 membership、message append/list 和 turn-taking。
- DreamNarrativeKernel 的离线记忆叙事草稿。
- ForegroundSessionController 前后台分离协议。
- EAgentRuntime 端到端 reference flow。

## 与扩展蓝图的关系

核心框架和 `src/core` 下的扩展能力已经进入代码和 README。剩余未落地工作保留在
[BLUEPRINT_EXTENSIONS.md](./BLUEPRINT_EXTENSIONS.md)，主要是 app/runtime bridge、具体
transport adapter、产品 UI 和生产化治理。
