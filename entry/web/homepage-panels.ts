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

export type StandalonePage = "downip";

export function resolveStandalonePage(pathname: string): StandalonePage | null {
  return pathname === "/downip" ? "downip" : null;
}

export function isProjectDetailPanelId(
  projectId: string,
): projectId is ProjectDetailPanelId {
  return PROJECT_DETAIL_PANEL_IDS.includes(projectId as ProjectDetailPanelId);
}
