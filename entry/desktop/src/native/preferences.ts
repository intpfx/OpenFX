import { preferencesGet, preferencesSet } from "perry/system";

import {
  DEFAULT_DESKTOP_PREFERENCES,
  sanitizeDesktopPreferences,
} from "../core/desktop-state.ts";
import type { DesktopPreferenceStore } from "./pairing-service.ts";

export const DESKTOP_PREFERENCES_KEY = "openfx.node.preferences.v1";

export const readDesktopPreferencesSync = () => {
  const raw = preferencesGet(DESKTOP_PREFERENCES_KEY);
  if (!raw) return DEFAULT_DESKTOP_PREFERENCES;
  try {
    return sanitizeDesktopPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_DESKTOP_PREFERENCES;
  }
};

export const createDesktopPreferenceStore = (): DesktopPreferenceStore => ({
  load() {
    return Promise.resolve(readDesktopPreferencesSync());
  },
  save(preferences) {
    preferencesSet(
      DESKTOP_PREFERENCES_KEY,
      JSON.stringify(
        sanitizeDesktopPreferences(
          preferences as unknown as Record<string, unknown>,
        ),
      ),
    );
    return Promise.resolve();
  },
});
