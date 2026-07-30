import {
  App,
  appSetActivationPolicy,
  onActivate,
  onMainWindowVisibilityChanged,
  onTerminate,
  State,
} from "perry/ui";
import { exit } from "node:process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";

import { decodeBase64Url } from "../../../domains/_shared/openfx-node/encoding.ts";
import { SafetyActionGate } from "../../../domains/e/src/core/safety-action-gate.ts";
import { createAgentToolRuntime } from "./core/agent-runtime.ts";
import {
  deriveDesktopAppSmokeLibraryDirectory,
  deriveDesktopAppSmokeRun,
  type DesktopAppSmokeStatus,
  serializeDesktopAppSmokeMarker,
} from "./core/app-smoke-contract.ts";
import type { AuditLog } from "./core/audit-log.ts";
import { createDesktopJournal } from "./core/durable-journal.ts";
import { createDesktopLifecycleController } from "./core/lifecycle-controller.ts";
import {
  deriveCoreMotionPolicy,
  derivePerryWindowPolicy,
  PERRY_ANIMATED_CORE_AVAILABLE,
  PERRY_VISIBLE_MAIN_WINDOW_AVAILABLE,
} from "./core/core-motion-policy.ts";
import { derivePairingReadiness } from "./core/pairing-readiness.ts";
import { createDesktopRouteDispatcher } from "./core/route-dispatcher.ts";
import type { DesktopLaunchMode, DesktopPreferences } from "./core/types.ts";
import { describeDesktopError } from "./core/ui-model.ts";
import { createControlPlaneClient } from "./native/control-plane-client.ts";
import { createSqliteJournalStorage } from "./native/sqlite-journal-storage.ts";
import { requestJson, requestTextStream } from "./native/http-json.ts";
import { createKeychain } from "./native/keychain.ts";
import { createMacSystemAdapter } from "./native/mac-system.ts";
import { createNodeEventReporter } from "./native/node-event-reporter.ts";
import { createNodeCryptoAdapter } from "./native/node-crypto.ts";
import { type RunningNodeServer, startNodeServer } from "./native/node-server.ts";
import {
  createFileThumbnailResolver,
  createManagedFileLibrary,
} from "./native/file-library.ts";
import { createOmlxClient } from "./native/omlx-client.ts";
import {
  createDesktopPreferenceStore,
  readDesktopPreferencesSync,
} from "./native/preferences.ts";
import {
  createPairingService,
  type RestoredPairing,
  synchronizePairingState,
} from "./native/pairing-service.ts";
import { createRelayReporter } from "./native/relay-reporter.ts";
import {
  createObservedSystemCollector,
  createPublicIpv6Observer,
} from "./native/public-ipv6-observer.ts";
import { createSystemMonitor } from "./native/system-monitor.ts";
import {
  type ControlPanelController,
  createControlPanel,
  createControlPanelPresentation,
  type PairingFormInput,
} from "./ui/control-panel.ts";
import { createFileBrowser, type FileBrowserController } from "./ui/file-browser.ts";
import { createNodeSettingsWindow } from "./ui/node-settings-window.ts";
import { createNodeTray, type NodeTrayController } from "./ui/tray.ts";

const desktopAppSmokeRun = deriveDesktopAppSmokeRun({
  testMode: process.env.PERRY_UI_TEST_MODE === "1",
  token: process.env.OPENFX_APP_SMOKE_TOKEN ?? "",
  argv: process.argv,
  launchMarkerPath: process.env.OPENFX_APP_SMOKE_LAUNCH_PATH ?? "",
  cleanExitMarkerPath: process.env.OPENFX_APP_SMOKE_CLEAN_EXIT_PATH ?? "",
  pid: process.pid,
  executable: process.execPath,
});
let desktopAppSmokeCleanExitWritten = false;
writeDesktopAppSmokeMarker("launched");

const cryptoAdapter = createNodeCryptoAdapter();
const keychain = createKeychain();
const preferenceStore = createDesktopPreferenceStore();
const controlPlane = createControlPlaneClient(requestJson, { crypto: cryptoAdapter });
const pairingService = createPairingService({
  client: controlPlane,
  preferences: preferenceStore,
  keychain,
});
const reporter = createRelayReporter(controlPlane);
const eventReporter = createNodeEventReporter(controlPlane);
const journalDirectory = join(
  homedir(),
  "Library",
  "Application Support",
  "OpenFX Node",
);
const journal = createDesktopJournal(createSqliteJournalStorage(
  join(journalDirectory, "journal.sqlite"),
  { legacyJournalPath: join(journalDirectory, "journal.jsonl") },
));
const audit: AuditLog = {
  append: (event) => journal.appendAudit(event),
  list: (limit) => journal.listAudit(limit),
};
const macSystem = createMacSystemAdapter();
const systemCollector = createObservedSystemCollector(
  macSystem,
  createPublicIpv6Observer(requestJson),
);
const productionFileLibraryDirectory = join(
  homedir(),
  "Library",
  "Application Support",
  "OpenFX Node",
  "Files",
);
const fileLibraryDirectory = resolve(
  deriveDesktopAppSmokeLibraryDirectory(
    desktopAppSmokeRun,
    process.env.OPENFX_APP_SMOKE_LIBRARY_DIRECTORY ?? "",
    productionFileLibraryDirectory,
  ),
);
const fileLibrary = createManagedFileLibrary({
  libraryDirectory: fileLibraryDirectory,
});
const fileThumbnails = createFileThumbnailResolver({
  cacheDirectory: join(
    homedir(),
    "Library",
    "Caches",
    "OpenFX Node",
    "Thumbnails",
  ),
});

const startupPreferences = readDesktopPreferencesSync();
let pairing: RestoredPairing | null = null;
let nodeServer: RunningNodeServer | null = null;
let pairingInProgress = false;
let controlPanel: ControlPanelController | null = null;
let fileBrowser: FileBrowserController | null = null;
let nodeTray: NodeTrayController | null = null;

const preferences = State<DesktopPreferences>(startupPreferences);
const serviceStatus = State("正在启动 OpenFX Node…");
const pairingStatus = State("等待输入配对信息。");

const systemMonitor = createSystemMonitor({
  collector: systemCollector,
  onSample(state) {
    return reporter.report(state);
  },
  async onError(error) {
    serviceStatus.set(`采样失败：${errorMessage(error)}`);
    await audit.append({
      category: "node",
      action: "telemetry.sample",
      outcome: "failed",
      metadata: { error: errorMessage(error) },
    });
  },
});

const gate = new SafetyActionGate({
  now: Date.now,
  createId: () => createId("approval"),
  consumptionStore: journal,
});

const agentTools = createAgentToolRuntime({
  gate,
  approvals: journal,
  audit,
  nodeId: () => preferences.value.nodeId,
  ownPid: () => process.pid,
  now: Date.now,
  createId: () => createId("action"),
  read: {
    overview: () => Promise.resolve(systemMonitor.overview()),
    processes: () => Promise.resolve(systemMonitor.processes()),
    network: () => Promise.resolve(systemMonitor.network()),
    relay: () => Promise.resolve(reporter.status()),
  },
  effects: {
    inspectProcess: (pid) => macSystem.inspectProcess(pid),
    kill: (pid, expected) => macSystem.kill(pid, expected),
    openApplication: (application) => macSystem.openApplication(application),
    updateRelay(enabled) {
      preferenceStore.update({
        relayEnabled: enabled,
      });
      pairing = applyAuthoritativePairing(pairing);
      refreshPresentation();
      return Promise.resolve(reporter.status());
    },
  },
  events: {
    approvalRequested(request) {
      return eventReporter.emit({
        type: "approval.requested",
        data: { id: request.id, summary: request.reason },
      });
    },
    approvalResolved(request, decision) {
      return eventReporter.emit({
        type: "approval.resolved",
        data: { id: request.id, decision },
      });
    },
  },
});

const omlx = createOmlxClient(requestJson, requestTextStream);
const dispatchRoute = createDesktopRouteDispatcher({
  overview: () => Promise.resolve(systemMonitor.overview()),
  processes: () => Promise.resolve(systemMonitor.processes()),
  network: () => Promise.resolve(systemMonitor.network()),
  relay: () => Promise.resolve(reporter.status()),
  chat: (message, onDelta, toolRounds, options) =>
    omlx.chat(message, onDelta, toolRounds, options),
  agentDelta(data) {
    return eventReporter.emit({ type: "agent.delta", data });
  },
  invokeTool: (toolId, input, options) => agentTools.invoke(toolId, input, options),
  listApprovals: () => agentTools.listApprovals(),
  resolveApproval: (input) => agentTools.resolve(input),
}, { createId: () => createId("message") });

const pairWithControlPlane = async (input: PairingFormInput): Promise<void> => {
  if (pairingInProgress) return;
  pairingInProgress = true;
  serviceStatus.set("正在配对…");
  pairingStatus.set("正在检查本机网络与配对信息…");
  refreshPresentation();
  try {
    let network = systemMonitor.network();
    if (!network) {
      await systemMonitor.sampleNow();
      network = systemMonitor.network();
    }
    const readiness = derivePairingReadiness({
      serverUrl: input.serverUrl,
      pairingCode: input.pairingCode,
      nodeName: input.nodeName,
      network,
      submitting: false,
    });
    if (!readiness.canSubmit || !network?.publicIpv6) {
      serviceStatus.set("配对信息尚未就绪。");
      pairingStatus.set(readiness.statusMessage);
      return;
    }
    const candidate = await pairingService.pair({
      serverUrl: input.serverUrl,
      code: input.pairingCode,
      name: input.nodeName,
      publicIpv6: network.publicIpv6,
    });
    pairing = applyAuthoritativePairing(candidate);
    if (!pairing) throw new Error("pairing_state_changed");
    serviceStatus.set(`已配对：${pairing.preferences.nodeName}`);
    pairingStatus.set("配对完成，节点凭据已保存到 macOS 钥匙串。");
    controlPanel?.setPairingDefaults(
      pairing.preferences.serverUrl,
      pairing.preferences.nodeName,
    );
    controlPanel?.clearPairingCode();
    fileBrowser?.showLibrary();
  } catch (error) {
    const userMessage = describeDesktopError(error);
    serviceStatus.set(`配对失败：${userMessage}`);
    pairingStatus.set(`配对失败：${userMessage}`);
  } finally {
    pairingInProgress = false;
    refreshPresentation();
  }
};

const bootstrap = async (): Promise<void> => {
  try {
    const recovered = await journal.recoverIncompleteExecutions();
    if (recovered > 0) {
      serviceStatus.set(`已恢复 ${recovered} 个中断的执行记录。`);
    }
    const restored = await pairingService.restore();
    pairing = applyAuthoritativePairing(restored ?? pairing);
    if (pairing) {
      serviceStatus.set(`已恢复配对：${pairing.preferences.nodeName}`);
      pairingStatus.set("已从 macOS 钥匙串恢复安全配对。");
      controlPanel?.setPairingDefaults(
        pairing.preferences.serverUrl,
        pairing.preferences.nodeName,
      );
      fileBrowser?.showLibrary();
    } else {
      const saved = preferenceStore.current();
      controlPanel?.setPairingDefaults(saved.serverUrl, saved.nodeName);
      serviceStatus.set("未配对；本机监控与手动操作仍可用。");
      pairingStatus.set("请完成三步配对；节点 ID 仅以钥匙串凭据为准。");
      controlPanel?.showPairingGuide();
    }
    nodeServer = await startNodeServer({
      crypto: cryptoAdapter,
      loadSecret: () =>
        Promise.resolve(pairing ? decodeBase64Url(pairing.nodeSecret) : null),
      dispatch: dispatchRoute,
      replayStore: journal,
    });
    systemMonitor.start();
    refreshPresentation();
  } catch (error) {
    systemMonitor.stop();
    if (nodeServer) await nodeServer.close();
    nodeServer = null;
    serviceStatus.set(`节点启动失败：${errorMessage(error)}`);
    refreshPresentation();
  }
};

const lifecycle = createDesktopLifecycleController({
  startServices: bootstrap,
  async stopServices() {
    systemMonitor.stop();
    if (nodeServer) await nodeServer.close();
    nodeServer = null;
  },
});

controlPanel = createControlPanel(currentPresentation(), {
  pair(input) {
    void pairWithControlPlane(input);
  },
  sample() {
    void sampleAndRefreshPresentation();
  },
  openConsole() {
    void openControlPlaneConsole();
  },
  setLaunchMode(mode) {
    void persistLaunchMode(mode);
  },
  setReduceMotion(reduceMotion) {
    void persistPreferenceChoice({ reduceMotion });
  },
});

const nodeSettingsWindow = createNodeSettingsWindow(controlPanel.body);

fileBrowser = createFileBrowser({
  library: fileLibrary,
  thumbnails: fileThumbnails,
  reduceMotion: startupPreferences.reduceMotion,
});

nodeTray = createNodeTray(currentPresentation(), {
  sample() {
    void sampleAndRefreshPresentation();
  },
  openSettings() {
    nodeSettingsWindow.show();
  },
  openConsole() {
    void openControlPlaneConsole();
  },
  quit() {
    void lifecycle.terminate().finally(() => exit(0));
  },
});

onActivate(() => {
  void sampleAndRefreshPresentation();
});

onMainWindowVisibilityChanged((visible) => {
  if (visible) lifecycle.mainWindowShown();
  else lifecycle.mainWindowClosed();
});

onTerminate(() => {
  writeDesktopAppSmokeMarker("clean-exit");
  void lifecycle.terminate();
});

appSetActivationPolicy(
  currentWindowPolicy().mode === "menuBarOnly" ? "accessory" : "regular",
);
setTimeout(() => {
  void lifecycle.start();
}, 1);
App({
  title: "OpenFX Node",
  width: 820,
  height: 640,
  minWidth: 820,
  minHeight: 640,
  vibrancy: "underWindowBackground",
  titlebarStyle: "overlay",
  body: fileBrowser.body,
});

function currentPresentation() {
  const network = systemMonitor.network();
  return createControlPanelPresentation({
    preferences: preferences.value,
    paired: pairing !== null,
    serviceStatus: serviceStatus.value,
    pairingStatus: pairingStatus.value,
    overview: systemMonitor.overview(),
    publicIpv6: network?.publicIpv6 ?? null,
    relay: reporter.status(),
    motionPolicy: currentMotionPolicy(),
    windowPolicy: currentWindowPolicy(),
    now: Date.now(),
  });
}

function currentMotionPolicy() {
  return deriveCoreMotionPolicy(
    preferences.value.reduceMotion,
    PERRY_ANIMATED_CORE_AVAILABLE,
  );
}

function currentWindowPolicy() {
  return derivePerryWindowPolicy(
    preferences.value.launchMode,
    PERRY_VISIBLE_MAIN_WINDOW_AVAILABLE,
  );
}

function applyAuthoritativePairing(
  candidate: RestoredPairing | null,
): RestoredPairing | null {
  return synchronizePairingState(preferenceStore, candidate, {
    setPreferences(next) {
      preferences.set(next);
    },
    setRelayPairing(next) {
      reporter.setPairing(next);
    },
    setEventPairing(next) {
      eventReporter.setPairing(next);
    },
  });
}

function refreshPresentation(): void {
  const presentation = currentPresentation();
  controlPanel?.update(presentation);
  nodeTray?.update(presentation);
  fileBrowser?.setReduceMotion(preferences.value.reduceMotion);
}

async function sampleAndRefreshPresentation(): Promise<void> {
  await systemMonitor.sampleNow();
  refreshPresentation();
}

function persistLaunchMode(mode: DesktopLaunchMode): void {
  const saved = persistPreferenceChoice({ launchMode: mode });
  if (!saved) return;
  serviceStatus.set(
    mode === "menuBarOnly"
      ? "已保存：下次启动仅显示菜单栏；本次 Dock 图标保持不变。"
      : "已保存：下次启动显示 Dock 与菜单栏。",
  );
  refreshPresentation();
}

function persistPreferenceChoice(
  patch: Partial<Pick<DesktopPreferences, "launchMode" | "reduceMotion">>,
): boolean {
  try {
    preferenceStore.update(patch);
    pairing = applyAuthoritativePairing(pairing);
    refreshPresentation();
    return true;
  } catch (error) {
    serviceStatus.set(`偏好保存失败：${describeDesktopError(error)}`);
    refreshPresentation();
    return false;
  }
}

async function openControlPlaneConsole(): Promise<void> {
  try {
    await macSystem.openConsole(preferences.value.serverUrl);
  } catch (error) {
    serviceStatus.set(`无法打开控制台：${describeDesktopError(error)}`);
    refreshPresentation();
  }
}

function createId(prefix: string): string {
  const bytes = cryptoAdapter.randomBytes(12);
  return `${prefix}-${
    Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  }`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writeDesktopAppSmokeMarker(status: DesktopAppSmokeStatus): void {
  if (!desktopAppSmokeRun) return;
  if (status === "clean-exit" && desktopAppSmokeCleanExitWritten) return;
  const path = status === "launched"
    ? desktopAppSmokeRun.launchMarkerPath
    : desktopAppSmokeRun.cleanExitMarkerPath;
  try {
    writeFileSync(
      path,
      serializeDesktopAppSmokeMarker(desktopAppSmokeRun, status),
    );
    if (status === "clean-exit") desktopAppSmokeCleanExitWritten = true;
  } catch (error) {
    console.error(`OpenFX app smoke marker failed: ${errorMessage(error)}`);
  }
}
