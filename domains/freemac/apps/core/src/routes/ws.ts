import { Elysia } from "elysia";
import type { WsClientMessage, WsServerMessage } from "@freemac/shared";
import { config } from "../config";
import { getDdnsState } from "../services/ddns.service";
import { getRelayReportState } from "../services/relay-report.service";
import { getSetupStatus } from "../services/settings.service";
import { getSystemSnapshot } from "../services/telemetry.service";
import { chatWithTools, streamChat } from "../services/agent.service";
import {
  addAssistantMessage,
  addUserMessage,
  getOrCreateSession,
  removeSession,
  setSessionState,
} from "../services/agent-session.service";

async function buildTelemetryMessage(): Promise<WsServerMessage> {
  return {
    type: "telemetry",
    payload: {
      setup: await getSetupStatus(),
      ddns: getDdnsState(),
      relay: getRelayReportState(),
      snapshot: getSystemSnapshot(),
    },
  };
}

const intervals = new Map<string, ReturnType<typeof setInterval>>();

async function handleAgentChat(
  ws: { id: string; send: (msg: WsServerMessage) => void },
  message: string,
): Promise<void> {
  ws.send(setSessionState(ws.id, "listening"));
  addUserMessage(ws.id, message);

  ws.send(setSessionState(ws.id, "thinking"));
  const session = getOrCreateSession(ws.id);

  const { content, toolCalls } = await chatWithTools(session.messages);

  for (const tool of toolCalls) {
    ws.send({
      type: "tool-event",
      payload: { toolId: tool.toolId, status: "started" },
    });
    ws.send({
      type: "tool-event",
      payload: { toolId: tool.toolId, status: "completed" },
    });
  }

  if (content) {
    addAssistantMessage(ws.id, content);
    ws.send(setSessionState(ws.id, "responding"));

    for await (const token of streamChat(session.messages)) {
      ws.send({ type: "agent-token", payload: { token, done: false } });
    }
    ws.send({ type: "agent-token", payload: { token: "", done: true } });
  } else if (toolCalls.length > 0) {
    const summary = `Tool calls: ${toolCalls.map((t) => t.toolId).join(", ")}`;
    addAssistantMessage(ws.id, summary);
    ws.send({ type: "agent-token", payload: { token: summary, done: true } });
  }

  ws.send(setSessionState(ws.id, "idle"));
}

export const wsRoutes = new Elysia({ prefix: "/ws" }).ws("/stream", {
  open(ws) {
    void buildTelemetryMessage().then((msg) => ws.send(msg));

    const interval = setInterval(() => {
      void buildTelemetryMessage().then((msg) => {
        try {
          ws.send(msg);
        } catch {
          clearInterval(interval);
          intervals.delete(ws.id);
        }
      });
    }, config.wsHeartbeatMs);

    intervals.set(ws.id, interval);
  },
  message(ws, raw) {
    const msg = raw as WsClientMessage;
    if (msg.type === "pong") {
      return;
    }
    if (msg.type === "agent-chat") {
      void handleAgentChat(ws, msg.payload.message);
    }
  },
  close(ws) {
    removeSession(ws.id);
    const interval = intervals.get(ws.id);
    if (interval) {
      clearInterval(interval);
      intervals.delete(ws.id);
    }
  },
});
