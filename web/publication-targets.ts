export type WebPublicationPreparation = "hlc-display" | "media-player";

export type WebPublicationTarget = Readonly<{
  id: string;
  directory: URL;
  maxAge: number;
  baseURL?: `/${string}`;
  proxyPath?: `/${string}`;
  fallthrough?: boolean;
  preparation?: WebPublicationPreparation;
  serverAsset?: Readonly<{
    baseName: string;
    pattern: string;
  }>;
}>;

const MONTH_SECONDS = 60 * 60 * 24 * 30;

export const WEB_PUBLICATION_TARGETS = Object.freeze(
  [
    {
      id: "client",
      directory: new URL("./.client-dist", import.meta.url),
      maxAge: MONTH_SECONDS,
    },
    {
      id: "how-much",
      directory: new URL("../domains/how-much/public", import.meta.url),
      maxAge: 0,
      proxyPath: "/how-much",
    },
    {
      id: "wanone",
      directory: new URL("../domains/wanone/public", import.meta.url),
      maxAge: MONTH_SECONDS,
      proxyPath: "/wanone",
    },
    {
      id: "gasmap",
      directory: new URL("../domains/gasmap/public", import.meta.url),
      maxAge: MONTH_SECONDS,
      proxyPath: "/gasmap",
    },
    {
      id: "finlyzer",
      directory: new URL("../domains/finlyzer/public", import.meta.url),
      maxAge: MONTH_SECONDS,
      proxyPath: "/finlyzer",
    },
    {
      id: "hlc",
      directory: new URL("./.hlc-public", import.meta.url),
      baseURL: "/hlc",
      maxAge: MONTH_SECONDS,
      proxyPath: "/hlc",
      preparation: "hlc-display",
    },
    {
      id: "costing-assistant",
      directory: new URL("../domains/costing-assistant/public", import.meta.url),
      maxAge: MONTH_SECONDS,
      proxyPath: "/costing-assistant",
    },
    {
      id: "bewlyscript",
      directory: new URL("../domains/BewlyScript/public", import.meta.url),
      maxAge: 0,
      proxyPath: "/bewlyscript",
    },
    {
      id: "openink",
      directory: new URL("../domains/openink/public", import.meta.url),
      maxAge: MONTH_SECONDS,
      proxyPath: "/openink",
    },
    {
      id: "media-player",
      directory: new URL("../domains/media-player/.openfx-public", import.meta.url),
      baseURL: "/media-player",
      fallthrough: true,
      maxAge: 0,
      proxyPath: "/media-player",
      preparation: "media-player",
      serverAsset: {
        baseName: "media-player",
        pattern: "**/*.html",
      },
    },
  ] satisfies readonly WebPublicationTarget[],
);

export const WEB_DEV_PROXY_PATHS = Object.freeze([
  "/api",
  ...WEB_PUBLICATION_TARGETS.flatMap((target) =>
    target.proxyPath ? [target.proxyPath] : []
  ),
]);

export const PREPARED_WEB_PUBLICATION_TARGETS = Object.freeze(
  WEB_PUBLICATION_TARGETS.filter((target) => target.preparation),
);

export function getWebPublicationTarget(id: string): WebPublicationTarget {
  const target = WEB_PUBLICATION_TARGETS.find((candidate) => candidate.id === id);
  if (!target) throw new Error(`未知 Web 发布目标：${id}`);
  return target;
}

export function createNitroPublicAssets(
  resolveDirectory: (directory: URL) => string,
) {
  return WEB_PUBLICATION_TARGETS.map((target) => ({
    dir: resolveDirectory(target.directory),
    ...(target.baseURL ? { baseURL: target.baseURL } : {}),
    ...(target.fallthrough ? { fallthrough: true } : {}),
    maxAge: target.maxAge,
  }));
}

export function createNitroServerAssets(
  resolveDirectory: (directory: URL) => string,
) {
  return WEB_PUBLICATION_TARGETS.flatMap((target) =>
    target.serverAsset
      ? [{
        ...target.serverAsset,
        dir: resolveDirectory(target.directory),
      }]
      : []
  );
}
