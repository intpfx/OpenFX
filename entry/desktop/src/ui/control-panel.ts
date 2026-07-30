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
import type {
  CoreMotionPolicy,
  PerryWindowPolicy,
} from "../core/core-motion-policy.ts";

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
  launchStatus: string;
  launchControlAvailable: boolean;
  reduceMotion: boolean;
  motionStatus: string;
  motionControlAvailable: boolean;
}

export interface ControlPanelPresentationInput {
  preferences: DesktopPreferences;
  paired: boolean;
  serviceStatus: string;
  pairingStatus: string;
  overview: SystemOverview | null;
  publicIpv6: string | null;
  relay: RelayStatus;
  motionPolicy: CoreMotionPolicy;
  windowPolicy: PerryWindowPolicy;
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
    launchMode: input.windowPolicy.mode,
    launchStatus: input.windowPolicy.status,
    launchControlAvailable: input.windowPolicy.controlAvailable,
    reduceMotion: preferences.reduceMotion,
    motionStatus: `${
      preferences.reduceMotion ? "界面动态已减少" : "界面动态已开启"
    } · ${input.motionPolicy.status}`,
    motionControlAvailable: true,
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
  textSetWraps(pairingLabel, 444);
  const pairButton = Button("配对", () => {
    actions.pair({
      serverUrl: serverUrl.trim(),
      pairingCode: pairingCode.trim().toUpperCase(),
      nodeName: nodeName.trim(),
    });
  });

  const guide = VStack(10, [
    sectionTitle("节点配对"),
    caption("连接 Web 控制台后，节点凭据只保存到 macOS 钥匙串。"),
    Divider(),
    sectionTitle("1 · 网络检查"),
    networkLabel,
    sectionTitle("2 · 控制台与配对码"),
    serverField,
    codeField,
    nameField,
    sectionTitle("3 · 确认"),
    pairingLabel,
    pairButton,
  ]);
  stackSetAlignment(guide, 7);

  const reduceMotionToggle = Toggle("减少界面动态效果", (enabled: boolean) => {
    actions.setReduceMotion(enabled);
  });
  const motionStatusLabel = caption(initial.motionStatus);
  const menuBarToggle = Toggle("下次启动仅菜单栏", (enabled: boolean) => {
    actions.setLaunchMode(enabled ? "menuBarOnly" : "regular");
  });
  const launchStatusLabel = caption(initial.launchStatus);
  toggleSetState(reduceMotionToggle, initial.reduceMotion ? 1 : 0);
  toggleSetState(menuBarToggle, initial.launchMode === "menuBarOnly" ? 1 : 0);

  const body = VStack(12, [
    guide,
    Spacer(),
    Divider(),
    HStack(8, [
      Button("立即采样", actions.sample),
      Button("打开 Web 控制台", actions.openConsole),
    ]),
    reduceMotionToggle,
    motionStatusLabel,
    menuBarToggle,
    launchStatusLabel,
  ]);
  widgetSetWidth(body, 492);
  widgetSetEdgeInsets(body, 0, 0, 0, 0);
  stackSetAlignment(body, 7);
  stackSetDetachesHidden(body, 1);
  updateMotionControlVisibility(
    reduceMotionToggle,
    motionStatusLabel,
    initial.motionControlAvailable,
  );
  updateLaunchControlVisibility(
    menuBarToggle,
    launchStatusLabel,
    initial.launchControlAvailable,
  );

  return {
    body,
    update(presentation) {
      textSetString(pairingLabel, presentation.pairingStatus);
      textSetString(networkLabel, presentation.networkStatus);
      buttonSetTitle(pairButton, presentation.paired ? "更新配对" : "配对");
      toggleSetState(reduceMotionToggle, presentation.reduceMotion ? 1 : 0);
      textSetString(motionStatusLabel, presentation.motionStatus);
      updateMotionControlVisibility(
        reduceMotionToggle,
        motionStatusLabel,
        presentation.motionControlAvailable,
      );
      toggleSetState(
        menuBarToggle,
        presentation.launchMode === "menuBarOnly" ? 1 : 0,
      );
      textSetString(launchStatusLabel, presentation.launchStatus);
      updateLaunchControlVisibility(
        menuBarToggle,
        launchStatusLabel,
        presentation.launchControlAvailable,
      );
    },
    showPairingGuide() {},
    showDashboard() {},
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

const updateMotionControlVisibility = (
  toggle: Widget,
  status: Widget,
  controlAvailable: boolean,
): void => {
  widgetSetHidden(toggle, controlAvailable ? 0 : 1);
  widgetSetHidden(status, controlAvailable ? 1 : 0);
};

const updateLaunchControlVisibility = (
  toggle: Widget,
  status: Widget,
  controlAvailable: boolean,
): void => {
  widgetSetHidden(toggle, controlAvailable ? 0 : 1);
  widgetSetHidden(status, controlAvailable ? 1 : 0);
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
