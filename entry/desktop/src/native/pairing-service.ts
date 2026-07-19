import { sanitizeDesktopPreferences } from "../core/desktop-state.ts";
import type { DesktopPreferences } from "../core/types.ts";
import type {
  ControlPlaneClient,
  PairNodeInput,
  PairNodeResult,
} from "./control-plane-client.ts";
import type { NodeKeychain } from "./keychain.ts";

export interface DesktopPreferenceStore {
  load(): Promise<DesktopPreferences | null>;
  save(preferences: DesktopPreferences): Promise<void>;
}

export interface PairingServiceDependencies {
  client: Pick<ControlPlaneClient, "pair">;
  preferences: DesktopPreferenceStore;
  currentPreferences(): DesktopPreferences | null;
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
    const existingPreferences = dependencies.currentPreferences();
    const result: PairNodeResult = await dependencies.client.pair(input);
    const preferences = sanitizeDesktopPreferences({
      serverUrl: input.serverUrl,
      nodeId: result.node.id,
      nodeName: result.node.name || input.name,
      relayEnabled: true,
      pairedAt: (dependencies.now ?? Date.now)(),
      launchMode: existingPreferences?.launchMode,
      reduceMotion: existingPreferences?.reduceMotion,
    });
    await dependencies.keychain.write(result.node.id, result.nodeSecret);
    try {
      await dependencies.preferences.save(preferences);
    } catch (error) {
      await dependencies.keychain.remove(result.node.id);
      throw error;
    }
    return { preferences, nodeSecret: result.nodeSecret };
  },
  async restore() {
    const preferences = await dependencies.preferences.load();
    if (!preferences?.nodeId) return null;
    const nodeSecret = await dependencies.keychain.read(preferences.nodeId);
    return nodeSecret ? { preferences, nodeSecret } : null;
  },
});
