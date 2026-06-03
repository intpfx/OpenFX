// 1.判断本机环境是什么操作系统
// 2.根据不同的操作系统获取本机IP的方式获取本机IPV6地址
// 3.将获取到的IPV6地址每小时一次发送到指定服务器的接口

import {
  computeUpdateUrl,
  isGlobalUnicastIpv6,
  isLoopbackIpv6,
  isValidEndpointKey,
  isValidServerUrl,
  normalizeIpv6,
  normalizeServerBaseUrl,
  parsePortOrNull,
  pickPreferredIpv6,
  uniqueStrings,
} from "../../../domains/downip/core/validation.ts";

type OSName =
  | "darwin"
  | "linux"
  | "windows"
  | "freebsd"
  | "netbsd"
  | "aix"
  | "solaris"
  | "unknown";

type Options = {
  serverBaseUrl: string;
  endpointKey: string;
  endpointPort: number;
  /** cron 表达式（默认每小时整点：0 * * * *） */
  cron: string;
  preferInterface?: string;
  timeoutMs: number;
  retries: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function promptText(message: string, defaultValue?: string): string {
  const shown = defaultValue !== undefined && defaultValue !== ""
    ? `${message} (default: ${defaultValue})`
    : message;
  const v = prompt(shown);
  if (v === null) return defaultValue ?? "";
  const trimmed = v.trim();
  return trimmed !== "" ? trimmed : (defaultValue ?? "");
}

function promptRequired(message: string, defaultValue?: string): string {
  while (true) {
    const v = promptText(message, defaultValue);
    if (v.trim()) return v.trim();
    console.log("Value is required.");
  }
}

function promptYesNo(message: string, defaultYes = true): boolean {
  const hint = defaultYes ? "Y/n" : "y/N";
  const v = prompt(`${message} (${hint})`);
  if (v === null || v.trim() === "") return defaultYes;
  const s = v.trim().toLowerCase();
  if (s === "y" || s === "yes") return true;
  if (s === "n" || s === "no") return false;
  return defaultYes;
}

function log(
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  data?: Record<string, unknown>,
): void {
  const base: Record<string, unknown> = {
    ts: nowIso(),
    level,
    msg: message,
  };
  const merged = data ? { ...base, ...data } : base;
  // 结构化 JSON 日志，便于 grep/收集
  const line = JSON.stringify(merged);
  if (level === "ERROR") console.error(line);
  else console.log(line);
}

function getOsName(): OSName {
  // Deno.build.os: "darwin" | "linux" | "windows"
  const os = Deno.build.os;
  if (os === "darwin" || os === "linux" || os === "windows") return os;
  return "unknown";
}

async function runCmdText(cmd: string[], timeoutMs: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const command = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: "piped",
      stderr: "piped",
      signal: controller.signal,
    });

    const { code, stdout } = await command.output();
    clearTimeout(timer);
    if (code !== 0) return null;
    return new TextDecoder().decode(stdout);
  } catch {
    return null;
  }
}

function extractIpv6FromText(text: string): string[] {
  const re = /([0-9a-fA-F]{0,4}(?::[0-9a-fA-F]{0,4}){2,})(?:%[0-9A-Za-z_.-]+)?/g;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const raw = m[1];
    if (!raw) continue;
    const addr = normalizeIpv6(raw);
    if (!addr.includes(":")) continue;
    if (isLoopbackIpv6(addr)) continue;
    out.push(addr);
  }
  return uniqueStrings(out);
}

async function getHostname(timeoutMs: number): Promise<string | null> {
  const os = getOsName();
  if (os === "windows") {
    return Deno.env.get("COMPUTERNAME") ??
      (await runCmdText(["hostname"], timeoutMs))?.trim() ?? null;
  }
  return (await runCmdText(["hostname"], timeoutMs))?.trim() ?? null;
}

async function getIpv6List(options: Options): Promise<string[]> {
  const os = getOsName();

  // 优先使用符合 OS 的命令
  if (os === "darwin" || os === "freebsd" || os === "netbsd") {
    const out = await runCmdText(["ifconfig", "-a"], options.timeoutMs);
    if (out) return extractIpv6FromText(out);
  }

  if (os === "linux") {
    const out = await runCmdText(["ip", "-6", "addr", "show"], options.timeoutMs);
    if (out) return extractIpv6FromText(out);
    const out2 = await runCmdText(["ifconfig", "-a"], options.timeoutMs);
    if (out2) return extractIpv6FromText(out2);
  }

  if (os === "windows") {
    const out = await runCmdText(["ipconfig"], options.timeoutMs);
    if (out) return extractIpv6FromText(out);
  }

  // 最后兜底：尝试 ifconfig
  const fallback = await runCmdText(["ifconfig"], options.timeoutMs);
  if (fallback) return extractIpv6FromText(fallback);
  return [];
}

type PostResult = {
  status: number;
  statusText: string;
  durationMs: number;
  responseText: string;
};

async function postIpv6Report(ipv6: string, options: Options): Promise<PostResult> {
  const updateUrl = computeUpdateUrl(options.serverBaseUrl);
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  const started = performance.now();
  const bodyObj: Record<string, { ipv6: string; port: number }> = {
    [options.endpointKey]: { ipv6, port: options.endpointPort },
  };
  const res = await fetch(updateUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyObj),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  const responseText = await res.text().catch(() => "");
  const durationMs = Math.round(performance.now() - started);

  if (!res.ok) {
    throw new Error(
      `POST failed: ${res.status} ${res.statusText}${
        responseText ? ` - ${responseText}` : ""
      }`,
    );
  }

  return {
    status: res.status,
    statusText: res.statusText,
    durationMs,
    responseText,
  };
}

function printHelp(): void {
  const exec = (() => {
    try {
      return Deno.execPath();
    } catch {
      return "";
    }
  })();
  const base = exec.split(/[/\\]/).filter(Boolean).pop() ?? "desktop-sync-agent";
  const isDeno = /(^|[/\\])deno(\.exe)?$/i.test(exec);
  const usage = isDeno ? "deno run -A desktop-sync-agent.ts" : base;

  console.log(`Usage: ${usage} [options]

Options:
	--server <url>        服务端 base URL（如 https://example.com；也可用环境变量 IPV6_SERVER_URL）
	--key <name>          端点键名（服务端会暴露 /<name>；不能是 update）
	--port <n>            重定向目标端口（必填；也可用环境变量 IPV6_ENDPOINT_PORT）
	--cron <expr>         Cron 表达式（默认 0 * * * *；也可用 IPV6_POST_CRON）
	--timeout <ms>        命令/请求超时时间（默认 8000）
	--retries <n>          每次触发失败重试次数（默认 2）
	--help                显示帮助

Examples:
  deno run -A --unstable-cron desktop-sync-agent.ts
  deno run -A --unstable-cron desktop-sync-agent.ts --server https://example.com --key home --port 80
  deno compile -A --unstable-cron --output desktop-sync-agent desktop-sync-agent.ts && ./desktop-sync-agent

Notes:
	- 默认无参数启动会进入交互式配置
	- 运行开始会检测是否存在公网 IPv6；没有则退出
	- Deno.cron 可能需要 --unstable-cron（编译/运行时）
`);
}

function parseArgs(argv: string[]): Partial<Options> & { help?: boolean } {
  const out: Partial<Options> & { help?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (a === "--server") {
      out.serverBaseUrl = argv[++i] ?? "";
      continue;
    }
    if (a === "--key") {
      out.endpointKey = argv[++i] ?? "";
      continue;
    }
    if (a === "--port") {
      const v = argv[++i] ?? "";
      const p = parsePortOrNull(v);
      if (p !== null) out.endpointPort = p;
      continue;
    }
    if (a === "--cron") {
      out.cron = (argv[++i] ?? "").trim();
      continue;
    }
    if (a === "--timeout") {
      const v = Number(argv[++i]);
      if (Number.isFinite(v) && v > 0) out.timeoutMs = Math.floor(v);
      continue;
    }
    if (a === "--retries") {
      const v = Number(argv[++i]);
      if (Number.isFinite(v) && v >= 0) out.retries = Math.floor(v);
      continue;
    }
  }
  return out;
}

function deriveCronFromIntervalSeconds(intervalSeconds: number): string | null {
  // 仅用于兼容旧环境变量：IPV6_POST_INTERVAL_SECONDS
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return null;
  if (intervalSeconds === 3600) return "0 * * * *";
  if (intervalSeconds % 60 !== 0) return null;
  const minutes = intervalSeconds / 60;
  if (minutes >= 1 && minutes <= 59) return `*/${minutes} * * * *`;
  // cron 分钟字段最大 59，超过则无法精确表达
  return null;
}

function buildOptions(): Options | null {
  const args = parseArgs(Deno.args);
  if (args.help) {
    printHelp();
    return null;
  }

  const envServer = Deno.env.get("IPV6_SERVER_URL") ?? "";
  const envKey = Deno.env.get("IPV6_ENDPOINT_KEY") ?? "";
  const envPortRaw = (Deno.env.get("IPV6_ENDPOINT_PORT") ?? "").trim();
  const envPort = envPortRaw ? parsePortOrNull(envPortRaw) : null;
  const serverBaseUrl = (args.serverBaseUrl ?? envServer ?? "").trim();
  const endpointKey = (args.endpointKey ?? envKey ?? "").trim();
  const endpointPort = args.endpointPort ?? envPort ?? 0;

  const intervalSeconds = Number(Deno.env.get("IPV6_POST_INTERVAL_SECONDS") ?? "");
  const envDerivedCron = deriveCronFromIntervalSeconds(intervalSeconds);
  if (Number.isFinite(intervalSeconds) && intervalSeconds > 0 && !envDerivedCron) {
    log(
      "WARN",
      "IPV6_POST_INTERVAL_SECONDS is set but cannot be converted to cron; use IPV6_POST_CRON instead",
      { intervalSeconds },
    );
  }

  const envCron = (Deno.env.get("IPV6_POST_CRON") ?? "").trim();
  // 注意：envCron 可能是空字符串，不能用 ?? 否则会覆盖默认值
  const cron = (args.cron?.trim() || envCron || envDerivedCron || "0 * * * *").trim();
  if (!cron) {
    console.error("Missing cron schedule (use --cron or env IPV6_POST_CRON)");
    printHelp();
    return null;
  }

  const timeoutEnv = Number(Deno.env.get("IPV6_POST_TIMEOUT_MS") ?? "");
  const envTimeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0
    ? Math.floor(timeoutEnv)
    : undefined;

  return {
    serverBaseUrl,
    endpointKey,
    endpointPort,
    cron,
    preferInterface: undefined,
    timeoutMs: args.timeoutMs ?? envTimeoutMs ?? 8000,
    retries: args.retries ?? 2,
  };
}

async function assertPublicIpv6Support(
  timeoutMs: number,
): Promise<{ ipv6List: string[]; publicIpv6List: string[] } | null> {
  const options: Options = {
    serverBaseUrl: "",
    endpointKey: "",
    endpointPort: 0,
    cron: "0 * * * *",
    timeoutMs,
    retries: 0,
    preferInterface: undefined,
  };
  const ipv6List = uniqueStrings((await getIpv6List(options)).map(normalizeIpv6));
  const publicIpv6List = ipv6List.filter((x) => isGlobalUnicastIpv6(x));
  return { ipv6List, publicIpv6List };
}

function ensureInteractiveOptions(options: Options): Options {
  let serverBaseUrl = options.serverBaseUrl.trim();
  let endpointKey = options.endpointKey.trim();
  let endpointPort = options.endpointPort;

  while (true) {
    console.log("\n=== desktop-sync-agent interactive setup ===\n");

    // 1) Server
    while (!serverBaseUrl || !isValidServerUrl(normalizeServerBaseUrl(serverBaseUrl))) {
      const entered = promptRequired(
        "[1/3] Server base URL (http(s)://..., e.g. https://example.com)",
        serverBaseUrl,
      );
      serverBaseUrl = normalizeServerBaseUrl(entered);
      if (!isValidServerUrl(serverBaseUrl)) {
        console.log("Invalid URL. Please enter a valid http(s) URL.");
      }
    }

    // 2) Key
    while (!endpointKey || !isValidEndpointKey(endpointKey)) {
      const entered = promptRequired(
        "[2/3] Endpoint key (1-64 chars; letters/digits/._-; cannot be update)",
        endpointKey,
      );
      endpointKey = entered.trim();
      if (endpointKey.includes("://")) {
        console.log(
          "That looks like a URL. The key should be a short name like 'home' or 'nas'.",
        );
      }
      if (!isValidEndpointKey(endpointKey)) {
        console.log("Invalid key.");
      }
    }

    // 3) Port
    while (!(endpointPort >= 1 && endpointPort <= 65535)) {
      const entered = promptRequired(
        "[3/3] Target port (1-65535, e.g. 80/443/3000)",
        endpointPort ? String(endpointPort) : "80",
      );
      const p = parsePortOrNull(entered);
      if (p === null) {
        console.log("Invalid port.");
        continue;
      }
      endpointPort = p;
    }

    console.log("\nSummary:");
    console.log(`  Server: ${serverBaseUrl}`);
    console.log(`  Key:    ${endpointKey}`);
    console.log(`  Port:   ${endpointPort}`);
    console.log(`  Cron:   ${options.cron}`);

    if (promptYesNo("Proceed with these settings?", true)) {
      return {
        ...options,
        serverBaseUrl,
        endpointKey,
        endpointPort,
      };
    }

    // restart wizard
    console.log("\nRestarting setup...\n");
    // keep current values as defaults
  }
}

async function reportOnce(options: Options): Promise<void> {
  const os = getOsName();
  const hostname = await getHostname(options.timeoutMs);
  const ipv6ListRaw = await getIpv6List(options);

  // 保留所有地址；但挑选优先上报的 ipv6
  const ipv6List = uniqueStrings(ipv6ListRaw.map(normalizeIpv6));
  const ipv6 = pickPreferredIpv6(ipv6List);

  log("INFO", "ipv6 resolved", {
    os,
    hostname,
    ipv6,
    ipv6Count: ipv6List.length,
    ipv6List,
  });

  if (!ipv6) {
    log("WARN", "no ipv6 found; skip post", { server: options.serverBaseUrl });
    return;
  }
  if (!isGlobalUnicastIpv6(ipv6)) {
    log("WARN", "no public ipv6 found; skip post", { ipv6 });
    return;
  }

  log("INFO", "posting", {
    server: options.serverBaseUrl,
    endpointKey: options.endpointKey,
    endpointPort: options.endpointPort,
    ipv6,
  });
  const result = await postIpv6Report(ipv6, options);

  let parsed: unknown = undefined;
  try {
    parsed = result.responseText ? JSON.parse(result.responseText) : undefined;
  } catch {
    parsed = undefined;
  }

  const responsePreview = result.responseText.length > 800
    ? `${result.responseText.slice(0, 800)}...`
    : result.responseText;

  log("INFO", "post ok", {
    status: result.status,
    statusText: result.statusText,
    durationMs: result.durationMs,
    responseJson: parsed,
    responseTextPreview: parsed ? undefined : responsePreview,
  });
}

async function reportWithRetries(options: Options): Promise<void> {
  let lastError: unknown = undefined;
  const maxAttempts = Math.max(1, 1 + Math.floor(options.retries));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      log("INFO", "job attempt", { attempt, maxAttempts });
      await reportOnce(options);
      return;
    } catch (e) {
      lastError = e;
      log("ERROR", "job failed", {
        attempt,
        maxAttempts,
        error: (e as Error)?.message ?? String(e),
      });
      if (attempt < maxAttempts) {
        const backoffMs = Math.min(60_000, 1000 * 2 ** Math.min(6, attempt));
        log("WARN", "retrying after backoff", { backoffMs });
        await delay(backoffMs);
      }
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  let options = buildOptions();
  if (!options) return;

  // 运行/编译时可能需要 --unstable-cron：提前给出更友好的提示
  if (typeof (Deno as unknown as { cron?: unknown }).cron !== "function") {
    console.error("Deno.cron is not available in this build.");
    console.error(
      "If you run from source: use deno run -A --unstable-cron desktop-sync-agent.ts",
    );
    console.error(
      "If you compile: use deno compile -A --unstable-cron --output desktop-sync-agent desktop-sync-agent.ts",
    );
    Deno.exit(2);
  }

  // 运行最开始：检查是否支持公网 IPv6（没有则直接退出）
  const support = await assertPublicIpv6Support(options.timeoutMs);
  if (!support || support.publicIpv6List.length === 0) {
    console.log("Your network does not appear to have a public IPv6 address. Exiting.");
    log("ERROR", "public ipv6 not available", {
      ipv6List: support?.ipv6List ?? [],
    });
    Deno.exit(1);
  }
  log("INFO", "public ipv6 detected", {
    publicIpv6List: support.publicIpv6List,
    count: support.publicIpv6List.length,
  });

  // 默认无参数：交互式引导
  options = ensureInteractiveOptions(options);
  if (!isValidEndpointKey(options.endpointKey)) {
    console.log("Invalid endpoint key (cannot be 'update').");
    Deno.exit(1);
  }

  const abort = new AbortController();
  const os = getOsName();
  if (os !== "windows") {
    try {
      Deno.addSignalListener("SIGINT", () => abort.abort());
      Deno.addSignalListener("SIGTERM", () => abort.abort());
    } catch {
      // ignore
    }
  }

  log("INFO", "starting", {
    os,
    server: options.serverBaseUrl,
    endpointKey: options.endpointKey,
    endpointPort: options.endpointPort,
    cron: options.cron,
    retries: options.retries,
  });

  // 仅保留：启动后立即执行一次
  try {
    await reportWithRetries(options);
  } catch {
    // 已记录日志；继续进入 cron 调度
  }

  // 使用 Deno Cron 实现定时任务
  // cron 表达式格式：minute hour day month dayOfWeek
  Deno.cron("post-ipv6", options.cron, async () => {
    if (abort.signal.aborted) return;
    log("INFO", "cron tick", { cron: options.cron });
    try {
      await reportWithRetries(options);
    } catch {
      // 错误已在 reportWithRetries 内部打日志
    }
  });

  // 保持进程运行，等待 cron 和信号
  await new Promise<void>((resolve) => {
    if (abort.signal.aborted) return resolve();
    abort.signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

if (import.meta.main) {
  await main();
}
