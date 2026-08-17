import { expect } from "@std/expect";

import {
  acceptPairingApproval,
  approvePairingRequest,
  createPairingRequest,
  createPrivateMesh,
} from "../src/file-library/private-mesh.ts";
import { createMemoryPrivateMeshKeyVault } from "../src/file-library/private-mesh-key-vault.ts";
import {
  acceptPrivateMeshConnectionOffer,
  createPrivateMeshSignalCode,
  parsePrivateMeshSignalCode,
} from "../src/file-library/private-mesh-transport.ts";

const NOW = "2026-08-15T00:00:00.000Z";

Deno.test("private mesh WebRTC signaling is member signed and recipient bound", async () => {
  const ownerVault = createMemoryPrivateMeshKeyVault();
  const memberVault = createMemoryPrivateMeshKeyVault();
  const owner = await createPrivateMesh({
    meshName: "家庭文件网络",
    nodeName: "Mac mini",
    recoveryPassphrase: "a passphrase only the owner knows",
    now: NOW,
  }, ownerVault);
  const pending = await createPairingRequest({
    nodeName: "iPad",
    now: NOW,
  }, memberVault);
  const approved = await approvePairingRequest(
    owner.state,
    pending.requestCode,
    ownerVault,
    { now: NOW },
  );
  const member = await acceptPairingApproval(
    pending,
    approved.approvalCode,
    memberVault,
  );
  const offerCode = await createPrivateMeshSignalCode(
    approved.state,
    {
      kind: "offer",
      recipientNodeId: member.localNode.nodeId,
      description: { type: "offer", sdp: "v=0\r\na=fingerprint:offer" },
      now: NOW,
    },
    ownerVault,
  );
  const offer = await parsePrivateMeshSignalCode(
    member,
    offerCode,
    { kind: "offer", now: NOW },
  );

  expect(offer.fromNodeId).toBe(approved.state.localNode.nodeId);
  expect(offer.toNodeId).toBe(member.localNode.nodeId);
  expect(offer.description.type).toBe("offer");
  expect(offer.networkMode).toBe("local");

  const publicStunOfferCode = await createPrivateMeshSignalCode(
    approved.state,
    {
      kind: "offer",
      recipientNodeId: member.localNode.nodeId,
      networkMode: "public-stun",
      description: { type: "offer", sdp: "v=0\r\na=fingerprint:public-stun" },
      now: NOW,
    },
    ownerVault,
  );
  await expect(
    parsePrivateMeshSignalCode(member, publicStunOfferCode, {
      kind: "offer",
      now: NOW,
    }),
  ).resolves.toMatchObject({ networkMode: "public-stun" });
  await expect(
    acceptPrivateMeshConnectionOffer(
      member,
      publicStunOfferCode,
      memberVault,
      { now: NOW },
    ),
  ).rejects.toThrow("请明确允许后重试");

  const answerCode = await createPrivateMeshSignalCode(
    member,
    {
      kind: "answer",
      recipientNodeId: approved.state.localNode.nodeId,
      sessionId: offer.sessionId,
      description: { type: "answer", sdp: "v=0\r\na=fingerprint:answer" },
      now: NOW,
    },
    memberVault,
  );
  await expect(
    parsePrivateMeshSignalCode(approved.state, answerCode, {
      kind: "answer",
      sessionId: offer.sessionId,
      now: NOW,
    }),
  ).resolves.toMatchObject({
    fromNodeId: member.localNode.nodeId,
    toNodeId: approved.state.localNode.nodeId,
  });

  await expect(
    parsePrivateMeshSignalCode(member, `${offerCode}tampered`, {
      kind: "offer",
      now: NOW,
    }),
  ).rejects.toThrow("连接码无效");
  await expect(
    parsePrivateMeshSignalCode(approved.state, offerCode, {
      kind: "offer",
      now: NOW,
    }),
  ).rejects.toThrow("连接码不属于当前设备");
});

Deno.test("private mesh answerer keeps listening while the manual signal is valid", async () => {
  const ownerVault = createMemoryPrivateMeshKeyVault();
  const memberVault = createMemoryPrivateMeshKeyVault();
  const owner = await createPrivateMesh({
    meshName: "家庭文件网络",
    nodeName: "Mac mini",
    recoveryPassphrase: "a passphrase only the owner knows",
    now: NOW,
  }, ownerVault);
  const pending = await createPairingRequest({
    nodeName: "Android",
    now: NOW,
  }, memberVault);
  const approved = await approvePairingRequest(
    owner.state,
    pending.requestCode,
    ownerVault,
    { now: NOW },
  );
  const member = await acceptPairingApproval(
    pending,
    approved.approvalCode,
    memberVault,
  );
  const offerCode = await createPrivateMeshSignalCode(
    member,
    {
      kind: "offer",
      recipientNodeId: approved.state.localNode.nodeId,
      description: { type: "offer", sdp: "v=0\r\na=fingerprint:android" },
      now: NOW,
    },
    memberVault,
  );
  const channel = new EventTarget() as EventTarget & {
    label: string;
    close(): void;
  };
  channel.label = "openfx-private-mesh-v1";
  channel.close = () => undefined;
  class FakePeerConnection extends EventTarget {
    iceGatheringState = "complete" as RTCIceGatheringState;
    localDescription: RTCSessionDescription | null = null;

    setRemoteDescription(): Promise<void> {
      return Promise.resolve();
    }

    createAnswer(): Promise<RTCSessionDescriptionInit> {
      return Promise.resolve({
        type: "answer",
        sdp: "v=0\r\na=fingerprint:mac",
      });
    }

    setLocalDescription(
      description: RTCSessionDescriptionInit,
    ): Promise<void> {
      this.localDescription = description as RTCSessionDescription;
      return Promise.resolve();
    }

    close(): void {}
  }
  const peerConnection = new FakePeerConnection();
  const nativeSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout =
    ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(
        handler,
        Math.max(1, (timeout ?? 0) / 1_000),
        ...args,
      )) as typeof globalThis.setTimeout;
  try {
    const accepted = await acceptPrivateMeshConnectionOffer(
      approved.state,
      offerCode,
      ownerVault,
      {
        now: NOW,
        createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      },
    );
    nativeSetTimeout(() => {
      const event = new Event("datachannel");
      Object.defineProperty(event, "channel", { value: channel });
      peerConnection.dispatchEvent(event);
    }, 40);

    await expect(accepted.connection.channel).resolves.toBe(channel);
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
  }
});

Deno.test("private mesh answer keeps usable ICE candidates when WebKit does not finish gathering", async () => {
  const ownerVault = createMemoryPrivateMeshKeyVault();
  const memberVault = createMemoryPrivateMeshKeyVault();
  const owner = await createPrivateMesh({
    meshName: "家庭文件网络",
    nodeName: "Mac",
    recoveryPassphrase: "a passphrase only the owner knows",
    now: NOW,
  }, ownerVault);
  const pending = await createPairingRequest({
    nodeName: "Web",
    now: NOW,
  }, memberVault);
  const approved = await approvePairingRequest(
    owner.state,
    pending.requestCode,
    ownerVault,
    { now: NOW },
  );
  const member = await acceptPairingApproval(
    pending,
    approved.approvalCode,
    memberVault,
  );
  const offerCode = await createPrivateMeshSignalCode(
    member,
    {
      kind: "offer",
      recipientNodeId: approved.state.localNode.nodeId,
      description: {
        type: "offer",
        sdp: "v=0\r\na=candidate:offer 1 udp 1 host.local 5000 typ host\r\n",
      },
      now: NOW,
    },
    memberVault,
  );
  const channel = new EventTarget() as EventTarget & {
    label: string;
    close(): void;
  };
  channel.label = "openfx-private-mesh-v1";
  channel.close = () => undefined;
  class StalledWebKitPeerConnection extends EventTarget {
    iceGatheringState = "gathering" as RTCIceGatheringState;
    localDescription: RTCSessionDescription | null = null;

    setRemoteDescription(): Promise<void> {
      return Promise.resolve();
    }

    createAnswer(): Promise<RTCSessionDescriptionInit> {
      return Promise.resolve({
        type: "answer",
        sdp: "v=0\r\na=candidate:answer 1 udp 1 host.local 5001 typ host\r\n",
      });
    }

    setLocalDescription(
      description: RTCSessionDescriptionInit,
    ): Promise<void> {
      this.localDescription = description as RTCSessionDescription;
      return Promise.resolve();
    }

    close(): void {}
  }
  const peerConnection = new StalledWebKitPeerConnection();
  const accepted = await acceptPrivateMeshConnectionOffer(
    approved.state,
    offerCode,
    ownerVault,
    {
      now: NOW,
      iceGatheringTimeoutMs: 1,
      createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
    },
  );
  const answer = await parsePrivateMeshSignalCode(member, accepted.answerCode, {
    kind: "answer",
    sessionId: accepted.connection.sessionId,
    now: NOW,
  });
  expect(answer.description.sdp).toContain("a=candidate:answer");

  const event = new Event("datachannel");
  Object.defineProperty(event, "channel", { value: channel });
  peerConnection.dispatchEvent(event);
  await expect(accepted.connection.channel).resolves.toBe(channel);
});
