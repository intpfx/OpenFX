import type { DesktopPreferences } from "../core/types.ts";
import type {
  ControlPlaneClient,
  PairNodeInput,
  PairNodeResult,
} from "./control-plane-client.ts";
import type { NodeKeychain } from "./keychain.ts";

export interface DesktopPreferenceStore {
  load(): Promise<DesktopPreferences | null>;
  update(
    patch: Partial<DesktopPreferences>,
  ): Promise<DesktopPreferences>;
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

export const createPairingService = (
  dependencies: PairingServiceDependencies,
): PairingService => ({
  async pair(input) {
    const result: PairNodeResult = await dependencies.client.pair(input);
    await dependencies.keychain.write(result.node.id, result.nodeSecret);
    try {
      const preferences = await dependencies.preferences.update({
        serverUrl: input.serverUrl,
        nodeId: result.node.id,
        nodeName: result.node.name || input.name,
        relayEnabled: true,
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
    const preferences = await dependencies.preferences.load();
    if (!preferences?.nodeId) return null;
    const nodeSecret = await dependencies.keychain.read(preferences.nodeId);
    return nodeSecret ? { preferences, nodeSecret } : null;
  },
});
