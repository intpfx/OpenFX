import { assert, assertEquals } from "@std/assert";
import { preferencesSet } from "perry/system";

import {
  DEFAULT_DESKTOP_PREFERENCES,
  sanitizeDesktopPreferences,
} from "../src/core/desktop-state.ts";
import {
  derivePairingReadiness,
  type PairingReadinessInput,
} from "../src/core/pairing-readiness.ts";
import { createDesktopUiSnapshot, describeDesktopError } from "../src/core/ui-model.ts";
import {
  DESKTOP_PREFERENCES_KEY,
  readDesktopPreferencesSync,
} from "../src/native/preferences.ts";

const READY_PAIRING: PairingReadinessInput = {
  serverUrl: "https://openfx.example",
  pairingCode: "0123ABYZ",
  nodeName: "Studio Mac",
  network: {
    publicIpv6: "240e:1234::9",
    ipv6Addresses: ["240e:1234::9"],
    observedIpv6: ["240e:1234::9"],
    mismatch: false,
  },
  submitting: false,
};

Deno.test("old desktop preferences migrate to regular launch with motion enabled", () => {
  assertEquals(
    sanitizeDesktopPreferences({
      serverUrl: "https://openfx.example/path",
      nodeId: "node-1",
      nodeName: "Studio Mac",
      relayEnabled: false,
      pairedAt: 123,
    }),
    {
      serverUrl: "https://openfx.example",
      nodeId: "node-1",
      nodeName: "Studio Mac",
      relayEnabled: false,
      pairedAt: 123,
      launchMode: "regular",
      reduceMotion: false,
    },
  );
});

Deno.test("desktop preferences preserve supported launch and motion choices", () => {
  assertEquals(
    sanitizeDesktopPreferences({
      ...DEFAULT_DESKTOP_PREFERENCES,
      launchMode: "menuBarOnly",
      reduceMotion: true,
    }),
    {
      ...DEFAULT_DESKTOP_PREFERENCES,
      launchMode: "menuBarOnly",
      reduceMotion: true,
    },
  );
  assertEquals(
    sanitizeDesktopPreferences({ launchMode: "hidden", reduceMotion: "yes" }),
    DEFAULT_DESKTOP_PREFERENCES,
  );
});

Deno.test("startup preferences are available synchronously before native app assembly", () => {
  preferencesSet(
    DESKTOP_PREFERENCES_KEY,
    JSON.stringify({
      nodeName: "Menu Mac",
      launchMode: "menuBarOnly",
      reduceMotion: true,
    }),
  );

  assertEquals(readDesktopPreferencesSync(), {
    ...DEFAULT_DESKTOP_PREFERENCES,
    nodeName: "Menu Mac",
    launchMode: "menuBarOnly",
    reduceMotion: true,
  });
});

Deno.test("pairing readiness accepts only a complete valid combination", () => {
  assertEquals(derivePairingReadiness(READY_PAIRING), {
    canSubmit: true,
    serverUrlValid: true,
    pairingCodeValid: true,
    nodeNameValid: true,
    publicIpv6Valid: true,
    statusMessage: "已满足安全配对条件。",
  });
});

Deno.test("pairing readiness rejects each invalid input combination", () => {
  const cases: Array<{
    name: string;
    input: PairingReadinessInput;
    invalidField:
      | "serverUrlValid"
      | "pairingCodeValid"
      | "nodeNameValid"
      | "publicIpv6Valid";
    statusMessage: string;
  }> = [
    {
      name: "HTTP server",
      input: { ...READY_PAIRING, serverUrl: "http://openfx.example" },
      invalidField: "serverUrlValid",
      statusMessage: "请输入有效的 HTTPS 服务端地址。",
    },
    {
      name: "short pairing code",
      input: { ...READY_PAIRING, pairingCode: "0123ABY" },
      invalidField: "pairingCodeValid",
      statusMessage: "请输入 8 位 Crockford Base32 配对码。",
    },
    {
      name: "empty node name",
      input: { ...READY_PAIRING, nodeName: "   " },
      invalidField: "nodeNameValid",
      statusMessage: "请输入节点名称。",
    },
    {
      name: "missing public IPv6",
      input: { ...READY_PAIRING, network: null },
      invalidField: "publicIpv6Valid",
      statusMessage: "需要本机与外部观察一致的公网 IPv6。",
    },
    {
      name: "mismatched public IPv6",
      input: {
        ...READY_PAIRING,
        network: {
          publicIpv6: "240e:1234::9",
          ipv6Addresses: ["240e:1234::9"],
          observedIpv6: ["240e:9999::1"],
          mismatch: true,
        },
      },
      invalidField: "publicIpv6Valid",
      statusMessage: "需要本机与外部观察一致的公网 IPv6。",
    },
  ];

  for (const testCase of cases) {
    const result = derivePairingReadiness(testCase.input);
    assertEquals(result.canSubmit, false, testCase.name);
    assertEquals(result[testCase.invalidField], false, testCase.name);
    assertEquals(result.statusMessage, testCase.statusMessage, testCase.name);
  }
});

Deno.test("pairing code excludes every ambiguous Crockford character", () => {
  for (const character of ["I", "L", "O", "U"]) {
    const result = derivePairingReadiness({
      ...READY_PAIRING,
      pairingCode: `0123ABY${character}`,
    });
    assertEquals(result.pairingCodeValid, false, character);
    assertEquals(result.canSubmit, false, character);
  }
});

Deno.test("pairing in progress prevents duplicate submission", () => {
  assertEquals(derivePairingReadiness({ ...READY_PAIRING, submitting: true }), {
    canSubmit: false,
    serverUrlValid: true,
    pairingCodeValid: true,
    nodeNameValid: true,
    publicIpv6Valid: true,
    statusMessage: "正在配对，请勿重复提交。",
  });
});

Deno.test("desktop errors map protocol, network, IPv6, and Keychain failures to Chinese", () => {
  assertEquals(
    describeDesktopError(new Error("public_ipv6_required")),
    "未检测到与外部观察一致的公网 IPv6，请检查网络后重试。",
  );
  assertEquals(
    describeDesktopError(new Error("https_required")),
    "服务端地址无效，请输入 HTTPS 地址。",
  );
  assertEquals(
    describeDesktopError(new TypeError("Invalid URL")),
    "服务端地址无效，请输入 HTTPS 地址。",
  );
  assertEquals(
    describeDesktopError(new Error("node_pairing_expired")),
    "配对码已过期，请在控制台重新生成。",
  );
  assertEquals(
    describeDesktopError(new Error("node_pairing_used")),
    "配对码已使用，请在控制台重新生成。",
  );
  assertEquals(
    describeDesktopError(new Error("node_protocol_mismatch")),
    "节点与控制台协议不兼容，请更新 OpenFX Node。",
  );
  assertEquals(
    describeDesktopError(new Error("getaddrinfo ENOTFOUND openfx.example")),
    "网络连接失败，请检查服务端地址与网络后重试。",
  );
  assertEquals(
    describeDesktopError(
      new Error("security_exit_1: User interaction is not allowed."),
    ),
    "无法安全保存节点凭据，请检查 macOS 钥匙串权限。",
  );
});

Deno.test("UI snapshots use static core for reduced motion and contain no undefined strings", () => {
  const snapshot = createDesktopUiSnapshot({
    preferences: {
      ...DEFAULT_DESKTOP_PREFERENCES,
      nodeId: "node-1",
      nodeName: "Studio Mac",
      serverUrl: "https://openfx.example",
      launchMode: "menuBarOnly",
      reduceMotion: true,
    },
    network: null,
    serviceStatus: undefined,
    monitorStatus: undefined,
    pairingError: undefined,
    pairingInProgress: false,
  });

  assertEquals(snapshot, {
    appTitle: "OpenFX Node",
    nodeName: "Studio Mac",
    pairingState: "已配对",
    pairingDetail: "节点 ID：node-1",
    serverStatus: "https://openfx.example",
    networkStatus: "未检测到公网 IPv6",
    relayStatus: "Relay 已启用",
    launchModeStatus: "仅菜单栏模式（下次启动生效）",
    motionStatus: "静态核心",
    coreMotion: "static",
    serviceStatus: "节点服务准备中",
    monitorStatus: "等待系统采样",
    errorMessage: "",
    primaryAction: "已配对",
  });
  assert(!containsUndefined(snapshot));
  assert(Object.values(snapshot).every((value) => value !== "undefined"));
});

Deno.test("unpaired UI snapshots provide deterministic fallback strings", () => {
  const snapshot = createDesktopUiSnapshot({
    preferences: DEFAULT_DESKTOP_PREFERENCES,
    network: undefined,
    pairingInProgress: true,
    pairingError: new Error("node_pairing_used"),
  });

  assertEquals(snapshot.pairingState, "等待配对");
  assertEquals(snapshot.pairingDetail, "输入控制台 HTTPS 地址和 8 位配对码。");
  assertEquals(snapshot.serverStatus, "尚未设置服务端");
  assertEquals(snapshot.launchModeStatus, "常规模式（Dock 与菜单栏）");
  assertEquals(snapshot.motionStatus, "动态核心");
  assertEquals(snapshot.coreMotion, "animated");
  assertEquals(snapshot.primaryAction, "正在配对…");
  assertEquals(snapshot.errorMessage, "配对码已使用，请在控制台重新生成。");
  assert(!containsUndefined(snapshot));
});

const containsUndefined = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsUndefined);
};
