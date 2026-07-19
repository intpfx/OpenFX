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
  let draining = false;
  const queue: Array<{
    pairing: RestoredPairing;
    event: NodeControlEvent;
    resolve: () => void;
  }> = [];

  const drain = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        const pending = queue.shift();
        if (!pending) continue;
        try {
          await client.events({
            serverUrl: pending.pairing.preferences.serverUrl,
            nodeId: pending.pairing.preferences.nodeId,
            nodeSecret: pending.pairing.nodeSecret,
            events: [pending.event],
          });
          lastError = null;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        } finally {
          pending.resolve();
        }
      }
    } finally {
      draining = false;
    }
  };

  return {
    setPairing(next) {
      pairing = next;
      lastError = null;
    },
    emit(event) {
      const current = pairing;
      if (!current) return Promise.resolve();
      const { promise, resolve } = Promise.withResolvers<void>();
      queue.push({ pairing: current, event, resolve });
      void drain();
      return promise;
    },
    errorMessage: () => lastError,
  };
};
