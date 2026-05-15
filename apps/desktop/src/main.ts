import {
  App,
  Button,
  clipboardWrite,
  Divider,
  HStack,
  Section,
  Spacer,
  State,
  stateBindTextfield,
  Text,
  TextField,
  Toggle,
  VStack,
  widgetAddChild,
} from "perry/ui";

import { preferencesGet, preferencesSet } from "perry/system";

import { spawn } from "perry/thread";

import { execSync } from "node:child_process";

import {
  buildDownipServerTemplate,
  buildIpv6ReportPayload,
  buildProxyTemplate,
  computeUpdateUrl,
  createRuntimeHealth,
  isGlobalUnicastIpv6,
  isProbablyIpv6,
  normalizeIpv6,
  parsePortOrNull,
  parsePositiveIntegerOrNull,
  pickPreferredIpv6,
  validateDownipSyncConfig,
} from "../../../packages/core/src/mod.ts";

const health = createRuntimeHealth({ surface: "desktop", version: "0.1.0" });
void buildDownipServerTemplate;

const CONFIG_PREFERENCE_KEY = "openfx.downip.desktopSyncConfig";
const DEFAULT_CONFIG: DesktopSyncConfig = {
  serverBaseUrl: "https://example.com",
  endpointKey: "home",
  endpointPort: 3000,
  autoSyncEnabled: false,
  intervalSeconds: 3600,
  preferredIpv6: "",
};

type DesktopSyncConfig = {
  serverBaseUrl: string;
  endpointKey: string;
  endpointPort: number;
  autoSyncEnabled: boolean;
  intervalSeconds: number;
  preferredIpv6: string;
};

const config = State<DesktopSyncConfig>(DEFAULT_CONFIG);

const detectedIpv6 = State<string[]>([]);
const syncStatus = State("等待检测本机 IPv6");
const lastUploadResult = State("尚未执行上传");
const serverArtifactStatus = State("尚未复制服务端脚本");
const isBusy = State(false);

const serverUrlFieldState = State(config.value.serverBaseUrl);
const endpointKeyFieldState = State(config.value.endpointKey);
const endpointPortFieldState = State(String(config.value.endpointPort));
const intervalFieldState = State(String(config.value.intervalSeconds));
const ipv6FieldState = State(config.value.preferredIpv6);

let autoSyncTimer: ReturnType<typeof setInterval> | null = null;

const syncFieldStates = (nextConfig: DesktopSyncConfig): void => {
  serverUrlFieldState.set(nextConfig.serverBaseUrl);
  endpointKeyFieldState.set(nextConfig.endpointKey);
  endpointPortFieldState.set(String(nextConfig.endpointPort));
  intervalFieldState.set(String(nextConfig.intervalSeconds));
  ipv6FieldState.set(nextConfig.preferredIpv6);
};

const sanitizeConfig = (candidate: Partial<DesktopSyncConfig>): DesktopSyncConfig => {
  const serverBaseUrl = typeof candidate.serverBaseUrl === "string"
    ? candidate.serverBaseUrl
    : DEFAULT_CONFIG.serverBaseUrl;
  const endpointKey = typeof candidate.endpointKey === "string"
    ? candidate.endpointKey
    : DEFAULT_CONFIG.endpointKey;
  const endpointPort = typeof candidate.endpointPort === "number" &&
      Number.isFinite(candidate.endpointPort)
    ? candidate.endpointPort
    : DEFAULT_CONFIG.endpointPort;
  const autoSyncEnabled = typeof candidate.autoSyncEnabled === "boolean"
    ? candidate.autoSyncEnabled
    : DEFAULT_CONFIG.autoSyncEnabled;
  const intervalSeconds = typeof candidate.intervalSeconds === "number" &&
      Number.isFinite(candidate.intervalSeconds)
    ? candidate.intervalSeconds
    : DEFAULT_CONFIG.intervalSeconds;
  const preferredIpv6 = typeof candidate.preferredIpv6 === "string"
    ? candidate.preferredIpv6
    : DEFAULT_CONFIG.preferredIpv6;

  return {
    serverBaseUrl: serverBaseUrl.trim() || DEFAULT_CONFIG.serverBaseUrl,
    endpointKey: endpointKey.trim() || DEFAULT_CONFIG.endpointKey,
    endpointPort: parsePortOrNull(String(endpointPort)) ?? DEFAULT_CONFIG.endpointPort,
    autoSyncEnabled,
    intervalSeconds: parsePositiveIntegerOrNull(String(intervalSeconds)) ??
      DEFAULT_CONFIG.intervalSeconds,
    preferredIpv6: preferredIpv6.trim(),
  };
};

const persistConfig = (nextConfig: DesktopSyncConfig): void => {
  try {
    preferencesSet(CONFIG_PREFERENCE_KEY, JSON.stringify(nextConfig));
  } catch (error) {
    syncStatus.set(`配置持久化失败：${String(error)}`);
  }
};

const stopAutoSyncTimer = (): void => {
  if (autoSyncTimer !== null) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
};

const detectIpv6FromCommandOutput = (): string[] => {
  const rawOutput = execSync("ifconfig", { encoding: "utf8" }) as string;
  return detectIpv6FromLocalText(rawOutput).filter((value) => value !== "::1");
};

const refreshDetectedIpv6 = async (): Promise<string[]> => {
  const addresses = await spawn(() => detectIpv6FromCommandOutput());
  detectedIpv6.set(addresses);
  return addresses;
};

const chooseIpv6Candidate = (
  preferredInput: string,
  addresses: readonly string[],
): string => {
  const normalizedPreferred = normalizeIpv6(preferredInput);
  if (normalizedPreferred && isProbablyIpv6(normalizedPreferred)) {
    return normalizedPreferred;
  }

  return pickPreferredIpv6(addresses) ?? "";
};

const syncAutoTimer = (nextConfig: DesktopSyncConfig): void => {
  stopAutoSyncTimer();

  if (!nextConfig.autoSyncEnabled) {
    syncStatus.set("已关闭自动同步，仅支持手动触发。");
    return;
  }

  syncStatus.set(`已启用自动同步：每 ${nextConfig.intervalSeconds} 秒自动检测并上传。`);
  autoSyncTimer = setInterval(() => {
    void runSyncCycle("auto");
  }, nextConfig.intervalSeconds * 1000);
};

const applyConfig = (
  nextConfig: DesktopSyncConfig,
  options?: { persist?: boolean },
): void => {
  const sanitized = sanitizeConfig(nextConfig);
  config.set(sanitized);
  syncFieldStates(sanitized);

  if (options?.persist !== false) {
    persistConfig(sanitized);
  }

  syncAutoTimer(sanitized);
};

const restorePersistedConfig = (): void => {
  try {
    const rawValue = preferencesGet(CONFIG_PREFERENCE_KEY);
    if (typeof rawValue !== "string" || rawValue.trim() === "") {
      syncAutoTimer(config.value);
      return;
    }

    const restored = sanitizeConfig(JSON.parse(rawValue) as Partial<DesktopSyncConfig>);
    applyConfig(restored, { persist: false });
    syncStatus.set(
      restored.autoSyncEnabled
        ? `已恢复自动同步配置：每 ${restored.intervalSeconds} 秒执行一次。`
        : "已恢复本地配置，自动同步当前关闭。",
    );
  } catch (error) {
    syncStatus.set(`读取本地配置失败：${String(error)}`);
    syncAutoTimer(config.value);
  }
};

const serverUrlField = TextField(
  "服务端 URL（https://example.com）",
  (value: string) => {
    applyConfig({
      ...config.value,
      serverBaseUrl: value,
    });
  },
);
stateBindTextfield(serverUrlFieldState, serverUrlField);

const endpointKeyField = TextField("endpoint key（如 home）", (value: string) => {
  applyConfig({
    ...config.value,
    endpointKey: value,
  });
});
stateBindTextfield(endpointKeyFieldState, endpointKeyField);

const endpointPortField = TextField("目标端口（如 3000）", (value: string) => {
  endpointPortFieldState.set(value);
  const parsed = parsePortOrNull(value);
  if (parsed !== null) {
    applyConfig({
      ...config.value,
      endpointPort: parsed,
    });
  }
});
stateBindTextfield(endpointPortFieldState, endpointPortField);

const intervalField = TextField("自动同步间隔秒数（如 3600）", (value: string) => {
  intervalFieldState.set(value);
  const parsed = parsePositiveIntegerOrNull(value);
  if (parsed !== null) {
    applyConfig({
      ...config.value,
      intervalSeconds: parsed,
    });
  }
});
stateBindTextfield(intervalFieldState, intervalField);

const ipv6Field = TextField("手动指定 IPv6（可选）", (value: string) => {
  applyConfig({
    ...config.value,
    preferredIpv6: value,
  });
});
stateBindTextfield(ipv6FieldState, ipv6Field);

const autoSyncToggle = Toggle("启用自动同步（自动检测并上传）", (on: boolean) => {
  applyConfig({
    ...config.value,
    autoSyncEnabled: on,
  });
});

const detectIpv6FromLocalText = (text: string): string[] => {
  const matcher = /([0-9a-fA-F]{0,4}(?::[0-9a-fA-F]{0,4}){2,})(?:%[0-9A-Za-z_.-]+)?/g;
  const matches: string[] = [];
  for (const match of text.matchAll(matcher)) {
    const raw = match[1];
    if (!raw) {
      continue;
    }

    const normalized = normalizeIpv6(raw);
    if (normalized.includes(":") && normalized !== "::1") {
      matches.push(normalized);
    }
  }

  const unique = new Set<string>();
  const output: string[] = [];
  for (const value of matches) {
    if (!unique.has(value)) {
      unique.add(value);
      output.push(value);
    }
  }

  return output;
};

const detectIpv6 = async (): Promise<void> => {
  isBusy.set(true);
  syncStatus.set("正在分析本机 IPv6…");

  try {
    const addresses = await refreshDetectedIpv6();
    const preferred = chooseIpv6Candidate(config.value.preferredIpv6, addresses);

    if (!config.value.preferredIpv6.trim() && preferred) {
      applyConfig({
        ...config.value,
        preferredIpv6: preferred,
      });
    }

    syncStatus.set(
      addresses.length > 0
        ? `检测完成，共发现 ${addresses.length} 个 IPv6；优先推荐 ${
          preferred || addresses[0]
        }`
        : "未检测到可用 IPv6，请确认当前网络环境支持 IPv6。",
    );
  } catch (error) {
    syncStatus.set(`本机 IPv6 检测失败：${String(error)}`);
  }

  isBusy.set(false);
};

const runSyncCycle = async (trigger: "manual" | "auto"): Promise<void> => {
  if (isBusy.value) {
    if (trigger === "auto") {
      lastUploadResult.set("自动同步跳过：当前已有任务执行中。");
    }
    return;
  }

  isBusy.set(true);
  syncStatus.set(
    trigger === "auto"
      ? "自动同步：正在检测并上传 IPv6…"
      : "手动同步：正在检测并上传 IPv6…",
  );

  try {
    const addresses = await refreshDetectedIpv6();
    const candidateIpv6 = chooseIpv6Candidate(config.value.preferredIpv6, addresses);
    const effectiveConfig = {
      ...config.value,
      preferredIpv6: candidateIpv6,
    };

    if (!candidateIpv6) {
      lastUploadResult.set("未检测到可上传的 IPv6 地址。");
      syncStatus.set("同步中止：没有可用 IPv6。");
      return;
    }

    if (candidateIpv6 !== config.value.preferredIpv6) {
      applyConfig(effectiveConfig);
    }

    const validation = validateDownipSyncConfig({
      serverBaseUrl: effectiveConfig.serverBaseUrl,
      endpointKey: effectiveConfig.endpointKey,
      endpointPort: effectiveConfig.endpointPort,
      ipv6: candidateIpv6,
    });

    if (validation) {
      lastUploadResult.set(validation);
      syncStatus.set(
        trigger === "auto"
          ? "自动同步失败：配置校验未通过。"
          : "手动同步失败：配置校验未通过。",
      );
      return;
    }

    lastUploadResult.set(
      trigger === "auto" ? "自动同步：正在上传 IPv6…" : "手动同步：正在上传 IPv6…",
    );

    const response = await fetch(computeUpdateUrl(effectiveConfig.serverBaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(
        buildIpv6ReportPayload(
          effectiveConfig.endpointKey,
          normalizeIpv6(candidateIpv6),
          effectiveConfig.endpointPort,
        ),
      ),
    });

    const text = await response.text().catch(() => "");
    lastUploadResult.set(
      response.ok
        ? `上传成功：${response.status} ${response.statusText}${
          text ? ` / ${text}` : ""
        }`
        : `上传失败：${response.status} ${response.statusText}${
          text ? ` / ${text}` : ""
        }`,
    );
    syncStatus.set(
      response.ok
        ? `${trigger === "auto" ? "自动" : "手动"}同步完成：已上传 ${candidateIpv6}`
        : `${trigger === "auto" ? "自动" : "手动"}同步失败：服务端返回异常。`,
    );
  } catch (error) {
    lastUploadResult.set(`上传异常：${String(error)}`);
    syncStatus.set(`${trigger === "auto" ? "自动" : "手动"}同步异常：${String(error)}`);
  } finally {
    isBusy.set(false);
  }
};

const postIpv6Report = async (): Promise<void> => {
  await runSyncCycle("manual");
};

const copyDownipServer = (): void => {
  clipboardWrite(buildDownipServerTemplate());
  serverArtifactStatus.set("已复制 crondownip 服务端脚本到剪贴板");
};

const copyProxyServer = (): void => {
  clipboardWrite(buildProxyTemplate(config.value.serverBaseUrl, 8464));
  serverArtifactStatus.set("已复制 proxy 服务端脚本到剪贴板");
};

const copyDeployGuide = (): void => {
  clipboardWrite([
    "# OpenFX 服务端部署说明",
    "",
    "1. 将 crondownip 服务端脚本保存为 downip-server.ts",
    "2. 使用 Deno 运行：deno run -A downip-server.ts",
    "3. 如需代理，再将 proxy 脚本保存为 proxy.ts",
    "4. 使用 Deno 运行：deno run -A proxy.ts",
    "5. 在桌面端填写服务端 URL、endpoint key 和目标端口后执行手动上传。",
  ].join("\n"));
  serverArtifactStatus.set("已复制部署说明到剪贴板");
};

const syncSection = Section("桌面端：IPv6 客户端同步");
widgetAddChild(
  syncSection,
  Text("该区域集成客户端能力；服务端逻辑不会直接打进桌面二进制。"),
);
widgetAddChild(syncSection, autoSyncToggle);
widgetAddChild(syncSection, serverUrlField);
widgetAddChild(syncSection, endpointKeyField);
widgetAddChild(syncSection, endpointPortField);
widgetAddChild(syncSection, intervalField);
widgetAddChild(syncSection, ipv6Field);

const serverSection = Section("服务端：复制部署产物");
widgetAddChild(
  serverSection,
  Text("proxy.ts 与 crondownip.ts 当前以可复制脚本形式提供，方便部署到服务端。"),
);
widgetAddChild(serverSection, Button("复制 crondownip 服务端脚本", copyDownipServer));
widgetAddChild(serverSection, Button("复制 proxy 服务端脚本", copyProxyServer));
widgetAddChild(serverSection, Button("复制部署说明", copyDeployGuide));

restorePersistedConfig();

App({
  title: "OpenFX Desktop / DownIP",
  width: 760,
  height: 720,
  body: VStack(16, [
    Text("OpenFX Desktop / DownIP 控制台"),
    Text(`Runtime: ${health.surface}`),
    Text(`Status: ${health.status}`),
    Text("temp/ 中的客户端能力已整合为 GUI；服务端能力改为复制部署。"),
    Divider(),
    syncSection,
    HStack(8, [
      Button("检测 IPv6", () => {
        void detectIpv6();
      }),
      Button("手动上传 IPv6", () => {
        void postIpv6Report();
      }),
    ]),
    Text(
      `自动同步: ${
        config.value.autoSyncEnabled
          ? `开启 / ${config.value.intervalSeconds} 秒`
          : "关闭"
      }`,
    ),
    Text(`忙碌状态: ${isBusy.value ? "处理中" : "空闲"}`),
    Text(`同步状态: ${syncStatus.value}`),
    Text(
      `已检测 IPv6: ${
        detectedIpv6.value.length > 0 ? detectedIpv6.value.join(", ") : "暂无"
      }`,
    ),
    Text(
      `当前首选 IPv6: ${config.value.preferredIpv6 || "未设置"}`,
    ),
    Text(
      `当前候选是否公网 IPv6: ${
        config.value.preferredIpv6 && isProbablyIpv6(config.value.preferredIpv6)
          ? (isGlobalUnicastIpv6(config.value.preferredIpv6) ? "是" : "否")
          : "未知"
      }`,
    ),
    Text(`最近上传结果: ${lastUploadResult.value}`),
    Divider(),
    serverSection,
    Text(`服务端产物状态: ${serverArtifactStatus.value}`),
    Spacer(),
  ]),
});
