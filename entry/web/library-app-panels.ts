export const LIBRARY_APP_PANEL_IDS = [
  "e-agent-framework",
  "how-much-this",
  "hlc",
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

export type LibraryAppPanelId = typeof LIBRARY_APP_PANEL_IDS[number];

export function isLibraryAppPanelId(
  appId: string,
): appId is LibraryAppPanelId {
  return LIBRARY_APP_PANEL_IDS.includes(appId as LibraryAppPanelId);
}
