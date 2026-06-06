import { useRef, useState, type KeyboardEvent } from "react";
import type { AgentState } from "@freemac/shared";

interface Props {
  agentState: AgentState;
  agentResponse: string;
  agentThinking: boolean;
  sendAgentChat: (message: string) => void;
}

export function AgentConsole({ agentState, agentResponse, agentThinking, sendAgentChat }: Props) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && input.trim() && !agentThinking) {
      sendAgentChat(input.trim());
      setInput("");
    }
  }

  const stateLabel =
    agentState === "thinking"
      ? "思考中…"
      : agentState === "responding"
        ? "回复中…"
        : agentState === "listening"
          ? "聆听中…"
          : "";

  return (
    <div className="whisper-bar">
      {agentResponse && (
        <div className="whisper-bar__response">
          <p className="whisper-bar__text">{agentResponse}</p>
        </div>
      )}
      <div className="whisper-bar__input-row">
        {stateLabel && <span className="whisper-bar__state">{stateLabel}</span>}
        <input
          ref={inputRef}
          className="whisper-bar__input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="与 freemac 对话…"
          disabled={agentThinking}
        />
      </div>
    </div>
  );
}
