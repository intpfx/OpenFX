import {
  ADMIN_SESSION_TTL_MS,
  aggregateTelemetrySamples,
  type AuditEvent,
  constantTimeEqual,
  createWebCryptoAdapter,
  generatePairingCode,
  NODE_PORT,
  type NodeRecord,
  type NodeStatus,
  OPENFX_NODE_ERROR_CODES,
  OpenFxNodeProtocolError,
  PAIRING_TTL_MS,
  PROTOCOL_VERSION,
  RELAY_NONCE_TTL_MS,
  type RelayReply,
  retainTelemetryMinutes,
  type SealedRelayEnvelope,
  sealRelayEnvelope,
  signedRequestFromHeaders,
  signRequest,
  TELEMETRY_AGGREGATE_MS,
  TELEMETRY_RETENTION_MS,
  type TelemetryMinute,
  type TelemetrySample,
  verifySignedRequest,
} from "../../../../domains/_shared/openfx-node/mod.ts";
import {
  canonicalJson,
  decodeBase64Url,
  encodeBase64Url,
  utf8,
} from "../../../../domains/_shared/openfx-node/encoding.ts";
import { openRelayEnvelope } from "../../../../domains/_shared/openfx-node/relay.ts";
import {
  type ConsoleKey,
  type ConsoleStore,
  ConsoleStoreUnavailableError,
  createDefaultConsoleStore,
  getDefaultConsoleStore,
} from "./store.ts";
import { getTrustedClientIdentity } from "../utils/request.ts";
import {
  type ConsoleEventType,
  createConsoleEventService,
  type StoredConsoleEvent,
} from "./event-service.ts";
import {
  isAllowedRelayBody,
  isGlobalIpv6,
  parseNodeEvent,
  parseTelemetrySample,
  readJsonObject,
  validateNodeEndpoint,
} from "./validation.ts";

export { createMemoryConsoleStore } from "./store.ts";
export { formatSseEvent } from "./event-service.ts";

const ROOT = ["openfx-console"] as const;
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60_000;
const NODE_ONLINE_WINDOW_MS = 45_000;
const TELEMETRY_CLOCK_SKEW_MS = 60_000;
const RELAY_RESPONSE_MAX_BYTES = 64 * 1024;
const PROCESS_RELAY_RESPONSE_MAX_BYTES = 256 * 1024;
const PAIRING_EXPIRY_GRACE_MS = 60_000;
const SESSION_COOKIE = "openfx_admin_session";
const CREDENTIAL_AAD = utf8("openfx-node/v1/credential");

export const CONSOLE_RELAY_OPERATIONS = {
  overview: { method: "GET", path: "/v1/system/overview" },
  processes: { method: "GET", path: "/v1/processes" },
  "agent.messages.get": { method: "GET", path: "/v1/agent/messages" },
  "agent.messages.post": { method: "POST", path: "/v1/agent/messages" },
  approvals: { method: "GET", path: "/v1/approvals" },
  "approvals.resolve": { method: "POST", path: "/v1/approvals/resolve" },
  "relay.settings.get": { method: "GET", path: "/v1/relay" },
  "relay.settings.update": { method: "POST", path: "/v1/relay" },
} as const;

export type ConsoleRelayOperation = keyof typeof CONSOLE_RELAY_OPERATIONS;

interface SessionRecord {
  createdAt: number;
  expiresAt: number;
}

interface LoginRateRecord {
  attempts: number;
  resetAt: number;
}

interface PairingRecord {
  createdAt: number;
  expiresAt: number;
  usedAt?: number;
  state?: "incomplete" | "completed";
  pending?: PairingPendingReference;
}

interface PairingPendingReference {
  nodeId: string;
  requestFingerprint: string;
}

interface PendingNodeStatus {
  nodeId: string;
  value: NodeStatus | null;
}

interface StoredCredential {
  nodeId: string;
  digest: string;
  iv: string;
  ciphertext: string;
}

interface TelemetryBucket {
  minute: TelemetryMinute;
  samples: TelemetrySample[];
  receivedAt: number;
}

interface VerifiedNodeAuthorization {
  store: ConsoleStore;
  node: NodeRecord;
  credentialVersion: string;
  nonceKey: ConsoleKey;
  nonceValue: {
    nodeId: string;
    timestamp: number;
    expiresAt: number;
  };
}

export interface ConsoleControlPlaneOptions {
  store?: ConsoleStore;
  env?: Record<string, string | undefined>;
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
  fetch?: typeof fetch;
  ssePollMs?: number;
  openKv?: () => Promise<Deno.Kv>;
}

export interface ConsoleControlPlane {
  adminSession: {
    create(req: Request): Promise<Response>;
    get(req: Request): Promise<Response>;
    delete(req: Request): Promise<Response>;
  };
  pairings: { create(req: Request): Promise<Response> };
  node: {
    pair(req: Request): Promise<Response>;
    revoke(req: Request): Promise<Response>;
    heartbeat(req: Request): Promise<Response>;
    telemetry(req: Request): Promise<Response>;
    events(req: Request): Promise<Response>;
  };
  console: {
    handle(
      req: Request,
      operation: ConsoleRelayOperation,
      body?: unknown,
    ): Promise<Response>;
    telemetry(req: Request): Promise<Response>;
    audit(req: Request): Promise<Response>;
  };
  events: {
    append(type: ConsoleEventType, data: unknown): Promise<StoredConsoleEvent>;
    snapshot(req: Request): Promise<Response>;
    stream(req: Request): Promise<Response>;
  };
  authorize(req: Request): Promise<boolean>;
}

export const createConsoleControlPlane = (
  options: ConsoleControlPlaneOptions = {},
): ConsoleControlPlane => {
  const storePromise = options.store
    ? Promise.resolve(options.store)
    : options.openKv
    ? createDefaultConsoleStore(options.openKv)
    : getDefaultConsoleStore();
  void storePromise.catch(() => undefined);
  const now = options.now ?? Date.now;
  const cryptoAdapter = createWebCryptoAdapter();
  const randomBytes = options.randomBytes ?? cryptoAdapter.randomBytes;
  const relayFetch = options.fetch ?? globalThis.fetch;
  const ssePollMs = options.ssePollMs ?? 1_000;

  const env = (name: string): string => {
    if (options.env) return (options.env[name] ?? "").trim();
    try {
      return (Deno.env.get(name) ?? "").trim();
    } catch {
      return "";
    }
  };

  const configuredAdminKey = (req?: Request): string => {
    const configured = env("OPENFX_ADMIN_KEY");
    if (configured) return configured;
    const production = env("DENO_DEPLOYMENT_ID") ||
      env("NODE_ENV").toLowerCase() === "production";
    return production || (req && !isLocalUrl(req.url)) ? "" : "TEST";
  };

  const digest = async (value: string | Uint8Array): Promise<string> =>
    encodeBase64Url(
      await cryptoAdapter.sha256(typeof value === "string" ? utf8(value) : value),
    );

  const appendAudit = async (
    event: Omit<AuditEvent, "id" | "createdAt">,
  ): Promise<void> => {
    const id = await nextCounter(await storePromise, "audit-counter");
    const value: AuditEvent = { ...event, id: String(id), createdAt: now() };
    await (await storePromise).set([...ROOT, "audit", id], value);
  };

  const authorize = async (req: Request): Promise<boolean> => {
    if (!configuredAdminKey(req)) return false;
    const token = parseCookie(req.headers.get("cookie") ?? "", SESSION_COOKIE);
    if (!token) return false;
    const key = [...ROOT, "sessions", await digest(token)] as const;
    const store = await storePromise;
    const record = await store.get<SessionRecord>(key);
    if (!record || record.value.expiresAt <= now()) {
      if (record) await store.delete(key);
      return false;
    }
    return true;
  };

  const requireSession = async (req: Request): Promise<Response | null> =>
    await authorize(req) ? null : jsonError("unauthorized", 401);

  const eventService = createConsoleEventService({
    store: storePromise,
    now,
    pollMs: ssePollMs,
    requireSession,
  });

  const createSession = async (req: Request): Promise<Response> => {
    const adminKey = configuredAdminKey(req);
    if (!adminKey) return jsonError("admin_not_configured", 503);
    const parsed = await readJsonObject(req);
    if (parsed instanceof Response) return parsed;
    const provided = typeof parsed.key === "string" ? parsed.key : "";
    const client = await digest(clientIdentity(req));
    const rateKey = [...ROOT, "login-rate", client] as const;
    const store = await storePromise;
    const current = await store.get<LoginRateRecord>(rateKey);
    if (
      current && current.value.resetAt > now() && current.value.attempts >= LOGIN_LIMIT
    ) {
      return jsonError("rate_limited", 429, {
        "retry-after": String(Math.ceil((current.value.resetAt - now()) / 1000)),
      });
    }
    const matches = constantTimeEqual(
      await cryptoAdapter.sha256(utf8(provided)),
      await cryptoAdapter.sha256(utf8(adminKey)),
    );
    if (!matches) {
      const failures = await recordLoginFailure(store, rateKey, now());
      await appendAudit({
        category: "admin",
        action: "session.login",
        outcome: "rejected",
        actor: clientIdentity(req),
      });
      return jsonError(
        failures >= LOGIN_LIMIT ? "rate_limited" : "unauthorized",
        failures >= LOGIN_LIMIT ? 429 : 401,
      );
    }
    await store.delete(rateKey);
    const token = encodeBase64Url(randomBytes(32));
    await store.set(
      [...ROOT, "sessions", await digest(token)],
      {
        createdAt: now(),
        expiresAt: now() + ADMIN_SESSION_TTL_MS,
      } satisfies SessionRecord,
      { expireIn: ADMIN_SESSION_TTL_MS },
    );
    await appendAudit({
      category: "admin",
      action: "session.login",
      outcome: "succeeded",
      actor: clientIdentity(req),
    });
    return Response.json(
      { ok: true, expiresAt: now() + ADMIN_SESSION_TTL_MS },
      {
        status: 200,
        headers: { "set-cookie": sessionCookie(req, token, ADMIN_SESSION_TTL_MS) },
      },
    );
  };

  const getSession = async (req: Request): Promise<Response> =>
    await authorize(req)
      ? Response.json({ ok: true, authenticated: true })
      : jsonError("unauthorized", 401);

  const deleteSession = async (req: Request): Promise<Response> => {
    const token = parseCookie(req.headers.get("cookie") ?? "", SESSION_COOKIE);
    if (!token) return clearedSessionResponse(req);

    const store = await storePromise;
    const key = [...ROOT, "sessions", await digest(token)] as const;
    const record = await store.get<SessionRecord>(key);
    if (!record) return clearedSessionResponse(req);

    const invalidated = await store.atomic({
      checks: [{ key, versionstamp: record.versionstamp }],
      sets: [],
      deletes: [key],
    });
    if (invalidated && record.value.expiresAt > now()) {
      await appendAudit({
        category: "admin",
        action: "session.logout",
        outcome: "succeeded",
        actor: clientIdentity(req),
      });
    }
    return clearedSessionResponse(req);
  };

  const createPairing = async (req: Request): Promise<Response> => {
    const denied = await requireSession(req);
    if (denied) return denied;
    const code = generatePairingCode(randomBytes);
    const codeDigest = await digest(code);
    const createdAt = now();
    const record = {
      createdAt,
      expiresAt: createdAt + PAIRING_TTL_MS,
    } satisfies PairingRecord;
    const pairingKey = [...ROOT, "pairings", codeDigest] as const;
    const liveKey = [...ROOT, "pairings-live", codeDigest] as const;
    const pairingExpireIn = Math.max(
      1,
      record.expiresAt + PAIRING_EXPIRY_GRACE_MS - now(),
    );
    const liveExpireIn = Math.max(1, record.expiresAt - now());
    if (
      !await (await storePromise).atomic({
        checks: [],
        sets: [
          {
            key: pairingKey,
            value: record,
            options: { expireIn: pairingExpireIn },
          },
          {
            key: liveKey,
            value: { expiresAt: record.expiresAt },
            options: { expireIn: liveExpireIn },
          },
        ],
      })
    ) throw new ConsoleStoreUnavailableError();
    await appendAudit({
      category: "pairing",
      action: "pairing.created",
      outcome: "succeeded",
    });
    return Response.json(
      { ok: true, code, expiresAt: record.expiresAt },
      { status: 201 },
    );
  };

  const pairNode = async (req: Request): Promise<Response> => {
    const parsed = await readJsonObject(req);
    if (parsed instanceof Response) return parsed;
    const code = typeof parsed.code === "string"
      ? parsed.code.trim().toUpperCase()
      : "";
    const validation = validateNodeEndpoint(parsed);
    if (validation) return validation;
    if (!code) return nodeError(OPENFX_NODE_ERROR_CODES.pairingInvalid, 400);
    const credentialKey = parseCredentialKey(env("OPENFX_NODE_CREDENTIAL_KEY"));
    if (!credentialKey) {
      return nodeError(OPENFX_NODE_ERROR_CODES.relayUnavailable, 503);
    }
    const endpoint = {
      name: String(parsed.name).trim(),
      protocolVersion: Number(parsed.protocolVersion),
      publicIpv6: String(parsed.publicIpv6).trim(),
      port: Number(parsed.port),
    };
    const requestFingerprint = await digest(canonicalJson(endpoint));
    const store = await storePromise;
    const codeDigest = await digest(code);
    const pairingKey = [...ROOT, "pairings", codeDigest] as const;
    const liveKey = [...ROOT, "pairings-live", codeDigest] as const;
    const pendingNodeKey = [
      ...ROOT,
      "pairing-pending",
      codeDigest,
      "node",
    ] as const;
    const pendingCredentialKey = [
      ...ROOT,
      "pairing-pending",
      codeDigest,
      "credential",
    ] as const;
    const pendingStatusKey = [
      ...ROOT,
      "pairing-pending",
      codeDigest,
      "status",
    ] as const;
    let pairing = await store.get<PairingRecord>(pairingKey);
    if (!pairing) return nodeError(OPENFX_NODE_ERROR_CODES.pairingInvalid, 404);
    let node: NodeRecord;
    let credential: StoredCredential;
    let nodeSecret: Uint8Array;
    let live = await store.get<{ expiresAt: number }>(liveKey);

    if (pairing.value.state === "completed") {
      if (
        now() > pairing.value.expiresAt + PAIRING_EXPIRY_GRACE_MS
      ) return nodeError(OPENFX_NODE_ERROR_CODES.pairingInvalid, 404);
      if (
        !pairing.value.pending ||
        pairing.value.pending.requestFingerprint !== requestFingerprint
      ) return nodeError(OPENFX_NODE_ERROR_CODES.pairingUsed, 409);
      const [active, activeCredential] = await Promise.all([
        store.get<NodeRecord>([...ROOT, "node", "active"]),
        store.get<StoredCredential>([...ROOT, "node", "credential"]),
      ]);
      if (
        !active || !activeCredential ||
        active.value.id !== pairing.value.pending.nodeId ||
        activeCredential.value.nodeId !== pairing.value.pending.nodeId
      ) return nodeError(OPENFX_NODE_ERROR_CODES.pairingUsed, 409);
      try {
        nodeSecret = await cryptoAdapter.aes256GcmDecrypt(
          credentialKey,
          decodeBase64Url(activeCredential.value.iv),
          decodeBase64Url(activeCredential.value.ciphertext),
          CREDENTIAL_AAD,
        );
      } catch {
        throw new ConsoleStoreUnavailableError();
      }
      if (await digest(nodeSecret) !== activeCredential.value.digest) {
        throw new ConsoleStoreUnavailableError();
      }
      return Response.json(
        {
          ok: true,
          node: active.value,
          nodeSecret: encodeBase64Url(nodeSecret),
        },
        { status: 201 },
      );
    } else if (pairing.value.state === "incomplete") {
      if (
        !pairing.value.pending ||
        pairing.value.pending.requestFingerprint !== requestFingerprint
      ) {
        return nodeError(OPENFX_NODE_ERROR_CODES.pairingUsed, 409);
      }
      if (!live || pairing.value.expiresAt <= now()) {
        return nodeError(OPENFX_NODE_ERROR_CODES.pairingExpired, 410);
      }
      const [pendingNode, pendingCredential, pendingStatus] = await Promise.all([
        store.get<NodeRecord>(pendingNodeKey),
        store.get<StoredCredential>(pendingCredentialKey),
        store.get<PendingNodeStatus>(pendingStatusKey),
      ]);
      if (
        !pendingNode || !pendingCredential || !pendingStatus ||
        pendingNode.value.id !== pairing.value.pending.nodeId ||
        pendingCredential.value.nodeId !== pairing.value.pending.nodeId ||
        pendingStatus.value.nodeId !== pairing.value.pending.nodeId
      ) throw new ConsoleStoreUnavailableError();
      node = pendingNode.value;
      credential = pendingCredential.value;
      try {
        nodeSecret = await cryptoAdapter.aes256GcmDecrypt(
          credentialKey,
          decodeBase64Url(credential.iv),
          decodeBase64Url(credential.ciphertext),
          CREDENTIAL_AAD,
        );
      } catch {
        throw new ConsoleStoreUnavailableError();
      }
      if (await digest(nodeSecret) !== credential.digest) {
        throw new ConsoleStoreUnavailableError();
      }
    } else {
      if (
        pairing.value.usedAt !== undefined ||
        pairing.value.state === "completed"
      ) return nodeError(OPENFX_NODE_ERROR_CODES.pairingUsed, 409);
      if (!live || pairing.value.expiresAt <= now()) {
        return nodeError(OPENFX_NODE_ERROR_CODES.pairingExpired, 410);
      }
      nodeSecret = randomBytes(32);
      const nodeId = encodeBase64Url(randomBytes(16));
      const iv = randomBytes(12);
      credential = {
        nodeId,
        digest: await digest(nodeSecret),
        iv: encodeBase64Url(iv),
        ciphertext: encodeBase64Url(
          await cryptoAdapter.aes256GcmEncrypt(
            credentialKey,
            iv,
            nodeSecret,
            CREDENTIAL_AAD,
          ),
        ),
      };
      node = {
        id: nodeId,
        name: endpoint.name,
        protocolVersion: PROTOCOL_VERSION,
        publicIpv6: endpoint.publicIpv6,
        port: NODE_PORT,
        status: "unknown",
        pairedAt: now(),
        lastSeenAt: 0,
      };
      const pendingExpireIn = Math.max(
        1,
        pairing.value.expiresAt + PAIRING_EXPIRY_GRACE_MS - now(),
      );
      const incomplete = {
        ...pairing.value,
        usedAt: now(),
        state: "incomplete",
        pending: { nodeId, requestFingerprint },
      } satisfies PairingRecord;
      if (
        !await store.atomic({
          checks: [
            { key: pairingKey, versionstamp: pairing.versionstamp },
            { key: liveKey, versionstamp: live.versionstamp },
            { key: pendingNodeKey, versionstamp: null },
            { key: pendingCredentialKey, versionstamp: null },
            { key: pendingStatusKey, versionstamp: null },
          ],
          sets: [
            {
              key: pairingKey,
              value: incomplete,
              options: { expireIn: pendingExpireIn },
            },
            {
              key: pendingNodeKey,
              value: node,
              options: { expireIn: pendingExpireIn },
            },
            {
              key: pendingCredentialKey,
              value: credential,
              options: { expireIn: pendingExpireIn },
            },
            {
              key: pendingStatusKey,
              value: { nodeId, value: null } satisfies PendingNodeStatus,
              options: { expireIn: pendingExpireIn },
            },
          ],
        })
      ) {
        pairing = await store.get<PairingRecord>(pairingKey);
        live = await store.get<{ expiresAt: number }>(liveKey);
        if (
          pairing?.value.state === "incomplete" ||
          pairing?.value.state === "completed" ||
          pairing?.value.usedAt !== undefined
        ) return nodeError(OPENFX_NODE_ERROR_CODES.pairingUsed, 409);
        const expired = !pairing || !live || pairing.value.expiresAt <= now();
        return nodeError(
          expired
            ? OPENFX_NODE_ERROR_CODES.pairingExpired
            : OPENFX_NODE_ERROR_CODES.pairingUsed,
          expired ? 410 : 409,
        );
      }
    }

    const finalized = await finalizePendingPairing({
      store,
      pairingKey,
      liveKey,
      pendingNodeKey,
      pendingCredentialKey,
      pendingStatusKey,
      nodeId: node.id,
      requestFingerprint,
    });
    if (finalized === "completed") {
      return nodeError(OPENFX_NODE_ERROR_CODES.pairingUsed, 409);
    }
    if (finalized === "expired") {
      return nodeError(OPENFX_NODE_ERROR_CODES.pairingExpired, 410);
    }
    return Response.json(
      { ok: true, node, nodeSecret: encodeBase64Url(nodeSecret) },
      { status: 201 },
    );
  };

  const finalizePendingPairing = async (input: {
    store: ConsoleStore;
    pairingKey: ConsoleKey;
    liveKey: ConsoleKey;
    pendingNodeKey: ConsoleKey;
    pendingCredentialKey: ConsoleKey;
    pendingStatusKey: ConsoleKey;
    nodeId: string;
    requestFingerprint: string;
  }): Promise<"promoted" | "completed" | "expired"> => {
    const activeKey = [...ROOT, "node", "active"] as const;
    const credentialKey = [...ROOT, "node", "credential"] as const;
    const statusKey = [...ROOT, "node", "status"] as const;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const [
        pairing,
        live,
        pendingNode,
        pendingCredential,
        pendingStatus,
        active,
        credential,
        status,
      ] = await Promise.all([
        input.store.get<PairingRecord>(input.pairingKey),
        input.store.get<{ expiresAt: number }>(input.liveKey),
        input.store.get<NodeRecord>(input.pendingNodeKey),
        input.store.get<StoredCredential>(input.pendingCredentialKey),
        input.store.get<PendingNodeStatus>(input.pendingStatusKey),
        input.store.get<NodeRecord>(activeKey),
        input.store.get<StoredCredential>(credentialKey),
        input.store.get<NodeStatus>(statusKey),
      ]);
      if (pairing?.value.state === "completed") return "completed";
      if (
        !pairing || pairing.value.state !== "incomplete" ||
        pairing.value.pending?.nodeId !== input.nodeId ||
        pairing.value.pending.requestFingerprint !== input.requestFingerprint
      ) {
        throw new ConsoleStoreUnavailableError();
      }
      if (!live || pairing.value.expiresAt <= now()) return "expired";
      if (
        !pendingNode || !pendingCredential || !pendingStatus ||
        pendingNode.value.id !== input.nodeId ||
        pendingCredential.value.nodeId !== input.nodeId ||
        pendingStatus.value.nodeId !== input.nodeId
      ) {
        throw new ConsoleStoreUnavailableError();
      }
      const finalizationNow = now();
      if (pairing.value.expiresAt <= finalizationNow) return "expired";
      const completed = {
        ...pairing.value,
        state: "completed",
      } satisfies PairingRecord;
      const sets: Array<{
        key: ConsoleKey;
        value: unknown;
        options?: { expireIn?: number };
      }> = [
        {
          key: input.pairingKey,
          value: completed,
          options: {
            expireIn: Math.max(
              1,
              pairing.value.expiresAt + PAIRING_EXPIRY_GRACE_MS -
                finalizationNow,
            ),
          },
        },
        { key: activeKey, value: pendingNode.value },
        { key: credentialKey, value: pendingCredential.value },
      ];
      if (pendingStatus.value.value) {
        sets.push({ key: statusKey, value: pendingStatus.value.value });
      }
      if (
        await input.store.atomic({
          checks: [
            { key: input.pairingKey, versionstamp: pairing.versionstamp },
            { key: input.liveKey, versionstamp: live.versionstamp },
            {
              key: input.pendingNodeKey,
              versionstamp: pendingNode.versionstamp,
            },
            {
              key: input.pendingCredentialKey,
              versionstamp: pendingCredential.versionstamp,
            },
            {
              key: input.pendingStatusKey,
              versionstamp: pendingStatus.versionstamp,
            },
            { key: activeKey, versionstamp: active?.versionstamp ?? null },
            {
              key: credentialKey,
              versionstamp: credential?.versionstamp ?? null,
            },
            { key: statusKey, versionstamp: status?.versionstamp ?? null },
          ],
          sets,
          deletes: [
            input.liveKey,
            input.pendingNodeKey,
            input.pendingCredentialKey,
            input.pendingStatusKey,
            ...(pendingStatus.value.value ? [] : [statusKey]),
          ],
        })
      ) return "promoted";
    }
    throw new ConsoleStoreUnavailableError();
  };

  const revokeNode = async (req: Request): Promise<Response> => {
    const denied = await requireSession(req);
    if (denied) return denied;
    const store = await storePromise;
    const activeKey = [...ROOT, "node", "active"] as const;
    const credentialKey = [...ROOT, "node", "credential"] as const;
    const statusKey = [...ROOT, "node", "status"] as const;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const active = await store.get<NodeRecord>(activeKey);
      const credential = await store.get<StoredCredential>(credentialKey);
      const status = await store.get<NodeStatus>(statusKey);
      if (
        await store.atomic({
          checks: [
            { key: activeKey, versionstamp: active?.versionstamp ?? null },
            { key: credentialKey, versionstamp: credential?.versionstamp ?? null },
            { key: statusKey, versionstamp: status?.versionstamp ?? null },
          ],
          sets: [],
          deletes: [activeKey, credentialKey, statusKey],
        })
      ) {
        if (active) {
          try {
            await appendAudit({
              category: "node",
              action: "node.revoked",
              outcome: "succeeded",
              nodeId: active.value.id,
              subjectId: active.value.id,
            });
          } catch {
            // Revocation is authoritative after the atomic credential deletion.
          }
        }
        return Response.json({
          ok: true,
          revokedNodeId: active?.value.id ?? null,
        });
      }
    }
    return nodeError(OPENFX_NODE_ERROR_CODES.internal, 503);
  };

  const authorizeNode = async (
    req: Request,
    nodeId: unknown,
    body: Record<string, unknown>,
    path: string,
  ): Promise<
    VerifiedNodeAuthorization | Response
  > => {
    const store = await storePromise;
    const activeKey = [...ROOT, "node", "active"] as const;
    const credentialKey = [...ROOT, "node", "credential"] as const;
    const active = await store.get<NodeRecord>(activeKey);
    const credential = await store.get<StoredCredential>(credentialKey);
    if (
      !active || !credential || active.value.id !== nodeId ||
      credential.value.nodeId !== active.value.id
    ) {
      return nodeError(OPENFX_NODE_ERROR_CODES.unauthorized, 401);
    }
    const secret = await decryptStoredCredential(
      credential.value,
      env("OPENFX_NODE_CREDENTIAL_KEY"),
      cryptoAdapter,
    );
    if (
      !secret ||
      !constantTimeEqual(
        utf8(await digest(secret)),
        utf8(credential.value.digest),
      )
    ) return nodeError(OPENFX_NODE_ERROR_CODES.unauthorized, 401);

    let signed;
    try {
      signed = signedRequestFromHeaders(req.headers, {
        method: "POST",
        path,
        body,
      });
      await verifySignedRequest(cryptoAdapter, secret, signed, {
        now,
        replayProtector: { consume() {} },
      });
    } catch (error) {
      return error instanceof OpenFxNodeProtocolError
        ? nodeError(
          error.code,
          error.code === OPENFX_NODE_ERROR_CODES.protocolMismatch ? 400 : 401,
        )
        : nodeError(OPENFX_NODE_ERROR_CODES.unauthorized, 401);
    }

    const nonceKey = [
      ...ROOT,
      "node-request-nonces",
      credential.value.nodeId,
      signed.nonce,
    ] as const;
    if (await store.get(nonceKey)) {
      return nodeError(OPENFX_NODE_ERROR_CODES.replayDetected, 409);
    }
    return {
      store,
      node: active.value,
      credentialVersion: credential.versionstamp,
      nonceKey,
      nonceValue: {
        nodeId: credential.value.nodeId,
        timestamp: signed.timestamp,
        expiresAt: now() + RELAY_NONCE_TTL_MS,
      },
    };
  };

  const authorizationGuard = (authorization: VerifiedNodeAuthorization) => ({
    checks: [
      {
        key: [...ROOT, "node", "credential"],
        versionstamp: authorization.credentialVersion,
      },
      { key: authorization.nonceKey, versionstamp: null },
    ],
    sets: [{
      key: authorization.nonceKey,
      value: authorization.nonceValue,
      options: { expireIn: RELAY_NONCE_TTL_MS },
    }],
  });

  const authorizationConflict = async (
    authorization: VerifiedNodeAuthorization,
  ): Promise<Response | null> => {
    if (await authorization.store.get(authorization.nonceKey)) {
      return nodeError(OPENFX_NODE_ERROR_CODES.replayDetected, 409);
    }
    const credential = await authorization.store.get<StoredCredential>([
      ...ROOT,
      "node",
      "credential",
    ]);
    return credential?.versionstamp === authorization.credentialVersion &&
        credential.value.nodeId === authorization.node.id
      ? null
      : nodeError(OPENFX_NODE_ERROR_CODES.unauthorized, 401);
  };

  const heartbeat = async (req: Request): Promise<Response> => {
    const parsed = await readJsonObject(req);
    if (parsed instanceof Response) return parsed;
    const validation = validateNodeEndpoint(parsed);
    if (validation) return validation;
    const availability = parsed.availability;
    if (!["online", "offline", "degraded"].includes(String(availability))) {
      return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
    }
    const activeKey = [...ROOT, "node", "active"] as const;
    const statusKey = [...ROOT, "node", "status"] as const;
    const authorization = await authorizeNode(
      req,
      parsed.nodeId,
      parsed,
      "/api/node/heartbeat",
    );
    if (authorization instanceof Response) return authorization;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const currentNode = await authorization.store.get<NodeRecord>(activeKey);
      if (!currentNode || currentNode.value.id !== authorization.node.id) {
        return nodeError(OPENFX_NODE_ERROR_CODES.unauthorized, 401);
      }
      const currentStatus = await authorization.store.get<NodeStatus>(statusKey);
      const status: NodeStatus = {
        nodeId: authorization.node.id,
        availability: availability as NodeStatus["availability"],
        protocolVersion: PROTOCOL_VERSION,
        publicIpv6: String(parsed.publicIpv6),
        port: NODE_PORT,
        lastSeenAt: now(),
      };
      const node = { ...currentNode.value, ...status, status: status.availability };
      const guard = authorizationGuard(authorization);
      if (
        await authorization.store.atomic({
          checks: [
            { key: activeKey, versionstamp: currentNode.versionstamp },
            { key: statusKey, versionstamp: currentStatus?.versionstamp ?? null },
            ...guard.checks,
          ],
          sets: [
            { key: activeKey, value: node },
            { key: statusKey, value: status },
            ...guard.sets,
          ],
        })
      ) {
        try {
          await eventService.append("heartbeat", status);
        } catch {
          // The atomic status and nonce write is authoritative; SSE is best-effort.
        }
        return Response.json({ ok: true, receivedAt: now() });
      }
      const conflict = await authorizationConflict(authorization);
      if (conflict) return conflict;
    }
    return nodeError(OPENFX_NODE_ERROR_CODES.internal, 503);
  };

  const telemetry = async (req: Request): Promise<Response> => {
    const parsed = await readJsonObject(req);
    if (parsed instanceof Response) return parsed;
    if (parsed.protocolVersion !== PROTOCOL_VERSION) {
      return nodeError(OPENFX_NODE_ERROR_CODES.protocolMismatch, 400);
    }
    const sample = parseTelemetrySample(parsed.sample);
    if (!sample) return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
    if (Math.abs(sample.collectedAt - now()) > TELEMETRY_CLOCK_SKEW_MS) {
      return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
    }
    const authorization = await authorizeNode(
      req,
      parsed.nodeId,
      parsed,
      "/api/node/telemetry",
    );
    if (authorization instanceof Response) return authorization;
    const minuteStart = Math.floor(sample.collectedAt / TELEMETRY_AGGREGATE_MS) *
      TELEMETRY_AGGREGATE_MS;
    const key = [...ROOT, "telemetry", minuteStart] as const;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await authorization.store.get<TelemetryBucket>(key);
      const samples = [...(current?.value.samples ?? []), sample].slice(-60);
      const minute = aggregateTelemetrySamples(samples)[0]!;
      const guard = authorizationGuard(authorization);
      if (
        await authorization.store.atomic({
          checks: [
            { key, versionstamp: current?.versionstamp ?? null },
            ...guard.checks,
          ],
          sets: [
            {
              key,
              value: { minute, samples, receivedAt: now() } satisfies TelemetryBucket,
              options: { expireIn: TELEMETRY_RETENTION_MS },
            },
            ...guard.sets,
          ],
        })
      ) {
        try {
          await eventService.append(
            "telemetry",
            aggregateTelemetrySamples([sample])[0],
          );
        } catch {
          // The atomic telemetry and nonce write is authoritative; SSE is best-effort.
        }
        return Response.json({ ok: true, minuteStart }, { status: 202 });
      }
      const conflict = await authorizationConflict(authorization);
      if (conflict) return conflict;
    }
    return nodeError(OPENFX_NODE_ERROR_CODES.internal, 503);
  };

  const ingestNodeEvents = async (req: Request): Promise<Response> => {
    const parsed = await readJsonObject(req);
    if (parsed instanceof Response) return parsed;
    if (parsed.protocolVersion !== PROTOCOL_VERSION) {
      return nodeError(OPENFX_NODE_ERROR_CODES.protocolMismatch, 400);
    }
    if (
      !Array.isArray(parsed.events) || parsed.events.length === 0 ||
      parsed.events.length > 64
    ) {
      return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
    }
    const events = parsed.events.map(parseNodeEvent);
    if (events.some((event) => event === null)) {
      return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
    }
    const authorization = await authorizeNode(
      req,
      parsed.nodeId,
      parsed,
      "/api/node/events",
    );
    if (authorization instanceof Response) return authorization;
    const batchKey = [
      ...ROOT,
      "node-event-batches",
      authorization.node.id,
      await digest(canonicalJson({ nodeId: authorization.node.id, events })),
    ] as const;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const batch = await authorization.store.get<{
        accepted: number;
        createdAt: number;
      }>(batchKey);
      const guard = authorizationGuard(authorization);
      if (batch) {
        if (
          await authorization.store.atomic({
            checks: [
              ...guard.checks,
              { key: batchKey, versionstamp: batch.versionstamp },
            ],
            sets: guard.sets,
          })
        ) {
          return Response.json(
            { ok: true, accepted: batch.value.accepted },
            { status: 202 },
          );
        }
      } else {
        const appended = await eventService.appendBatch(
          events as { type: ConsoleEventType; data: unknown }[],
          {
            checks: [
              ...guard.checks,
              { key: batchKey, versionstamp: null },
            ],
            sets: [
              ...guard.sets,
              {
                key: batchKey,
                value: { accepted: events.length, createdAt: now() },
                options: { expireIn: TELEMETRY_RETENTION_MS },
              },
            ],
          },
        );
        if (appended) {
          return Response.json(
            { ok: true, accepted: appended.length },
            { status: 202 },
          );
        }
      }
      const conflict = await authorizationConflict(authorization);
      if (conflict) return conflict;
    }
    return nodeError(OPENFX_NODE_ERROR_CODES.internal, 503);
  };

  const listTelemetry = async (req: Request): Promise<Response> => {
    const denied = await requireSession(req);
    if (denied) return denied;
    const store = await storePromise;
    const buckets = await store.list<TelemetryBucket>({
      prefix: [...ROOT, "telemetry"],
      limit: 10_081,
    });
    const minutes = retainTelemetryMinutes(
      buckets
        .filter((entry) => entry.value.receivedAt >= now() - TELEMETRY_RETENTION_MS)
        .map((entry) => entry.value.minute),
      now(),
    ).sort((left, right) => left.minuteStart - right.minuteStart);
    return Response.json({ ok: true, minutes });
  };

  const listAudit = async (req: Request): Promise<Response> => {
    const denied = await requireSession(req);
    if (denied) return denied;
    const query = new URL(req.url).searchParams;
    const requestedLimit = Number.parseInt(query.get("limit") ?? "100", 10);
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 500)
      : 100;
    const beforeRaw = query.get("before");
    const before = beforeRaw === null ? undefined : Number.parseInt(beforeRaw, 10);
    if (
      beforeRaw !== null &&
      (!Number.isSafeInteger(before) || before === undefined || before <= 0 ||
        String(before) !== beforeRaw)
    ) {
      return jsonError("invalid_audit_cursor", 400);
    }
    const entries = await (await storePromise).list<AuditEvent>({
      prefix: [...ROOT, "audit"],
      end: before === undefined ? undefined : [...ROOT, "audit", before],
      limit: limit + 1,
      reverse: true,
    });
    const hasMore = entries.length > limit;
    const page = entries.slice(0, limit);
    return Response.json({
      ok: true,
      events: page.map((entry) => entry.value),
      nextCursor: hasMore ? page.at(-1)?.value.id ?? null : null,
    });
  };

  const relay = async (
    req: Request,
    operation: ConsoleRelayOperation,
    explicitBody?: unknown,
  ): Promise<Response> => {
    const denied = await requireSession(req);
    if (denied) return denied;
    const route = CONSOLE_RELAY_OPERATIONS[operation];
    if (!route) return nodeError(OPENFX_NODE_ERROR_CODES.routeNotAllowed, 404);
    const store = await storePromise;
    const node = await store.get<NodeRecord>([...ROOT, "node", "active"]);
    const status = await store.get<NodeStatus>([...ROOT, "node", "status"]);
    if (!node) return nodeError(OPENFX_NODE_ERROR_CODES.nodeUnpaired, 503);
    if (
      !status || status.value.availability === "offline" ||
      status.value.lastSeenAt + NODE_ONLINE_WINDOW_MS < now()
    ) return nodeError(OPENFX_NODE_ERROR_CODES.nodeOffline, 503);
    if (
      status.value.publicIpv6 !== node.value.publicIpv6 ||
      status.value.port !== NODE_PORT || !isGlobalIpv6(node.value.publicIpv6)
    ) return nodeError(OPENFX_NODE_ERROR_CODES.relayUnavailable, 503);
    const secret = await decryptNodeSecret(
      store,
      env("OPENFX_NODE_CREDENTIAL_KEY"),
      cryptoAdapter,
    );
    if (!secret) return nodeError(OPENFX_NODE_ERROR_CODES.relayUnavailable, 503);
    let body = explicitBody ?? null;
    if (explicitBody === undefined && route.method !== "GET") {
      const parsed = await readJsonObject(req);
      if (parsed instanceof Response) return parsed;
      body = parsed;
    }
    if (!isAllowedRelayBody(operation, route.method, body)) {
      return nodeError(OPENFX_NODE_ERROR_CODES.routeNotAllowed, 400);
    }
    const signed = await signRequest(cryptoAdapter, secret, {
      method: route.method,
      path: route.path,
      body,
    }, { now, randomBytes });
    const envelope = await sealRelayEnvelope(cryptoAdapter, secret, signed, {
      now,
      randomBytes,
    });
    const auditContext = {
      nodeId: node.value.id,
      actor: clientIdentity(req),
      subjectId: signed.nonce,
      metadata: {
        operation,
        method: signed.method,
        path: signed.path,
      },
    } as const;
    await appendAudit({
      category: "relay",
      action: "relay.intent",
      outcome: "succeeded",
      ...auditContext,
    });
    const appendRelayOutcome = async (
      outcome: "succeeded" | "failed" | "replayed",
      errorCode?:
        (typeof OPENFX_NODE_ERROR_CODES)[keyof typeof OPENFX_NODE_ERROR_CODES],
      metadata: Record<string, unknown> = {},
    ): Promise<void> => {
      try {
        await appendAudit({
          category: "relay",
          action: "relay.outcome",
          outcome,
          errorCode,
          ...auditContext,
          metadata: { ...auditContext.metadata, ...metadata },
        });
      } catch {
        // Intent is already durable; outcome enrichment is best-effort.
      }
    };
    let upstream: Response;
    try {
      upstream = await relayFetch(
        `http://[${node.value.publicIpv6}]:${NODE_PORT}/v1/relay`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(envelope),
          signal: AbortSignal.timeout(8_000),
        },
      );
    } catch {
      await appendRelayOutcome(
        "failed",
        OPENFX_NODE_ERROR_CODES.nodeOffline,
      );
      return nodeError(OPENFX_NODE_ERROR_CODES.nodeOffline, 503);
    }
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => undefined);
      await appendRelayOutcome(
        "failed",
        OPENFX_NODE_ERROR_CODES.relayUnavailable,
        { upstreamStatus: upstream.status },
      );
      return nodeError(OPENFX_NODE_ERROR_CODES.relayUnavailable, 502);
    }
    try {
      const replyEnvelope = await readBoundedRelayResponse(
        upstream,
        operation === "processes"
          ? PROCESS_RELAY_RESPONSE_MAX_BYTES
          : RELAY_RESPONSE_MAX_BYTES,
      ) as SealedRelayEnvelope;
      const reply = await openRelayEnvelope<unknown>(
        cryptoAdapter,
        secret,
        replyEnvelope,
        {
          now,
          replayProtector: { consume() {} },
        },
      );
      if (!await consumeNonce(store, replyEnvelope.nonce, now())) {
        await appendRelayOutcome(
          "replayed",
          OPENFX_NODE_ERROR_CODES.replayDetected,
        );
        return nodeError(OPENFX_NODE_ERROR_CODES.replayDetected, 409);
      }
      if (!isCorrelatedRelayReply(reply, signed)) {
        await appendRelayOutcome(
          "failed",
          OPENFX_NODE_ERROR_CODES.envelopeInvalid,
        );
        return nodeError(OPENFX_NODE_ERROR_CODES.envelopeInvalid, 502);
      }
      await appendRelayOutcome("succeeded");
      return Response.json(reply.result);
    } catch (error) {
      if (error instanceof OpenFxNodeProtocolError) {
        await appendRelayOutcome("failed", error.code);
        return nodeError(error.code, 502);
      }
      await appendRelayOutcome(
        "failed",
        OPENFX_NODE_ERROR_CODES.envelopeInvalid,
      );
      return nodeError(OPENFX_NODE_ERROR_CODES.envelopeInvalid, 502);
    }
  };

  const isCorrelatedRelayReply = (
    value: unknown,
    request: { nonce: string; method: string; path: string },
  ): value is RelayReply => {
    if (!value || typeof value !== "object") return false;
    const reply = value as Partial<RelayReply>;
    if (!reply.request || typeof reply.request !== "object") return false;
    return reply.request.nonce === request.nonce &&
      reply.request.method === request.method &&
      reply.request.path === request.path &&
      Object.hasOwn(reply, "result");
  };

  const readBoundedRelayResponse = async (
    response: Response,
    maxBytes: number,
  ): Promise<unknown> => {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new OpenFxNodeProtocolError(
        OPENFX_NODE_ERROR_CODES.envelopeInvalid,
        `Relay response exceeded ${maxBytes / 1024} KiB.`,
      );
    }
    if (!response.body) {
      throw new OpenFxNodeProtocolError(
        OPENFX_NODE_ERROR_CODES.envelopeInvalid,
        "Relay response body is missing.",
      );
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new OpenFxNodeProtocolError(
            OPENFX_NODE_ERROR_CODES.envelopeInvalid,
            `Relay response exceeded ${maxBytes / 1024} KiB.`,
          );
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }

    const payload = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      payload.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder().decode(payload));
    } catch {
      throw new OpenFxNodeProtocolError(
        OPENFX_NODE_ERROR_CODES.envelopeInvalid,
        "Relay response body is not valid JSON.",
      );
    }
  };

  const stableResponse = <Args extends unknown[]>(
    handler: (...args: Args) => Promise<Response>,
  ) =>
  async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return error instanceof ConsoleStoreUnavailableError
        ? jsonError("control_plane_unavailable", 503)
        : nodeError(OPENFX_NODE_ERROR_CODES.internal, 500);
    }
  };

  return {
    adminSession: {
      create: stableResponse(createSession),
      get: stableResponse(getSession),
      delete: stableResponse(deleteSession),
    },
    pairings: { create: stableResponse(createPairing) },
    node: {
      pair: stableResponse(pairNode),
      revoke: stableResponse(revokeNode),
      heartbeat: stableResponse(heartbeat),
      telemetry: stableResponse(telemetry),
      events: stableResponse(ingestNodeEvents),
    },
    console: {
      handle: stableResponse(relay),
      telemetry: stableResponse(listTelemetry),
      audit: stableResponse(listAudit),
    },
    events: {
      append: eventService.append,
      snapshot: stableResponse(eventService.snapshot),
      stream: stableResponse(eventService.stream),
    },
    authorize: async (req) => {
      try {
        return await authorize(req);
      } catch {
        return false;
      }
    },
  };
};

export const getConsoleControlPlane = (() => {
  let instance: ConsoleControlPlane | undefined;
  return (): ConsoleControlPlane => instance ??= createConsoleControlPlane();
})();

const nextCounter = async (store: ConsoleStore, name: string): Promise<number> => {
  const key = [...ROOT, name] as const;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const current = await store.get<number>(key);
    const next = (current?.value ?? 0) + 1;
    if (await store.compareAndSet(key, current?.versionstamp ?? null, next)) {
      return next;
    }
  }
  throw new Error(`counter_conflict:${name}`);
};

const recordLoginFailure = async (
  store: ConsoleStore,
  key: ConsoleKey,
  now: number,
): Promise<number> => {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const current = await store.get<LoginRateRecord>(key);
    const active = current && current.value.resetAt > now;
    const failures = active ? current.value.attempts + 1 : 1;
    const value: LoginRateRecord = {
      attempts: failures,
      resetAt: active ? current.value.resetAt : now + LOGIN_WINDOW_MS,
    };
    if (
      await store.compareAndSet(
        key,
        current?.versionstamp ?? null,
        value,
        { expireIn: LOGIN_WINDOW_MS },
      )
    ) {
      return failures;
    }
  }
  return LOGIN_LIMIT;
};

const parseCredentialKey = (value: string): Uint8Array | null => {
  if (!value) return null;
  const raw = utf8(value);
  if (raw.length === 32) return raw;
  try {
    const decoded = decodeBase64Url(value);
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
};

const decryptNodeSecret = async (
  store: ConsoleStore,
  keyValue: string,
  cryptoAdapter: ReturnType<typeof createWebCryptoAdapter>,
): Promise<Uint8Array | null> => {
  const credential = await store.get<StoredCredential>([...ROOT, "node", "credential"]);
  return credential
    ? await decryptStoredCredential(credential.value, keyValue, cryptoAdapter)
    : null;
};

const decryptStoredCredential = async (
  credential: StoredCredential,
  keyValue: string,
  cryptoAdapter: ReturnType<typeof createWebCryptoAdapter>,
): Promise<Uint8Array | null> => {
  const key = parseCredentialKey(keyValue);
  if (!key) return null;
  try {
    return await cryptoAdapter.aes256GcmDecrypt(
      key,
      decodeBase64Url(credential.iv),
      decodeBase64Url(credential.ciphertext),
      CREDENTIAL_AAD,
    );
  } catch {
    return null;
  }
};

const consumeNonce = async (
  store: ConsoleStore,
  nonce: string,
  now: number,
): Promise<boolean> => {
  const key = [...ROOT, "relay-nonces", nonce] as const;
  const current = await store.get<{ expiresAt: number }>(key);
  if (current && current.value.expiresAt > now) return false;
  return await store.compareAndSet(
    key,
    current?.versionstamp ?? null,
    { expiresAt: now + 60_000 },
    { expireIn: 60_000 },
  );
};

const clearedSessionResponse = (req: Request): Response =>
  Response.json(
    { ok: true },
    { headers: { "set-cookie": sessionCookie(req, "", 0) } },
  );

const sessionCookie = (req: Request, token: string, ttlMs: number): string => {
  const url = new URL(req.url);
  const local = isLocalUrl(url);
  return [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${Math.floor(ttlMs / 1000)}`,
    local ? "" : "Secure",
  ].filter(Boolean).join("; ");
};

const isLocalUrl = (value: string | URL): boolean => {
  const url = typeof value === "string" ? new URL(value) : value;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]" || url.hostname === "::1";
};

const parseCookie = (header: string, name: string): string => {
  for (const item of header.split(";")) {
    const [candidate, ...rest] = item.trim().split("=");
    if (candidate === name) return rest.join("=");
  }
  return "";
};

const clientIdentity = (req: Request): string => getTrustedClientIdentity(req);

const jsonError = (
  error: string,
  status: number,
  headers?: HeadersInit,
): Response => Response.json({ ok: false, error }, { status, headers });

const nodeError = (error: string, status: number): Response => jsonError(error, status);
