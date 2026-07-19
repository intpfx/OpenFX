import { preferencesGet, preferencesSet } from "perry/system";

import {
  DEFAULT_DESKTOP_PREFERENCES,
  sanitizeDesktopPreferences,
} from "../core/desktop-state.ts";
import type { DesktopPreferences } from "../core/types.ts";
import type { DesktopPreferenceStore } from "./pairing-service.ts";

export const DESKTOP_PREFERENCES_KEY = "openfx.node.preferences.v1";

export interface DesktopPreferencePersistence {
  get(): string | null;
  set(value: string): void;
}

const systemPreferencePersistence: DesktopPreferencePersistence = {
  get: () => preferencesGet(DESKTOP_PREFERENCES_KEY),
  set: (value) => preferencesSet(DESKTOP_PREFERENCES_KEY, value),
};

const decodeDesktopPreferences = (raw: string | null): DesktopPreferences => {
  if (!raw) return DEFAULT_DESKTOP_PREFERENCES;
  try {
    return sanitizeDesktopPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_DESKTOP_PREFERENCES;
  }
};

export const readDesktopPreferencesSync = (
  persistence: DesktopPreferencePersistence = systemPreferencePersistence,
) => decodeDesktopPreferences(persistence.get());

export const createDesktopPreferenceStore = (
  persistence: DesktopPreferencePersistence = systemPreferencePersistence,
): DesktopPreferenceStore => ({
  current() {
    return readDesktopPreferencesSync(persistence);
  },
  update(patch) {
    const previousRaw = persistence.get();
    const preferences = sanitizeDesktopPreferences({
      ...decodeDesktopPreferences(previousRaw),
      ...patch,
    });
    const serialized = JSON.stringify(
      sanitizeDesktopPreferences(
        preferences as unknown as Record<string, unknown>,
      ),
    );
    try {
      persistence.set(serialized);
    } catch (error) {
      try {
        persistence.set(previousRaw ?? "");
      } catch {
        throw new Error("preferences_rollback_failed");
      }
      throw error;
    }
    return preferences;
  },
});
