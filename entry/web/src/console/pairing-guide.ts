import type { NodeAvailability } from "./model.ts";

export type PairingCredential = {
  code: string;
  expiresAt: number;
};

export type PairingCountdown = {
  remainingSeconds: number;
  label: string;
  expired: boolean;
};

export type PairingGuide = {
  serverUrl: string | null;
  canGenerate: boolean;
  generateDisabled: boolean;
  transportMessage: string | null;
  serverCopyLabel: "复制 OpenFX HTTPS 服务端地址";
  steps: readonly [string, string, string];
  connected: boolean;
  stateLabel: "节点已连接" | "等待 Mac 节点" | "配对码已失效";
  code: string | null;
  countdown: PairingCountdown | null;
};

export type PairingCountdownScheduler = {
  now: () => number;
  setInterval: (callback: () => void, milliseconds: number) => number;
  clearInterval: (handle: number) => void;
};

const browserCountdownScheduler: PairingCountdownScheduler = {
  now: () => Date.now(),
  setInterval: (callback, milliseconds) =>
    globalThis.setInterval(callback, milliseconds),
  clearInterval: (handle) => globalThis.clearInterval(handle),
};

export function formatPairingCountdown(
  expiresAt: number,
  now: number,
): PairingCountdown {
  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1_000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return {
    remainingSeconds,
    label: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    expired: remainingSeconds === 0,
  };
}

export function derivePairingGuide(input: {
  currentUrl: string | null;
  availability: NodeAvailability;
  pairing: PairingCredential | null;
  now: number;
}): PairingGuide {
  const origin = parseOrigin(input.currentUrl);
  const canGenerate = origin?.protocol === "https:";
  const connected = input.availability === "online";
  const countdown = input.pairing
    ? formatPairingCountdown(input.pairing.expiresAt, input.now)
    : null;
  return {
    serverUrl: origin?.origin ?? null,
    canGenerate,
    generateDisabled: !canGenerate,
    transportMessage: canGenerate ? null : "请通过 HTTPS 控制台打开",
    serverCopyLabel: "复制 OpenFX HTTPS 服务端地址",
    steps: [
      "检测公网 IPv6",
      "输入 HTTPS 地址与 8 位配对码",
      "写入 macOS Keychain",
    ],
    connected,
    stateLabel: connected
      ? "节点已连接"
      : countdown?.expired
      ? "配对码已失效"
      : "等待 Mac 节点",
    code: input.pairing?.code ?? null,
    countdown,
  };
}

export function subscribePairingCountdown(
  expiresAt: number,
  onTick: (countdown: PairingCountdown, now: number) => void,
  scheduler: PairingCountdownScheduler = browserCountdownScheduler,
): () => void {
  let handle: number | null = null;
  let closed = false;
  const stop = () => {
    if (closed) return;
    closed = true;
    if (handle !== null) scheduler.clearInterval(handle);
  };
  const tick = () => {
    if (closed) return;
    const now = scheduler.now();
    const countdown = formatPairingCountdown(expiresAt, now);
    onTick(countdown, now);
    if (countdown.expired) stop();
  };

  tick();
  if (!closed) handle = scheduler.setInterval(tick, 1_000);
  return stop;
}

export async function copyPairingValue(
  value: string,
  writeText: (value: string) => Promise<void>,
  successMessage = "已复制服务端地址",
): Promise<string> {
  try {
    await writeText(value);
    return successMessage;
  } catch {
    return "复制失败，请手动选择文本";
  }
}

function parseOrigin(currentUrl: string | null): URL | null {
  if (!currentUrl) return null;
  try {
    return new URL(currentUrl);
  } catch {
    return null;
  }
}
