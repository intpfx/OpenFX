import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { relaySettingsSchema, setupInitSchema } from "@freemac/shared";
import type {
  AgentState,
  DdnsState,
  RelayReportState,
  SetupStatus,
  SystemSnapshot,
  WsClientMessage,
  WsServerMessage,
} from "@freemac/shared";

const SESSION_STORAGE_KEY = "freemac.sessionId";

export type AuthState = "checking" | "authenticated" | "unauthenticated";

export interface OverviewResponse {
  setup: SetupStatus;
  ddns: DdnsState;
  relay: RelayReportState;
  snapshot: SystemSnapshot;
}

export interface RelayStatusPresentation {
  connectionLabel: string;
  reportLabel: string;
  tone: "idle" | "success" | "error" | "running";
}

interface SetupFormState {
  password: string;
}

export interface CoreVisualProfile {
  locked: boolean;
  initialized: boolean;
  authState: AuthState;
  tone: RelayStatusPresentation["tone"];
  cpuPercent: number;
  memoryRatio: number;
  diskRatio: number;
  processCount: number;
  networkActivity: number;
  pulse: number;
  directLinkAvailable: boolean;
  errorActive: boolean;
  agentState: AgentState;
  conversationDepth: number;
  batteryPercent: number;
}

const DEFAULT_RELAY_STATE: RelayReportState = {
  configured: false,
  relayOrigin: "",
  status: "idle",
  lastReportedAt: null,
  errorMessage: null,
  lastTargetUrl: null,
};

function normalizeOverviewResponse(data: Partial<OverviewResponse>): OverviewResponse | null {
  if (!data.setup || !data.ddns || !data.snapshot) {
    return null;
  }

  return {
    setup: data.setup,
    ddns: data.ddns,
    snapshot: data.snapshot,
    relay: data.relay || DEFAULT_RELAY_STATE,
  };
}

function describeRelayState(relay: RelayReportState | null | undefined): RelayStatusPresentation {
  if (!relay || !relay.configured) {
    return {
      connectionLabel: "未连接",
      reportLabel: "未配置",
      tone: "idle",
    };
  }

  if (relay.status === "running") {
    return {
      connectionLabel: "已连接",
      reportLabel: "上报中",
      tone: "running",
    };
  }

  if (relay.errorMessage) {
    return {
      connectionLabel: "已连接",
      reportLabel: "上报失败",
      tone: "error",
    };
  }

  if (relay.lastReportedAt) {
    return {
      connectionLabel: "已连接",
      reportLabel: "上报成功",
      tone: "success",
    };
  }

  return {
    connectionLabel: "已连接",
    reportLabel: "等待首次上报",
    tone: "idle",
  };
}

function summarizeWarning(ddns: DdnsState, relay: RelayReportState): string {
  if (relay.errorMessage) {
    return relay.errorMessage;
  }
  if (ddns.errorMessage) {
    return ddns.errorMessage;
  }
  if (!ddns.currentIpv6) {
    return "Waiting for a public IPv6 route.";
  }
  return "Relay and direct access can continue from this machine.";
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function useFreemacState() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [relayOrigin, setRelayOrigin] = useState("");
  const [relayMessage, setRelayMessage] = useState<string | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [relayBusy, setRelayBusy] = useState(false);
  const [setupForm, setSetupForm] = useState<SetupFormState>({
    password: "",
  });
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [agentResponse, setAgentResponse] = useState("");
  const [agentThinking, setAgentThinking] = useState(false);
  const [conversationDepth, setConversationDepth] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  function createHeaders(includeAuth = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (includeAuth && sessionId) {
      headers["x-session-id"] = sessionId;
    }
    return headers;
  }

  useEffect(() => {
    const storedSessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedSessionId) {
      setSessionId(storedSessionId);
      void fetch("/auth/status", {
        headers: {
          "x-session-id": storedSessionId,
        },
      })
        .then((response) => response.json())
        .then((data: { authenticated: boolean }) => {
          if (data.authenticated) {
            setAuthState("authenticated");
            return;
          }

          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          setSessionId(null);
          setAuthState("unauthenticated");
        })
        .catch(() => {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          setSessionId(null);
          setAuthState("unauthenticated");
        });
    } else {
      setAuthState("unauthenticated");
    }

    void fetch("/system/overview")
      .then((response) => response.json())
      .then((raw: Partial<OverviewResponse>) => {
        const data = normalizeOverviewResponse(raw);
        if (!data) {
          return;
        }

        setOverview(data);
        setRelayOrigin(data.setup.relayOrigin || "");
      })
      .catch(() => undefined);

    let ws: WebSocket | null = null;
    let reconnectDelay = 1000;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws/stream`);

      ws.onopen = () => {
        reconnectDelay = 1000;
        wsRef.current = ws;
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as WsServerMessage;
        if (msg.type === "telemetry") {
          const data = normalizeOverviewResponse(msg.payload);
          if (data) {
            setOverview(data);
          }
        } else if (msg.type === "agent-state") {
          setAgentState(msg.payload.state);
          setAgentThinking(msg.payload.state === "thinking");
          setConversationDepth(msg.payload.conversationDepth);
        } else if (msg.type === "agent-token") {
          if (msg.payload.done) {
            setAgentThinking(false);
          } else {
            setAgentResponse((prev) => prev + msg.payload.token);
          }
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (disposed) return;
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          connect();
        }, reconnectDelay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  async function submitSetup() {
    setSetupError(null);
    const payload = {
      password: setupForm.password,
    };

    const parsed = setupInitSchema.safeParse(payload);
    if (!parsed.success) {
      setSetupError(parsed.error.issues[0]?.message || "Please complete the setup form.");
      return;
    }

    const response = await fetch("/setup/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsed.data),
    });

    const raw = await response.text();
    let data: { ok?: boolean; message?: string } = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as { ok?: boolean; message?: string };
      } catch {
        data = {};
      }
    }
    if (!response.ok || !data.ok) {
      setSetupError(data.message || "Setup failed. Check the form values and try again.");
      return;
    }

    const refreshedRaw = (await fetch("/system/overview").then((result) =>
      result.json(),
    )) as Partial<OverviewResponse>;
    const refreshed = normalizeOverviewResponse(refreshedRaw);
    if (!refreshed) {
      setSetupError("Setup saved, but dashboard refresh returned incomplete data.");
      return;
    }

    setOverview(refreshed);
    setSetupForm({ password: "" });
    setRelayMessage("Setup saved.");
  }

  async function submitLogin() {
    setLoginBusy(true);
    setLoginError(null);

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: loginPassword }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok || !data.sessionId) {
        setLoginError(data.message || "Login failed");
        return;
      }

      window.localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      setSessionId(data.sessionId as string);
      setAuthState("authenticated");
      setLoginPassword("");
    } catch {
      setLoginError("Login failed");
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    if (sessionId) {
      await fetch("/auth/logout", {
        method: "POST",
        headers: createHeaders(true),
      }).catch(() => undefined);
    }

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionId(null);
    setAuthState("unauthenticated");
  }

  async function saveRelaySettings() {
    setRelayError(null);
    setRelayMessage(null);

    const payload = {
      relayOrigin: relayOrigin.trim(),
    };
    const parsed = relaySettingsSchema.safeParse(payload);
    if (!parsed.success) {
      setRelayError(parsed.error.issues[0]?.message || "Enter a valid Deno Deploy URL.");
      return;
    }

    const response = await fetch("/setup/relay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...createHeaders(true),
      },
      body: JSON.stringify(parsed.data),
    });

    const raw = await response.text();
    let data: { ok?: boolean; message?: string; status?: SetupStatus; relay?: RelayReportState } =
      {};
    if (raw) {
      try {
        data = JSON.parse(raw) as {
          ok?: boolean;
          message?: string;
          status?: SetupStatus;
          relay?: RelayReportState;
        };
      } catch {
        data = {};
      }
    }

    if (!response.ok || !data.ok || !data.status || !data.relay) {
      setRelayError(data.message || "Failed to save relay settings.");
      return;
    }

    setOverview((current) =>
      current
        ? {
          ...current,
          setup: data.status as SetupStatus,
          relay: data.relay as RelayReportState,
        }
        : current,
    );
    setRelayOrigin(data.status.relayOrigin);
    setRelayMessage(data.message || "Relay saved.");
  }

  async function reportRelayNow() {
    setRelayBusy(true);
    setRelayError(null);
    setRelayMessage(null);

    try {
      const response = await fetch("/system/report-relay", {
        method: "POST",
        headers: createHeaders(true),
      });
      const raw = await response.text();
      let data: { ok?: boolean; message?: string; relay?: RelayReportState } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { ok?: boolean; message?: string; relay?: RelayReportState };
        } catch {
          data = {};
        }
      }
      if (!response.ok || !data.ok || !data.relay) {
        setRelayError(data.message || "Relay report failed.");
        return;
      }

      setOverview((current) =>
        current ? { ...current, relay: data.relay as RelayReportState } : current,
      );
      setRelayMessage(
        data.relay.errorMessage
          ? `Relay report finished with error: ${data.relay.errorMessage}`
          : "Relay report sent.",
      );
    } catch {
      setRelayError("Relay report failed.");
    } finally {
      setRelayBusy(false);
    }
  }

  const initialized = overview?.setup.initialized ?? false;
  const locked = !initialized || authState !== "authenticated";
  const relayPresentation = describeRelayState(overview?.relay);
  const warningText = summarizeWarning(
    overview?.ddns || {
      currentIpv6: null,
      observedIpv6: null,
      lastUpdatedAt: null,
      status: "idle",
      errorMessage: null,
    },
    overview?.relay || DEFAULT_RELAY_STATE,
  );

  const directUrl = overview?.ddns.currentIpv6
    ? `http://[${overview.ddns.currentIpv6}]:${overview.setup.publicPort}`
    : "Unavailable";

  const visualProfile = useMemo<CoreVisualProfile>(() => {
    const cpuPercent = overview?.snapshot.cpuUsagePercent ?? 0;
    const memoryRatio = overview?.snapshot.memoryTotalMb
      ? (overview.snapshot.memoryUsedMb / overview.snapshot.memoryTotalMb) * 100
      : 0;
    const diskRatio = overview?.snapshot.diskTotalGb
      ? (overview.snapshot.diskUsedGb / overview.snapshot.diskTotalGb) * 100
      : 0;
    const processCount = overview?.snapshot.processCount ?? 0;
    const networkActivity =
      (overview?.snapshot.networkRxMb || 0) + (overview?.snapshot.networkTxMb || 0);
    const batteryPercent = overview?.snapshot.batteryPercent ?? 100;

    return {
      locked,
      initialized,
      authState,
      tone: relayPresentation.tone,
      cpuPercent,
      memoryRatio,
      diskRatio,
      processCount,
      networkActivity,
      pulse: Math.max(0.3, Math.min(1.4, cpuPercent / 100 + networkActivity / 5000 + 0.35)),
      directLinkAvailable: Boolean(overview?.ddns.currentIpv6),
      errorActive: Boolean(overview?.relay.errorMessage || overview?.ddns.errorMessage),
      agentState,
      conversationDepth,
      batteryPercent,
    };
  }, [
    agentState,
    authState,
    conversationDepth,
    initialized,
    locked,
    overview,
    relayPresentation.tone,
  ]);

  const sendAgentChat = useCallback((message: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setAgentResponse("");
    const msg: WsClientMessage = { type: "agent-chat", payload: { message } };
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  return {
    agentResponse,
    agentState,
    agentThinking,
    authState,
    directUrl,
    initialized,
    lastUpdatedLabel: formatTimestamp(overview?.snapshot.collectedAt),
    locked,
    loginBusy,
    loginError,
    loginPassword,
    logout,
    machineIpv6: overview?.ddns.currentIpv6 || null,
    relayBusy,
    relayError,
    relayMessage,
    relayOrigin,
    relayPresentation,
    reportRelayNow,
    saveRelaySettings,
    sendAgentChat,
    setLoginPassword,
    setRelayOrigin,
    setSetupPassword: (value: string) => setSetupForm({ password: value }),
    settingsListenHost: overview?.setup.currentListenHost || "::",
    settingsListenPort: overview?.setup.currentListenPort || 24531,
    setupError,
    setupPassword: setupForm.password,
    submitLogin,
    submitSetup,
    visualProfile,
    warningText,
  };
}
