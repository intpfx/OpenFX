import { preferencesGet, preferencesSet } from "perry/system";

import {
  DEFAULT_DESKTOP_PREFERENCES,
  sanitizeDesktopPreferences,
} from "../core/desktop-state.ts";
import type { ApprovalPersistence } from "../core/persistent-approval-store.ts";
import type { JsonStringPersistence } from "../core/persistent-approval-requests.ts";
import type { DesktopPreferenceStore } from "./pairing-service.ts";

export const DESKTOP_PREFERENCES_KEY = "openfx.node.preferences.v1";
export const APPROVAL_AUTHORITY_KEY = "openfx.node.approval-authority.v1";
export const APPROVAL_REQUESTS_KEY = "openfx.node.approval-requests.v1";

export const createDesktopPreferenceStore = (): DesktopPreferenceStore => ({
  load() {
    const raw = preferencesGet(DESKTOP_PREFERENCES_KEY);
    if (!raw) return Promise.resolve(DEFAULT_DESKTOP_PREFERENCES);
    try {
      return Promise.resolve(sanitizeDesktopPreferences(JSON.parse(raw)));
    } catch {
      return Promise.resolve(DEFAULT_DESKTOP_PREFERENCES);
    }
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

export const createPreferenceStringPersistence = (
  key: string,
): ApprovalPersistence & JsonStringPersistence => ({
  read() {
    return Promise.resolve(preferencesGet(key));
  },
  compareAndSet(expected, next) {
    const current = preferencesGet(key);
    if (current !== expected) return Promise.resolve(false);
    preferencesSet(key, next);
    return Promise.resolve(true);
  },
});
