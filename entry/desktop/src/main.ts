import {
  App,
  Button,
  Divider,
  HStack,
  menuAddItem,
  menuAddSeparator,
  menuCreate,
  onTerminate,
  Spacer,
  State,
  stateBindTextfield,
  Text,
  TextField,
  trayAttachMenu,
  trayCreate,
  trayOnClick,
  traySetTooltip,
  VStack,
  Window,
} from "perry/ui";
import { exit } from "node:process";

import { decodeBase64Url } from "../../../domains/_shared/openfx-node/encoding.ts";
import { SafetyActionGate } from "../../../domains/e/src/core/safety-action-gate.ts";
import { createAgentToolRuntime } from "./core/agent-runtime.ts";
import { createAuditLog } from "./core/audit-log.ts";
import {
  DEFAULT_DESKTOP_PREFERENCES,
  sanitizeDesktopPreferences,
} from "./core/desktop-state.ts";
import { PersistentApprovalConsumptionStore } from "./core/persistent-approval-store.ts";
import { PersistentApprovalRequestRepository } from "./core/persistent-approval-requests.ts";
import { createDesktopRouteDispatcher } from "./core/route-dispatcher.ts";
import type { DesktopPreferences } from "./core/types.ts";
import { createControlPlaneClient } from "./native/control-plane-client.ts";
import { createFileAuditStorage } from "./native/file-audit-storage.ts";
import { requestJson } from "./native/http-json.ts";
import { createKeychain } from "./native/keychain.ts";
import { createMacSystemAdapter } from "./native/mac-system.ts";
import { createNodeCryptoAdapter } from "./native/node-crypto.ts";
import { type RunningNodeServer, startNodeServer } from "./native/node-server.ts";
import { createOmlxClient } from "./native/omlx-client.ts";
import {
  APPROVAL_AUTHORITY_KEY,
  APPROVAL_REQUESTS_KEY,
  createDesktopPreferenceStore,
  createPreferenceStringPersistence,
} from "./native/preferences.ts";
import {
  createPairingService,
  type RestoredPairing,
} from "./native/pairing-service.ts";
import { createRelayReporter } from "./native/relay-reporter.ts";
import { createSystemMonitor } from "./native/system-monitor.ts";

const cryptoAdapter = createNodeCryptoAdapter();
const keychain = createKeychain();
const preferenceStore = createDesktopPreferenceStore();
const controlPlane = createControlPlaneClient(requestJson);
const pairingService = createPairingService({
  client: controlPlane,
  preferences: preferenceStore,
  keychain,
});
const reporter = createRelayReporter(controlPlane);
const audit = createAuditLog(createFileAuditStorage());
const macSystem = createMacSystemAdapter();

let pairing: RestoredPairing | null = null;
let nodeServer: RunningNodeServer | null = null;

const preferences = State<DesktopPreferences>(DEFAULT_DESKTOP_PREFERENCES);
const serviceStatus = State("正在启动 OpenFX Node…");
const monitorStatus = State("等待首个 5 秒采样");
const pairingCode = State("");
const serverUrl = State("");
const nodeName = State("OpenFX Mac");

const systemMonitor = createSystemMonitor({
  collector: macSystem,
  async onSample(state) {
    const ipv6 = state.network.publicIpv6 ?? "未检测到公网 IPv6";
    monitorStatus.set(
      `CPU ${state.overview.cpuUsagePercent}% · ${state.processes.length} 个进程 · ${ipv6}`,
    );
    await reporter.report(state);
  },
  async onError(error) {
    monitorStatus.set(`采样失败：${errorMessage(error)}`);
    await audit.append({
      category: "node",
      action: "telemetry.sample",
      outcome: "failed",
      metadata: { error: errorMessage(error) },
    });
  },
});

const approvalAuthority = new PersistentApprovalConsumptionStore(
  createPreferenceStringPersistence(APPROVAL_AUTHORITY_KEY),
);
const approvals = new PersistentApprovalRequestRepository(
  createPreferenceStringPersistence(APPROVAL_REQUESTS_KEY),
);
const gate = new SafetyActionGate({
  now: Date.now,
  createId: () => createId("approval"),
  consumptionStore: approvalAuthority,
});

const agentTools = createAgentToolRuntime({
  gate,
  approvals,
  audit,
  nodeId: () => preferences.value.nodeId,
  now: Date.now,
  createId: () => createId("action"),
  read: {
    overview: () => Promise.resolve(systemMonitor.overview()),
    processes: () => Promise.resolve(systemMonitor.processes()),
    network: () => Promise.resolve(systemMonitor.network()),
    relay: () => Promise.resolve(reporter.status()),
  },
  effects: {
    kill: (pid) => macSystem.kill(pid),
    openApplication: (application) => macSystem.openApplication(application),
    async updateRelay(enabled) {
      const next = sanitizeDesktopPreferences({
        ...preferences.value,
        relayEnabled: enabled,
      });
      await preferenceStore.save(next);
      preferences.set(next);
      if (pairing) {
        pairing = { ...pairing, preferences: next };
        reporter.setPairing(pairing);
      }
      return reporter.status();
    },
  },
});

const omlx = createOmlxClient(requestJson);
const dispatchRoute = createDesktopRouteDispatcher({
  overview: () => Promise.resolve(systemMonitor.overview()),
  processes: () => Promise.resolve(systemMonitor.processes()),
  network: () => Promise.resolve(systemMonitor.network()),
  relay: () => Promise.resolve(reporter.status()),
  chat: (message) => omlx.chat(message),
  invokeTool: (toolId, input) => agentTools.invoke(toolId, input),
  listApprovals: () => agentTools.listApprovals(),
  resolveApproval: (input) => agentTools.resolve(input),
});

const pairWithControlPlane = async (): Promise<void> => {
  serviceStatus.set("正在配对…");
  let network = systemMonitor.network();
  if (!network) {
    await systemMonitor.sampleNow();
    network = systemMonitor.network();
  }
  if (!network?.publicIpv6) {
    serviceStatus.set("配对失败：未检测到公网 IPv6。");
    return;
  }
  try {
    pairing = await pairingService.pair({
      serverUrl: serverUrl.value,
      code: pairingCode.value,
      name: nodeName.value,
      publicIpv6: network.publicIpv6,
    });
    preferences.set(pairing.preferences);
    reporter.setPairing(pairing);
    serverUrl.set(pairing.preferences.serverUrl);
    nodeName.set(pairing.preferences.nodeName);
    pairingCode.set("");
    serviceStatus.set(`已配对：${pairing.preferences.nodeName}`);
  } catch (error) {
    serviceStatus.set(`配对失败：${errorMessage(error)}`);
  }
};

const bootstrap = async (): Promise<void> => {
  try {
    pairing = await pairingService.restore();
    if (pairing) {
      preferences.set(pairing.preferences);
      reporter.setPairing(pairing);
      serverUrl.set(pairing.preferences.serverUrl);
      nodeName.set(pairing.preferences.nodeName);
      serviceStatus.set(`已恢复配对：${pairing.preferences.nodeName}`);
    } else {
      const saved = await preferenceStore.load();
      if (saved) {
        preferences.set(saved);
        serverUrl.set(saved.serverUrl);
        nodeName.set(saved.nodeName);
      }
      serviceStatus.set("未配对；本机监控与手动操作仍可用。");
    }
    nodeServer = await startNodeServer({
      crypto: cryptoAdapter,
      loadSecret: () =>
        Promise.resolve(pairing ? decodeBase64Url(pairing.nodeSecret) : null),
      dispatch: dispatchRoute,
    });
    systemMonitor.start();
  } catch (error) {
    serviceStatus.set(`节点启动失败：${errorMessage(error)}`);
  }
};

const buildControlPanel = () => {
  const serverField = TextField(
    "OpenFX 服务端 URL（必须为 HTTPS）",
    (value: string) => {
      serverUrl.set(value);
    },
  );
  stateBindTextfield(serverUrl, serverField);
  const codeField = TextField("8 位配对码", (value: string) => {
    pairingCode.set(value.toUpperCase());
  });
  stateBindTextfield(pairingCode, codeField);
  const nameField = TextField("节点名称", (value: string) => {
    nodeName.set(value);
  });
  stateBindTextfield(nodeName, nameField);

  return VStack(12, [
    Text("OpenFX Node"),
    Text("原生 Perry 菜单栏节点；关闭窗口后监控与节点 API 会继续运行。"),
    Divider(),
    Text(`节点服务：${serviceStatus.value}`),
    Text(`本机监控：${monitorStatus.value}`),
    Text("协议：v1 · 监听：[::]:24531"),
    Divider(),
    serverField,
    codeField,
    nameField,
    HStack(8, [
      Button("配对", () => void pairWithControlPlane()),
      Button("立即采样", () => void systemMonitor.sampleNow()),
    ]),
    Spacer(),
  ]);
};

const tray = trayCreate("");
traySetTooltip(tray, "OpenFX Node");
const trayMenu = menuCreate();
const controlWindow = Window("OpenFX Node", 680, 520);
controlWindow.setBody(buildControlPanel());
controlWindow.onFocusLost(() => controlWindow.hide());
menuAddItem(trayMenu, "显示 OpenFX Node", () => controlWindow.show());
menuAddItem(trayMenu, "立即采样", () => void systemMonitor.sampleNow());
menuAddSeparator(trayMenu);
menuAddItem(trayMenu, "退出", () => exit(0));
trayAttachMenu(tray, trayMenu);
trayOnClick(tray, () => controlWindow.show());

onTerminate(() => {
  systemMonitor.stop();
  if (nodeServer) void nodeServer.close();
});

void bootstrap();

App({
  title: "OpenFX Node",
  width: 680,
  height: 520,
  activationPolicy: "accessory",
  body: buildControlPanel(),
});

function createId(prefix: string): string {
  const bytes = cryptoAdapter.randomBytes(12);
  return `${prefix}-${
    Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  }`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
