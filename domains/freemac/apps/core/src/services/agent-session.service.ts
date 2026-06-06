import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentState } from "@freemac/shared";
import type { WsAgentStateMessage } from "@freemac/shared";

export interface AgentSession {
  messages: ChatCompletionMessageParam[];
  state: AgentState;
  conversationDepth: number;
}

const sessions = new Map<string, AgentSession>();
let activeAgentCount = 0;

export function getOrCreateSession(wsId: string): AgentSession {
  let session = sessions.get(wsId);
  if (!session) {
    session = { messages: [], state: "idle", conversationDepth: 0 };
    sessions.set(wsId, session);
  }
  return session;
}

export function removeSession(wsId: string): void {
  const session = sessions.get(wsId);
  if (session && session.state !== "idle") {
    activeAgentCount = Math.max(0, activeAgentCount - 1);
  }
  sessions.delete(wsId);
}

export function setSessionState(wsId: string, state: AgentState): WsAgentStateMessage {
  const session = getOrCreateSession(wsId);
  const wasActive = session.state !== "idle";
  const isActive = state !== "idle";

  session.state = state;

  if (!wasActive && isActive) {
    activeAgentCount++;
  } else if (wasActive && !isActive) {
    activeAgentCount = Math.max(0, activeAgentCount - 1);
  }

  return {
    type: "agent-state",
    payload: {
      state,
      conversationDepth: session.conversationDepth,
      activeAgentCount,
    },
  };
}

export function addUserMessage(wsId: string, content: string): void {
  const session = getOrCreateSession(wsId);
  session.messages.push({ role: "user", content });
  session.conversationDepth++;
}

export function addAssistantMessage(wsId: string, content: string): void {
  const session = getOrCreateSession(wsId);
  session.messages.push({ role: "assistant", content });
}

export function getActiveAgentCount(): number {
  return activeAgentCount;
}
