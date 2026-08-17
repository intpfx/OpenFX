import { dir, file, write } from "opfs-tools";

import {
  type LocalPrivateMeshState,
  type MembershipCertificatePayload,
  type PendingPairingRequest,
  type SignedPairingRequest,
  verifyMembershipCertificate,
} from "./private-mesh.ts";
import {
  type PrivateMeshKeyRef,
  type PrivateMeshKeyVault,
} from "./private-mesh-key-vault.ts";

const PRIVATE_MESH_STORE_VERSION = 2 as const;
const LEGACY_PRIVATE_MESH_STORE_VERSION = 1 as const;
const PRIVATE_MESH_ROOT = "/openfx-private-mesh";
const PRIVATE_MESH_STATE_PATH = `${PRIVATE_MESH_ROOT}/state.json`;
const PRIVATE_MESH_V1_BACKUP_PATH = `${PRIVATE_MESH_ROOT}/state.v1-backup.json`;

export type PrivateMeshLocalRecord = {
  version: typeof PRIVATE_MESH_STORE_VERSION;
  state: LocalPrivateMeshState | null;
  pendingPairing: PendingPairingRequest | null;
};

type LegacyLocalPrivateMeshNode = MembershipCertificatePayload & {
  signingPrivateKey: JsonWebKey;
  encryptionPrivateKey: JsonWebKey;
  certificate: LocalPrivateMeshState["localNode"]["certificate"];
};

type LegacyLocalPrivateMeshState =
  & Omit<
    LocalPrivateMeshState,
    "localNode" | "rootSigningKey"
  >
  & {
    localNode: LegacyLocalPrivateMeshNode;
    rootPrivateKey?: JsonWebKey;
  };

type LegacyPendingPairingRequest = Omit<PendingPairingRequest, "identity"> & {
  identity: {
    signingPrivateKey: JsonWebKey;
    encryptionPrivateKey: JsonWebKey;
  };
};

type LegacyPrivateMeshLocalRecord = {
  version: typeof LEGACY_PRIVATE_MESH_STORE_VERSION;
  state: LegacyLocalPrivateMeshState | null;
  pendingPairing: LegacyPendingPairingRequest | null;
};

export type PrivateMeshStore = ReturnType<typeof createOpfsPrivateMeshStore>;

export function createEmptyPrivateMeshLocalRecord(): PrivateMeshLocalRecord {
  return {
    version: PRIVATE_MESH_STORE_VERSION,
    state: null,
    pendingPairing: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksLikeKeyRef(value: unknown): value is PrivateMeshKeyRef {
  return isRecord(value) && value.version === 1 && typeof value.id === "string" &&
    (value.algorithm === "ECDSA-P256" || value.algorithm === "ECDH-P256");
}

function looksLikePendingEpochUpdate(value: unknown): boolean {
  return isRecord(value) && typeof value.nodeId === "string" &&
    typeof value.nodeName === "string" && typeof value.updateCode === "string";
}

function looksLikePrivateMeshState(value: unknown): value is LocalPrivateMeshState {
  if (!isRecord(value) || !isRecord(value.localNode)) return false;
  return isRecord(value.descriptor) &&
    Array.isArray(value.members) &&
    typeof value.meshKey === "string" &&
    Array.isArray(value.usedPairingRequestIds) &&
    (value.pendingEpochUpdates === undefined ||
      (Array.isArray(value.pendingEpochUpdates) &&
        value.pendingEpochUpdates.every(looksLikePendingEpochUpdate))) &&
    looksLikeKeyRef(value.localNode.signingKey) &&
    looksLikeKeyRef(value.localNode.encryptionKey) &&
    (value.rootSigningKey === undefined || looksLikeKeyRef(value.rootSigningKey));
}

function looksLikePendingPairing(value: unknown): value is PendingPairingRequest {
  if (!isRecord(value) || !isRecord(value.identity)) return false;
  return isRecord(value.request) &&
    typeof value.requestCode === "string" &&
    typeof value.verificationCode === "string" &&
    looksLikeKeyRef(value.identity.signingKey) &&
    looksLikeKeyRef(value.identity.encryptionKey);
}

function looksLikeLegacyState(value: unknown): value is LegacyLocalPrivateMeshState {
  if (!isRecord(value) || !isRecord(value.localNode)) return false;
  return isRecord(value.descriptor) &&
    Array.isArray(value.members) &&
    typeof value.meshKey === "string" &&
    Array.isArray(value.usedPairingRequestIds) &&
    isRecord(value.localNode.signingPrivateKey) &&
    isRecord(value.localNode.encryptionPrivateKey) &&
    (value.rootPrivateKey === undefined || isRecord(value.rootPrivateKey));
}

function looksLikeLegacyPending(
  value: unknown,
): value is LegacyPendingPairingRequest {
  if (!isRecord(value) || !isRecord(value.identity)) return false;
  return isRecord(value.request) &&
    typeof value.requestCode === "string" &&
    typeof value.verificationCode === "string" &&
    isRecord(value.identity.signingPrivateKey) &&
    isRecord(value.identity.encryptionPrivateKey);
}

export function parsePrivateMeshLocalRecord(value: unknown): PrivateMeshLocalRecord {
  if (!isRecord(value) || value.version !== PRIVATE_MESH_STORE_VERSION) {
    throw new Error("私有网络状态格式无效");
  }
  if (value.state !== null && !looksLikePrivateMeshState(value.state)) {
    throw new Error("私有网络状态格式无效");
  }
  if (value.pendingPairing !== null && !looksLikePendingPairing(value.pendingPairing)) {
    throw new Error("待完成配对状态格式无效");
  }
  const record = value as unknown as PrivateMeshLocalRecord;
  return {
    ...record,
    state: record.state
      ? {
        ...record.state,
        pendingEpochUpdates: record.state.pendingEpochUpdates ?? [],
      }
      : null,
  };
}

function parseLegacyPrivateMeshLocalRecord(
  value: unknown,
): LegacyPrivateMeshLocalRecord {
  if (!isRecord(value) || value.version !== LEGACY_PRIVATE_MESH_STORE_VERSION) {
    throw new Error("私有网络状态格式无效");
  }
  if (value.state !== null && !looksLikeLegacyState(value.state)) {
    throw new Error("私有网络状态格式无效");
  }
  if (value.pendingPairing !== null && !looksLikeLegacyPending(value.pendingPairing)) {
    throw new Error("待完成配对状态格式无效");
  }
  return value as unknown as LegacyPrivateMeshLocalRecord;
}

function signingKeyId(nodeId: string): string {
  return `legacy_${nodeId}_signing`;
}

function encryptionKeyId(nodeId: string): string {
  return `legacy_${nodeId}_encryption`;
}

export async function migratePrivateMeshLocalRecord(
  value: unknown,
  keyVault: PrivateMeshKeyVault,
): Promise<PrivateMeshLocalRecord> {
  if (isRecord(value) && value.version === PRIVATE_MESH_STORE_VERSION) {
    return parsePrivateMeshLocalRecord(value);
  }
  const legacy = parseLegacyPrivateMeshLocalRecord(value);
  let state: LocalPrivateMeshState | null = null;
  if (legacy.state) {
    const {
      signingPrivateKey,
      encryptionPrivateKey,
      certificate,
      ...payload
    } = legacy.state.localNode;
    const [signingKey, encryptionKey, rootSigningKey] = await Promise.all([
      keyVault.importSigningKey(
        signingKeyId(payload.nodeId),
        signingPrivateKey,
        payload.signingPublicKey,
      ),
      keyVault.importEncryptionKey(
        encryptionKeyId(payload.nodeId),
        encryptionPrivateKey,
        payload.encryptionPublicKey,
      ),
      legacy.state.rootPrivateKey
        ? keyVault.importSigningKey(
          `legacy_${legacy.state.descriptor.rootKeyId}_root`,
          legacy.state.rootPrivateKey,
          legacy.state.descriptor.rootPublicKey,
        )
        : Promise.resolve(undefined),
    ]);
    state = {
      descriptor: legacy.state.descriptor,
      localNode: { ...payload, signingKey, encryptionKey, certificate },
      members: legacy.state.members,
      meshKey: legacy.state.meshKey,
      rootSigningKey,
      usedPairingRequestIds: legacy.state.usedPairingRequestIds,
      pendingEpochUpdates: [],
    };
  }

  let pendingPairing: PendingPairingRequest | null = null;
  if (legacy.pendingPairing) {
    const request = legacy.pendingPairing.request as SignedPairingRequest;
    const [signingKey, encryptionKey] = await Promise.all([
      keyVault.importSigningKey(
        signingKeyId(request.payload.nodeId),
        legacy.pendingPairing.identity.signingPrivateKey,
        request.payload.signingPublicKey,
      ),
      keyVault.importEncryptionKey(
        encryptionKeyId(request.payload.nodeId),
        legacy.pendingPairing.identity.encryptionPrivateKey,
        request.payload.encryptionPublicKey,
      ),
    ]);
    pendingPairing = {
      request: legacy.pendingPairing.request,
      requestCode: legacy.pendingPairing.requestCode,
      verificationCode: legacy.pendingPairing.verificationCode,
      identity: { signingKey, encryptionKey },
    };
  }
  return { version: PRIVATE_MESH_STORE_VERSION, state, pendingPairing };
}

function localCertificateMatchesState(state: LocalPrivateMeshState): boolean {
  const { signingKey: _signing, encryptionKey: _encryption, certificate, ...payload } =
    state.localNode;
  return JSON.stringify(payload) === JSON.stringify(certificate.payload) &&
    state.members.some((member) =>
      member.payload.nodeId === state.localNode.nodeId &&
      member.signature === certificate.signature
    );
}

export async function validatePrivateMeshLocalRecord(
  record: PrivateMeshLocalRecord,
  keyVault: PrivateMeshKeyVault,
): Promise<void> {
  try {
    if (record.state) {
      const state = record.state;
      if (!localCertificateMatchesState(state)) {
        throw new Error("local certificate mismatch");
      }
      const checks = await Promise.all(
        state.members.map((member) =>
          verifyMembershipCertificate(member, state.descriptor)
        ),
      );
      if (checks.length === 0 || checks.some((valid) => !valid)) {
        throw new Error("invalid member certificate");
      }
      const memberIds = state.members.map((member) => member.payload.nodeId);
      if (
        !Number.isSafeInteger(state.descriptor.epoch) || state.descriptor.epoch < 1 ||
        new Set(memberIds).size !== memberIds.length ||
        state.members.filter((member) => member.payload.role === "owner").length !==
          1 ||
        !memberIds.includes(state.localNode.nodeId) ||
        new Set(state.usedPairingRequestIds).size !==
          state.usedPairingRequestIds.length
      ) throw new Error("invalid membership structure");
      const pendingNodeIds = state.pendingEpochUpdates.map((update) => update.nodeId);
      if (
        new Set(pendingNodeIds).size !== pendingNodeIds.length ||
        (state.pendingEpochUpdates.length > 0 &&
          (state.localNode.role !== "owner" || !state.rootSigningKey)) ||
        state.pendingEpochUpdates.some((update) => {
          const member = state.members.find((candidate) =>
            candidate.payload.nodeId === update.nodeId
          );
          return !member || update.nodeId === state.localNode.nodeId ||
            update.nodeName !== member.payload.nodeName ||
            !update.updateCode.startsWith("openfx-epoch-v1.");
        })
      ) throw new Error("invalid pending epoch update");
      // WebKit can stall when several IndexedDB records containing non-extractable
      // CryptoKeys are cloned concurrently after a cold WKWebView start.
      const signingMatches = await keyVault.matchesPublicKey(
        state.localNode.signingKey,
        state.localNode.signingPublicKey,
      );
      const encryptionMatches = await keyVault.matchesPublicKey(
        state.localNode.encryptionKey,
        state.localNode.encryptionPublicKey,
      );
      const rootMatches = state.rootSigningKey
        ? await keyVault.matchesPublicKey(
          state.rootSigningKey,
          state.descriptor.rootPublicKey,
        )
        : true;
      if (!signingMatches || !encryptionMatches || !rootMatches) {
        throw new Error("local key mismatch");
      }
    }
    if (record.pendingPairing) {
      const pending = record.pendingPairing;
      const signingMatches = await keyVault.matchesPublicKey(
        pending.identity.signingKey,
        pending.request.payload.signingPublicKey,
      );
      const encryptionMatches = await keyVault.matchesPublicKey(
        pending.identity.encryptionKey,
        pending.request.payload.encryptionPublicKey,
      );
      if (!signingMatches || !encryptionMatches) {
        throw new Error("pending key mismatch");
      }
    }
  } catch {
    throw new Error("私有网络成员证书或本机密钥无效");
  }
}

function assertOpfsAvailable(): void {
  if (!globalThis.navigator?.storage?.getDirectory) {
    throw new Error("当前浏览器不支持 OPFS，无法保存私有网络身份");
  }
}

export function createOpfsPrivateMeshStore(keyVault: PrivateMeshKeyVault) {
  return {
    async load(): Promise<PrivateMeshLocalRecord> {
      assertOpfsAvailable();
      await dir(PRIVATE_MESH_ROOT).create();
      const stored = file(PRIVATE_MESH_STATE_PATH, "r");
      if (!await stored.exists()) return createEmptyPrivateMeshLocalRecord();
      let parsed: unknown;
      let source: string;
      try {
        source = await stored.text();
        parsed = JSON.parse(source);
      } catch {
        throw new Error("私有网络状态已损坏，未进行自动覆盖");
      }
      try {
        const record = await migratePrivateMeshLocalRecord(parsed, keyVault);
        await validatePrivateMeshLocalRecord(record, keyVault);
        if (
          isRecord(parsed) &&
          parsed.version === LEGACY_PRIVATE_MESH_STORE_VERSION
        ) {
          const backup = file(PRIVATE_MESH_V1_BACKUP_PATH, "r");
          if (!await backup.exists()) {
            await write(PRIVATE_MESH_V1_BACKUP_PATH, source, { overwrite: false });
          }
          await write(PRIVATE_MESH_STATE_PATH, JSON.stringify(record), {
            overwrite: true,
          });
        }
        return record;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("私有网络成员")) {
          throw error;
        }
        throw new Error("私有网络状态迁移失败，未覆盖原身份");
      }
    },
    async save(record: PrivateMeshLocalRecord): Promise<void> {
      assertOpfsAvailable();
      await validatePrivateMeshLocalRecord(record, keyVault);
      await dir(PRIVATE_MESH_ROOT).create();
      await write(PRIVATE_MESH_STATE_PATH, JSON.stringify(record), {
        overwrite: true,
      });
    },
  };
}
