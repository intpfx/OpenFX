import type { ControlPlaneClient } from "./control-plane-client.ts";
import type { RestoredPairing } from "./pairing-service.ts";

export type NodeControlEvent =
  | {
    type: "agent.delta";
    data: { messageId: string; delta: string; sequence: number };
  }
  | {
    type: "approval.requested";
    data: { id: string; summary: string };
  }
  | {
    type: "approval.resolved";
    data: { id: string; decision: "approved" | "rejected" };
  };

export interface NodeEventReporter {
  setPairing(pairing: RestoredPairing | null): void;
  emit(event: NodeControlEvent): Promise<void>;
  errorMessage(): string | null;
}

export const createNodeEventReporter = (
  client: Pick<ControlPlaneClient, "events">,
): NodeEventReporter => {
  let pairing: RestoredPairing | null = null;
  let lastError: string | null = null;
  let queue = Promise.resolve();
  return {
    setPairing(next) {
      pairing = next;
      lastError = null;
    },
    emit(event) {
      const current = pairing;
      if (!current) return Promise.resolve();
      queue = queue.then(async () => {
        try {
          await client.events({
            serverUrl: current.preferences.serverUrl,
            nodeId: current.preferences.nodeId,
            nodeSecret: current.nodeSecret,
            events: [event],
          });
          lastError = null;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      });
      return queue;
    },
    errorMessage: () => lastError,
  };
};
