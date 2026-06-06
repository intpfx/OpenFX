import { useState } from "react";
import { HolographicCoreScene } from "../components/hologram/HolographicCoreScene";
import type { CoreLayerId } from "../components/hologram/HolographicCoreScene";
import { AgentConsole } from "../components/agent/AgentConsole";
import { useFreemacState } from "../hooks/useFreemacState";

export function Dashboard() {
  const state = useFreemacState();
  const [hoveredLayerId, setHoveredLayerId] = useState<CoreLayerId | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<CoreLayerId>("core-pulse");

  return (
    <main className="core-shell">
      <div
        className={
          state.locked ? "core-shell__scene core-shell__scene--locked" : "core-shell__scene"
        }
      >
        <HolographicCoreScene
          profile={state.visualProfile}
          hoveredLayerId={hoveredLayerId}
          selectedLayerId={selectedLayerId}
          onHoverChange={setHoveredLayerId}
          onRendererInfoChange={() => undefined}
          onRuntimeError={() => undefined}
          onSelectionChange={setSelectedLayerId}
        />
      </div>
      <AgentConsole
        agentState={state.agentState}
        agentResponse={state.agentResponse}
        agentThinking={state.agentThinking}
        sendAgentChat={state.sendAgentChat}
      />
    </main>
  );
}
