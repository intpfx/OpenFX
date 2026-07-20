import { expect } from "@std/expect";

import {
  type ConsoleControlPlane,
  consoleRelayTimeoutMs,
  createConsoleControlPlane,
  createMemoryConsoleStore,
  formatSseEvent,
} from "../server/console/control-plane.ts";
import {
  ADMIN_SESSION_TTL_MS,
  createWebCryptoAdapter,
  openRelayEnvelope,
  sealRelayEnvelope,
  signedRequestHeaders,
  signRequest,
  TELEMETRY_AGGREGATE_MS,
} from "../../../domains/_shared/openfx-node/mod.ts";
import { decodeBase64Url } from "../../../domains/_shared/openfx-node/encoding.ts";

const CREDENTIAL_KEY = "0123456789abcdef0123456789abcdef";

Deno.test("Agent Relay timeout covers the shared 30 second node turn", () => {
  expect(consoleRelayTimeoutMs("overview")).toBe(8_000);
  expect(consoleRelayTimeoutMs("agent.messages.get")).toBe(35_000);
  expect(consoleRelayTimeoutMs("agent.messages.post")).toBe(35_000);
});

const jsonRequest = (url: string, body: unknown, headers: HeadersInit = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const signedJsonRequest = async (
  url: string,
  body: unknown,
  nodeSecret: string,
  timestamp = Date.parse("2026-07-18T00:00:00Z"),
) => {
  const target = new URL(url);
  const signed = await signRequest(
    createWebCryptoAdapter(),
    decodeBase64Url(nodeSecret),
    { method: "POST", path: target.pathname, body },
    { now: () => timestamp },
  );
  return jsonRequest(url, body, signedRequestHeaders(signed));
};

const cookieFrom = (response: Response): string =>
  response.headers.get("set-cookie")!.split(";", 1)[0]!;

const createHarness = (overrides: {
  now?: () => number;
  fetch?: typeof fetch;
  ssePollMs?: number;
} = {}) => {
  const store = createMemoryConsoleStore({ now: overrides.now });
  const plane = createConsoleControlPlane({
    store,
    env: {
      OPENFX_ADMIN_KEY: "correct horse battery staple",
      OPENFX_NODE_CREDENTIAL_KEY: CREDENTIAL_KEY,
    },
    now: overrides.now ?? (() => Date.parse("2026-07-18T00:00:00Z")),
    fetch: overrides.fetch,
    ssePollMs: overrides.ssePollMs,
  });
  return { plane, store };
};

const login = async (plane: ConsoleControlPlane, url = "http://localhost") => {
  const response = await plane.adminSession.create(
    jsonRequest(`${url}/api/admin/session`, {
      key: "correct horse battery staple",
    }),
  );
  expect(response.status).toBe(200);
  return cookieFrom(response);
};

const pair = async (plane: ConsoleControlPlane, cookie: string) => {
  const pairingResponse = await plane.pairings.create(
    jsonRequest("http://localhost/api/console/pairings", {}, { cookie }),
  );
  expect(pairingResponse.status).toBe(201);
  const pairing = await pairingResponse.json();
  const pairResponse = await plane.node.pair(
    jsonRequest("http://localhost/api/node/pair", {
      code: pairing.code,
      name: "Studio Mac",
      protocolVersion: 1,
      publicIpv6: "2001:4860:4860::8844",
      port: 24531,
    }),
  );
  expect(pairResponse.status).toBe(201);
  return await pairResponse.json() as { node: { id: string }; nodeSecret: string };
};

const heartbeatBody = (nodeId: string) => ({
  nodeId,
  protocolVersion: 1,
  publicIpv6: "2001:4860:4860::8844",
  port: 24531,
  availability: "online",
});

Deno.test("admin session stores a digest and emits strict localhost cookie attributes", async () => {
  const { plane, store } = createHarness();
  const response = await plane.adminSession.create(
    jsonRequest("http://localhost/api/admin/session", {
      key: "correct horse battery staple",
    }),
  );

  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Strict");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("Max-Age=43200");
  expect(cookie).not.toContain("Secure");
  const stored = await store.list({ prefix: ["openfx-console", "sessions"] });
  expect(stored).toHaveLength(1);
  expect(JSON.stringify(stored)).not.toContain(cookieFrom(response).split("=")[1]);

  const production = await plane.adminSession.create(
    jsonRequest("https://openfx.example/api/admin/session", {
      key: "correct horse battery staple",
    }),
  );
  expect(production.headers.get("set-cookie")).toContain("Secure");
});

Deno.test("admin session restores, logs out, and expires absolutely", async () => {
  let now = Date.parse("2026-07-18T00:00:00Z");
  const { plane } = createHarness({ now: () => now });
  const cookie = await login(plane);
  expect(
    (await plane.adminSession.get(
      new Request(
        "http://localhost/api/admin/session",
        { headers: { cookie } },
      ),
    )).status,
  ).toBe(200);

  now += 12 * 60 * 60_000 + 1;
  expect(
    (await plane.adminSession.get(
      new Request(
        "http://localhost/api/admin/session",
        { headers: { cookie } },
      ),
    )).status,
  ).toBe(401);

  const fresh = await login(plane);
  const logout = await plane.adminSession.delete(
    new Request(
      "http://localhost/api/admin/session",
      { method: "DELETE", headers: { cookie: fresh } },
    ),
  );
  expect(logout.status).toBe(200);
  expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
});

Deno.test("admin login rate limits failures and production fails closed without a key", async () => {
  const { plane } = createHarness();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await plane.adminSession.create(
      jsonRequest("https://openfx.example/api/admin/session", { key: "wrong" }, {
        "x-forwarded-for": "203.0.113.4",
      }),
    );
    expect(response.status).toBe(attempt === 4 ? 429 : 401);
  }

  const closed = createConsoleControlPlane({
    store: createMemoryConsoleStore(),
    env: { DENO_DEPLOYMENT_ID: "production" },
  });
  const response = await closed.adminSession.create(
    jsonRequest("https://openfx.example/api/admin/session", { key: "anything" }),
  );
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: "admin_not_configured",
  });
});

Deno.test("admin APIs require a session cookie and reject the legacy admin header", async () => {
  const { plane } = createHarness();
  const legacy = await plane.pairings.create(
    jsonRequest("http://localhost/api/console/pairings", {}, {
      "x-openfx-admin-key": "correct horse battery staple",
    }),
  );
  expect(legacy.status).toBe(401);

  const cookie = await login(plane);
  expect(
    (await plane.pairings.create(
      jsonRequest("http://localhost/api/console/pairings", {}, { cookie }),
    )).status,
  ).toBe(201);
});

Deno.test("completed pairing transport retries are idempotent only during grace", async () => {
  let now = Date.parse("2026-07-18T00:00:00Z");
  const { plane } = createHarness({ now: () => now });
  const cookie = await login(plane);
  const created = await plane.pairings.create(
    jsonRequest("http://localhost/api/console/pairings", {}, { cookie }),
  );
  const { code } = await created.json();
  const body = {
    code,
    name: "Studio Mac",
    protocolVersion: 1,
    publicIpv6: "2001:4860:4860::8844",
    port: 24531,
  };
  const first = await plane.node.pair(
    jsonRequest("http://localhost/api/node/pair", body),
  );
  expect(first.status).toBe(201);
  const firstBody = await first.json();
  const replay = await plane.node.pair(
    jsonRequest("http://localhost/api/node/pair", body),
  );
  expect(replay.status).toBe(201);
  await expect(replay.json()).resolves.toMatchObject({
    node: { id: firstBody.node.id },
    nodeSecret: firstBody.nodeSecret,
  });

  const mismatch = await plane.node.pair(
    jsonRequest("http://localhost/api/node/pair", {
      ...body,
      name: "Different Mac",
    }),
  );
  expect(mismatch.status).toBe(409);
  await expect(mismatch.json()).resolves.toMatchObject({
    error: "node_pairing_used",
  });

  const expiring = await plane.pairings.create(
    jsonRequest("http://localhost/api/console/pairings", {}, { cookie }),
  );
  const expiringCode = (await expiring.json()).code;
  now += 10 * 60_000 + 1;
  const graceRetry = await plane.node.pair(
    jsonRequest("http://localhost/api/node/pair", body),
  );
  expect(graceRetry.status).toBe(201);
  await expect(graceRetry.json()).resolves.toMatchObject({
    node: { id: firstBody.node.id },
    nodeSecret: firstBody.nodeSecret,
  });
  const expired = await plane.node.pair(
    jsonRequest("http://localhost/api/node/pair", { ...body, code: expiringCode }),
  );
  expect(expired.status).toBe(410);
  await expect(expired.json()).resolves.toMatchObject({
    error: "node_pairing_expired",
  });

  now += 60_000;
  const afterGrace = await plane.node.pair(
    jsonRequest("http://localhost/api/node/pair", body),
  );
  expect(afterGrace.status).toBe(404);
  await expect(afterGrace.json()).resolves.toMatchObject({
    error: "node_pairing_invalid",
  });
});

Deno.test("pairing validates protocol and fixed global IPv6 endpoint without leaking secrets", async () => {
  const { plane, store } = createHarness();
  const cookie = await login(plane);
  const pairing = await plane.pairings.create(
    jsonRequest("http://localhost/api/console/pairings", {}, { cookie }),
  );
  const code = (await pairing.json()).code;
  const rejected = await plane.node.pair(
    jsonRequest("http://localhost/api/node/pair", {
      code,
      name: "bad",
      protocolVersion: 2,
      publicIpv6: "::1",
      port: 3000,
    }),
  );
  expect(rejected.status).toBe(400);
  await expect(rejected.json()).resolves.toMatchObject({
    error: "node_protocol_mismatch",
  });

  const paired = await pair(plane, cookie);
  expect(decodeBase64Url(paired.nodeSecret)).toHaveLength(32);
  const persisted = JSON.stringify(
    await store.list({ prefix: ["openfx-console"] }),
  );
  expect(persisted).not.toContain(paired.nodeSecret);
  const overview = await plane.console.handle(
    new Request("http://localhost/api/console/overview", { headers: { cookie } }),
    "overview",
  );
  expect(JSON.stringify(await overview.json())).not.toContain(paired.nodeSecret);
});

Deno.test("administrator can atomically revoke the active node credential", async () => {
  const { plane, store } = createHarness();
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);

  const unauthorized = await plane.node.revoke(
    new Request("http://localhost/api/console/node", { method: "DELETE" }),
  );
  expect(unauthorized.status).toBe(401);

  const revoked = await plane.node.revoke(
    new Request("http://localhost/api/console/node", {
      method: "DELETE",
      headers: { cookie },
    }),
  );
  expect(revoked.status).toBe(200);
  await expect(revoked.json()).resolves.toMatchObject({
    ok: true,
    revokedNodeId: paired.node.id,
  });
  expect(await store.list({ prefix: ["openfx-console", "node"] })).toEqual([]);

  const audits = await store.list<{ action: string; subjectId?: string }>({
    prefix: ["openfx-console", "audit"],
  });
  expect(audits.map((entry) => entry.value)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "node.revoked",
        subjectId: paired.node.id,
      }),
    ]),
  );
});

Deno.test("node heartbeat accepts signed headers without receiving the credential", async () => {
  const now = Date.parse("2026-07-18T00:00:00Z");
  const { plane, store } = createHarness({ now: () => now });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  const request = await signedJsonRequest(
    "https://openfx.example/api/node/heartbeat",
    {
      nodeId: paired.node.id,
      protocolVersion: 1,
      publicIpv6: "2001:4860:4860::8844",
      port: 24531,
      availability: "online",
    },
    paired.nodeSecret,
    now,
  );

  expect(request.headers.get("authorization")).toBeNull();
  expect(JSON.stringify([...request.headers])).not.toContain(paired.nodeSecret);
  expect((await plane.node.heartbeat(request)).status).toBe(200);
  expect(
    await store.list({ prefix: ["openfx-console", "node-request-nonces"] }),
  ).toHaveLength(1);
});

Deno.test("node request nonce is consumed atomically and rejects a concurrent replay", async () => {
  const now = Date.parse("2026-07-18T00:00:00Z");
  const { plane, store } = createHarness({ now: () => now });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  const signed = await signedJsonRequest(
    "https://openfx.example/api/node/heartbeat",
    heartbeatBody(paired.node.id),
    paired.nodeSecret,
    now,
  );
  const [first, replay] = await Promise.all([
    plane.node.heartbeat(signed.clone()),
    plane.node.heartbeat(signed.clone()),
  ]);

  expect([first.status, replay.status].sort()).toEqual([200, 409]);
  const rejected = first.status === 409 ? first : replay;
  await expect(rejected.json()).resolves.toMatchObject({
    error: "node_replay_detected",
  });
  expect(
    await store.list({ prefix: ["openfx-console", "node-request-nonces"] }),
  ).toHaveLength(1);
});

Deno.test("heartbeat retries an effect CAS conflict without consuming its nonce early", async () => {
  const now = Date.parse("2026-07-18T00:00:00Z");
  const base = createMemoryConsoleStore({ now: () => now });
  let rejectedStatusWrite = false;
  const store = {
    ...base,
    atomic(operation: Parameters<typeof base.atomic>[0]) {
      if (
        !rejectedStatusWrite &&
        operation.sets.some((item) =>
          item.key[1] === "node" && item.key[2] === "status"
        )
      ) {
        rejectedStatusWrite = true;
        return Promise.resolve(false);
      }
      return base.atomic(operation);
    },
  };
  const plane = createConsoleControlPlane({
    store,
    env: {
      OPENFX_ADMIN_KEY: "correct horse battery staple",
      OPENFX_NODE_CREDENTIAL_KEY: CREDENTIAL_KEY,
    },
    now: () => now,
  });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  const response = await plane.node.heartbeat(
    await signedJsonRequest(
      "https://openfx.example/api/node/heartbeat",
      heartbeatBody(paired.node.id),
      paired.nodeSecret,
      now,
    ),
  );

  expect(rejectedStatusWrite).toBe(true);
  expect(response.status).toBe(200);
  expect(await store.get(["openfx-console", "node", "status"])).not.toBeNull();
  expect(
    await store.list({ prefix: ["openfx-console", "node-request-nonces"] }),
  ).toHaveLength(1);
});

Deno.test("telemetry retries an effect CAS conflict and stores the signed sample once", async () => {
  const now = Date.parse("2026-07-18T00:00:00Z");
  const base = createMemoryConsoleStore({ now: () => now });
  let rejectedTelemetryWrite = false;
  const store = {
    ...base,
    atomic(operation: Parameters<typeof base.atomic>[0]) {
      if (
        !rejectedTelemetryWrite &&
        operation.sets.some((item) => item.key[1] === "telemetry")
      ) {
        rejectedTelemetryWrite = true;
        return Promise.resolve(false);
      }
      return base.atomic(operation);
    },
  };
  const plane = createConsoleControlPlane({
    store,
    env: {
      OPENFX_ADMIN_KEY: "correct horse battery staple",
      OPENFX_NODE_CREDENTIAL_KEY: CREDENTIAL_KEY,
    },
    now: () => now,
  });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  const body = {
    nodeId: paired.node.id,
    protocolVersion: 1,
    sample: {
      collectedAt: now,
      cpuUsagePercent: 20,
      memoryUsedBytes: 10,
      memoryTotalBytes: 100,
      diskUsedBytes: 20,
      diskTotalBytes: 200,
      networkRxBytes: 1000,
      networkTxBytes: 2000,
      batteryPercent: null,
      processCount: 4,
    },
  };
  const response = await plane.node.telemetry(
    await signedJsonRequest(
      "https://openfx.example/api/node/telemetry",
      body,
      paired.nodeSecret,
      now,
    ),
  );

  expect(rejectedTelemetryWrite).toBe(true);
  expect(response.status).toBe(202);
  const buckets = await store.list<{ samples: unknown[] }>({
    prefix: ["openfx-console", "telemetry"],
  });
  expect(buckets).toHaveLength(1);
  expect(buckets[0]?.value.samples).toHaveLength(1);
  expect(
    await store.list({ prefix: ["openfx-console", "node-request-nonces"] }),
  ).toHaveLength(1);
});

Deno.test("node signatures reject stale timestamps, body tampering, and cross-route reuse", async () => {
  const now = Date.parse("2026-07-18T00:00:00Z");
  const { plane } = createHarness({ now: () => now });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  const body = heartbeatBody(paired.node.id);

  const stale = await plane.node.heartbeat(
    await signedJsonRequest(
      "https://openfx.example/api/node/heartbeat",
      body,
      paired.nodeSecret,
      now - 30_001,
    ),
  );
  expect(stale.status).toBe(401);
  await expect(stale.json()).resolves.toMatchObject({
    error: "node_timestamp_invalid",
  });

  const original = await signedJsonRequest(
    "https://openfx.example/api/node/heartbeat",
    body,
    paired.nodeSecret,
    now,
  );
  const headers = Object.fromEntries(original.headers);
  const tampered = await plane.node.heartbeat(
    jsonRequest(
      "https://openfx.example/api/node/heartbeat",
      { ...body, availability: "degraded" },
      headers,
    ),
  );
  expect(tampered.status).toBe(401);
  await expect(tampered.json()).resolves.toMatchObject({
    error: "node_signature_invalid",
  });

  const crossRouteBody = {
    ...body,
    events: [{
      type: "agent.delta",
      data: { messageId: "m1", delta: "x", sequence: 1 },
    }],
  };
  const crossRouteSigned = await signedJsonRequest(
    "https://openfx.example/api/node/heartbeat",
    crossRouteBody,
    paired.nodeSecret,
    now,
  );
  const crossRoute = await plane.node.events(
    jsonRequest(
      "https://openfx.example/api/node/events",
      crossRouteBody,
      Object.fromEntries(crossRouteSigned.headers),
    ),
  );
  expect(crossRoute.status).toBe(401);
  await expect(crossRoute.json()).resolves.toMatchObject({
    error: "node_signature_invalid",
  });
});

Deno.test("credential rotation and revocation reject requests signed by retired secrets", async () => {
  const now = Date.parse("2026-07-18T00:00:00Z");
  const { plane } = createHarness({ now: () => now });
  const cookie = await login(plane);
  const first = await pair(plane, cookie);
  const retired = await signedJsonRequest(
    "https://openfx.example/api/node/heartbeat",
    heartbeatBody(first.node.id),
    first.nodeSecret,
    now,
  );

  const replacement = await pair(plane, cookie);
  expect((await plane.node.heartbeat(retired)).status).toBe(401);
  expect(
    (await plane.node.heartbeat(
      await signedJsonRequest(
        "https://openfx.example/api/node/heartbeat",
        heartbeatBody(replacement.node.id),
        replacement.nodeSecret,
        now,
      ),
    )).status,
  ).toBe(200);

  expect(
    (await plane.node.revoke(
      new Request("http://localhost/api/console/node", {
        method: "DELETE",
        headers: { cookie },
      }),
    )).status,
  ).toBe(200);
  expect(
    (await plane.node.heartbeat(
      await signedJsonRequest(
        "https://openfx.example/api/node/heartbeat",
        heartbeatBody(replacement.node.id),
        replacement.nodeSecret,
        now,
      ),
    )).status,
  ).toBe(401);
});

Deno.test("paused authorized heartbeat cannot resurrect or overwrite a re-paired node", async () => {
  const base = createMemoryConsoleStore();
  let pauseHeartbeat = false;
  let releaseHeartbeat!: () => void;
  let markPaused!: () => void;
  const paused = new Promise<void>((resolve) => markPaused = resolve);
  const released = new Promise<void>((resolve) => releaseHeartbeat = resolve);
  const isActiveKey = (key: readonly (string | number | boolean)[]) =>
    JSON.stringify(key) === JSON.stringify(["openfx-console", "node", "active"]);
  const pause = async () => {
    pauseHeartbeat = false;
    markPaused();
    await released;
  };
  const store = {
    ...base,
    async set(
      key: readonly (string | number | boolean)[],
      value: unknown,
      options?: { expireIn?: number },
    ) {
      if (pauseHeartbeat && isActiveKey(key)) await pause();
      await base.set(key, value, options);
    },
    async atomic(operation: Parameters<typeof base.atomic>[0]) {
      if (pauseHeartbeat && operation.sets.some((item) => isActiveKey(item.key))) {
        await pause();
      }
      return await base.atomic(operation);
    },
  };
  const plane = createConsoleControlPlane({
    store,
    env: {
      OPENFX_ADMIN_KEY: "correct horse battery staple",
      OPENFX_NODE_CREDENTIAL_KEY: CREDENTIAL_KEY,
    },
    now: () => Date.parse("2026-07-18T00:00:00Z"),
  });
  const cookie = await login(plane);
  const first = await pair(plane, cookie);
  pauseHeartbeat = true;
  const heartbeat = plane.node.heartbeat(
    await signedJsonRequest(
      "http://localhost/api/node/heartbeat",
      heartbeatBody(first.node.id),
      first.nodeSecret,
    ),
  );
  await paused;

  expect(
    (await plane.node.revoke(
      new Request("http://localhost/api/console/node", {
        method: "DELETE",
        headers: { cookie },
      }),
    )).status,
  ).toBe(200);
  const replacement = await pair(plane, cookie);
  releaseHeartbeat();

  expect((await heartbeat).status).toBe(401);
  const active = await store.get<{ id: string }>(["openfx-console", "node", "active"]);
  expect(active?.value.id).toBe(replacement.node.id);
  expect(active?.value.id).not.toBe(first.node.id);
  expect(await store.get(["openfx-console", "node", "status"])).toBeNull();
});

Deno.test("heartbeat and telemetry require signed node credentials and retain seven days", async () => {
  let now = Date.parse("2026-07-18T00:00:00Z");
  const { plane } = createHarness({ now: () => now });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  const unauthorized = await plane.node.heartbeat(
    jsonRequest(
      "http://localhost/api/node/heartbeat",
      heartbeatBody(paired.node.id),
    ),
  );
  expect(unauthorized.status).toBe(401);

  expect(
    (await plane.node.heartbeat(
      await signedJsonRequest(
        "http://localhost/api/node/heartbeat",
        heartbeatBody(paired.node.id),
        paired.nodeSecret,
        now,
      ),
    )).status,
  ).toBe(200);

  const sample = {
    collectedAt: now,
    cpuUsagePercent: 20,
    memoryUsedBytes: 10,
    memoryTotalBytes: 100,
    diskUsedBytes: 20,
    diskTotalBytes: 200,
    networkRxBytes: 1000,
    networkTxBytes: 2000,
    batteryPercent: null,
    processCount: 4,
  };
  expect(
    (await plane.node.telemetry(
      await signedJsonRequest(
        "http://localhost/api/node/telemetry",
        {
          nodeId: paired.node.id,
          protocolVersion: 1,
          sample,
        },
        paired.nodeSecret,
        now,
      ),
    )).status,
  ).toBe(202);

  now += 7 * 24 * 60 * 60_000 + 60_000;
  expect(
    (await plane.node.telemetry(
      await signedJsonRequest(
        "http://localhost/api/node/telemetry",
        {
          nodeId: paired.node.id,
          protocolVersion: 1,
          sample: { ...sample, collectedAt: now },
        },
        paired.nodeSecret,
        now,
      ),
    )).status,
  ).toBe(202);
  const freshCookie = await login(plane);
  const history = await plane.console.telemetry(
    new Request("http://localhost/api/console/telemetry", {
      headers: { cookie: freshCookie },
    }),
  );
  const payload = await history.json();
  expect(payload.minutes).toHaveLength(1);
  expect(payload.minutes[0].minuteStart).toBe(now);
});

Deno.test("node JSON input size and shape failures use stable errors", async () => {
  const { plane } = createHarness();
  const tooLarge = await plane.node.pair(
    jsonRequest("http://localhost/api/node/pair", { code: "A".repeat(70_000) }),
  );
  expect(tooLarge.status).toBe(413);
  await expect(tooLarge.json()).resolves.toMatchObject({
    ok: false,
    error: "node_invalid_request",
  });
});

Deno.test("Relay uses only the paired IPv6, port 24531, and fixed operation path", async () => {
  let pairedSecret = "";
  let calledUrl = "";
  let tamperReply = false;
  let wrongCorrelation = false;
  let redirectReply = false;
  const cryptoAdapter = createWebCryptoAdapter();
  const { plane } = createHarness({
    fetch: async (input, init) => {
      calledUrl = String(input);
      expect(init?.redirect).toBe("manual");
      if (redirectReply) {
        return new Response(null, {
          status: 307,
          headers: { location: "https://attacker.example/collect" },
        });
      }
      const requestEnvelope = JSON.parse(String(init?.body));
      const request = await openRelayEnvelope<{
        nonce: string;
        method: string;
        path: string;
      }>(
        cryptoAdapter,
        decodeBase64Url(pairedSecret),
        requestEnvelope,
        {
          now: () => Date.parse("2026-07-18T00:00:00Z"),
          replayProtector: { consume() {} },
        },
      );
      expect(request).toMatchObject({ path: "/v1/system/overview", method: "GET" });
      const reply = await sealRelayEnvelope(
        cryptoAdapter,
        decodeBase64Url(pairedSecret),
        {
          request: {
            nonce: wrongCorrelation ? "different-request" : request.nonce,
            method: request.method,
            path: request.path,
          },
          result: { ok: true, overview: { hostname: "studio" } },
        },
        { now: () => Date.parse("2026-07-18T00:00:00Z") },
      );
      return Response.json(tamperReply ? { ...reply, signature: "AAAA" } : reply);
    },
  });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  pairedSecret = paired.nodeSecret;
  await plane.node.heartbeat(
    await signedJsonRequest(
      "http://localhost/api/node/heartbeat",
      heartbeatBody(paired.node.id),
      paired.nodeSecret,
    ),
  );

  const response = await plane.console.handle(
    new Request("http://localhost/api/console/overview", { headers: { cookie } }),
    "overview",
  );
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    overview: { hostname: "studio" },
  });
  expect(calledUrl).toBe("http://[2001:4860:4860::8844]:24531/v1/relay");

  redirectReply = true;
  const redirected = await plane.console.handle(
    new Request("http://localhost/api/console/overview", { headers: { cookie } }),
    "overview",
  );
  expect(redirected.status).toBe(502);
  await expect(redirected.json()).resolves.toMatchObject({
    error: "node_relay_unavailable",
  });
  redirectReply = false;

  wrongCorrelation = true;
  const mismatched = await plane.console.handle(
    new Request("http://localhost/api/console/overview", { headers: { cookie } }),
    "overview",
  );
  expect(mismatched.status).toBe(502);
  await expect(mismatched.json()).resolves.toMatchObject({
    error: "node_envelope_invalid",
  });
  wrongCorrelation = false;

  tamperReply = true;
  const tampered = await plane.console.handle(
    new Request("http://localhost/api/console/overview", { headers: { cookie } }),
    "overview",
  );
  expect(tampered.status).toBe(502);
  await expect(tampered.json()).resolves.toMatchObject({
    error: "node_signature_invalid",
  });
  tamperReply = false;

  const callerTarget = await plane.console.handle(
    jsonRequest("http://localhost/api/console/relay", {
      enabled: true,
      targetUrl: "https://attacker.example",
    }, { cookie }),
    "relay.settings.update",
  );
  expect(callerTarget.status).toBe(400);
  await expect(callerTarget.json()).resolves.toMatchObject({
    error: "node_route_not_allowed",
  });

  const rejected = await plane.console.handle(
    jsonRequest("http://localhost/api/console/relay", {
      targetUrl: "https://attacker.example",
    }, { cookie }),
    "arbitrary-target" as never,
  );
  expect(rejected.status).toBe(404);
  await expect(rejected.json()).resolves.toMatchObject({
    error: "node_route_not_allowed",
  });
});

Deno.test("Relay reports an offline node before attempting a network request", async () => {
  let calls = 0;
  const { plane } = createHarness({
    fetch: () => {
      calls += 1;
      return Promise.resolve(new Response());
    },
  });
  const cookie = await login(plane);
  await pair(plane, cookie);
  const response = await plane.console.handle(
    new Request("http://localhost/api/console/processes", { headers: { cookie } }),
    "processes",
  );
  expect(response.status).toBe(503);
  expect(calls).toBe(0);
  await expect(response.json()).resolves.toMatchObject({ error: "node_offline" });
});

Deno.test("Relay keeps a minute-cadence node online until its next heartbeat", async () => {
  let now = Date.parse("2026-07-18T00:00:00Z");
  let calls = 0;
  const { plane } = createHarness({
    now: () => now,
    fetch: () => {
      calls += 1;
      return Promise.resolve(Response.json({}));
    },
  });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  const heartbeat = await plane.node.heartbeat(
    await signedJsonRequest(
      "http://localhost/api/node/heartbeat",
      heartbeatBody(paired.node.id),
      paired.nodeSecret,
      now,
    ),
  );
  expect(heartbeat.status).toBe(200);

  now += TELEMETRY_AGGREGATE_MS;
  const response = await plane.console.handle(
    new Request("http://localhost/api/console/overview", { headers: { cookie } }),
    "overview",
  );

  expect(calls).toBe(1);
  expect(response.status).toBe(502);
  await expect(response.json()).resolves.toMatchObject({
    error: "node_protocol_mismatch",
  });
});

Deno.test("SSE formats supported event names, monotonic ids, keepalive, and resume", async () => {
  const { plane } = createHarness();
  const cookie = await login(plane);
  await plane.events.append("telemetry", { cpu: 10 });
  await plane.events.append("agent.delta", { text: "a" });
  await plane.events.append("approval.requested", { id: "approval-1" });
  await plane.events.append("approval.resolved", { id: "approval-1" });
  await plane.events.append("heartbeat", { availability: "online" });

  expect(formatSseEvent({ id: 7, type: "heartbeat", data: { ok: true } }))
    .toBe('id: 7\nevent: heartbeat\ndata: {"ok":true}\n\n');
  const response = await plane.events.snapshot(
    new Request("http://localhost/api/console/events", {
      headers: { cookie, "last-event-id": "2" },
    }),
  );
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const text = await response.text();
  expect(text).toContain(": keepalive");
  expect(text).not.toContain("id: 2\n");
  expect(text).toContain("id: 3\nevent: approval.requested");
  expect(text).toContain("id: 5\nevent: heartbeat");
});

Deno.test("SSE latest cursor skips retained backlog before opening live stream", async () => {
  const { plane } = createHarness();
  const cookie = await login(plane);
  await plane.events.append("agent.delta", {
    messageId: "historical",
    sequence: 1,
    delta: "old",
  });

  const response = await plane.events.snapshot(
    new Request("http://localhost/api/console/events?after=latest", {
      headers: { cookie },
    }),
  );

  expect(await response.text()).not.toContain("historical");
});

Deno.test("SSE reconnect resumes Last-Event-ID even with the initial latest URL", async () => {
  const { plane } = createHarness();
  const cookie = await login(plane);
  await plane.events.append("heartbeat", { availability: "online" });
  await plane.events.append("heartbeat", { availability: "degraded" });

  const response = await plane.events.snapshot(
    new Request("http://localhost/api/console/events?after=latest", {
      headers: { cookie, "last-event-id": "1" },
    }),
  );
  const text = await response.text();
  expect(text).not.toContain("id: 1\n");
  expect(text).toContain("id: 2\nevent: heartbeat");
});

Deno.test("SSE closes when its admin session expires during the stream", async () => {
  let now = Date.parse("2026-07-18T00:00:00Z");
  const { plane } = createHarness({ now: () => now, ssePollMs: 5 });
  const cookie = await login(plane);
  const response = await plane.events.stream(
    new Request("http://localhost/api/console/events?after=latest", {
      headers: { cookie },
    }),
  );
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(
    ": keepalive",
  );

  now += ADMIN_SESSION_TTL_MS + 1;
  const expired = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("SSE did not close after session expiry")), 200)
    ),
  ]).finally(() => reader.cancel());
  expect(expired.done).toBe(true);
});

Deno.test("SSE observes retained events appended by another control-plane isolate", async () => {
  const store = createMemoryConsoleStore();
  const env = {
    OPENFX_ADMIN_KEY: "correct horse battery staple",
    OPENFX_NODE_CREDENTIAL_KEY: CREDENTIAL_KEY,
  };
  const readerPlane = createConsoleControlPlane({ store, env, ssePollMs: 5 });
  const writerPlane = createConsoleControlPlane({ store, env, ssePollMs: 5 });
  const cookie = await login(readerPlane);
  const response = await readerPlane.events.stream(
    new Request("http://localhost/api/console/events", { headers: { cookie } }),
  );
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toContain(": keepalive");

  await writerPlane.events.append("heartbeat", { availability: "online" });
  let received = "";
  for (
    let attempt = 0;
    attempt < 20 && !received.includes("event: heartbeat");
    attempt++
  ) {
    const chunk = await reader.read();
    received += decoder.decode(chunk.value);
  }
  expect(received).toContain("id: 1\nevent: heartbeat");
  await reader.cancel();
});
