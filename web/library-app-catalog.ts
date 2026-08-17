import rawConfig from "./content/library-apps.json" with { type: "json" };

export type LibraryAppLivePreview = {
  src: string;
  title: string;
  sandbox?: string;
};

export type LibraryAppProvenance = {
  origin: { label: string; href: string };
  changes: string;
  differences: string;
};

export type LibraryAppLink = {
  label: string;
  href: string;
  download?: string;
};

const LIBRARY_APP_RENDERERS = {
  "e-agent-framework": { kind: "summary" },
  "how-much-this": { kind: "component", component: "how-much" },
  hlc: { kind: "embedded", layout: "fill", sandbox: "preview" },
  "wanone-memorial": { kind: "embedded" },
  "chinagas-wms-qrcode": { kind: "summary" },
  "dsh-openfx-web": { kind: "summary" },
  "dsh-usage-balance": { kind: "summary" },
  "dsh-ambient-theme": { kind: "summary" },
  "dsh-workspace-shell": { kind: "summary" },
  "dsh-design-annotations": { kind: "summary" },
  "dsh-conversation-browser": { kind: "summary" },
  bewlyscript: { kind: "summary" },
  gasmap: { kind: "embedded" },
  finlyzer: { kind: "embedded" },
  "costing-assistant": { kind: "embedded" },
  "map-poster": { kind: "component", component: "map-poster" },
  smartisax: { kind: "summary" },
  "live-system": { kind: "summary" },
  "wandering-plan": { kind: "summary" },
} as const;

export type LibraryAppId = keyof typeof LIBRARY_APP_RENDERERS;
export type LibraryAppRenderer = typeof LIBRARY_APP_RENDERERS[LibraryAppId];

export type LibraryAppDefinition = {
  id: LibraryAppId;
  hidden?: boolean;
  name: string;
  description: string;
  coverDescription?: string;
  highlights?: string[];
  tech: string[];
  sourcePath: string;
  preview?: LibraryAppLivePreview;
  provenance?: LibraryAppProvenance;
  links?: LibraryAppLink[];
};

export const LIBRARY_APP_IDS = Object.freeze(
  Object.keys(LIBRARY_APP_RENDERERS) as LibraryAppId[],
);
export const LIBRARY_APP_COUNT = LIBRARY_APP_IDS.length;

export function isLibraryAppId(appId: string): appId is LibraryAppId {
  return Object.hasOwn(LIBRARY_APP_RENDERERS, appId);
}

function createCatalog(): LibraryAppDefinition[] {
  const apps = rawConfig.apps as unknown as Array<
    Omit<LibraryAppDefinition, "id"> & { id: string }
  >;
  const configuredIds = apps.map((app) => app.id);
  const duplicates = configuredIds.filter((id, index) =>
    configuredIds.indexOf(id) !== index
  );
  const unknown = configuredIds.filter((id) => !isLibraryAppId(id));
  const missing = LIBRARY_APP_IDS.filter((id) => !configuredIds.includes(id));
  if (duplicates.length || unknown.length || missing.length) {
    throw new Error(
      `OpenFX App catalog 不一致：重复=${duplicates.join(",") || "无"}，` +
        `未知=${unknown.join(",") || "无"}，缺失=${missing.join(",") || "无"}`,
    );
  }
  for (const app of apps) {
    if (!isLibraryAppId(app.id)) continue;
    const renderer = LIBRARY_APP_RENDERERS[app.id];
    if (renderer.kind === "embedded" && !app.preview) {
      throw new Error(`嵌入式 OpenFX App 缺少同源 preview：${app.id}`);
    }
    if (renderer.kind === "summary" && !app.highlights?.length) {
      throw new Error(`摘要型 OpenFX App 缺少 highlights：${app.id}`);
    }
  }
  return apps as LibraryAppDefinition[];
}

export const LIBRARY_APPS = Object.freeze(createCatalog());

export function getLibraryApp(appId: LibraryAppId): LibraryAppDefinition {
  const app = LIBRARY_APPS.find((candidate) => candidate.id === appId);
  if (!app) throw new Error(`OpenFX App catalog 缺少条目：${appId}`);
  return app;
}

export function getLibraryAppRenderer(appId: LibraryAppId): LibraryAppRenderer {
  return LIBRARY_APP_RENDERERS[appId];
}

export function isLibraryAppOpenable(appId: LibraryAppId): boolean {
  return LIBRARY_APP_RENDERERS[appId].kind !== "summary";
}

export function listHiddenLibraryApps(): LibraryAppDefinition[] {
  return LIBRARY_APPS.filter((app) => app.hidden);
}
