import { expect } from "@std/expect";

import {
  acceptPairingApproval,
  acceptPrivateMeshEpochUpdate,
  approvePairingRequest,
  createPairingRequest,
  createPrivateMesh,
  revokePrivateMeshMember,
  signPrivateMeshMessage,
  verifyMembershipCertificate,
  verifyPrivateMeshMessage,
} from "../src/file-library/private-mesh.ts";
import {
  migratePrivateMeshLocalRecord,
  parsePrivateMeshLocalRecord,
  validatePrivateMeshLocalRecord,
} from "../src/file-library/private-mesh-store.ts";
import { createMemoryPrivateMeshKeyVault } from "../src/file-library/private-mesh-key-vault.ts";
import {
  decryptPrivateMeshRecoveryCode,
  encryptPrivateMeshRecoveryCode,
} from "../src/file-library/private-mesh-recovery.ts";

const NOW = "2026-08-15T00:00:00.000Z";

Deno.test("private mesh vault keeps daily signing keys non-extractable", async () => {
  const vault = createMemoryPrivateMeshKeyVault();
  const generated = await vault.generateSigningKey({ exportForRecovery: true });
  const message = new TextEncoder().encode("openfx-private-mesh");
  const signature = await vault.sign(generated.ref, message);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    generated.publicKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );

  expect(generated.recoveryPrivateKey?.d).toBeTruthy();
  expect(await vault.describe(generated.ref)).toMatchObject({
    algorithm: "ECDSA-P256",
    extractable: false,
  });
  await expect(
    crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signature,
      message,
    ),
  ).resolves.toBe(true);
});

Deno.test("private mesh vault imports a legacy JWK without keeping it extractable", async () => {
  const legacy = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.exportKey("jwk", legacy.privateKey),
    crypto.subtle.exportKey("jwk", legacy.publicKey),
  ]);
  const vault = createMemoryPrivateMeshKeyVault();
  const ref = await vault.importSigningKey(
    "legacy-owner-signing",
    privateKey,
    publicKey,
  );

  expect(await vault.describe(ref)).toMatchObject({
    algorithm: "ECDSA-P256",
    extractable: false,
  });
  await expect(vault.matchesPublicKey(ref, publicKey)).resolves.toBe(true);
});

Deno.test("private mesh vault derives a shared key without exporting ECDH private keys", async () => {
  const senderVault = createMemoryPrivateMeshKeyVault();
  const recipientVault = createMemoryPrivateMeshKeyVault();
  const [sender, recipient] = await Promise.all([
    senderVault.generateEncryptionKey(),
    recipientVault.generateEncryptionKey(),
  ]);
  const [encryptKey, decryptKey] = await Promise.all([
    senderVault.deriveAesKey(sender.ref, recipient.publicKey, ["encrypt"]),
    recipientVault.deriveAesKey(recipient.ref, sender.publicKey, ["decrypt"]),
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const message = new TextEncoder().encode("distributed openfx");
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptKey,
    message,
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    decryptKey,
    ciphertext,
  );

  expect(new TextDecoder().decode(plaintext)).toBe("distributed openfx");
  expect(await senderVault.describe(sender.ref)).toMatchObject({
    algorithm: "ECDH-P256",
    extractable: false,
  });
  await expect(
    senderVault.matchesPublicKey(sender.ref, sender.publicKey),
  ).resolves.toBe(true);
});

Deno.test("private mesh recovery material is passphrase encrypted", async () => {
  const recovery = {
    version: 1,
    descriptor: { meshId: "mesh_test", name: "家庭文件网络" },
    rootPrivateKey: { kty: "EC", d: "root-private-material" },
    meshKey: "mesh-secret-material",
  };
  const encrypted = await encryptPrivateMeshRecoveryCode(
    recovery,
    "correct horse battery staple",
  );

  expect(encrypted).toMatch(/^openfx-recovery-v2\./u);
  expect(encrypted).not.toContain("root-private-material");
  await expect(
    decryptPrivateMeshRecoveryCode(encrypted, "wrong recovery phrase"),
  ).rejects.toThrow("恢复码或恢复口令无效");
  await expect(
    decryptPrivateMeshRecoveryCode(encrypted, "correct horse battery staple"),
  ).resolves.toEqual(recovery);
});

Deno.test("new private mesh state stores key references and an encrypted recovery code", async () => {
  const vault = createMemoryPrivateMeshKeyVault();
  const created = await createPrivateMesh({
    meshName: "我的文件网络",
    nodeName: "MacBook",
    recoveryPassphrase: "a passphrase only the owner knows",
    now: NOW,
  }, vault);

  expect(created.state.localNode.signingKey.algorithm).toBe("ECDSA-P256");
  expect(created.state.localNode.encryptionKey.algorithm).toBe("ECDH-P256");
  expect(created.state.rootSigningKey?.algorithm).toBe("ECDSA-P256");
  expect(created.recoveryCode).toMatch(/^openfx-recovery-v2\./u);
  expect(JSON.stringify(created.state)).not.toContain('"d":');
  const recovery = await decryptPrivateMeshRecoveryCode<{
    rootPrivateKey: JsonWebKey;
  }>(created.recoveryCode, "a passphrase only the owner knows");
  expect(recovery.rootPrivateKey.d).toBeTruthy();
});

Deno.test("legacy pending pairing keys migrate out of JSON into the vault", async () => {
  const [signingPair, encryptionPair] = await Promise.all([
    crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    ),
    crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey"],
    ),
  ]);
  const [
    signingPrivateKey,
    signingPublicKey,
    encryptionPrivateKey,
    encryptionPublicKey,
  ] = await Promise.all([
    crypto.subtle.exportKey("jwk", signingPair.privateKey),
    crypto.subtle.exportKey("jwk", signingPair.publicKey),
    crypto.subtle.exportKey("jwk", encryptionPair.privateKey),
    crypto.subtle.exportKey("jwk", encryptionPair.publicKey),
  ]);
  const legacy = {
    version: 1,
    state: null,
    pendingPairing: {
      request: {
        payload: {
          version: 1,
          requestId: "legacy-request",
          nodeId: "node_legacy",
          nodeName: "旧设备",
          signingPublicKey,
          encryptionPublicKey,
          createdAt: NOW,
          expiresAt: "2026-08-15T00:10:00.000Z",
          nonce: "legacy-nonce",
        },
        signature: "legacy-signature",
      },
      requestCode: "openfx-pair-v1.legacy",
      verificationCode: "123456",
      identity: { signingPrivateKey, encryptionPrivateKey },
    },
  };
  const vault = createMemoryPrivateMeshKeyVault();
  const migrated = await migratePrivateMeshLocalRecord(legacy, vault);

  expect(migrated.version).toBe(2);
  expect(JSON.stringify(migrated)).not.toContain('"d":');
  expect(migrated.pendingPairing?.identity.signingKey.algorithm).toBe(
    "ECDSA-P256",
  );
  await expect(
    validatePrivateMeshLocalRecord(migrated, vault),
  ).resolves.toBeUndefined();
});

Deno.test("first device creates a private mesh with a verifiable owner membership", async () => {
  const vault = createMemoryPrivateMeshKeyVault();
  const created = await createPrivateMesh({
    meshName: "我的文件网络",
    nodeName: "MacBook",
    recoveryPassphrase: "a passphrase only the owner knows",
    now: NOW,
  }, vault);

  expect(created.state.descriptor.name).toBe("我的文件网络");
  expect(created.state.localNode.role).toBe("owner");
  expect(created.state.localNode.capabilities).toEqual({
    invite: true,
    store: true,
  });
  expect(created.state.members).toHaveLength(1);
  expect(created.recoveryCode).not.toContain(created.state.descriptor.meshId);
  await expect(
    verifyMembershipCertificate(
      created.state.localNode.certificate,
      created.state.descriptor,
    ),
  ).resolves.toBe(true);
});

Deno.test("an owner pairs a new device without an account or central authority", async () => {
  const ownerVault = createMemoryPrivateMeshKeyVault();
  const joiningVault = createMemoryPrivateMeshKeyVault();
  const owner = await createPrivateMesh({
    meshName: "我的文件网络",
    nodeName: "MacBook",
    recoveryPassphrase: "a passphrase only the owner knows",
    now: NOW,
  }, ownerVault);
  const pending = await createPairingRequest({
    nodeName: "iPhone",
    now: "2026-08-15T00:01:00.000Z",
  }, joiningVault);

  const approved = await approvePairingRequest(
    owner.state,
    pending.requestCode,
    ownerVault,
    {
      now: "2026-08-15T00:02:00.000Z",
    },
  );
  const joined = await acceptPairingApproval(
    pending,
    approved.approvalCode,
    joiningVault,
  );

  expect(approved.verificationCode).toBe(pending.verificationCode);
  expect(joined.descriptor.meshId).toBe(owner.state.descriptor.meshId);
  expect(joined.meshKey).toBe(owner.state.meshKey);
  expect(joined.localNode.nodeName).toBe("iPhone");
  expect(joined.localNode.role).toBe("member");
  expect(joined.localNode.capabilities.invite).toBe(false);
  expect(joined.members).toHaveLength(2);
  await expect(
    verifyMembershipCertificate(joined.localNode.certificate, joined.descriptor),
  ).resolves.toBe(true);
  await expect(
    approvePairingRequest(approved.state, pending.requestCode, ownerVault, {
      now: "2026-08-15T00:03:00.000Z",
    }),
  ).rejects.toThrow("配对请求已经使用");

  const message = { kind: "webrtc-offer", sessionId: "session-1" };
  const signature = await signPrivateMeshMessage(
    joined,
    message,
    joiningVault,
  );
  await expect(
    verifyPrivateMeshMessage(
      approved.state,
      joined.localNode.nodeId,
      message,
      signature,
    ),
  ).resolves.toBe(true);
  await expect(
    verifyPrivateMeshMessage(
      approved.state,
      joined.localNode.nodeId,
      { ...message, sessionId: "tampered" },
      signature,
    ),
  ).resolves.toBe(false);
});

Deno.test("an owner revokes a member and rotates the remaining mesh to a new epoch", async () => {
  const ownerVault = createMemoryPrivateMeshKeyVault();
  const revokedVault = createMemoryPrivateMeshKeyVault();
  const remainingVault = createMemoryPrivateMeshKeyVault();
  const owner = await createPrivateMesh({
    meshName: "家庭文件网络",
    nodeName: "Mac mini",
    recoveryPassphrase: "a passphrase only the owner knows",
    now: NOW,
  }, ownerVault);
  const revokedPending = await createPairingRequest({
    nodeName: "旧 iPad",
    now: "2026-08-15T00:01:00.000Z",
  }, revokedVault);
  const firstApproval = await approvePairingRequest(
    owner.state,
    revokedPending.requestCode,
    ownerVault,
    { now: "2026-08-15T00:02:00.000Z" },
  );
  const revokedState = await acceptPairingApproval(
    revokedPending,
    firstApproval.approvalCode,
    revokedVault,
  );
  const remainingPending = await createPairingRequest({
    nodeName: "新 iPhone",
    now: "2026-08-15T00:03:00.000Z",
  }, remainingVault);
  const secondApproval = await approvePairingRequest(
    firstApproval.state,
    remainingPending.requestCode,
    ownerVault,
    { now: "2026-08-15T00:04:00.000Z" },
  );
  const remainingState = await acceptPairingApproval(
    remainingPending,
    secondApproval.approvalCode,
    remainingVault,
  );

  const rotated = await revokePrivateMeshMember(
    secondApproval.state,
    revokedState.localNode.nodeId,
    ownerVault,
    { now: "2026-08-15T00:05:00.000Z" },
  );

  expect(rotated.descriptor.epoch).toBe(2);
  expect(rotated.meshKey).not.toBe(secondApproval.state.meshKey);
  expect(rotated.members.map((member) => member.payload.nodeName)).toEqual([
    "Mac mini",
    "新 iPhone",
  ]);
  expect(rotated.localNode.meshEpoch).toBe(2);
  expect(rotated.pendingEpochUpdates).toHaveLength(1);
  expect(rotated.pendingEpochUpdates[0]?.nodeId).toBe(
    remainingState.localNode.nodeId,
  );
  expect(rotated.pendingEpochUpdates[0]?.updateCode).toMatch(
    /^openfx-epoch-v1\./u,
  );

  const updatedRemaining = await acceptPrivateMeshEpochUpdate(
    remainingState,
    rotated.pendingEpochUpdates[0]!.updateCode,
    remainingVault,
  );
  expect(updatedRemaining.descriptor.epoch).toBe(2);
  expect(updatedRemaining.meshKey).toBe(rotated.meshKey);
  expect(updatedRemaining.members).toEqual(rotated.members);
  await expect(
    verifyMembershipCertificate(
      revokedState.localNode.certificate,
      updatedRemaining.descriptor,
    ),
  ).resolves.toBe(false);
  const invalidPendingRecord = {
    version: 2 as const,
    state: {
      ...rotated,
      pendingEpochUpdates: [{
        ...rotated.pendingEpochUpdates[0]!,
        nodeId: revokedState.localNode.nodeId,
      }],
    },
    pendingPairing: null,
  };
  await expect(
    validatePrivateMeshLocalRecord(invalidPendingRecord, ownerVault),
  ).rejects.toThrow("私有网络成员证书或本机密钥无效");
});

Deno.test("persisted mesh state survives JSON while certificate tampering is rejected", async () => {
  const vault = createMemoryPrivateMeshKeyVault();
  const created = await createPrivateMesh({
    meshName: "家庭文件网络",
    nodeName: "Mac mini",
    recoveryPassphrase: "a passphrase only the owner knows",
    now: NOW,
  }, vault);
  const pending = await createPairingRequest({
    nodeName: "iPad",
    now: NOW,
  }, vault);
  const record = parsePrivateMeshLocalRecord(JSON.parse(JSON.stringify({
    version: 2,
    state: created.state,
    pendingPairing: pending,
  })));

  await expect(
    validatePrivateMeshLocalRecord(record, vault),
  ).resolves.toBeUndefined();

  const tampered = structuredClone(record);
  if (!tampered.state) throw new Error("expected persisted mesh state");
  (tampered.state.localNode.certificate.payload as { nodeName: string }).nodeName =
    "攻击者设备";
  await expect(validatePrivateMeshLocalRecord(tampered, vault)).rejects.toThrow(
    "私有网络成员证书或本机密钥无效",
  );
});

Deno.test("persisted mesh validation reads key vault entries serially for WebKit", async () => {
  const vault = createMemoryPrivateMeshKeyVault();
  const created = await createPrivateMesh({
    meshName: "家庭文件网络",
    nodeName: "MacBook",
    recoveryPassphrase: "a passphrase only the owner knows",
    now: NOW,
  }, vault);
  let activeReads = 0;
  let maximumActiveReads = 0;
  const serialOnlyVault = {
    ...vault,
    async matchesPublicKey(...args: Parameters<typeof vault.matchesPublicKey>) {
      activeReads += 1;
      maximumActiveReads = Math.max(maximumActiveReads, activeReads);
      await Promise.resolve();
      try {
        return await vault.matchesPublicKey(...args);
      } finally {
        activeReads -= 1;
      }
    },
  };

  await expect(
    validatePrivateMeshLocalRecord({
      version: 2,
      state: created.state,
      pendingPairing: null,
    }, serialOnlyVault),
  ).resolves.toBeUndefined();
  expect(maximumActiveReads).toBe(1);
});
