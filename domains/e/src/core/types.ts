export type TurnState =
  | "queued"
  | "calling_model"
  | "routing_decision"
  | "calling_tool"
  | "waiting_boundary"
  | "completed"
  | "blocked"
  | "cancelled";

export type AgentDecision =
  | { kind: "think"; summary: string }
  | { kind: "call_tool"; toolName: string; args: unknown }
  | { kind: "request_boundary"; reason: string; action: ProposedAction }
  | { kind: "complete"; result: string }
  | { kind: "ask_orchestrator"; question: string };

export type JsonSchema = Record<string, unknown>;

export type ToolExecutionState =
  | "pending"
  | "validating"
  | "waiting_boundary"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ToolExecutionRecord {
  id: string;
  toolName: string;
  state: ToolExecutionState;
  args?: unknown;
  proposedActionId?: string;
  boundaryRequestId?: string;
  result?: unknown;
  error?: KernelError;
  startedAt: number;
  endedAt?: number;
}

export interface BoundaryRequest {
  id: string;
  reason: string;
  action: ProposedAction;
  state: "pending" | "approved" | "rejected";
  createdAt: number;
  resolvedAt?: number;
}

export interface ProposedAction {
  id: string;
  kind: "file_edit" | "external_effect" | "workspace_change";
  title: string;
  target: string;
  preview?: string;
  beforeHash?: string;
  state: "draft" | "ready" | "approved" | "applied" | "rejected" | "stale";
}

export interface AppliedActionRecord {
  id: string;
  actionId: string;
  state: "applied" | "rejected" | "stale" | "failed";
  result?: unknown;
  error?: KernelError;
  at: number;
}

export interface AnchoredEdit {
  targetUri: string;
  anchor: string;
  replacement: string;
  beforeHash?: string;
}

export interface WorkspaceResource {
  uri: string;
  mediaType: string;
  digest: string;
  content: string;
  summary?: string;
  anchors?: ResourceAnchor[];
  redaction?: "none" | "partial";
  metadata?: Record<string, unknown>;
}

export interface StreamRule {
  id: string;
  description: string;
  pattern: string;
  action: "abort_and_retry" | "request_boundary" | "inject_reminder";
  severity: "info" | "warn" | "block";
  reminder?: string;
  maxRetries?: number;
}

export interface ResourceAnchor {
  id: string;
  line: number;
  column: number;
  length: number;
  text: string;
}

export interface ModelRoute {
  role: ModelRole;
  provider: string;
  modelId: string;
  fallbackChain: string[];
  tokenBudget: number;
  latencyBudgetMs?: number;
  fallbackOccurred: boolean;
  messageStitching?: string;
  reasoningTrace?: ReasoningTrace;
}

export type ModelRole = "default" | "smol" | "slow" | "plan" | "review" | "commit";

export interface ReasoningTrace {
  kind: "none" | "summary" | "provider_trace";
  content?: string;
}

export interface EventRecord {
  id: string;
  type: string;
  at: number;
  payload?: unknown;
}

export type EventSignal =
  | { kind: "none" }
  | { kind: "block"; reason: string }
  | { kind: "modifyArgs"; args: unknown }
  | { kind: "modifyResult"; result: unknown }
  | { kind: "overrideDecision"; decision: AgentDecision; privileged: boolean }
  | { kind: "injectMessage"; message: string; priority: number; tokenCost?: number };

export interface EventEngineRecord {
  handlerId: string;
  signal: EventSignal;
  error?: KernelError;
}

export interface EventEngineResult<TPayload = unknown> {
  blocked: boolean;
  blockReason?: string;
  payload: TPayload;
  injectedMessages: string[];
  overrideDecision?: AgentDecision;
  records: EventEngineRecord[];
}

export type SessionMessageRole = "system" | "user" | "assistant" | "tool";

export interface SessionMessage {
  id: string;
  agentId: string;
  sessionId: string;
  role: SessionMessageRole;
  content: string;
  createdAt: number;
  turnId?: string;
}

export interface QueuedMessage {
  id: string;
  agentId: string;
  sessionId: string;
  content: string;
  priority: number;
  state: "queued" | "processing" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  error?: KernelError;
}

export type TaskStatus =
  | "proposed"
  | "ready"
  | "running"
  | "waiting_human"
  | "blocked"
  | "review"
  | "done"
  | "failed"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgentIds: string[];
  parentTaskId?: string;
  dependsOnTaskIds: string[];
  progress: number;
  projectId?: string;
  branchName?: string;
  createdAt: number;
  updatedAt: number;
}

export type ArtifactKind =
  | "discovery"
  | "decision"
  | "patch_summary"
  | "verification"
  | "boundary_plan"
  | "risk"
  | "memory_candidate";

export interface Artifact {
  id: string;
  taskId: string;
  turnId?: string;
  kind: ArtifactKind;
  path?: string;
  summary: string;
  payload?: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface VerificationCommand {
  cwd: string;
  program: string;
  args: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface AgentWorkOrder {
  id: string;
  taskId: string;
  assignedAgentId: string;
  goal: string;
  allowedPaths: string[];
  forbiddenActions: string[];
  requiredArtifacts: ArtifactKind[];
  successCriteria: string[];
  verificationCommands: VerificationCommand[];
  maxTurns: number;
  fallbackPlan: string;
  createdAt: number;
}

export interface WorkspacePathResolution {
  inputPath: string;
  absolutePath: string;
  relativePath?: string;
  insideWorkspace: boolean;
  escapedSymlink?: boolean;
  workspaceId?: string;
}

export type WorkspaceBoundaryDecision =
  | {
    kind: "inside_workspace";
    inputPath: string;
    absolutePath: string;
    relativePath: string;
    workspaceId?: string;
  }
  | {
    kind: "outside_workspace";
    inputPath: string;
    absolutePath: string;
    escapedSymlink: boolean;
    proposedAction: ProposedAction;
    boundaryRequest: BoundaryRequest;
  }
  | {
    kind: "external_import_required";
    inputPath: string;
    absolutePath: string;
    importTargetUri: string;
    proposedAction: ProposedAction;
    boundaryRequest: BoundaryRequest;
  };

export interface RuntimeAdapterRecord {
  id: string;
  kind: "workspace_tool" | "git_timeline" | "mcp_gateway";
  operation: string;
  state: "succeeded" | "failed" | "boundary_required";
  input?: unknown;
  result?: unknown;
  boundaryRequestId?: string;
  error?: KernelError;
  at: number;
}

export interface TurnRecord {
  id: string;
  agentId: string;
  sessionId: string;
  taskId: string | null;
  startedAt: number;
  endedAt?: number;
  inputMessageIds: string[];
  promptDigest: string;
  decision?: AgentDecision;
  events: EventRecord[];
  eventEngineRecords: EventEngineRecord[];
  toolExecutions: ToolExecutionRecord[];
  boundaryRequests: BoundaryRequest[];
  proposedActions: ProposedAction[];
  appliedActions: AppliedActionRecord[];
  modelRoutes: ModelRoute[];
  taskFacts?: AgentTask[];
  workOrders?: AgentWorkOrder[];
  artifacts?: Artifact[];
  adapterRecords?: RuntimeAdapterRecord[];
  finalState: TurnState;
  error?: KernelError;
}

export interface KernelError {
  code: string;
  message: string;
}

export interface CancellationToken {
  readonly cancelled: boolean;
  throwIfCancelled(): void;
}

export interface AgentState {
  agentId: string;
  persona: PersonaProfile;
  worldview: WorldViewProfile;
  memories: MemoryEntry[];
  observations: ObservationEvent[];
  heartbeatSchedules: HeartbeatSchedule[];
  cerebellumInsights: CerebellumInsight[];
  updatedAt: number;
}

export interface PersonaProfile {
  agentId: string;
  displayName: string;
  systemPrompt: string;
  cannotPretendToBe: string[];
  clarifyWhen: string[];
  digest: string;
}

export interface MemoryEntry {
  id: string;
  agentId: string;
  kind: "fact" | "preference" | "summary" | "hindsight";
  content: string;
  source: string;
  salience: number;
  createdAt: number;
}

export interface WorldViewProfile {
  agentId: string;
  statements: WorldViewStatement[];
  updatedAt: number;
}

export interface WorldViewStatement {
  id: string;
  agentId: string;
  kind: "preference" | "belief" | "value" | "constraint";
  content: string;
  confidence: number;
  source: string;
  conflictWith?: string[];
  updatedAt: number;
}

export interface ObservationEvent {
  id: string;
  agentId: string;
  type: string;
  payload?: unknown;
  observedAt: number;
}

export interface HeartbeatSchedule {
  id: string;
  agentId: string;
  reason: string;
  nextAt: number;
  intervalMs?: number;
}

export interface CerebellumInsight {
  id: string;
  agentId: string;
  turnId?: string;
  content: string;
  createdAt: number;
  late: boolean;
}

export interface AgentCard {
  agentId: string;
  displayName: string;
  purpose: string;
  model?: string;
  capabilities: string[];
  status: "idle" | "busy" | "offline" | "unknown";
  queueDepth: number;
  contextUsage?: {
    usedTokens: number;
    maxTokens: number;
  };
  updatedAt: number;
}

export interface PeerEnvelope<TInput = unknown> {
  id: string;
  conversationId: string;
  senderAgentId: string;
  targetAgentId: string;
  body: TInput;
  responseSchema?: JsonSchema;
  hops: number;
  maxHops: number;
  ttlMs: number;
  createdAt: number;
}

export interface PeerMessage<TInput = unknown, TResult = unknown> {
  envelope: PeerEnvelope<TInput>;
  state: "queued" | "processing" | "completed" | "failed" | "cancelled" | "expired";
  result?: TResult;
  error?: KernelError;
  updatedAt: number;
}

export interface SubagentTask<TInput = unknown, TResult = unknown> {
  id: string;
  parentTurnId: string;
  parentAgentId: string;
  agentId: string;
  prompt: string;
  input?: TInput;
  isolation: "none" | "workspace_snapshot" | "worktree";
  resultSchema: JsonSchema;
  maxTurns: number;
  state: "queued" | "running" | "completed" | "failed" | "cancelled";
  result?: TResult;
  error?: KernelError;
  createdAt: number;
  updatedAt: number;
}

export interface EvolutionProposal {
  id: string;
  agentId: string;
  title: string;
  rationale: string;
  changes: EvolutionChange[];
  state: "draft" | "ready_for_audit" | "approved" | "rejected";
  createdAt: number;
  updatedAt: number;
}

export interface EvolutionChange {
  target:
    | "persona"
    | "memory_policy"
    | "decision_policy"
    | "boundary_policy"
    | "heartbeat_policy";
  description: string;
  risk: "low" | "medium" | "high";
}

export interface AdversarialAudit {
  id: string;
  proposalId: string;
  auditorAgentId: string;
  verdict: "approve" | "reject";
  findings: string[];
  createdAt: number;
}

export interface ObserverInsight {
  id: string;
  type: "risk" | "pattern" | "memory_proposal";
  severity: "info" | "warn" | "block";
  content: string;
  sourceIds: string[];
  createdAt: number;
}

export interface MemoryProposal {
  id: string;
  agentId: string;
  content: string;
  source: string;
  salience: number;
  createdAt: number;
}

export interface ObserverAnalyticsReport {
  id: string;
  metrics: {
    turns: number;
    blockedTurns: number;
    toolFailures: number;
    boundaryRejections: number;
    peerTimeouts: number;
  };
  insights: ObserverInsight[];
  memoryProposals: MemoryProposal[];
  createdAt: number;
}

export interface EvolutionSandboxReport {
  id: string;
  proposalId: string;
  state: "skipped" | "validated" | "failed";
  summary: string;
  suggestedActions: ProposedAction[];
  commandPlan: string[];
  createdAt: number;
}

export interface SocialRelation {
  id: string;
  agentId: string;
  peerAgentId: string;
  label: "collaborator" | "reviewer" | "mentor" | "rival";
  trust: number;
  interactions: number;
  lastOutcome: "success" | "failure" | "timeout" | "unknown";
  updatedAt: number;
}

export interface Channel {
  id: string;
  name: string;
  memberAgentIds: string[];
  moderatorAgentId?: string;
  nextSpeakerIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  agentId: string;
  content: string;
  createdAt: number;
}

export interface DreamNarrative {
  id: string;
  agentId: string;
  memoryIds: string[];
  content: string;
  confidence: number;
  createdAt: number;
}
