import { LIBRARY_APPS } from "../../library-app-catalog.ts";
import type { LibraryItem } from "./model.ts";

const DEFAULT_APP_TIMESTAMP = "2000-01-01T00:00:00.000Z";
const DEFAULT_APP_ID_PREFIX = "openfx-app:";
const DEFAULT_APP_FAVORITES_KEY = "openfx-library-app-favorites";

export const DEFAULT_LIBRARY_APPS: LibraryItem[] = LIBRARY_APPS.map((app) => {
  return {
    id: `${DEFAULT_APP_ID_PREFIX}${app.id}`,
    kind: "app",
    name: app.name,
    createdAt: DEFAULT_APP_TIMESTAMP,
    updatedAt: DEFAULT_APP_TIMESTAMP,
    size: 0,
    source: {
      path: `/openfx-library-apps/${app.id}`,
      name: `${app.id}.app`,
      type: "application/x-openfx-app",
      size: 0,
      lastModified: 0,
    },
    app: {
      id: app.id,
      description: app.description,
      preview: app.preview,
      tech: app.tech,
      sourcePath: app.sourcePath,
    },
  };
});

export function isDefaultLibraryApp(item: LibraryItem): boolean {
  return item.kind === "app" && item.id.startsWith(DEFAULT_APP_ID_PREFIX);
}

function readDefaultAppFavorites(): Set<string> {
  try {
    const stored = globalThis.localStorage?.getItem(DEFAULT_APP_FAVORITES_KEY);
    const values = stored ? JSON.parse(stored) : [];
    return new Set(
      Array.isArray(values) ? values.filter((id) => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

export function setDefaultLibraryAppFavorite(id: string, favorite: boolean): void {
  const favorites = readDefaultAppFavorites();
  favorite ? favorites.add(id) : favorites.delete(id);
  try {
    globalThis.localStorage?.setItem(
      DEFAULT_APP_FAVORITES_KEY,
      JSON.stringify([...favorites]),
    );
  } catch {
    // Virtual App favorites remain usable for the current snapshot if storage is blocked.
  }
}

export function withDefaultLibraryApps(
  storedItems: readonly LibraryItem[],
): LibraryItem[] {
  const favorites = readDefaultAppFavorites();
  return [
    ...storedItems.filter((item) => !isDefaultLibraryApp(item)),
    ...DEFAULT_LIBRARY_APPS.map((item) => ({
      ...item,
      ...(favorites.has(item.id) ? { favorite: true } : {}),
    })),
  ];
}
