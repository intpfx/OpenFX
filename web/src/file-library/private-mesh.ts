import {
  type PrivateMeshKeyRef,
  type PrivateMeshKeyVault,
} from "./private-mesh-key-vault.ts";
import { encryptPrivateMeshRecoveryCode } from "./private-mesh-recovery.ts";

const PRIVATE_MESH_VERSION = 1 as const;
const ECDSA_ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const ECDH_ALGORITHM = { name: "ECDH", namedCurve: "P-256" } as const;
const UTF8 = new TextEncoder();
const UTF8_DECODER = new TextDecoder();

export type PrivateMeshCapabilities = Readonly<{
  invite: boolean;
  store: boolean;
}>;

export type PrivateMeshDescriptor = Readonly<{
  version: typeof PRIVATE_MESH_VERSION;
  meshId: string;
  name: string;
  epoch: number;
  rootKeyId: string;
  rootPublicKey: JsonWebKey;
  createdAt: string;
}>;

export type MembershipCertificatePayload = Readonly<{
  version: typeof PRIVATE_MESH_VERSION;
  meshId: string;
  meshEpoch: number;
  nodeId: string;
  nodeName: string;
  role: "owner" | "member";
  capabilities: PrivateMeshCapabilities;
  signingPublicKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
  pairingRequestId: string | null;
  issuedAt: string;
  issuerKeyId: string;
}>;

export type MembershipCertificate = Readonly<{
  payload: MembershipCertificatePayload;
  signature: string;
}>;

export type LocalPrivateMeshNode =
  & MembershipCertificatePayload
  & Readonly<{
    signingKey: PrivateMeshKeyRef;
    encryptionKey: PrivateMeshKeyRef;
    certificate: MembershipCertificate;
  }>;

export type LocalPrivateMeshState = Readonly<{
  descriptor: PrivateMeshDescriptor;
  localNode: LocalPrivateMeshNode;
  members: readonly MembershipCertificate[];
  meshKey: string;
  rootSigningKey?: PrivateMeshKeyRef;
  usedPairingRequestIds: readonly string[];
  pendingEpochUpdates: readonly PendingPrivateMeshEpochUpdate[];
}>;

export type PendingPrivateMeshEpochUpdate = Readonly<{
  nodeId: string;
  nodeName: string;
  updateCode: string;
}>;

export type CreatedPrivateMesh = Readonly<{
  state: LocalPrivateMeshState;
  recoveryCode: string;
}>;

export type PairingRequestPayload = Readonly<{
  version: typeof PRIVATE_MESH_VERSION;
  requestId: string;
  nodeId: string;
  nodeName: string;
  signingPublicKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
  createdAt: string;
  expiresAt: string;
  nonce: string;
}>;

export type SignedPairingRequest = Readonly<{
  payload: PairingRequestPayload;
  signature: string;
}>;

type PendingPairingIdentity = Readonly<{
  signingKey: PrivateMeshKeyRef;
  encryptionKey: PrivateMeshKeyRef;
}>;

export type PendingPairingRequest = Readonly<{
  request: SignedPairingRequest;
  requestCode: string;
  verificationCode: string;
  identity: PendingPairingIdentity;
}>;

type MeshKeyEnvelope = Readonly<{
  algorithm: "ECDH-P256+A256GCM";
  ephemeralPublicKey: JsonWebKey;
  iv: string;
  ciphertext: string;
}>;

type PairingApproval = Readonly<{
  version: typeof PRIVATE_MESH_VERSION;
  descriptor: PrivateMeshDescriptor;
  certificate: MembershipCertificate;
  members: readonly MembershipCertificate[];
  meshKeyEnvelope: MeshKeyEnvelope;
}>;

type PrivateMeshEpochUpdate = Readonly<{
  version: typeof PRIVATE_MESH_VERSION;
  descriptor: PrivateMeshDescriptor;
  descriptorSignature: string;
  certificate: MembershipCertificate;
  members: readonly MembershipCertificate[];
  meshKeyEnvelope: MeshKeyEnvelope;
}>;

function normalizedName(value: string, label: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error(`${label}不能为空`);
  if (normalized.length > 80) throw new Error(`${label}不能超过 80 个字符`);
  return normalized;
}

function assertIsoDate(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error("时间格式无效");
}

function bytesToBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${
    entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(
      ",",
    )
  }}`;
}

async function digestId(prefix: string, value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    UTF8.encode(canonicalJson(value)),
  );
  return `${prefix}_${bytesToBase64Url(new Uint8Array(digest)).slice(0, 24)}`;
}

async function signMembershipPayload(
  payload: MembershipCertificatePayload,
  rootSigningKey: PrivateMeshKeyRef,
  keyVault: PrivateMeshKeyVault,
): Promise<MembershipCertificate> {
  const signature = await keyVault.sign(
    rootSigningKey,
    UTF8.encode(canonicalJson(payload)),
  );
  return { payload, signature: bytesToBase64Url(new Uint8Array(signature)) };
}

async function signRootValue(
  value: unknown,
  rootSigningKey: PrivateMeshKeyRef,
  keyVault: PrivateMeshKeyVault,
): Promise<string> {
  const signature = await keyVault.sign(
    rootSigningKey,
    UTF8.encode(canonicalJson(value)),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifyRootValue(
  value: unknown,
  signature: string,
  descriptor: PrivateMeshDescriptor,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      descriptor.rootPublicKey,
      ECDSA_ALGORITHM,
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlToBytes(signature),
      UTF8.encode(canonicalJson(value)),
    );
  } catch {
    return false;
  }
}

async function signPairingRequest(
  payload: PairingRequestPayload,
  signingKey: PrivateMeshKeyRef,
  keyVault: PrivateMeshKeyVault,
): Promise<SignedPairingRequest> {
  const signature = await keyVault.sign(
    signingKey,
    UTF8.encode(canonicalJson(payload)),
  );
  return { payload, signature: bytesToBase64Url(new Uint8Array(signature)) };
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

function encodeCode(prefix: string, value: unknown): string {
  return `${prefix}.${bytesToBase64Url(UTF8.encode(canonicalJson(value)))}`;
}

function decodeCode(prefix: string, code: string): unknown {
  const normalized = code.trim();
  if (!normalized.startsWith(`${prefix}.`)) throw new Error("配对码格式无效");
  try {
    return JSON.parse(
      UTF8_DECODER.decode(base64UrlToBytes(normalized.slice(prefix.length + 1))),
    );
  } catch {
    throw new Error("配对码格式无效");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseSignedPairingRequest(value: unknown): SignedPairingRequest {
  if (
    !isRecord(value) || !isRecord(value.payload) || typeof value.signature !== "string"
  ) {
    throw new Error("配对请求格式无效");
  }
  const payload = value.payload;
  if (
    payload.version !== PRIVATE_MESH_VERSION ||
    typeof payload.requestId !== "string" ||
    typeof payload.nodeId !== "string" ||
    typeof payload.nodeName !== "string" ||
    !isRecord(payload.signingPublicKey) ||
    !isRecord(payload.encryptionPublicKey) ||
    typeof payload.createdAt !== "string" ||
    typeof payload.expiresAt !== "string" ||
    typeof payload.nonce !== "string"
  ) throw new Error("配对请求格式无效");
  return value as unknown as SignedPairingRequest;
}

async function verifyPairingRequest(request: SignedPairingRequest): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      request.payload.signingPublicKey,
      ECDSA_ALGORITHM,
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlToBytes(request.signature),
      UTF8.encode(canonicalJson(request.payload)),
    );
  } catch {
    return false;
  }
}

async function pairingVerificationCode(request: SignedPairingRequest): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", UTF8.encode(canonicalJson(request))),
  );
  const numeric = new DataView(digest.buffer).getUint32(0) % 1_000_000;
  return numeric.toString().padStart(6, "0");
}

async function encryptMeshKey(
  meshKey: string,
  recipientPublicKey: JsonWebKey,
  certificate: MembershipCertificate,
): Promise<MeshKeyEnvelope> {
  const recipient = await crypto.subtle.importKey(
    "jwk",
    recipientPublicKey,
    ECDH_ALGORITHM,
    false,
    [],
  );
  const ephemeral = await crypto.subtle.generateKey(ECDH_ALGORITHM, true, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: "ECDH", public: recipient },
    ephemeral.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: UTF8.encode(canonicalJson(certificate)),
    },
    key,
    base64UrlToBytes(meshKey),
  );
  return {
    algorithm: "ECDH-P256+A256GCM",
    ephemeralPublicKey: await crypto.subtle.exportKey("jwk", ephemeral.publicKey),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

async function decryptMeshKey(
  envelope: MeshKeyEnvelope,
  encryptionKey: PrivateMeshKeyRef,
  certificate: MembershipCertificate,
  keyVault: PrivateMeshKeyVault,
): Promise<string> {
  if (envelope.algorithm !== "ECDH-P256+A256GCM") {
    throw new Error("配对响应使用了不支持的加密算法");
  }
  try {
    const key = await keyVault.deriveAesKey(
      encryptionKey,
      envelope.ephemeralPublicKey,
      ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(envelope.iv),
        additionalData: UTF8.encode(canonicalJson(certificate)),
      },
      key,
      base64UrlToBytes(envelope.ciphertext),
    );
    return bytesToBase64Url(new Uint8Array(plaintext));
  } catch {
    throw new Error("无法解密私有网络密钥");
  }
}

export async function verifyMembershipCertificate(
  certificate: MembershipCertificate,
  descriptor: PrivateMeshDescriptor,
): Promise<boolean> {
  if (
    descriptor.version !== PRIVATE_MESH_VERSION ||
    certificate.payload.version !== PRIVATE_MESH_VERSION ||
    certificate.payload.meshId !== descriptor.meshId ||
    certificate.payload.meshEpoch !== descriptor.epoch ||
    certificate.payload.issuerKeyId !== descriptor.rootKeyId
  ) return false;
  try {
    const [meshId, rootKeyId, nodeId] = await Promise.all([
      digestId("mesh", descriptor.rootPublicKey),
      digestId("root", descriptor.rootPublicKey),
      digestId("node", certificate.payload.signingPublicKey),
    ]);
    if (
      meshId !== descriptor.meshId || rootKeyId !== descriptor.rootKeyId ||
      nodeId !== certificate.payload.nodeId
    ) return false;
    const key = await crypto.subtle.importKey(
      "jwk",
      descriptor.rootPublicKey,
      ECDSA_ALGORITHM,
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlToBytes(certificate.signature),
      UTF8.encode(canonicalJson(certificate.payload)),
    );
  } catch {
    return false;
  }
}

export async function signPrivateMeshMessage(
  state: LocalPrivateMeshState,
  message: unknown,
  keyVault: PrivateMeshKeyVault,
): Promise<string> {
  const signature = await keyVault.sign(
    state.localNode.signingKey,
    UTF8.encode(canonicalJson(message)),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyPrivateMeshMessage(
  state: LocalPrivateMeshState,
  senderNodeId: string,
  message: unknown,
  signature: string,
): Promise<boolean> {
  const membership = state.members.find((member) =>
    member.payload.nodeId === senderNodeId
  );
  if (
    !membership ||
    !await verifyMembershipCertificate(membership, state.descriptor)
  ) return false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      membership.payload.signingPublicKey,
      ECDSA_ALGORITHM,
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlToBytes(signature),
      UTF8.encode(canonicalJson(message)),
    );
  } catch {
    return false;
  }
}

export async function createPrivateMesh(input: {
  meshName: string;
  nodeName: string;
  recoveryPassphrase: string;
  now?: string;
}, keyVault: PrivateMeshKeyVault): Promise<CreatedPrivateMesh> {
  const now = input.now ?? new Date().toISOString();
  assertIsoDate(now);
  const meshName = normalizedName(input.meshName, "私有网络名称");
  const nodeName = normalizedName(input.nodeName, "设备名称");
  const [root, signing, encryption] = await Promise.all([
    keyVault.generateSigningKey({ exportForRecovery: true }),
    keyVault.generateSigningKey(),
    keyVault.generateEncryptionKey(),
  ]);
  if (!root.recoveryPrivateKey) throw new Error("无法生成所有者恢复密钥");
  const [meshId, rootKeyId, nodeId] = await Promise.all([
    digestId("mesh", root.publicKey),
    digestId("root", root.publicKey),
    digestId("node", signing.publicKey),
  ]);
  const descriptor: PrivateMeshDescriptor = {
    version: PRIVATE_MESH_VERSION,
    meshId,
    name: meshName,
    epoch: 1,
    rootKeyId,
    rootPublicKey: root.publicKey,
    createdAt: now,
  };
  const payload: MembershipCertificatePayload = {
    version: PRIVATE_MESH_VERSION,
    meshId,
    meshEpoch: descriptor.epoch,
    nodeId,
    nodeName,
    role: "owner",
    capabilities: { invite: true, store: true },
    signingPublicKey: signing.publicKey,
    encryptionPublicKey: encryption.publicKey,
    pairingRequestId: null,
    issuedAt: now,
    issuerKeyId: rootKeyId,
  };
  const certificate = await signMembershipPayload(payload, root.ref, keyVault);
  const meshKey = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const localNode: LocalPrivateMeshNode = {
    ...payload,
    signingKey: signing.ref,
    encryptionKey: encryption.ref,
    certificate,
  };
  const state: LocalPrivateMeshState = {
    descriptor,
    localNode,
    members: [certificate],
    meshKey,
    rootSigningKey: root.ref,
    usedPairingRequestIds: [],
    pendingEpochUpdates: [],
  };
  return {
    state,
    recoveryCode: await encryptPrivateMeshRecoveryCode({
      version: PRIVATE_MESH_VERSION,
      descriptor,
      rootPrivateKey: root.recoveryPrivateKey,
      meshKey,
    }, input.recoveryPassphrase),
  };
}

export async function createPairingRequest(input: {
  nodeName: string;
  now?: string;
  expiresInMs?: number;
}, keyVault: PrivateMeshKeyVault): Promise<PendingPairingRequest> {
  const now = input.now ?? new Date().toISOString();
  assertIsoDate(now);
  const expiresInMs = input.expiresInMs ?? 10 * 60 * 1000;
  if (
    !Number.isFinite(expiresInMs) || expiresInMs < 60_000 || expiresInMs > 3_600_000
  ) {
    throw new Error("配对有效期必须在 1 分钟到 1 小时之间");
  }
  const nodeName = normalizedName(input.nodeName, "设备名称");
  const [signing, encryption] = await Promise.all([
    keyVault.generateSigningKey(),
    keyVault.generateEncryptionKey(),
  ]);
  const payload: PairingRequestPayload = {
    version: PRIVATE_MESH_VERSION,
    requestId: crypto.randomUUID(),
    nodeId: await digestId("node", signing.publicKey),
    nodeName,
    signingPublicKey: signing.publicKey,
    encryptionPublicKey: encryption.publicKey,
    createdAt: now,
    expiresAt: new Date(Date.parse(now) + expiresInMs).toISOString(),
    nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
  const request = await signPairingRequest(payload, signing.ref, keyVault);
  return {
    request,
    requestCode: encodeCode("openfx-pair-v1", request),
    verificationCode: await pairingVerificationCode(request),
    identity: {
      signingKey: signing.ref,
      encryptionKey: encryption.ref,
    },
  };
}

export async function approvePairingRequest(
  state: LocalPrivateMeshState,
  requestCode: string,
  keyVault: PrivateMeshKeyVault,
  options: { now?: string } = {},
): Promise<
  Readonly<{
    state: LocalPrivateMeshState;
    approvalCode: string;
    verificationCode: string;
  }>
> {
  if (
    state.localNode.role !== "owner" ||
    !state.localNode.capabilities.invite ||
    !state.rootSigningKey
  ) throw new Error("当前设备没有邀请新设备的权限");
  const request = parseSignedPairingRequest(decodeCode("openfx-pair-v1", requestCode));
  const now = options.now ?? new Date().toISOString();
  assertIsoDate(now);
  if (state.usedPairingRequestIds.includes(request.payload.requestId)) {
    throw new Error("配对请求已经使用");
  }
  if (Date.parse(request.payload.expiresAt) < Date.parse(now)) {
    throw new Error("配对请求已经过期");
  }
  if (Date.parse(request.payload.createdAt) > Date.parse(now) + 60_000) {
    throw new Error("配对请求时间无效");
  }
  if (!await verifyPairingRequest(request)) throw new Error("配对请求签名无效");
  if (
    await digestId("node", request.payload.signingPublicKey) !== request.payload.nodeId
  ) throw new Error("配对请求设备身份无效");
  if (
    state.members.some((member) => member.payload.nodeId === request.payload.nodeId)
  ) throw new Error("该设备已经加入私有网络");

  const payload: MembershipCertificatePayload = {
    version: PRIVATE_MESH_VERSION,
    meshId: state.descriptor.meshId,
    meshEpoch: state.descriptor.epoch,
    nodeId: request.payload.nodeId,
    nodeName: request.payload.nodeName,
    role: "member",
    capabilities: { invite: false, store: true },
    signingPublicKey: request.payload.signingPublicKey,
    encryptionPublicKey: request.payload.encryptionPublicKey,
    pairingRequestId: request.payload.requestId,
    issuedAt: now,
    issuerKeyId: state.descriptor.rootKeyId,
  };
  const certificate = await signMembershipPayload(
    payload,
    state.rootSigningKey,
    keyVault,
  );
  const members = [...state.members, certificate];
  const approval: PairingApproval = {
    version: PRIVATE_MESH_VERSION,
    descriptor: state.descriptor,
    certificate,
    members,
    meshKeyEnvelope: await encryptMeshKey(
      state.meshKey,
      request.payload.encryptionPublicKey,
      certificate,
    ),
  };
  return {
    state: {
      ...state,
      members,
      usedPairingRequestIds: [
        ...state.usedPairingRequestIds,
        request.payload.requestId,
      ],
    },
    approvalCode: encodeCode("openfx-approve-v1", approval),
    verificationCode: await pairingVerificationCode(request),
  };
}

function parsePairingApproval(value: unknown): PairingApproval {
  if (
    !isRecord(value) ||
    value.version !== PRIVATE_MESH_VERSION ||
    !isRecord(value.descriptor) ||
    !isRecord(value.certificate) ||
    !Array.isArray(value.members) ||
    !isRecord(value.meshKeyEnvelope)
  ) throw new Error("配对响应格式无效");
  return value as unknown as PairingApproval;
}

export async function acceptPairingApproval(
  pending: PendingPairingRequest,
  approvalCode: string,
  keyVault: PrivateMeshKeyVault,
): Promise<LocalPrivateMeshState> {
  const approval = parsePairingApproval(
    decodeCode("openfx-approve-v1", approvalCode),
  );
  const payload = approval.certificate.payload;
  const request = pending.request.payload;
  if (
    !await verifyPairingRequest(pending.request) ||
    await digestId("node", request.signingPublicKey) !== request.nodeId
  ) throw new Error("本机配对请求签名无效");
  if (
    payload.pairingRequestId !== request.requestId ||
    payload.nodeId !== request.nodeId ||
    canonicalJson(payload.signingPublicKey) !==
      canonicalJson(request.signingPublicKey) ||
    canonicalJson(payload.encryptionPublicKey) !==
      canonicalJson(request.encryptionPublicKey)
  ) throw new Error("配对响应不属于当前设备");
  if (!await verifyMembershipCertificate(approval.certificate, approval.descriptor)) {
    throw new Error("成员证书签名无效");
  }
  const memberChecks = await Promise.all(
    approval.members.map((member) =>
      verifyMembershipCertificate(member, approval.descriptor)
    ),
  );
  if (memberChecks.some((valid) => !valid)) throw new Error("成员列表包含无效证书");
  const memberIds = approval.members.map((member) => member.payload.nodeId);
  if (
    new Set(memberIds).size !== memberIds.length ||
    !approval.members.some((member) => member.payload.role === "owner")
  ) throw new Error("成员列表结构无效");
  if (!approval.members.some((member) => member.payload.nodeId === payload.nodeId)) {
    throw new Error("成员列表缺少当前设备");
  }
  const meshKey = await decryptMeshKey(
    approval.meshKeyEnvelope,
    pending.identity.encryptionKey,
    approval.certificate,
    keyVault,
  );
  return {
    descriptor: approval.descriptor,
    localNode: {
      ...payload,
      signingKey: pending.identity.signingKey,
      encryptionKey: pending.identity.encryptionKey,
      certificate: approval.certificate,
    },
    members: approval.members,
    meshKey,
    usedPairingRequestIds: [],
    pendingEpochUpdates: [],
  };
}

function parsePrivateMeshEpochUpdate(value: unknown): PrivateMeshEpochUpdate {
  if (
    !isRecord(value) || value.version !== PRIVATE_MESH_VERSION ||
    !isRecord(value.descriptor) || typeof value.descriptorSignature !== "string" ||
    !isRecord(value.certificate) || !Array.isArray(value.members) ||
    !isRecord(value.meshKeyEnvelope)
  ) throw new Error("密钥更新码格式无效");
  return value as unknown as PrivateMeshEpochUpdate;
}

export async function revokePrivateMeshMember(
  state: LocalPrivateMeshState,
  revokedNodeId: string,
  keyVault: PrivateMeshKeyVault,
  options: { now?: string } = {},
): Promise<LocalPrivateMeshState> {
  if (
    state.localNode.role !== "owner" || !state.localNode.capabilities.invite ||
    !state.rootSigningKey
  ) throw new Error("当前设备没有撤销成员的权限");
  if (revokedNodeId === state.localNode.nodeId) {
    throw new Error("不能撤销当前所有者设备");
  }
  const revoked = state.members.find((member) =>
    member.payload.nodeId === revokedNodeId
  );
  if (!revoked) throw new Error("要撤销的设备不是当前网络成员");
  if (revoked.payload.role === "owner") throw new Error("不能撤销所有者设备");
  const now = options.now ?? new Date().toISOString();
  assertIsoDate(now);
  const descriptor: PrivateMeshDescriptor = {
    ...state.descriptor,
    epoch: state.descriptor.epoch + 1,
  };
  const remaining = state.members.filter((member) =>
    member.payload.nodeId !== revokedNodeId
  );
  const members = await Promise.all(remaining.map((member) =>
    signMembershipPayload(
      { ...member.payload, meshEpoch: descriptor.epoch, issuedAt: now },
      state.rootSigningKey!,
      keyVault,
    )
  ));
  const localCertificate = members.find((member) =>
    member.payload.nodeId === state.localNode.nodeId
  );
  if (!localCertificate) throw new Error("轮换后的成员列表缺少当前设备");
  const meshKey = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const descriptorSignature = await signRootValue(
    descriptor,
    state.rootSigningKey,
    keyVault,
  );
  const pendingEpochUpdates = await Promise.all(
    members
      .filter((member) => member.payload.nodeId !== state.localNode.nodeId)
      .map(async (certificate) => ({
        nodeId: certificate.payload.nodeId,
        nodeName: certificate.payload.nodeName,
        updateCode: encodeCode(
          "openfx-epoch-v1",
          {
            version: PRIVATE_MESH_VERSION,
            descriptor,
            descriptorSignature,
            certificate,
            members,
            meshKeyEnvelope: await encryptMeshKey(
              meshKey,
              certificate.payload.encryptionPublicKey,
              certificate,
            ),
          } satisfies PrivateMeshEpochUpdate,
        ),
      })),
  );
  return {
    ...state,
    descriptor,
    localNode: {
      ...localCertificate.payload,
      signingKey: state.localNode.signingKey,
      encryptionKey: state.localNode.encryptionKey,
      certificate: localCertificate,
    },
    members,
    meshKey,
    pendingEpochUpdates,
  };
}

export async function acceptPrivateMeshEpochUpdate(
  state: LocalPrivateMeshState,
  updateCode: string,
  keyVault: PrivateMeshKeyVault,
): Promise<LocalPrivateMeshState> {
  const update = parsePrivateMeshEpochUpdate(
    decodeCode("openfx-epoch-v1", updateCode),
  );
  if (
    update.descriptor.meshId !== state.descriptor.meshId ||
    update.descriptor.rootKeyId !== state.descriptor.rootKeyId ||
    canonicalJson(update.descriptor.rootPublicKey) !==
      canonicalJson(state.descriptor.rootPublicKey)
  ) throw new Error("密钥更新码不属于当前私有网络");
  if (update.descriptor.epoch <= state.descriptor.epoch) {
    throw new Error("密钥更新码不是更新的代次");
  }
  if (
    !await verifyRootValue(
      update.descriptor,
      update.descriptorSignature,
      update.descriptor,
    )
  ) throw new Error("密钥更新描述签名无效");
  const certificate = update.certificate;
  if (
    certificate.payload.nodeId !== state.localNode.nodeId ||
    canonicalJson(certificate.payload.signingPublicKey) !==
      canonicalJson(state.localNode.signingPublicKey) ||
    canonicalJson(certificate.payload.encryptionPublicKey) !==
      canonicalJson(state.localNode.encryptionPublicKey)
  ) throw new Error("密钥更新码不属于当前设备");
  const checks = await Promise.all(
    update.members.map((member) =>
      verifyMembershipCertificate(member, update.descriptor)
    ),
  );
  const memberIds = update.members.map((member) => member.payload.nodeId);
  if (
    update.members.length === 0 || checks.some((valid) => !valid) ||
    new Set(memberIds).size !== memberIds.length ||
    update.members.filter((member) => member.payload.role === "owner").length !== 1
  ) throw new Error("密钥更新成员列表无效");
  const matchingCertificate = update.members.find((member) =>
    member.payload.nodeId === certificate.payload.nodeId &&
    member.signature === certificate.signature &&
    canonicalJson(member.payload) === canonicalJson(certificate.payload)
  );
  if (!matchingCertificate) throw new Error("密钥更新成员列表缺少当前设备");
  const meshKey = await decryptMeshKey(
    update.meshKeyEnvelope,
    state.localNode.encryptionKey,
    certificate,
    keyVault,
  );
  return {
    ...state,
    descriptor: update.descriptor,
    localNode: {
      ...certificate.payload,
      signingKey: state.localNode.signingKey,
      encryptionKey: state.localNode.encryptionKey,
      certificate,
    },
    members: update.members,
    meshKey,
    pendingEpochUpdates: [],
  };
}
