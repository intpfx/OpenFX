import {
  type LocalPrivateMeshState,
  signPrivateMeshMessage,
  verifyPrivateMeshMessage,
} from "./private-mesh.ts";
import type { PrivateMeshKeyVault } from "./private-mesh-key-vault.ts";

const SIGNAL_VERSION = 1 as const;
const SIGNAL_PREFIX = "openfx-rtc-v1";
const SIGNAL_TTL_MS = 15 * 60 * 1000;
const MAX_SIGNAL_CODE_LENGTH = 512 * 1024;
const UTF8 = new TextEncoder();
const UTF8_DECODER = new TextDecoder();

export type PrivateMeshSignalPayload = Readonly<{
  version: typeof SIGNAL_VERSION;
  kind: "offer" | "answer";
  networkMode: "local" | "public-stun";
  meshId: string;
  sessionId: string;
  fromNodeId: string;
  toNodeId: string;
  description: RTCSessionDescriptionInit & { type: "offer" | "answer"; sdp: string };
  createdAt: string;
  expiresAt: string;
}>;

type SignedPrivateMeshSignal = Readonly<{
  payload: PrivateMeshSignalPayload;
  signature: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  const serialized = entries.map(([key, item]) =>
    `${JSON.stringify(key)}:${canonicalJson(item)}`
  ).join(",");
  return `{${serialized}}`;
}

function bytesToBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeSignal(value: SignedPrivateMeshSignal): string {
  return `${SIGNAL_PREFIX}.${bytesToBase64Url(UTF8.encode(canonicalJson(value)))}`;
}

function parseSignedSignal(code: string): SignedPrivateMeshSignal {
  const normalized = code.trim();
  if (
    normalized.length > MAX_SIGNAL_CODE_LENGTH ||
    !normalized.startsWith(`${SIGNAL_PREFIX}.`)
  ) throw new Error("连接码无效");
  try {
    const value = JSON.parse(
      UTF8_DECODER.decode(base64UrlToBytes(normalized.slice(SIGNAL_PREFIX.length + 1))),
    );
    if (
      !isRecord(value) || !isRecord(value.payload) ||
      typeof value.signature !== "string"
    ) throw new Error("invalid signal");
    const payload = value.payload;
    if (
      payload.version !== SIGNAL_VERSION ||
      (payload.kind !== "offer" && payload.kind !== "answer") ||
      (payload.networkMode !== "local" && payload.networkMode !== "public-stun") ||
      typeof payload.meshId !== "string" ||
      typeof payload.sessionId !== "string" ||
      typeof payload.fromNodeId !== "string" ||
      typeof payload.toNodeId !== "string" ||
      typeof payload.createdAt !== "string" ||
      typeof payload.expiresAt !== "string" ||
      !isRecord(payload.description) ||
      payload.description.type !== payload.kind ||
      typeof payload.description.sdp !== "string"
    ) throw new Error("invalid signal");
    return value as unknown as SignedPrivateMeshSignal;
  } catch {
    throw new Error("连接码无效");
  }
}

function assertIsoDate(value: string): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("连接码时间无效");
  return time;
}

export async function createPrivateMeshSignalCode(
  state: LocalPrivateMeshState,
  input: Readonly<{
    kind: "offer" | "answer";
    recipientNodeId: string;
    sessionId?: string;
    networkMode?: "local" | "public-stun";
    description: RTCSessionDescriptionInit;
    now?: string;
  }>,
  keyVault: PrivateMeshKeyVault,
): Promise<string> {
  if (
    input.description.type !== input.kind || typeof input.description.sdp !== "string"
  ) {
    throw new Error("WebRTC 会话描述无效");
  }
  if (
    input.recipientNodeId === state.localNode.nodeId ||
    !state.members.some((member) => member.payload.nodeId === input.recipientNodeId)
  ) throw new Error("目标设备不是当前网络成员");
  const now = input.now ?? new Date().toISOString();
  const createdAt = assertIsoDate(now);
  const sessionId = input.sessionId ?? crypto.randomUUID();
  if (!sessionId || sessionId.length > 100) throw new Error("连接会话 ID 无效");
  const payload: PrivateMeshSignalPayload = {
    version: SIGNAL_VERSION,
    kind: input.kind,
    networkMode: input.networkMode ?? "local",
    meshId: state.descriptor.meshId,
    sessionId,
    fromNodeId: state.localNode.nodeId,
    toNodeId: input.recipientNodeId,
    description: {
      type: input.kind,
      sdp: input.description.sdp,
    },
    createdAt: now,
    expiresAt: new Date(createdAt + SIGNAL_TTL_MS).toISOString(),
  };
  return encodeSignal({
    payload,
    signature: await signPrivateMeshMessage(state, payload, keyVault),
  });
}

export async function parsePrivateMeshSignalCode(
  state: LocalPrivateMeshState,
  code: string,
  expected: Readonly<{
    kind: "offer" | "answer";
    sessionId?: string;
    now?: string;
  }>,
): Promise<PrivateMeshSignalPayload> {
  const signal = parseSignedSignal(code);
  const payload = signal.payload;
  if (
    payload.meshId !== state.descriptor.meshId ||
    payload.toNodeId !== state.localNode.nodeId
  ) throw new Error("连接码不属于当前设备");
  if (
    payload.kind !== expected.kind ||
    (expected.sessionId && payload.sessionId !== expected.sessionId)
  ) throw new Error("连接码与当前会话不匹配");
  const now = assertIsoDate(expected.now ?? new Date().toISOString());
  const createdAt = assertIsoDate(payload.createdAt);
  const expiresAt = assertIsoDate(payload.expiresAt);
  if (
    createdAt > now + 60_000 || expiresAt < now ||
    expiresAt - createdAt !== SIGNAL_TTL_MS
  ) throw new Error("连接码已经过期");
  if (
    !await verifyPrivateMeshMessage(
      state,
      payload.fromNodeId,
      payload,
      signal.signature,
    )
  ) throw new Error("连接码无效");
  return payload;
}

export type PrivateMeshRtcConnection = Readonly<{
  sessionId: string;
  remoteNodeId: string;
  role: "offerer" | "answerer";
  networkMode: "local" | "public-stun";
  peerConnection: RTCPeerConnection;
  channel: Promise<RTCDataChannel>;
}>;

type PrivateMeshRtcOptions = Readonly<{
  now?: string;
  createPeerConnection?: () => RTCPeerConnection;
  iceGatheringTimeoutMs?: number;
  usePublicStun?: boolean;
}>;

function defaultPeerConnection(usePublicStun = false): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: usePublicStun ? [{ urls: "stun:stun.cloudflare.com:3478" }] : [],
  });
}

async function waitForIceGathering(
  connection: RTCPeerConnection,
  timeoutMs: number,
): Promise<void> {
  if (connection.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("收集本机 WebRTC 地址超时"));
    }, timeoutMs);
    const changed = () => {
      if (connection.iceGatheringState !== "complete") return;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", changed);
    };
    connection.addEventListener("icegatheringstatechange", changed);
  });
}

function waitForDataChannel(
  connection: RTCPeerConnection,
  timeoutMs = SIGNAL_TTL_MS,
): Promise<RTCDataChannel> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      connection.removeEventListener("datachannel", received);
      reject(new Error("没有收到 OpenFX 设备数据通道"));
    }, timeoutMs);
    const received = (event: RTCDataChannelEvent) => {
      if (event.channel.label !== "openfx-private-mesh-v1") {
        event.channel.close();
        return;
      }
      clearTimeout(timeout);
      connection.removeEventListener("datachannel", received);
      resolve(event.channel);
    };
    connection.addEventListener("datachannel", received);
  });
}

export async function createPrivateMeshConnectionOffer(
  state: LocalPrivateMeshState,
  recipientNodeId: string,
  keyVault: PrivateMeshKeyVault,
  options: PrivateMeshRtcOptions = {},
): Promise<
  Readonly<{
    connection: PrivateMeshRtcConnection;
    offerCode: string;
  }>
> {
  const peerConnection = options.createPeerConnection?.() ??
    defaultPeerConnection(options.usePublicStun);
  const channel = peerConnection.createDataChannel("openfx-private-mesh-v1", {
    ordered: true,
  });
  try {
    await peerConnection.setLocalDescription(await peerConnection.createOffer());
    await waitForIceGathering(
      peerConnection,
      options.iceGatheringTimeoutMs ?? 10_000,
    );
    if (!peerConnection.localDescription) throw new Error("无法创建 WebRTC offer");
    const offerCode = await createPrivateMeshSignalCode(
      state,
      {
        kind: "offer",
        networkMode: options.usePublicStun ? "public-stun" : "local",
        recipientNodeId,
        description: peerConnection.localDescription,
        now: options.now,
      },
      keyVault,
    );
    const payload = parseSignedSignal(offerCode).payload;
    return {
      connection: {
        sessionId: payload.sessionId,
        remoteNodeId: recipientNodeId,
        role: "offerer",
        networkMode: options.usePublicStun ? "public-stun" : "local",
        peerConnection,
        channel: Promise.resolve(channel),
      },
      offerCode,
    };
  } catch (error) {
    channel.close();
    peerConnection.close();
    throw error;
  }
}

export async function acceptPrivateMeshConnectionOffer(
  state: LocalPrivateMeshState,
  offerCode: string,
  keyVault: PrivateMeshKeyVault,
  options: PrivateMeshRtcOptions = {},
): Promise<
  Readonly<{
    connection: PrivateMeshRtcConnection;
    answerCode: string;
  }>
> {
  const offer = await parsePrivateMeshSignalCode(state, offerCode, {
    kind: "offer",
    now: options.now,
  });
  if (offer.networkMode === "public-stun" && !options.usePublicStun) {
    throw new Error("对方请求使用公共 STUN，请明确允许后重试");
  }
  const peerConnection = options.createPeerConnection?.() ??
    defaultPeerConnection(offer.networkMode === "public-stun");
  const channel = waitForDataChannel(peerConnection);
  try {
    await peerConnection.setRemoteDescription(offer.description);
    await peerConnection.setLocalDescription(await peerConnection.createAnswer());
    await waitForIceGathering(
      peerConnection,
      options.iceGatheringTimeoutMs ?? 10_000,
    );
    if (!peerConnection.localDescription) throw new Error("无法创建 WebRTC answer");
    return {
      connection: {
        sessionId: offer.sessionId,
        remoteNodeId: offer.fromNodeId,
        role: "answerer",
        networkMode: offer.networkMode,
        peerConnection,
        channel,
      },
      answerCode: await createPrivateMeshSignalCode(
        state,
        {
          kind: "answer",
          networkMode: offer.networkMode,
          recipientNodeId: offer.fromNodeId,
          sessionId: offer.sessionId,
          description: peerConnection.localDescription,
          now: options.now,
        },
        keyVault,
      ),
    };
  } catch (error) {
    peerConnection.close();
    throw error;
  }
}

export async function completePrivateMeshConnectionOffer(
  state: LocalPrivateMeshState,
  connection: PrivateMeshRtcConnection,
  answerCode: string,
  options: Pick<PrivateMeshRtcOptions, "now"> = {},
): Promise<void> {
  if (connection.role !== "offerer") throw new Error("当前连接不等待 answer");
  const answer = await parsePrivateMeshSignalCode(state, answerCode, {
    kind: "answer",
    sessionId: connection.sessionId,
    now: options.now,
  });
  if (answer.fromNodeId !== connection.remoteNodeId) {
    throw new Error("连接码来自错误的设备");
  }
  if (answer.networkMode !== connection.networkMode) {
    throw new Error("连接码的网络寻址模式不匹配");
  }
  await connection.peerConnection.setRemoteDescription(answer.description);
}

export async function waitForPrivateMeshChannel(
  connection: PrivateMeshRtcConnection,
  timeoutMs = 30_000,
): Promise<RTCDataChannel> {
  const channel = await connection.channel;
  if (channel.readyState === "open") return channel;
  if (channel.readyState === "closing" || channel.readyState === "closed") {
    throw new Error("设备数据通道已经关闭");
  }
  return await new Promise<RTCDataChannel>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("等待设备数据通道超时"));
    }, timeoutMs);
    const opened = () => {
      cleanup();
      resolve(channel);
    };
    const failed = () => {
      cleanup();
      reject(new Error("设备数据通道连接失败"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      channel.removeEventListener("open", opened);
      channel.removeEventListener("close", failed);
      channel.removeEventListener("error", failed);
    };
    channel.addEventListener("open", opened);
    channel.addEventListener("close", failed);
    channel.addEventListener("error", failed);
  });
}

export function closePrivateMeshConnection(
  connection: PrivateMeshRtcConnection,
): void {
  void connection.channel.then((channel) => channel.close()).catch(() => undefined);
  connection.peerConnection.close();
}
