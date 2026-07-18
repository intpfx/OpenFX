import {
  OPENFX_NODE_ERROR_CODES,
  OpenFxNodeProtocolError,
  openRelayEnvelope,
  PROTOCOL_VERSION,
  RELAY_NONCE_TTL_MS,
  sealRelayEnvelope,
  verifySignedRequest,
} from "../../../../domains/_shared/openfx-node/mod.ts";
import type { NodeCryptoAdapter } from "../../../../domains/_shared/openfx-node/crypto.ts";
import type {
  SealedRelayEnvelope,
  SignedNodeRequest,
} from "../../../../domains/_shared/openfx-node/types.ts";
import type { SignableNodeRequest } from "../../../../domains/_shared/openfx-node/request-signing.ts";

export const PUBLIC_NODE_HEALTH = Object.freeze({
  ok: true,
  protocolVersion: PROTOCOL_VERSION,
});

export const NODE_RELAY_ROUTES = Object.freeze(
  [
    { method: "GET", path: "/v1/system/overview" },
    { method: "GET", path: "/v1/processes" },
    { method: "GET", path: "/v1/agent/messages" },
    { method: "POST", path: "/v1/agent/messages" },
    { method: "GET", path: "/v1/approvals" },
    { method: "POST", path: "/v1/approvals/resolve" },
    { method: "GET", path: "/v1/relay" },
    { method: "POST", path: "/v1/relay" },
  ] as const,
);

export interface NodeRelayProtocolOptions {
  crypto: NodeCryptoAdapter;
  secret: Uint8Array;
  dispatch(request: SignableNodeRequest): Promise<unknown>;
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
  replayStore?: PersistentReplayStore;
}

export interface PersistentReplayStore {
  claimReplayNonce(nonce: string, expiresAt: number, now: number): Promise<boolean>;
}

export interface NodeRelayProtocol {
  handle(envelope: SealedRelayEnvelope): Promise<SealedRelayEnvelope>;
}

export const createNodeRelayProtocol = (
  options: NodeRelayProtocolOptions,
): NodeRelayProtocol => {
  const now = options.now ?? Date.now;
  const replayStore = options.replayStore ?? createMemoryReplayStore();
  const noReplay = { consume() {} };
  return {
    async handle(envelope) {
      const signed = await openRelayEnvelope<SignedNodeRequest>(
        options.crypto,
        options.secret,
        envelope,
        { now, replayProtector: noReplay },
      );
      await claimNonce(replayStore, envelope.nonce, envelope.timestamp, now());
      await verifySignedRequest(options.crypto, options.secret, signed, {
        now,
        replayProtector: noReplay,
      });
      await claimNonce(replayStore, signed.nonce, signed.timestamp, now());
      const method = signed.method.toUpperCase();
      if (!isAllowedNodeRoute(method, signed.path)) {
        throw new OpenFxNodeProtocolError(
          OPENFX_NODE_ERROR_CODES.routeNotAllowed,
          "Signed node route is not in the fixed v1 map.",
        );
      }
      const response = await options.dispatch({
        method,
        path: signed.path,
        body: signed.body,
      });
      return await sealRelayEnvelope(
        options.crypto,
        options.secret,
        response,
        { now, randomBytes: options.randomBytes },
      );
    },
  };
};

const claimNonce = async (
  replayStore: PersistentReplayStore,
  nonce: string,
  timestamp: number,
  currentTime: number,
): Promise<void> => {
  if (
    !await replayStore.claimReplayNonce(
      nonce,
      Math.max(timestamp, currentTime) + RELAY_NONCE_TTL_MS,
      currentTime,
    )
  ) {
    throw new OpenFxNodeProtocolError(
      OPENFX_NODE_ERROR_CODES.replayDetected,
      "Authenticated nonce has already been consumed.",
    );
  }
};

const createMemoryReplayStore = (): PersistentReplayStore => {
  const nonces = new Map<string, number>();
  return {
    claimReplayNonce(nonce, expiresAt, currentTime) {
      const existing = nonces.get(nonce);
      if (existing !== undefined && existing > currentTime) {
        return Promise.resolve(false);
      }
      nonces.set(nonce, expiresAt);
      return Promise.resolve(true);
    },
  };
};

export const isAllowedNodeRoute = (method: string, path: string): boolean =>
  NODE_RELAY_ROUTES.some((route) => route.method === method && route.path === path);
