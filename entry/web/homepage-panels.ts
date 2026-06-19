export const PROJECT_DETAIL_PANEL_IDS = [
  "ipv6-sync-suite",
  "how-much-this",
  "relay-proxy-gateway",
  "wanone-memorial",
  "chinagas-wms-qrcode",
  "bewlyscript",
  "gasmap",
  "finlyzer",
  "costing-assistant",
] as const;

export type ProjectDetailPanelId = typeof PROJECT_DETAIL_PANEL_IDS[number];

export type ActiveDomainPanel = "admin-console" | ProjectDetailPanelId;

export function isProjectDetailPanelId(
  projectId: string,
): projectId is ProjectDetailPanelId {
  return PROJECT_DETAIL_PANEL_IDS.includes(projectId as ProjectDetailPanelId);
}
