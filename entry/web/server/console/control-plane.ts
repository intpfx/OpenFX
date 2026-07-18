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
  retainTelemetryMinutes,
  type SealedRelayEnvelope,
  sealRelayEnvelope,
  signRequest,
  TELEMETRY_AGGREGATE_MS,
  TELEMETRY_RETENTION_MS,
  type TelemetryMinute,
  type TelemetrySample,
} from "../../../../domains/_shared/openfx-node/mod.ts";
import {
  decodeBase64Url,
  encodeBase64Url,
  utf8,
} from "../../../../domains/_shared/openfx-node/encoding.ts";
import { openRelayEnvelope } from "../../../../domains/_shared/openfx-node/relay.ts";
import { type ConsoleKey, type ConsoleStore, getDefaultConsoleStore } from "./store.ts";

export { createMemoryConsoleStore } from "./store.ts";

const ROOT = ["openfx-console"] as const;
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60_000;
const NODE_ONLINE_WINDOW_MS = 45_000;
const REQUEST_LIMIT_BYTES = 64 * 1024;
const EVENT_RETENTION_MS = TELEMETRY_RETENTION_MS;
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
export type ConsoleEventType =
  | "telemetry"
  | "agent.delta"
  | "approval.requested"
  | "approval.resolved"
  | "heartbeat";

export interface StoredConsoleEvent {
  id: number;
  type: ConsoleEventType;
  data: unknown;
  createdAt: number;
}

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
}

interface StoredCredential {
  digest: string;
  iv: string;
  ciphertext: string;
}

interface TelemetryBucket {
  minute: TelemetryMinute;
  samples: TelemetrySample[];
}

export interface ConsoleControlPlaneOptions {
  store?: ConsoleStore;
  env?: Record<string, string | undefined>;
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
  fetch?: typeof fetch;
  ssePollMs?: number;
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
    heartbeat(req: Request): Promise<Response>;
    telemetry(req: Request): Promise<Response>;
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
    : getDefaultConsoleStore();
  const now = options.now ?? Date.now;
  const cryptoAdapter = createWebCryptoAdapter();
  const randomBytes = options.randomBytes ?? cryptoAdapter.randomBytes;
  const relayFetch = options.fetch ?? globalThis.fetch;
  const ssePollMs = options.ssePollMs ?? 1_000;
  const listeners = new Set<(event: StoredConsoleEvent) => void>();

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

  const appendEvent = async (
    type: ConsoleEventType,
    data: unknown,
  ): Promise<StoredConsoleEvent> => {
    const store = await storePromise;
    const id = await nextCounter(store, "event-counter");
    const event = { id, type, data, createdAt: now() } satisfies StoredConsoleEvent;
    await store.set([...ROOT, "events", id], event);
    await pruneBefore<StoredConsoleEvent>(
      store,
      [...ROOT, "events"],
      now() - EVENT_RETENTION_MS,
      (value) => value.createdAt,
    );
    for (const listener of listeners) listener(event);
    return event;
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
    if (token) {
      await (await storePromise).delete([...ROOT, "sessions", await digest(token)]);
    }
    await appendAudit({
      category: "admin",
      action: "session.logout",
      outcome: "succeeded",
      actor: clientIdentity(req),
    });
    return Response.json(
      { ok: true },
      { headers: { "set-cookie": sessionCookie(req, "", 0) } },
    );
  };

  const createPairing = async (req: Request): Promise<Response> => {
    const denied = await requireSession(req);
    if (denied) return denied;
    const code = generatePairingCode(randomBytes);
    const codeDigest = await digest(code);
    const record = {
      createdAt: now(),
      expiresAt: now() + PAIRING_TTL_MS,
    } satisfies PairingRecord;
    await (await storePromise).set([...ROOT, "pairings", codeDigest], record);
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
    const store = await storePromise;
    const key = [...ROOT, "pairings", await digest(code)] as const;
    let pairing = await store.get<PairingRecord>(key);
    if (!pairing) return nodeError(OPENFX_NODE_ERROR_CODES.pairingInvalid, 404);
    if (pairing.value.usedAt !== undefined) {
      return nodeError(OPENFX_NODE_ERROR_CODES.pairingUsed, 409);
    }
    if (pairing.value.expiresAt <= now()) {
      return nodeError(OPENFX_NODE_ERROR_CODES.pairingExpired, 410);
    }
    const consumed = { ...pairing.value, usedAt: now() } satisfies PairingRecord;
    if (!await store.compareAndSet(key, pairing.versionstamp, consumed)) {
      pairing = await store.get<PairingRecord>(key);
      return nodeError(
        pairing?.value.usedAt !== undefined
          ? OPENFX_NODE_ERROR_CODES.pairingUsed
          : OPENFX_NODE_ERROR_CODES.pairingInvalid,
        pairing?.value.usedAt !== undefined ? 409 : 404,
      );
    }
    const nodeSecret = randomBytes(32);
    const nodeId = encodeBase64Url(randomBytes(16));
    const iv = randomBytes(12);
    const credential: StoredCredential = {
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
    const node: NodeRecord = {
      id: nodeId,
      name: String(parsed.name).trim(),
      protocolVersion: PROTOCOL_VERSION,
      publicIpv6: String(parsed.publicIpv6).trim(),
      port: NODE_PORT,
      status: "unknown",
      pairedAt: now(),
      lastSeenAt: 0,
    };
    await store.set([...ROOT, "node", "active"], node);
    await store.set([...ROOT, "node", "credential"], credential);
    await appendAudit({
      category: "pairing",
      action: "node.paired",
      outcome: "succeeded",
      nodeId,
      subjectId: nodeId,
    });
    return Response.json(
      { ok: true, node, nodeSecret: encodeBase64Url(nodeSecret) },
      { status: 201 },
    );
  };

  const authorizeNode = async (
    req: Request,
    nodeId: unknown,
  ): Promise<{ store: ConsoleStore; node: NodeRecord } | Response> => {
    const store = await storePromise;
    const active = await store.get<NodeRecord>([...ROOT, "node", "active"]);
    const credential = await store.get<StoredCredential>([
      ...ROOT,
      "node",
      "credential",
    ]);
    const token = bearerToken(req.headers.get("authorization") ?? "");
    if (!active || !credential || active.value.id !== nodeId || !token) {
      return nodeError(OPENFX_NODE_ERROR_CODES.unauthorized, 401);
    }
    let supplied: Uint8Array;
    try {
      supplied = decodeBase64Url(token);
    } catch {
      return nodeError(OPENFX_NODE_ERROR_CODES.unauthorized, 401);
    }
    const valid = constantTimeEqual(
      utf8(await digest(supplied)),
      utf8(credential.value.digest),
    );
    return valid
      ? { store, node: active.value }
      : nodeError(OPENFX_NODE_ERROR_CODES.unauthorized, 401);
  };

  const heartbeat = async (req: Request): Promise<Response> => {
    const parsed = await readJsonObject(req);
    if (parsed instanceof Response) return parsed;
    const validation = validateNodeEndpoint(parsed);
    if (validation) return validation;
    const authorization = await authorizeNode(req, parsed.nodeId);
    if (authorization instanceof Response) return authorization;
    const availability = parsed.availability;
    if (!["online", "offline", "degraded"].includes(String(availability))) {
      return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
    }
    const status: NodeStatus = {
      nodeId: authorization.node.id,
      availability: availability as NodeStatus["availability"],
      protocolVersion: PROTOCOL_VERSION,
      publicIpv6: String(parsed.publicIpv6),
      port: NODE_PORT,
      lastSeenAt: now(),
    };
    const node = { ...authorization.node, ...status, status: status.availability };
    await authorization.store.set([...ROOT, "node", "active"], node);
    await authorization.store.set([...ROOT, "node", "status"], status);
    await appendEvent("heartbeat", status);
    return Response.json({ ok: true, receivedAt: now() });
  };

  const telemetry = async (req: Request): Promise<Response> => {
    const parsed = await readJsonObject(req);
    if (parsed instanceof Response) return parsed;
    if (parsed.protocolVersion !== PROTOCOL_VERSION) {
      return nodeError(OPENFX_NODE_ERROR_CODES.protocolMismatch, 400);
    }
    const authorization = await authorizeNode(req, parsed.nodeId);
    if (authorization instanceof Response) return authorization;
    const sample = parseTelemetrySample(parsed.sample);
    if (!sample) return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
    const minuteStart = Math.floor(sample.collectedAt / TELEMETRY_AGGREGATE_MS) *
      TELEMETRY_AGGREGATE_MS;
    const key = [...ROOT, "telemetry", minuteStart] as const;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await authorization.store.get<TelemetryBucket>(key);
      const samples = [...(current?.value.samples ?? []), sample].slice(-60);
      const minute = aggregateTelemetrySamples(samples)[0]!;
      if (
        await authorization.store.compareAndSet(
          key,
          current?.versionstamp ?? null,
          { minute, samples } satisfies TelemetryBucket,
        )
      ) break;
      if (attempt === 7) return nodeError(OPENFX_NODE_ERROR_CODES.internal, 503);
    }
    await pruneTelemetry(authorization.store, now());
    await appendEvent("telemetry", aggregateTelemetrySamples([sample])[0]);
    return Response.json({ ok: true, minuteStart }, { status: 202 });
  };

  const listTelemetry = async (req: Request): Promise<Response> => {
    const denied = await requireSession(req);
    if (denied) return denied;
    const store = await storePromise;
    await pruneTelemetry(store, now());
    const buckets = await store.list<TelemetryBucket>([...ROOT, "telemetry"]);
    const minutes = retainTelemetryMinutes(
      buckets.map((entry) => entry.value.minute),
      now(),
    ).sort((left, right) => left.minuteStart - right.minuteStart);
    return Response.json({ ok: true, minutes });
  };

  const listAudit = async (req: Request): Promise<Response> => {
    const denied = await requireSession(req);
    if (denied) return denied;
    const entries = await (await storePromise).list<AuditEvent>([...ROOT, "audit"]);
    return Response.json({ ok: true, events: entries.map((entry) => entry.value) });
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
    if (!isAllowedRelayBody(operation, body)) {
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
      return nodeError(OPENFX_NODE_ERROR_CODES.nodeOffline, 503);
    }
    if (!upstream.ok) return nodeError(OPENFX_NODE_ERROR_CODES.relayUnavailable, 502);
    try {
      const replyEnvelope = await upstream.json() as SealedRelayEnvelope;
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
        return nodeError(OPENFX_NODE_ERROR_CODES.replayDetected, 409);
      }
      await appendAudit({
        category: "relay",
        action: route.path,
        outcome: "succeeded",
        nodeId: node.value.id,
      });
      if (operation === "agent.messages.post") {
        await appendEvent("agent.delta", reply);
      } else if (operation === "approvals.resolve") {
        await appendEvent("approval.resolved", reply);
      }
      return Response.json(reply);
    } catch (error) {
      if (error instanceof OpenFxNodeProtocolError) {
        return nodeError(error.code, 502);
      }
      return nodeError(OPENFX_NODE_ERROR_CODES.envelopeInvalid, 502);
    }
  };

  const eventSnapshot = async (req: Request): Promise<Response> => {
    const denied = await requireSession(req);
    if (denied) return denied;
    const after = parseLastEventId(req);
    const events = await retainedEvents(await storePromise, after, now());
    return new Response(
      `: keepalive\n\n${events.map(formatSseEvent).join("")}`,
      { headers: sseHeaders() },
    );
  };

  const eventStream = async (req: Request): Promise<Response> => {
    const denied = await requireSession(req);
    if (denied) return denied;
    const initialId = parseLastEventId(req);
    const backlog = await retainedEvents(await storePromise, initialId, now());
    const encoder = new TextEncoder();
    let listener: ((event: StoredConsoleEvent) => void) | undefined;
    let keepalive: number | undefined;
    let poller: number | undefined;
    let polling = false;
    let lastSent = backlog.at(-1)?.id ?? initialId;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
        for (const event of backlog) {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        }
        listener = (event) => {
          if (event.id <= lastSent) return;
          lastSent = event.id;
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        };
        listeners.add(listener);
        poller = setInterval(async () => {
          if (polling) return;
          polling = true;
          try {
            const events = await retainedEvents(await storePromise, lastSent, now());
            for (const event of events) listener?.(event);
          } catch {
            // A transient KV read failure must not terminate an established SSE stream.
          } finally {
            polling = false;
          }
        }, ssePollMs);
        keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            if (listener) listeners.delete(listener);
            if (keepalive !== undefined) clearInterval(keepalive);
            if (poller !== undefined) clearInterval(poller);
          }
        }, 15_000);
      },
      cancel() {
        if (listener) listeners.delete(listener);
        if (keepalive !== undefined) clearInterval(keepalive);
        if (poller !== undefined) clearInterval(poller);
      },
    });
    return new Response(stream, { headers: sseHeaders() });
  };

  return {
    adminSession: { create: createSession, get: getSession, delete: deleteSession },
    pairings: { create: createPairing },
    node: { pair: pairNode, heartbeat, telemetry },
    console: { handle: relay, telemetry: listTelemetry, audit: listAudit },
    events: { append: appendEvent, snapshot: eventSnapshot, stream: eventStream },
    authorize,
  };
};

export const getConsoleControlPlane = (() => {
  let instance: ConsoleControlPlane | undefined;
  return (): ConsoleControlPlane => instance ??= createConsoleControlPlane();
})();

export const formatSseEvent = (
  event: Pick<StoredConsoleEvent, "id" | "type" | "data">,
): string =>
  `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;

const sseHeaders = (): HeadersInit => ({
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
});

const retainedEvents = async (
  store: ConsoleStore,
  after: number,
  now: number,
): Promise<StoredConsoleEvent[]> =>
  (await store.list<StoredConsoleEvent>([...ROOT, "events"]))
    .map((entry) => entry.value)
    .filter((event) => event.id > after && event.createdAt >= now - EVENT_RETENTION_MS)
    .sort((left, right) => left.id - right.id);

const parseLastEventId = (req: Request): number => {
  const value = Number(req.headers.get("last-event-id") ?? "0");
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
};

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
    if (await store.compareAndSet(key, current?.versionstamp ?? null, value)) {
      return failures;
    }
  }
  return LOGIN_LIMIT;
};

const pruneBefore = async <T>(
  store: ConsoleStore,
  prefix: ConsoleKey,
  cutoff: number,
  timestamp: (value: T) => number,
): Promise<void> => {
  for (const entry of await store.list<T>(prefix)) {
    if (timestamp(entry.value) < cutoff) await store.delete(entry.key);
  }
};

const pruneTelemetry = async (store: ConsoleStore, now: number): Promise<void> => {
  const cutoff = now - TELEMETRY_RETENTION_MS;
  for (const entry of await store.list<TelemetryBucket>([...ROOT, "telemetry"])) {
    if (entry.value.minute.minuteStart < cutoff) await store.delete(entry.key);
  }
};

const readJsonObject = async (
  req: Request,
): Promise<Record<string, unknown> | Response> => {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > REQUEST_LIMIT_BYTES) {
    return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 413);
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
  }
  if (new TextEncoder().encode(text).length > REQUEST_LIMIT_BYTES) {
    return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 413);
  }
  try {
    const value = text ? JSON.parse(text) : {};
    return value !== null && !Array.isArray(value) && typeof value === "object"
      ? value as Record<string, unknown>
      : nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
  } catch {
    return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
  }
};

const validateNodeEndpoint = (input: Record<string, unknown>): Response | null => {
  if (input.protocolVersion !== PROTOCOL_VERSION) {
    return nodeError(OPENFX_NODE_ERROR_CODES.protocolMismatch, 400);
  }
  if (
    typeof input.name !== "string" && input.nodeId === undefined ||
    (typeof input.name === "string" &&
      (input.name.trim().length === 0 || input.name.length > 128)) ||
    typeof input.publicIpv6 !== "string" || !isGlobalIpv6(input.publicIpv6) ||
    input.port !== NODE_PORT
  ) return nodeError(OPENFX_NODE_ERROR_CODES.invalidRequest, 400);
  return null;
};

const isGlobalIpv6 = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized.includes(":") || !/^[0-9a-f:]+$/.test(normalized)) return false;
  try {
    new URL(`http://[${normalized}]/`);
  } catch {
    return false;
  }
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("ff")) {
    return false;
  }
  const first = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
  if (!Number.isFinite(first)) return false;
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return false;
  return first >= 0x2000 && first <= 0x3fff;
};

const isAllowedRelayBody = (
  operation: ConsoleRelayOperation,
  body: unknown,
): boolean => {
  if (CONSOLE_RELAY_OPERATIONS[operation].method === "GET") return body === null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  const exactKeys = (allowed: readonly string[]) =>
    Object.keys(record).every((key) => allowed.includes(key));
  switch (operation) {
    case "agent.messages.post":
      return exactKeys(["message", "conversationId"]) &&
        typeof record.message === "string" && record.message.length > 0 &&
        record.message.length <= 16_384;
    case "approvals.resolve":
      return exactKeys(["id", "decision", "parameterFingerprint"]) &&
        typeof record.id === "string" &&
        (record.decision === "approved" || record.decision === "rejected") &&
        typeof record.parameterFingerprint === "string";
    case "relay.settings.update":
      return exactKeys(["enabled"]) && typeof record.enabled === "boolean";
    default:
      return false;
  }
};

const parseTelemetrySample = (value: unknown): TelemetrySample | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sample = value as Record<string, unknown>;
  const finiteNonNegative = (key: string) =>
    typeof sample[key] === "number" && Number.isFinite(sample[key]) &&
    (sample[key] as number) >= 0;
  const keys = [
    "collectedAt",
    "cpuUsagePercent",
    "memoryUsedBytes",
    "memoryTotalBytes",
    "diskUsedBytes",
    "diskTotalBytes",
    "networkRxBytes",
    "networkTxBytes",
    "processCount",
  ];
  if (!keys.every(finiteNonNegative)) return null;
  if ((sample.cpuUsagePercent as number) > 100) return null;
  if (
    sample.batteryPercent !== null &&
    (!finiteNonNegative("batteryPercent") || (sample.batteryPercent as number) > 100)
  ) return null;
  return sample as unknown as TelemetrySample;
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
  const key = parseCredentialKey(keyValue);
  const credential = await store.get<StoredCredential>([...ROOT, "node", "credential"]);
  if (!key || !credential) return null;
  try {
    return await cryptoAdapter.aes256GcmDecrypt(
      key,
      decodeBase64Url(credential.value.iv),
      decodeBase64Url(credential.value.ciphertext),
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
  );
};

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

const bearerToken = (value: string): string =>
  value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";

const clientIdentity = (req: Request): string =>
  (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "local")
    .split(",", 1)[0]!.trim();

const jsonError = (
  error: string,
  status: number,
  headers?: HeadersInit,
): Response => Response.json({ ok: false, error }, { status, headers });

const nodeError = (error: string, status: number): Response => jsonError(error, status);
