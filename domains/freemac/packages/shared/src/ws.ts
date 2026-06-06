import type { AgentState, DdnsState, RelayReportState, SetupStatus, SystemSnapshot } from "./types";

export interface WsTelemetryMessage {
  type: "telemetry";
  payload: {
    setup: SetupStatus;
    ddns: DdnsState;
    relay: RelayReportState;
    snapshot: SystemSnapshot;
  };
}

export interface WsAgentStateMessage {
  type: "agent-state";
  payload: {
    state: AgentState;
    conversationDepth: number;
    activeAgentCount: number;
  };
}

export interface WsAgentTokenMessage {
  type: "agent-token";
  payload: {
    token: string;
    done: boolean;
  };
}

export interface WsToolEventMessage {
  type: "tool-event";
  payload: {
    toolId: string;
    status: "started" | "completed" | "failed";
  };
}

export interface WsPingMessage {
  type: "ping";
}

export interface WsPongMessage {
  type: "pong";
}

export interface WsAgentChatMessage {
  type: "agent-chat";
  payload: {
    message: string;
  };
}

export type WsServerMessage =
  | WsTelemetryMessage
  | WsAgentStateMessage
  | WsAgentTokenMessage
  | WsToolEventMessage
  | WsPingMessage;

export type WsClientMessage = WsPongMessage | WsAgentChatMessage;
