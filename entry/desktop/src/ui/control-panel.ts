import {
  Button,
  buttonSetTitle,
  Divider,
  HStack,
  Spacer,
  stackSetAlignment,
  stackSetDetachesHidden,
  Text,
  TextField,
  textfieldSetString,
  textSetColor,
  textSetFontSize,
  textSetFontWeight,
  textSetString,
  textSetWraps,
  Toggle,
  toggleSetState,
  VStack,
  type Widget,
  widgetSetBackgroundColor,
  widgetSetEdgeInsets,
  widgetSetHidden,
  widgetSetWidth,
} from "perry/ui";

import type {
  DesktopLaunchMode,
  DesktopPreferences,
  RelayStatus,
  SystemOverview,
} from "../core/types.ts";

export interface PairingFormInput {
  serverUrl: string;
  pairingCode: string;
  nodeName: string;
}

export interface ControlPanelPresentation {
  paired: boolean;
  nodeName: string;
  nodeId: string;
  connectionStatus: string;
  protocolStatus: string;
  serviceStatus: string;
  pairingStatus: string;
  networkStatus: string;
  cpuStatus: string;
  memoryStatus: string;
  processStatus: string;
  relayStatus: string;
  agentStatus: string;
  lastReportStatus: string;
  serverUrl: string;
  launchMode: DesktopLaunchMode;
  reduceMotion: boolean;
}

export interface ControlPanelPresentationInput {
  preferences: DesktopPreferences;
  paired: boolean;
  serviceStatus: string;
  pairingStatus: string;
  overview: SystemOverview | null;
  publicIpv6: string | null;
  relay: RelayStatus;
  now: number;
}

export const createControlPanelPresentation = (
  input: ControlPanelPresentationInput,
): ControlPanelPresentation => {
  const { overview, preferences, relay } = input;
  const memoryRatio = overview && overview.memoryTotalBytes > 0
    ? overview.memoryUsedBytes / overview.memoryTotalBytes
    : null;
  const reportAgeSeconds = relay.lastReportedAt === null
    ? null
    : Math.max(0, Math.floor((input.now - relay.lastReportedAt) / 1_000));

  return {
    paired: input.paired,
    nodeName: preferences.nodeName.trim() || "OpenFX Mac",
    nodeId: preferences.nodeId.trim() || "未分配",
    connectionStatus: !input.paired
      ? "等待配对"
      : relay.errorMessage
      ? "连接降级"
      : "节点在线",
    protocolStatus: "协议 v1 · [::]:24531",
    serviceStatus: input.serviceStatus.trim() || "节点服务准备中",
    pairingStatus: input.pairingStatus.trim() ||
      (input.paired ? "已安全配对。" : "等待输入配对信息。"),
    networkStatus: input.publicIpv6 || "未检测到公网 IPv6",
    cpuStatus: overview ? `${formatPercent(overview.cpuUsagePercent)}%` : "等待采样",
    memoryStatus: overview && memoryRatio !== null
      ? `${formatBytes(overview.memoryUsedBytes)} / ${
        formatBytes(overview.memoryTotalBytes)
      } · ${formatPercent(memoryRatio * 100)}%`
      : "等待采样",
    processStatus: overview ? `${overview.processCount} 个` : "等待采样",
    relayStatus: !input.paired
      ? "等待配对"
      : !relay.enabled
      ? "已停用"
      : relay.errorMessage
      ? "上报异常"
      : "已启用",
    agentStatus: input.paired ? "按需连接" : "等待配对",
    lastReportStatus: reportAgeSeconds === null
      ? "尚未上报"
      : `${reportAgeSeconds} 秒前`,
    serverUrl: preferences.serverUrl,
    launchMode: preferences.launchMode,
    reduceMotion: preferences.reduceMotion,
  };
};

export interface ControlPanelActions {
  pair(input: PairingFormInput): void;
  sample(): void;
  openConsole(): void;
  setLaunchMode(mode: DesktopLaunchMode): void;
  setReduceMotion(reduceMotion: boolean): void;
}

export interface ControlPanelController {
  body: Widget;
  update(presentation: ControlPanelPresentation): void;
  showPairingGuide(): void;
  showDashboard(): void;
  setPairingDefaults(serverUrl: string, nodeName: string): void;
  clearPairingCode(): void;
}

export const createControlPanel = (
  initial: ControlPanelPresentation,
  actions: ControlPanelActions,
): ControlPanelController => {
  let serverUrl = initial.serverUrl;
  let pairingCode = "";
  let nodeName = initial.nodeName;
  let pairingGuideVisible = !initial.paired;

  const nodeLabel = label(initial.nodeName, 22, true);
  const connectionLabel = label(initial.connectionStatus, 12, false);
  const protocolLabel = label(initial.protocolStatus, 12, false);
  const serviceLabel = label(initial.serviceStatus, 12, false);
  textSetWraps(serviceLabel, 344);

  const serverField = TextField("HTTPS 控制台地址", (value: string) => {
    serverUrl = value;
  });
  textfieldSetString(serverField, serverUrl);
  const codeField = TextField("8 位配对码", (value: string) => {
    pairingCode = value.toUpperCase();
  });
  const nameField = TextField("节点名称", (value: string) => {
    nodeName = value;
  });
  textfieldSetString(nameField, nodeName);

  const networkLabel = label(initial.networkStatus, 12, false);
  const pairingLabel = label(initial.pairingStatus, 12, false);
  textSetWraps(pairingLabel, 344);
  const pairButton = Button("配对", () => {
    actions.pair({
      serverUrl: serverUrl.trim(),
      pairingCode: pairingCode.trim().toUpperCase(),
      nodeName: nodeName.trim(),
    });
  });

  const guide = VStack(10, [
    sectionTitle("1 · 环境检查"),
    networkLabel,
    sectionTitle("2 · HTTPS 与配对码"),
    serverField,
    codeField,
    nameField,
    sectionTitle("3 · 钥匙串确认"),
    caption("确认后，节点凭据仅保存到 macOS 钥匙串。"),
    pairingLabel,
    pairButton,
  ]);
  stackSetAlignment(guide, 7);

  const cpuLabel = metric("CPU", initial.cpuStatus);
  const memoryLabel = metric("内存", initial.memoryStatus);
  const processLabel = metric("进程", initial.processStatus);
  const publicIpv6Label = metric("公网 IPv6", initial.networkStatus);
  const relayLabel = metric("Relay", initial.relayStatus);
  const agentLabel = metric("Agent", initial.agentStatus);
  const lastReportLabel = metric("上次上报", initial.lastReportStatus);
  const dashboard = VStack(10, [
    cpuLabel,
    memoryLabel,
    processLabel,
    publicIpv6Label,
    relayLabel,
    agentLabel,
    lastReportLabel,
    HStack(8, [
      Button("立即采样", actions.sample),
      Button("重新配对", () => {
        pairingGuideVisible = true;
        updateVisibility(guide, dashboard, pairingGuideVisible);
      }),
    ]),
    Button("打开 OpenFX 控制台", actions.openConsole),
  ]);
  stackSetAlignment(dashboard, 7);

  const reduceMotionToggle = Toggle("减少动态效果", (enabled: boolean) => {
    actions.setReduceMotion(enabled);
  });
  const menuBarToggle = Toggle("下次启动仅菜单栏", (enabled: boolean) => {
    actions.setLaunchMode(enabled ? "menuBarOnly" : "regular");
  });
  toggleSetState(reduceMotionToggle, initial.reduceMotion ? 1 : 0);
  toggleSetState(menuBarToggle, initial.launchMode === "menuBarOnly" ? 1 : 0);

  const body = VStack(12, [
    HStack(8, [nodeLabel, Spacer(), connectionLabel]),
    protocolLabel,
    serviceLabel,
    Divider(),
    guide,
    dashboard,
    Spacer(),
    Divider(),
    reduceMotionToggle,
    menuBarToggle,
  ]);
  widgetSetWidth(body, 400);
  widgetSetEdgeInsets(body, 20, 20, 16, 20);
  widgetSetBackgroundColor(body, 0.025, 0.045, 0.075, 0.86);
  stackSetAlignment(body, 7);
  stackSetDetachesHidden(body, 1);
  updateVisibility(guide, dashboard, pairingGuideVisible);

  return {
    body,
    update(presentation) {
      textSetString(nodeLabel, presentation.nodeName);
      textSetString(connectionLabel, presentation.connectionStatus);
      textSetString(protocolLabel, presentation.protocolStatus);
      textSetString(serviceLabel, presentation.serviceStatus);
      textSetString(pairingLabel, presentation.pairingStatus);
      textSetString(networkLabel, presentation.networkStatus);
      textSetString(cpuLabel, `CPU  ${presentation.cpuStatus}`);
      textSetString(memoryLabel, `内存  ${presentation.memoryStatus}`);
      textSetString(processLabel, `进程  ${presentation.processStatus}`);
      textSetString(publicIpv6Label, `公网 IPv6  ${presentation.networkStatus}`);
      textSetString(relayLabel, `Relay  ${presentation.relayStatus}`);
      textSetString(agentLabel, `Agent  ${presentation.agentStatus}`);
      textSetString(lastReportLabel, `上次上报  ${presentation.lastReportStatus}`);
      buttonSetTitle(pairButton, presentation.paired ? "更新配对" : "配对");
      toggleSetState(reduceMotionToggle, presentation.reduceMotion ? 1 : 0);
      toggleSetState(
        menuBarToggle,
        presentation.launchMode === "menuBarOnly" ? 1 : 0,
      );
      if (!presentation.paired) pairingGuideVisible = true;
      updateVisibility(guide, dashboard, pairingGuideVisible);
    },
    showPairingGuide() {
      pairingGuideVisible = true;
      updateVisibility(guide, dashboard, pairingGuideVisible);
    },
    showDashboard() {
      pairingGuideVisible = false;
      updateVisibility(guide, dashboard, pairingGuideVisible);
    },
    setPairingDefaults(nextServerUrl, nextNodeName) {
      serverUrl = nextServerUrl;
      nodeName = nextNodeName;
      textfieldSetString(serverField, serverUrl);
      textfieldSetString(nameField, nodeName);
    },
    clearPairingCode() {
      pairingCode = "";
      textfieldSetString(codeField, "");
    },
  };
};

const updateVisibility = (
  guide: Widget,
  dashboard: Widget,
  showGuide: boolean,
): void => {
  widgetSetHidden(guide, showGuide ? 0 : 1);
  widgetSetHidden(dashboard, showGuide ? 1 : 0);
};

const label = (value: string, size: number, strong: boolean): Widget => {
  const widget = Text(value);
  textSetFontSize(widget, size);
  textSetColor(widget, 0.82, 0.92, 1, 1);
  if (strong) textSetFontWeight(widget, size, 0.8);
  return widget;
};

const sectionTitle = (value: string): Widget => {
  const widget = label(value, 13, true);
  textSetColor(widget, 0.18, 0.83, 0.75, 1);
  return widget;
};

const formatPercent = (value: number): string =>
  Number.isFinite(value) ? Math.max(0, value).toFixed(1) : "0.0";

const formatBytes = (value: number): string => {
  const gibibytes = Number.isFinite(value) ? Math.max(0, value) / 1024 ** 3 : 0;
  return `${gibibytes.toFixed(1)} GB`;
};

const caption = (value: string): Widget => {
  const widget = label(value, 11, false);
  textSetColor(widget, 0.58, 0.68, 0.78, 1);
  textSetWraps(widget, 344);
  return widget;
};

const metric = (name: string, value: string): Widget => {
  const widget = label(`${name}  ${value}`, 13, false);
  textSetWraps(widget, 344);
  return widget;
};
