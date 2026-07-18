import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AccessRulesPanel } from "./AccessRulesPanel.tsx";
import { CoreScene } from "./CoreScene.tsx";
import { DatabasePanel } from "./DatabasePanel.tsx";
import {
  type AgentTurn,
  appendAgentDelta,
  applyHeartbeatTransition,
  type ApprovalResolution,
  buildEventStreamUrl,
  ConsoleClientError,
  type ConsoleRequest,
  ConsoleStaleRequestError,
  createAgentTurn,
  createAgentTurnCompletionGate,
  createAuthenticatedConsoleRequest,
  createConsoleClient,
  createSessionGeneration,
  emptyConsoleMemory,
  handleConsoleSessionMessage,
  parseAgentDelta,
  refreshAfterApproval,
  resolveAgentCompletionMessageId,
} from "./client-runtime.ts";
import {
  CONSOLE_ENDPOINTS,
  CONSOLE_MODULES,
  type ConsoleModuleId,
  corePresentation,
  formatBytes,
  formatTime,
  type NodeAvailability,
  relayUpdateMessage,
} from "./model.ts";

type SessionState = "checking" | "authenticated" | "anonymous";
type Tone = "neutral" | "success" | "error";
type Overview = {
  collectedAt?: number;
  cpuUsagePercent?: number;
  memoryUsedBytes?: number;
  memoryTotalBytes?: number;
  diskUsedBytes?: number;
  diskTotalBytes?: number;
  networkRxBytes?: number;
  networkTxBytes?: number;
  batteryPercent?: number | null;
  processCount?: number;
};
type Relay = {
  enabled?: boolean;
  paired?: boolean;
  serverUrl?: string;
  publicIpv6?: string | null;
  lastReportedAt?: number | null;
  errorMessage?: string | null;
};
type ProcessInfo = {
  pid: number;
  command: string;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
};
type TelemetryMinute = Overview & { minuteStart: number };
type AgentMessage = { role: "user" | "assistant"; content: string; createdAt: number };
type Approval = {
  id: string;
  state: string;
  reason?: string;
  summary?: string;
  parameterFingerprint: string;
  createdAt: number;
  expiresAt: number;
  action?: { title?: string; target?: string; preview?: string };
};
type AuditEvent = {
  id: string;
  category: string;
  action: string;
  outcome: string;
  actor?: string;
  createdAt: number;
};

export function ConsoleApp() {
  const [session, setSession] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [loginStatus, setLoginStatus] = useState("");
  const [module, setModule] = useState<ConsoleModuleId>("overview");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const [availability, setAvailability] = useState<NodeAvailability>("unknown");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [relay, setRelay] = useState<Relay | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryMinute[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(
    null,
  );
  const [whisper, setWhisper] = useState("");
  const [whisperStatus, setWhisperStatus] = useState("");
  const [agentTurn, setAgentTurn] = useState<AgentTurn | null>(null);
  const [nodeDataStale, setNodeDataStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: Tone }>({
    message: "正在连接控制面",
    tone: "neutral",
  });

  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.state === "pending"),
    [approvals],
  );
  const activeModule = CONSOLE_MODULES.find((item) => item.id === module)!;
  const core = corePresentation(availability);
  const sessionGeneration = useMemo(() => createSessionGeneration(), []);
  const agentCompletion = useMemo(() => createAgentTurnCompletionGate(), []);

  const resetAuthenticatedState = useCallback(() => {
    sessionGeneration.invalidate();
    agentCompletion.reset();
    const empty = emptyConsoleMemory();
    setSession("anonymous");
    setPassword("");
    setModule("overview");
    setAvailability(empty.availability);
    setOverview(null);
    setRelay(null);
    setProcesses([]);
    setTelemetry([]);
    setMessages([]);
    setApprovals([]);
    setAudit([]);
    setPairing(null);
    setAgentTurn(null);
    setNodeDataStale(false);
    setWhisper("");
    setWhisperStatus("");
    setLoginStatus("");
    setLoading(false);
    setStatus({ message: "会话已结束，请重新登录", tone: "neutral" });
  }, [agentCompletion, sessionGeneration]);
  const client = useMemo(
    () => createConsoleClient(fetch),
    [],
  );
  const authenticatedRequest = useMemo(
    () =>
      createAuthenticatedConsoleRequest(
        client.request,
        sessionGeneration,
        resetAuthenticatedState,
      ),
    [client, resetAuthenticatedState, sessionGeneration],
  );

  useEffect(() => {
    const ticket = sessionGeneration.capture();
    client.request<{ authenticated: true }>("/api/admin/session")
      .then(() => {
        if (!sessionGeneration.isCurrent(ticket)) return;
        sessionGeneration.activate();
        setSession("authenticated");
      })
      .catch(() => {
        if (sessionGeneration.isCurrent(ticket)) setSession("anonymous");
      });
  }, [client, sessionGeneration]);

  useEffect(() => {
    if (!("BroadcastChannel" in globalThis)) return;
    const channel = new BroadcastChannel("openfx-console-session");
    channel.onmessage = (event) => {
      handleConsoleSessionMessage(event.data, resetAuthenticatedState);
    };
    return () => channel.close();
  }, [resetAuthenticatedState]);

  useEffect(() => {
    if (session !== "authenticated") return;
    void refreshAll();
    const timer = window.setInterval(() => void refreshOverview(), 15_000);
    const sessionTimer = window.setInterval(
      () => void authenticatedRequest("/api/admin/session").catch(() => undefined),
      30_000,
    );
    const events = new EventSource(buildEventStreamUrl());
    const refreshAgent = () =>
      void Promise.all([loadMessages(), loadApprovals()]).catch(() => undefined);
    events.addEventListener("agent.delta", (event) => {
      try {
        const ticket = sessionGeneration.capture();
        if (!sessionGeneration.isAuthenticated(ticket)) return;
        const delta = parseAgentDelta(JSON.parse((event as MessageEvent).data));
        if (delta) {
          setAgentTurn((turn) => turn ? appendAgentDelta(turn, delta) : turn);
        }
      } catch {
        // A malformed ambient event must not interrupt the working console.
      }
    });
    events.addEventListener("heartbeat", (event) => {
      try {
        const ticket = sessionGeneration.capture();
        if (!sessionGeneration.isAuthenticated(ticket)) return;
        const data = JSON.parse((event as MessageEvent).data);
        if (!isAvailability(data?.availability)) return;
        void applyHeartbeatTransition(data.availability, {
          setAvailability,
          setStale: setNodeDataStale,
          refreshNodeData,
        });
      } catch {
        // Ignore malformed node lifecycle events.
      }
    });
    events.addEventListener("approval.requested", refreshAgent);
    events.addEventListener("approval.resolved", refreshAgent);
    events.onerror = () => {
      void authenticatedRequest("/api/admin/session").catch(() => undefined);
    };
    return () => {
      clearInterval(timer);
      clearInterval(sessionTimer);
      events.close();
    };
  }, [authenticatedRequest, session, sessionGeneration]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginStatus("验证中");
    const ticket = sessionGeneration.capture();
    try {
      await client.request("/api/admin/session", {
        method: "POST",
        body: JSON.stringify({ key: password }),
      });
      if (!sessionGeneration.isCurrent(ticket)) return;
      sessionGeneration.activate();
      setPassword("");
      setSession("authenticated");
      setLoginStatus("");
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : "登录失败");
    }
  }

  async function logout() {
    const pendingLogout = client.request("/api/admin/session", { method: "DELETE" });
    resetAuthenticatedState();
    if ("BroadcastChannel" in globalThis) {
      const channel = new BroadcastChannel("openfx-console-session");
      channel.postMessage({ type: "logout" });
      channel.close();
    }
    await pendingLogout.catch(() => undefined);
  }

  async function refreshOverview() {
    try {
      const payload = await authenticatedRequest<{
        overview?: Overview;
        relay?: Relay;
      }>(
        "/api/console/overview",
      );
      setOverview(payload.overview ?? null);
      setRelay(payload.relay ?? null);
      const relayError = payload.relay?.errorMessage;
      setAvailability(relayError ? "degraded" : "online");
      setNodeDataStale(Boolean(relayError));
      setStatus({
        message: `节点数据更新于 ${formatTime(payload.overview?.collectedAt)}`,
        tone: relayError ? "error" : "success",
      });
    } catch (error) {
      if (ignoreAfterSessionReset(error)) return;
      const message = error instanceof Error ? error.message : "节点状态读取失败";
      setAvailability(message.includes("离线") ? "offline" : "unknown");
      setNodeDataStale(true);
      setStatus({ message, tone: "error" });
    }
  }

  async function loadProcesses() {
    const payload = await authenticatedRequest<{ processes?: ProcessInfo[] }>(
      "/api/console/processes",
    );
    setProcesses(Array.isArray(payload.processes) ? payload.processes : []);
  }

  async function loadTelemetry() {
    const payload = await authenticatedRequest<{ minutes?: TelemetryMinute[] }>(
      "/api/console/telemetry",
    );
    setTelemetry(Array.isArray(payload.minutes) ? payload.minutes : []);
  }

  async function loadMessages() {
    const payload = await authenticatedRequest<{ messages?: AgentMessage[] }>(
      "/api/console/agent/messages",
    );
    setMessages(Array.isArray(payload.messages) ? payload.messages : []);
  }

  async function loadApprovals() {
    const payload = await authenticatedRequest<{ approvals?: Approval[] }>(
      "/api/console/approvals",
    );
    setApprovals(Array.isArray(payload.approvals) ? payload.approvals : []);
  }

  async function loadAudit() {
    const payload = await authenticatedRequest<{ events?: AuditEvent[] }>(
      "/api/console/audit",
    );
    setAudit(Array.isArray(payload.events) ? payload.events : []);
  }

  async function loadRelay() {
    const payload = await authenticatedRequest<{ relay?: Relay }>(
      "/api/console/relay",
    );
    setRelay(payload.relay ?? null);
  }

  async function refreshNodeData() {
    await Promise.allSettled([
      refreshOverview(),
      loadProcesses(),
      loadTelemetry(),
      loadRelay(),
    ]);
  }

  async function refreshAll() {
    const ticket = sessionGeneration.capture();
    setLoading(true);
    await refreshOverview();
    await Promise.allSettled([
      loadProcesses(),
      loadTelemetry(),
      loadMessages(),
      loadApprovals(),
      loadAudit(),
      loadRelay(),
    ]);
    sessionGeneration.commit(ticket, () => setLoading(false));
  }

  async function generatePairing() {
    try {
      const payload = await authenticatedRequest<{
        code: string;
        expiresAt: number;
      }>(
        CONSOLE_ENDPOINTS.pairings,
        { method: "POST", body: "{}" },
      );
      setPairing(payload);
      setStatus({ message: "已生成一次性配对码", tone: "success" });
    } catch (error) {
      if (ignoreAfterSessionReset(error)) return;
      setStatus({
        message: error instanceof Error ? error.message : "配对码生成失败",
        tone: "error",
      });
    }
  }

  async function revokeNode() {
    try {
      const payload = await authenticatedRequest<{
        revokedNodeId: string | null;
      }>(
        CONSOLE_ENDPOINTS.node,
        { method: "DELETE" },
      );
      setOverview(null);
      setRelay(null);
      setProcesses([]);
      setTelemetry([]);
      setAvailability("unknown");
      setNodeDataStale(false);
      setPairing(null);
      setStatus({
        message: payload.revokedNodeId ? "节点凭据已撤销" : "当前没有已配对节点",
        tone: "success",
      });
    } catch (error) {
      if (ignoreAfterSessionReset(error)) return;
      setStatus({
        message: error instanceof Error ? error.message : "撤销失败",
        tone: "error",
      });
    }
  }

  async function updateRelay(enabled: boolean) {
    try {
      const result = await authenticatedRequest<{ approvalRequired?: boolean }>(
        "/api/console/relay",
        {
          method: "POST",
          body: JSON.stringify({ enabled }),
        },
      );
      await loadRelay();
      if (result.approvalRequired) await loadApprovals();
      setStatus({
        message: relayUpdateMessage(result, enabled),
        tone: "success",
      });
    } catch (error) {
      if (ignoreAfterSessionReset(error)) return;
      setStatus({
        message: error instanceof Error ? error.message : "设置失败",
        tone: "error",
      });
    }
  }

  async function sendWhisper(event: FormEvent) {
    event.preventDefault();
    const message = whisper.trim();
    if (!message) return;
    const messageId = crypto.randomUUID();
    agentCompletion.begin(messageId);
    setWhisperStatus("Agent 正在处理");
    setAgentTurn(createAgentTurn(messageId));
    setWhisper("");
    try {
      const payload = await authenticatedRequest<{
        messageId?: string;
        message?: string;
      }>(
        "/api/console/agent/messages",
        {
          method: "POST",
          body: JSON.stringify({ message, conversationId: messageId }),
        },
      );
      if (
        !agentCompletion.complete(
          messageId,
          payload.messageId,
          () => setWhisperStatus(payload.message || "Agent 已响应"),
        )
      ) return;
      await Promise.all([loadMessages(), loadApprovals()]);
    } catch (error) {
      if (ignoreAfterSessionReset(error) || !agentCompletion.isCurrent(messageId)) {
        return;
      }
      agentCompletion.complete(
        messageId,
        resolveAgentCompletionMessageId(error, messageId),
        () =>
          setWhisperStatus(error instanceof Error ? error.message : "Agent 请求失败"),
      );
    }
  }

  async function resolveApproval(
    approval: Approval,
    decision: "approved" | "rejected",
  ) {
    const ticket = sessionGeneration.capture();
    try {
      const result = await authenticatedRequest<ApprovalResolution>(
        "/api/console/approvals",
        {
          method: "POST",
          body: JSON.stringify({
            id: approval.id,
            decision,
            parameterFingerprint: approval.parameterFingerprint,
          }),
        },
      );
      const refreshers: Record<string, () => Promise<void>> = {
        approvals: loadApprovals,
        overview: refreshOverview,
        relay: loadRelay,
        processes: loadProcesses,
        telemetry: loadTelemetry,
      };
      await refreshAfterApproval(result, decision, refreshers);
      sessionGeneration.commit(ticket, () =>
        setStatus({
          message: decision === "approved" ? "操作已批准" : "操作已拒绝",
          tone: "success",
        }));
    } catch (error) {
      if (ignoreAfterSessionReset(error)) return;
      setStatus({
        message: error instanceof Error ? error.message : "审批失败",
        tone: "error",
      });
    }
  }

  if (session !== "authenticated") {
    return (
      <main className="console-login">
        <div className="console-login-core">
          <CoreScene
            availability="unknown"
            dimmed={false}
            lowPower={session === "checking"}
          />
        </div>
        <form onSubmit={login}>
          <p>OPENFX CONSOLE</p>
          <h1>{session === "checking" ? "正在恢复会话" : "登录控制台"}</h1>
          <label>
            <span>管理密钥</span>
            <input
              autoFocus
              autoComplete="current-password"
              disabled={session === "checking"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button disabled={session === "checking" || !password.trim()} type="submit">
            {session === "checking" ? "连接中" : "建立安全会话"}
          </button>
          <span className="console-login-status" role="status">{loginStatus}</span>
        </form>
      </main>
    );
  }

  return (
    <main className={`openfx-console${module !== "overview" ? " has-workbench" : ""}`}>
      <header className="console-topbar">
        <button
          className="console-wordmark"
          type="button"
          onClick={() =>
            setModule("overview")}
        >
          <b>OpenFX</b>
          <span>CONSOLE</span>
        </button>
        <div className="console-node-status">
          <i className={`tone-${core.tone}`} />
          <span>Mac 节点</span>
          <strong>{core.label}</strong>
          <small>{relay?.publicIpv6 ?? "等待地址"}</small>
        </div>
        <div className="console-top-actions">
          <button
            className="console-approval-trigger"
            type="button"
            onClick={() => setModule("agent")}
          >
            待审批 <b>{pendingApprovals.length}</b>
          </button>
          <button
            disabled={loading}
            type="button"
            onClick={() => void refreshAll()}
          >
            {loading ? "同步中" : "刷新"}
          </button>
        </div>
      </header>

      <nav
        className={`console-rail${railCollapsed ? " is-collapsed" : ""}`}
        aria-label="控制台模块"
      >
        <button
          className="console-rail-toggle"
          aria-label={railCollapsed ? "展开导航" : "收起导航"}
          type="button"
          onClick={() => setRailCollapsed(!railCollapsed)}
        >
          {railCollapsed ? "›" : "‹"}
        </button>
        <div>
          {CONSOLE_MODULES.map((item) => (
            <button
              className={module === item.id ? "is-active" : ""}
              aria-current={module === item.id ? "page" : undefined}
              data-glyph={item.glyph}
              key={item.id}
              title={item.label}
              type="button"
              onClick={() => setModule(item.id)}
            >
              <ConsoleIcon name={item.glyph} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <section className="console-stage">
        <CoreScene
          availability={availability}
          dimmed={module !== "overview"}
          lowPower={lowPower}
        />
        <div className="console-vitals" aria-label="节点摘要">
          <Metric
            label="CPU"
            value={overview?.cpuUsagePercent === undefined
              ? "—"
              : `${overview.cpuUsagePercent.toFixed(1)}%`}
          />
          <Metric label="内存" value={formatBytes(overview?.memoryUsedBytes)} />
          <Metric label="进程" value={overview?.processCount?.toString() ?? "—"} />
        </div>
        <p className={`console-global-status tone-${status.tone}`} role="status">
          {status.message}
        </p>
      </section>

      {module !== "overview"
        ? (
          <aside
            className="console-workbench"
            aria-label={`${activeModule.label}工作台`}
          >
            <div className="console-workbench-head">
              <div>
                <span>WORKBENCH</span>
                <h2>{activeModule.label}</h2>
              </div>
              <button
                aria-label="关闭工作台"
                type="button"
                onClick={() => setModule("overview")}
              >
                ×
              </button>
            </div>
            <div className="console-workbench-body">
              <Workbench
                module={module}
                overview={overview}
                relay={relay}
                processes={processes}
                telemetry={telemetry}
                messages={messages}
                approvals={approvals}
                audit={audit}
                pairing={pairing}
                nodeDataStale={nodeDataStale}
                lowPower={lowPower}
                request={authenticatedRequest}
                onLowPower={setLowPower}
                onGeneratePairing={generatePairing}
                onRevokeNode={revokeNode}
                onRelay={updateRelay}
                onResolve={resolveApproval}
                onLogout={logout}
              />
            </div>
          </aside>
        )
        : null}

      <form className="console-whisper" onSubmit={sendWhisper}>
        <span className="console-whisper-mark">✦</span>
        <input
          aria-label="向 Agent 提问"
          placeholder="向 OpenFX Agent 描述要检查或执行的操作…"
          value={whisper}
          onChange={(event) => setWhisper(event.target.value)}
        />
        <button disabled={!whisper.trim()} type="submit">发送</button>
        {whisperStatus || agentTurn?.text
          ? <output title={whisperStatus}>{agentTurn?.text || whisperStatus}</output>
          : null}
      </form>
    </main>
  );
}

function Workbench(props: {
  module: ConsoleModuleId;
  overview: Overview | null;
  relay: Relay | null;
  processes: ProcessInfo[];
  telemetry: TelemetryMinute[];
  messages: AgentMessage[];
  approvals: Approval[];
  audit: AuditEvent[];
  pairing: { code: string; expiresAt: number } | null;
  nodeDataStale: boolean;
  lowPower: boolean;
  request: ConsoleRequest;
  onLowPower: (value: boolean) => void;
  onGeneratePairing: () => void;
  onRevokeNode: () => void;
  onRelay: (enabled: boolean) => void;
  onResolve: (approval: Approval, decision: "approved" | "rejected") => void;
  onLogout: () => void;
}) {
  if (props.module === "access") return <AccessRulesPanel request={props.request} />;
  if (props.module === "database") return <DatabasePanel request={props.request} />;
  if (props.module === "mac") {
    const maxCpu = Math.max(
      1,
      ...props.telemetry.slice(-24).map((item) => item.cpuUsagePercent ?? 0),
    );
    return (
      <div className="console-stack">
        {props.nodeDataStale
          ? (
            <p className="console-callout error">
              节点状态已变化，以下数据可能已过期。
            </p>
          )
          : null}
        <div className="console-metric-grid">
          <Metric
            label="CPU 使用"
            value={props.overview?.cpuUsagePercent === undefined
              ? "—"
              : `${props.overview.cpuUsagePercent.toFixed(1)}%`}
          />
          <Metric
            label="内存"
            value={`${formatBytes(props.overview?.memoryUsedBytes)} / ${
              formatBytes(props.overview?.memoryTotalBytes)
            }`}
          />
          <Metric
            label="磁盘"
            value={`${formatBytes(props.overview?.diskUsedBytes)} / ${
              formatBytes(props.overview?.diskTotalBytes)
            }`}
          />
          <Metric
            label="电池"
            value={props.overview?.batteryPercent == null
              ? "外接电源 / 未知"
              : `${props.overview.batteryPercent}%`}
          />
        </div>
        <section>
          <div className="console-section-heading">
            <div>
              <span>24 分钟</span>
              <h3>CPU 历史</h3>
            </div>
          </div>
          <div className="console-spark" aria-label="CPU 遥测历史">
            {props.telemetry.slice(-24).map((minute) => (
              <i
                key={minute.minuteStart}
                style={{
                  height: `${
                    Math.max(3, ((minute.cpuUsagePercent ?? 0) / maxCpu) * 100)
                  }%`,
                }}
                title={`${minute.cpuUsagePercent ?? 0}%`}
              />
            ))}
          </div>
        </section>
        <section>
          <div className="console-section-heading">
            <div>
              <span>实时</span>
              <h3>进程</h3>
            </div>
            <small>{props.processes.length} 个</small>
          </div>
          <div className="console-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PID</th>
                  <th>进程</th>
                  <th>CPU</th>
                  <th>内存</th>
                </tr>
              </thead>
              <tbody>
                {props.processes.map((process) => (
                  <tr key={process.pid}>
                    <td>{process.pid}</td>
                    <td>
                      <code>{process.command}</code>
                    </td>
                    <td>{process.cpuUsagePercent}%</td>
                    <td>{process.memoryUsagePercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }
  if (props.module === "relay") {
    return (
      <div className="console-stack">
        {props.nodeDataStale
          ? (
            <p className="console-callout error">
              节点状态已变化，以下数据可能已过期。
            </p>
          )
          : null}
        <div className="console-detail-list">
          <Metric label="Relay" value={props.relay?.enabled ? "已启用" : "已停用"} />
          <Metric label="公网 IPv6" value={props.relay?.publicIpv6 ?? "—"} />
          <Metric label="上次上报" value={formatTime(props.relay?.lastReportedAt)} />
          <Metric label="服务端" value={props.relay?.serverUrl || "—"} />
        </div>
        {props.relay?.errorMessage
          ? <p className="console-callout error">{props.relay.errorMessage}</p>
          : null}
        <div className="console-form-actions">
          <button type="button" onClick={() => void props.onRelay(false)}>停用</button>
          <button
            className="primary"
            type="button"
            onClick={() => void props.onRelay(true)}
          >
            启用远程接入
          </button>
        </div>
        <Pairing pairing={props.pairing} onGenerate={props.onGeneratePairing} />
      </div>
    );
  }
  if (props.module === "agent") {
    const pending = props.approvals.filter((item) => item.state === "pending");
    return (
      <div className="console-stack">
        <section>
          <div className="console-section-heading">
            <div>
              <span>Approval</span>
              <h3>待审批操作</h3>
            </div>
            <small>{pending.length} 项</small>
          </div>
          <div className="console-approval-list">
            {pending.map((approval) => (
              <article key={approval.id}>
                <span>{approval.action?.target ?? "Agent 操作"}</span>
                <strong>
                  {approval.summary ?? approval.reason ?? approval.action?.title ??
                    approval.id}
                </strong>
                {approval.action?.preview ? <pre>{approval.action.preview}</pre> : null}
                <time>{formatTime(approval.expiresAt)}</time>
                <div>
                  <button
                    type="button"
                    onClick={() => void props.onResolve(approval, "rejected")}
                  >
                    拒绝
                  </button>
                  <button
                    className="primary"
                    type="button"
                    onClick={() => void props.onResolve(approval, "approved")}
                  >
                    批准
                  </button>
                </div>
              </article>
            ))}
            {pending.length === 0
              ? <p className="console-empty">没有等待审批的操作</p>
              : null}
          </div>
        </section>
        <section>
          <div className="console-section-heading">
            <div>
              <span>Stream</span>
              <h3>Agent 会话</h3>
            </div>
          </div>
          <div className="console-message-list">
            {props.messages.slice(-30).map((message, index) => (
              <article className={message.role} key={`${message.createdAt}-${index}`}>
                <span>{message.role === "user" ? "你" : "Agent"}</span>
                <p>{message.content}</p>
                <time>{formatTime(message.createdAt)}</time>
              </article>
            ))}
            {props.messages.length === 0
              ? <p className="console-empty">使用底部 Whisper Bar 开始会话</p>
              : null}
          </div>
        </section>
      </div>
    );
  }
  if (props.module === "audit") {
    return (
      <div className="console-table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>类别</th>
              <th>动作</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {props.audit.map((event) => (
              <tr key={event.id}>
                <td>{formatTime(event.createdAt)}</td>
                <td>{event.category}</td>
                <td>
                  <code>{event.action}</code>
                </td>
                <td>
                  <span className={`console-outcome ${event.outcome}`}>
                    {event.outcome}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {props.audit.length === 0
          ? <p className="console-empty">暂无审计记录</p>
          : null}
      </div>
    );
  }
  return (
    <div className="console-stack">
      <section className="console-setting-row">
        <div>
          <strong>节能模式</strong>
          <p>停用动态画布，使用静态二维核心。</p>
        </div>
        <button
          aria-pressed={props.lowPower}
          className={props.lowPower ? "is-on" : ""}
          type="button"
          onClick={() => props.onLowPower(!props.lowPower)}
        >
          {props.lowPower ? "已开启" : "已关闭"}
        </button>
      </section>
      <Pairing pairing={props.pairing} onGenerate={props.onGeneratePairing} />
      <section className="console-setting-row danger">
        <div>
          <strong>撤销与轮换</strong>
          <p>生成新的配对码并在 Mac 上重新配对，会原子替换旧凭据。</p>
        </div>
        <div className="console-setting-actions">
          <button type="button" onClick={() => void props.onGeneratePairing()}>
            轮换凭据
          </button>
          <button type="button" onClick={() => void props.onRevokeNode()}>
            撤销节点
          </button>
        </div>
      </section>
      <section className="console-setting-row">
        <div>
          <strong>控制台会话</strong>
          <p>清除当前 HttpOnly 会话 cookie。</p>
        </div>
        <button type="button" onClick={() => void props.onLogout()}>退出登录</button>
      </section>
    </div>
  );
}

function Pairing(
  props: {
    pairing: { code: string; expiresAt: number } | null;
    onGenerate: () => void;
  },
) {
  return (
    <section className="console-pairing">
      <div className="console-section-heading">
        <div>
          <span>10 分钟有效</span>
          <h3>Mac 配对</h3>
        </div>
        <button type="button" onClick={() => void props.onGenerate()}>
          生成配对码
        </button>
      </div>
      {props.pairing
        ? (
          <div>
            <code>{props.pairing.code}</code>
            <time>失效于 {formatTime(props.pairing.expiresAt)}</time>
          </div>
        )
        : <p>配对码只显示在当前会话，不会写入浏览器存储。</p>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="console-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ConsoleIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    core: "M12 3l7 4v8l-7 4-7-4V7l7-4zm0 5a4 4 0 100 8 4 4 0 000-8z",
    mac: "M5 5h14v10H5V5zm-2 13h18M9 15v3m6-3v3",
    relay: "M5 12a7 7 0 0112-5m2-3v5h-5M19 12a7 7 0 01-12 5m-2 3v-5h5",
    agent: "M8 9a4 4 0 018 0v4a4 4 0 01-8 0V9zm4-6v2M6 11H3m15 0h3M8 19h8",
    access: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3zm-3 9l2 2 4-5",
    database:
      "M5 6c0-2 14-2 14 0s-14 2-14 0zm0 0v6c0 2 14 2 14 0V6m-14 6v6c0 2 14 2 14 0v-6",
    audit: "M7 3h10v18H7V3zm3 5h4m-4 4h4m-4 4h4",
    settings:
      "M12 8a4 4 0 100 8 4 4 0 000-8zm0-5v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1m0-12.8l-2.1 2.1m-8.6 8.6l-2.1 2.1",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={paths[name]} />
    </svg>
  );
}

function isAvailability(value: unknown): value is NodeAvailability {
  return value === "unknown" || value === "online" || value === "degraded" ||
    value === "offline";
}

function ignoreAfterSessionReset(error: unknown): boolean {
  return error instanceof ConsoleStaleRequestError ||
    (error instanceof ConsoleClientError && error.status === 401);
}
