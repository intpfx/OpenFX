import { LIBRARY_APPS } from "../../library-app-catalog.ts";
import type { LibraryItem } from "./model.ts";

const DEFAULT_APP_TIMESTAMP = "2000-01-01T00:00:00.000Z";
const DEFAULT_APP_ID_PREFIX = "openfx-app:";

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
      description: app.coverDescription ?? app.description,
      preview: app.preview,
      tech: app.tech,
      sourcePath: app.sourcePath,
    },
  };
});

export function isDefaultLibraryApp(item: LibraryItem): boolean {
  return item.kind === "app" && item.id.startsWith(DEFAULT_APP_ID_PREFIX);
}

export function withDefaultLibraryApps(
  storedItems: readonly LibraryItem[],
): LibraryItem[] {
  return [
    ...storedItems.filter((item) => !isDefaultLibraryApp(item)),
    ...DEFAULT_LIBRARY_APPS,
  ];
}
