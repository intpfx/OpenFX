# e 未落地扩展路线

> 本文件只记录尚未落成代码的内容。`src/core` 下的扩展能力已落地，见
> [README.md](./README.md)。

## 当前已落地，不在本文重复

- Agent Loop、Tool
  Runner、SafetyActionGate、ReplayLog、AgentState、MessageQueue、SessionManager。
- 前台交互 / 后台执行分离协议。
- DeepSeek reference adapter。
- Agent Policy、Observer Analytics、Peer Tool Bridge。
- WorldView 最小模型与 Advanced WorldView。
- Agent-to-Agent Peer Communication 内核服务。
- Subagent Task 内核服务。
- Evolution Proposal、Adversarial Audit、Evolution Sandbox。
- Minimal Social Graph、Channel、Dream Narrative。
- TaskGraphKernel、AgentWorkOrder、ArtifactKernel、WorkspaceBoundaryKernel。
- workspace-toolkit、mcp-gateway、git-timeline reference adapter 契约。
- Replay bundle 中的 task/workOrder/artifact/runtime adapter record 导出。
- 运行时无关的 `FileResourceReader`、`KvStore`、`ModelProvider` 等接口边界。
- `SubagentRuntimeBridge`、`SpeculativePeerCoordinator`、`CollaborationRecipeRunner` 和
  `CompletionJudge`。这些吸收自 Pi `agent-manager` 的 app 层协作模式，已以注入式 adapter
  和可测试 schema 边界落地。
- AStudio 的框架价值已吸收；不迁 Rust crate、SQLite、daemon 常驻进程、微信 API 或翻译
  Agent 源码。

---

## 1. Subagent Runtime Bridge Hardening

**位置**：`src/app/subagent-runtime-bridge.ts` 与 `src/app/e-agent-runtime.ts`

**目的**：已落地的 `SubagentRuntimeBridge` 可以创建、执行和收集 typed 子任务。剩余工作是
把它作为 `EAgentRuntime` 的可选工具链入口，并补齐更真实的 workspace / worktree
合并边界。

**剩余范围**：

- 把 subagent recipe 暴露为可注册 tool definitions，而不是只能由产品装配层手动调用。
- 为子 Agent 工具权限接入 `AgentPolicy`，形成可 replay 的 permission record。
- worktree / workspace merge 仍必须回到 `ProposedAction`。
- 将 subagent recipe 的 artifact 写回父 task completion summary。

**验收**：

- 一个 reference flow 能通过工具调用创建 reviewer 子任务并返回 typed result。
- 子任务权限记录可在 replay bundle 中复核。
- workspace merge 只通过 `BoundaryRequest` / `ProposedAction` 完成。

---

## 2. Transport Adapters

**位置**：`src/app/` 或产品外壳；不进入 `src/core`。

**目的**：为已落地的 peer/channel 协议提供具体传输实现。

**候选实现**：

- local in-process adapter。
- worker adapter。
- HTTP/SSE adapter。
- WebRTC adapter。
- Pi `agent-manager` 的统一 bridge daemon、在线池、互斥占用和自适应轮询只作为 adapter
  生命周期参考；不迁微信 / Telegram API 依赖。

**验收**：

- adapter 只实现传输，不改变 `PeerMessage` / `ChannelMessage` 事实结构。
- 跨 workspace、跨用户、跨网络边界仍必须经过 `BoundaryRequest`。
- transport 事件可 replay。

---

## 3. Product UI / Voice Shell

**位置**：`e-agent` 或其他产品外壳；不进入 `domains/e/src/core`。

**目的**：把前台进度、peer 协作、channel 和审批展示给用户。

**第一版范围**：

- 后台执行进度。
- peer message 列表。
- boundary approval / rejection。
- subagent task 状态。

**AStudio 产品壳启发，只保留蓝图**：

- terminal control console：可作为未来 CLI / desktop shell 的控制台形态参考。
- daemon / social binding：可作为后台陪伴、社交入口或 notification shell 的启发。
- translation agent：可作为特定产品能力，不进入 `domains/e` core。
- 微信入口：只作为外壳入口候选，不引入微信 API 依赖。

**暂不做**：

- 把 UI 状态写进核心事实模型。
- 在产品层重新实现 AgentLoop。
- 迁移 AStudio 产品壳源码到 `domains/e`。

---

## 4. Production Governance

**位置**：待定，优先产品装配层。

**目的**：把内核里的策略、审计、沙箱报告接入真实生产约束。

**第一版范围**：

- policy 配置文件加载。
- 审批缓存持久化。
- replay bundle 导出入口。
- sandbox report 人工确认流程。
- 将已落地的 `CompletionJudge` 接入产品层完成按钮或任务收口流程。

**暂不做**：

- 自动提交代码。
- 自动热重载。
- Agent 自己批准自己的修改。

---

## 建议实现顺序

1. `Subagent Runtime Bridge`
2. `local Transport Adapter`
3. `Peer / Channel 产品 UI`
4. `Production Governance`

这个顺序的理由：先把已落地的 core 能力接入 reference
runtime，再做具体传输和产品体验，最后补生产治理。
