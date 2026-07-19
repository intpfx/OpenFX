import type { DesktopPreferences } from "../core/types.ts";
import type {
  ControlPlaneClient,
  PairNodeInput,
  PairNodeResult,
} from "./control-plane-client.ts";
import type { NodeKeychain } from "./keychain.ts";

export interface DesktopPreferenceStore {
  current(): DesktopPreferences;
  update(patch: Partial<DesktopPreferences>): DesktopPreferences;
}

export interface PairingServiceDependencies {
  client: Pick<ControlPlaneClient, "pair">;
  preferences: DesktopPreferenceStore;
  keychain: NodeKeychain;
  now?: () => number;
}

export interface RestoredPairing {
  preferences: DesktopPreferences;
  nodeSecret: string;
}

export interface PairingService {
  pair(input: PairNodeInput): Promise<RestoredPairing>;
  restore(): Promise<RestoredPairing | null>;
}

export interface PairingStateSinks {
  setPreferences(preferences: DesktopPreferences): void;
  setRelayPairing(pairing: RestoredPairing | null): void;
  setEventPairing(pairing: RestoredPairing | null): void;
}

export const synchronizePairingState = (
  preferences: DesktopPreferenceStore,
  candidate: RestoredPairing | null,
  sinks: PairingStateSinks,
): RestoredPairing | null => {
  const current = preferences.current();
  const pairing = candidate && candidate.preferences.nodeId === current.nodeId
    ? { preferences: current, nodeSecret: candidate.nodeSecret }
    : null;
  sinks.setPreferences(current);
  sinks.setRelayPairing(pairing);
  sinks.setEventPairing(pairing);
  return pairing;
};

export const createPairingService = (
  dependencies: PairingServiceDependencies,
): PairingService => ({
  async pair(input) {
    const result: PairNodeResult = await dependencies.client.pair(input);
    await dependencies.keychain.write(result.node.id, result.nodeSecret);
    try {
      const preferences = dependencies.preferences.update({
        serverUrl: input.serverUrl,
        nodeId: result.node.id,
        nodeName: result.node.name || input.name,
        pairedAt: (dependencies.now ?? Date.now)(),
      });
      return { preferences, nodeSecret: result.nodeSecret };
    } catch (error) {
      try {
        await dependencies.keychain.remove(result.node.id);
      } catch {
        // Preserve the preference commit error; it is the actionable cause.
      }
      throw error;
    }
  },
  async restore() {
    const requested = dependencies.preferences.current();
    if (!requested.nodeId) return null;
    const nodeSecret = await dependencies.keychain.read(requested.nodeId);
    const current = dependencies.preferences.current();
    if (!nodeSecret || current.nodeId !== requested.nodeId) return null;
    return { preferences: current, nodeSecret };
  },
});
