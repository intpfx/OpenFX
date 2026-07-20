export const PROJECT_DETAIL_PANEL_IDS = [
  "ipv6-sync-suite",
  "how-much-this",
  "relay-proxy-gateway",
  "openfx-data",
  "wanone-memorial",
  "chinagas-wms-qrcode",
  "bewlyscript",
  "gasmap",
  "finlyzer",
  "costing-assistant",
  "map-poster",
  "smartisax",
  "live-system",
  "wandering-plan",
] as const;

export type ProjectDetailPanelId = typeof PROJECT_DETAIL_PANEL_IDS[number];

export type ActiveDomainPanel = ProjectDetailPanelId;

export interface HomepageRoute {
  canonicalPath: string;
  initialPanel?: ActiveDomainPanel;
}

export function resolveHomepageRoute(pathname: string): HomepageRoute {
  return pathname === "/admin"
    ? { canonicalPath: "/", initialPanel: "openfx-data" }
    : { canonicalPath: pathname };
}

export function isProjectDetailPanelId(
  projectId: string,
): projectId is ProjectDetailPanelId {
  return PROJECT_DETAIL_PANEL_IDS.includes(projectId as ProjectDetailPanelId);
}
