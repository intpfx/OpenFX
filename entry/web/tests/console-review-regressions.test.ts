import { expect } from "@std/expect";
import type { H3Event } from "h3";

import {
  type ConsoleControlPlane,
  createConsoleControlPlane,
  createMemoryConsoleStore,
} from "../server/console/control-plane.ts";
import type {
  ConsoleAtomicOperation,
  ConsoleListOptions,
  ConsoleStore,
} from "../server/console/store.ts";
import {
  ConsoleStoreUnavailableError,
  createDenoConsoleStore,
} from "../server/console/store.ts";
import { checkProjectAccess } from "../server/utils/access.ts";
import { createWebRequest } from "../server/utils/request.ts";
import { createAdminSessionHandler } from "../server/routes/api/admin/session.post.ts";
import { deleteAdminSessionHandler } from "../server/routes/api/admin/session.delete.ts";
import { listAdminKvHandler } from "../server/routes/api/admin/kv.get.ts";
import { listHomepageMessagesHandler } from "../server/routes/api/messages.get.ts";
import { unlockHandler } from "../server/routes/api/unlock.post.ts";
import { createPairingHandler } from "../server/routes/api/console/pairings.post.ts";
import { pairNodeHandler } from "../server/routes/api/node/pair.post.ts";
import { nodeHeartbeatHandler } from "../server/routes/api/node/heartbeat.post.ts";
import { nodeTelemetryHandler } from "../server/routes/api/node/telemetry.post.ts";
import { nodeEventsHandler } from "../server/routes/api/node/events.post.ts";
import {
  createWebCryptoAdapter,
  openRelayEnvelope,
  sealRelayEnvelope,
} from "../../../domains/_shared/openfx-node/mod.ts";
import { decodeBase64Url } from "../../../domains/_shared/openfx-node/encoding.ts";

const CREDENTIAL_KEY = "0123456789abcdef0123456789abcdef";
const START = Date.parse("2026-07-18T00:00:00Z");

const jsonRequest = (url: string, body: unknown, headers: HeadersInit = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const harness = (options: {
  store?: ConsoleStore;
  now?: () => number;
  openKv?: () => Promise<Deno.Kv>;
  fetch?: typeof fetch;
} = {}) => {
  const store = options.store ?? createMemoryConsoleStore({ now: options.now });
  const plane = createConsoleControlPlane({
    store: options.store === undefined && options.openKv ? undefined : store,
    openKv: options.openKv,
    env: {
      OPENFX_ADMIN_KEY: "correct horse battery staple",
      OPENFX_NODE_CREDENTIAL_KEY: CREDENTIAL_KEY,
    },
    now: options.now ?? (() => START),
    ssePollMs: 5,
    fetch: options.fetch,
  });
  return { plane, store };
};

const login = async (plane: ConsoleControlPlane): Promise<string> => {
  const response = await createAdminSessionHandler(
    jsonRequest("http://localhost/api/admin/session", {
      key: "correct horse battery staple",
    }),
    plane,
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
};

const createPairingCode = async (plane: ConsoleControlPlane, cookie: string) => {
  const response = await createPairingHandler(
    jsonRequest("http://localhost/api/console/pairings", {}, { cookie }),
    plane,
  );
  expect(response.status).toBe(201);
  return (await response.json()).code as string;
};

const pairBody = (code: string, name = "Studio Mac") => ({
  code,
  name,
  protocolVersion: 1,
  publicIpv6: "2001:4860:4860::8844",
  port: 24531,
});

const pair = async (plane: ConsoleControlPlane, cookie: string) => {
  const response = await pairNodeHandler(
    jsonRequest(
      "http://localhost/api/node/pair",
      pairBody(await createPairingCode(plane, cookie)),
    ),
    plane,
  );
  expect(response.status).toBe(201);
  return await response.json() as { node: { id: string }; nodeSecret: string };
};

Deno.test("admin key input no longer authorizes unlock, project access, or messages", async () => {
  const { plane } = harness();
  const unlock = await unlockHandler(
    jsonRequest("http://localhost/api/unlock", { key: "correct horse battery staple" }),
  );
  expect(unlock.status).toBe(404);

  const headerAccess = await checkProjectAccess(
    new Request("http://localhost/update", {
      headers: { "x-openfx-admin-key": "correct horse battery staple" },
    }),
    "ipv6-sync-suite",
    { public: false, authorizeAdmin: plane.authorize },
  );
  expect(headerAccess).toMatchObject({ ok: false, error: "unauthorized" });

  const legacyMessages = await listHomepageMessagesHandler(
    new Request("http://localhost/api/messages", {
      headers: { "x-openfx-admin-key": "correct horse battery staple" },
    }),
    plane,
    () => Promise.resolve([]),
  );
  expect(legacyMessages.status).toBe(401);

  const cookie = await login(plane);
  const cookieAccess = await checkProjectAccess(
    new Request("http://localhost/update", { headers: { cookie } }),
    "ipv6-sync-suite",
    { public: false, authorizeAdmin: plane.authorize },
  );
  expect(cookieAccess).toMatchObject({ ok: true, mode: "admin" });
  expect(
    (await listHomepageMessagesHandler(
      new Request("http://localhost/api/messages", { headers: { cookie } }),
      plane,
      () => Promise.resolve([]),
    )).status,
  ).toBe(200);
});

Deno.test("session DELETE audits only one actual valid-session invalidation", async () => {
  const { plane, store } = harness();
  const request = (cookie?: string) =>
    new Request("http://localhost/api/admin/session", {
      method: "DELETE",
      headers: cookie ? { cookie } : undefined,
    });
  const logoutAudits = async () =>
    (await store.list<{ action: string }>({
      prefix: ["openfx-console", "audit"],
    })).filter((entry) => entry.value.action === "session.logout");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    expect((await deleteAdminSessionHandler(request(), plane)).status).toBe(200);
  }
  expect(
    (await deleteAdminSessionHandler(
      request("openfx_admin_session=malformed"),
      plane,
    )).status,
  ).toBe(200);
  expect(await logoutAudits()).toHaveLength(0);

  const cookie = await login(plane);
  const responses = await Promise.all([
    deleteAdminSessionHandler(request(cookie), plane),
    deleteAdminSessionHandler(request(cookie), plane),
    deleteAdminSessionHandler(request(cookie), plane),
  ]);
  expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
  expect(await logoutAudits()).toHaveLength(1);
  expect(await store.list({ prefix: ["openfx-console", "sessions"] })).toHaveLength(0);
});

Deno.test("expired session DELETE cleans up without a logout audit", async () => {
  let now = START;
  const store = createMemoryConsoleStore();
  const { plane } = harness({ store, now: () => now });
  const cookie = await login(plane);
  now += 12 * 60 * 60_000 + 1;

  const response = await deleteAdminSessionHandler(
    new Request("http://localhost/api/admin/session", {
      method: "DELETE",
      headers: { cookie },
    }),
    plane,
  );
  expect(response.status).toBe(200);
  expect(await store.list({ prefix: ["openfx-console", "sessions"] })).toHaveLength(0);
  const logoutAudits = (await store.list<{ action: string }>({
    prefix: ["openfx-console", "audit"],
  })).filter((entry) => entry.value.action === "session.logout");
  expect(logoutAudits).toHaveLength(0);
});

Deno.test("default KV initialization failure returns a stable unavailable response", async () => {
  const { plane } = harness({
    openKv: () => Promise.reject(new Error("kv offline")),
  });
  const response = await createAdminSessionHandler(
    jsonRequest("https://openfx.example/api/admin/session", {
      key: "correct horse battery staple",
    }),
    plane,
  );
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: "control_plane_unavailable",
  });

  const nodeResponse = await nodeHeartbeatHandler(
    jsonRequest("https://openfx.example/api/node/heartbeat", {
      protocolVersion: 1,
      nodeId: "missing-node",
      availability: "online",
      publicIpv6: "2001:4860:4860::8844",
      port: 24531,
    }),
    plane,
  );
  expect(nodeResponse.status).toBe(503);
  await expect(nodeResponse.json()).resolves.toMatchObject({
    ok: false,
    error: "control_plane_unavailable",
  });

  const adminResponse = await listAdminKvHandler(
    new Request("https://openfx.example/api/admin/kv", {
      headers: { cookie: "openfx_admin_session=not-a-real-session" },
    }),
    plane,
  );
  expect(adminResponse.status).toBe(503);
  await expect(adminResponse.json()).resolves.toMatchObject({
    ok: false,
    error: "control_plane_unavailable",
  });
});

Deno.test("public node handlers ingest and persist every required SSE event type", async () => {
  const { plane } = harness();
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  const authorization = `Bearer ${paired.nodeSecret}`;
  const node = {
    nodeId: paired.node.id,
    protocolVersion: 1,
    publicIpv6: "2001:4860:4860::8844",
    port: 24531,
    availability: "online",
  };
  expect(
    (await nodeHeartbeatHandler(
      jsonRequest("http://localhost/api/node/heartbeat", node, { authorization }),
      plane,
    )).status,
  ).toBe(200);
  expect(
    (await nodeTelemetryHandler(
      jsonRequest("http://localhost/api/node/telemetry", {
        nodeId: paired.node.id,
        protocolVersion: 1,
        sample: telemetrySample(START),
      }, { authorization }),
      plane,
    )).status,
  ).toBe(202);

  for (
    const event of [
      { type: "agent.delta", data: { messageId: "m1", delta: "A", sequence: 1 } },
      { type: "agent.delta", data: { messageId: "m1", delta: "B", sequence: 2 } },
      { type: "approval.requested", data: { id: "a1", summary: "Kill process" } },
      { type: "approval.resolved", data: { id: "a1", decision: "rejected" } },
    ]
  ) {
    expect(
      (await nodeEventsHandler(
        jsonRequest("http://localhost/api/node/events", {
          nodeId: paired.node.id,
          protocolVersion: 1,
          events: [event],
        }, { authorization }),
        plane,
      )).status,
    ).toBe(202);
  }

  const snapshot = await plane.events.snapshot(
    new Request("http://localhost/api/console/events", { headers: { cookie } }),
  );
  const text = await snapshot.text();
  for (
    const type of [
      "heartbeat",
      "telemetry",
      "agent.delta",
      "approval.requested",
      "approval.resolved",
    ]
  ) expect(text).toContain(`event: ${type}`);
  expect(text).toContain('"delta":"A"');
  expect(text).toContain('"delta":"B"');
});

Deno.test("successful Relay effects do not synthesize events or fail on event storage", async () => {
  const base = createMemoryConsoleStore();
  let rejectEventWrites = false;
  let syntheticWriteAttempts = 0;
  const store: ConsoleStore = {
    ...base,
    atomic(operation) {
      if (
        rejectEventWrites &&
        operation.sets.some((item) => item.key[1] === "events")
      ) {
        syntheticWriteAttempts += 1;
        throw new Error("event append unavailable");
      }
      return base.atomic(operation);
    },
  };
  const cryptoAdapter = createWebCryptoAdapter();
  let nodeSecret = "";
  const { plane } = harness({
    store,
    fetch: async (_input, init) => {
      const request = await openRelayEnvelope(
        cryptoAdapter,
        decodeBase64Url(nodeSecret),
        JSON.parse(String(init?.body)),
        { now: () => START, replayProtector: { consume() {} } },
      );
      expect(request).toMatchObject({
        method: "POST",
        path: "/v1/approvals/resolve",
      });
      const reply = await sealRelayEnvelope(
        cryptoAdapter,
        decodeBase64Url(nodeSecret),
        { ok: true, applied: true, result: { opened: "Safari" } },
        { now: () => START },
      );
      return Response.json(reply);
    },
  });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  nodeSecret = paired.nodeSecret;
  await nodeHeartbeatHandler(
    jsonRequest("http://localhost/api/node/heartbeat", {
      nodeId: paired.node.id,
      protocolVersion: 1,
      publicIpv6: "2001:4860:4860::8844",
      port: 24531,
      availability: "online",
    }, { authorization: `Bearer ${paired.nodeSecret}` }),
    plane,
  );
  const before = await base.list({ prefix: ["openfx-console", "events"] });
  rejectEventWrites = true;

  const response = await plane.console.handle(
    jsonRequest("http://localhost/api/console/approvals/resolve", {
      id: "approval-1",
      decision: "approved",
      parameterFingerprint: "fingerprint-1",
    }, { cookie }),
    "approvals.resolve",
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    applied: true,
    result: { opened: "Safari" },
  });
  expect(syntheticWriteAttempts).toBe(0);
  expect(await base.list({ prefix: ["openfx-console", "events"] })).toEqual(before);
});

Deno.test("pairing atomically consumes the code with matching node and credential", async () => {
  const { plane, store } = harness();
  const cookie = await login(plane);
  const code = await createPairingCode(plane, cookie);
  const [first, second] = await Promise.all([
    pairNodeHandler(
      jsonRequest("http://localhost/api/node/pair", pairBody(code, "first")),
      plane,
    ),
    pairNodeHandler(
      jsonRequest("http://localhost/api/node/pair", pairBody(code, "second")),
      plane,
    ),
  ]);
  expect([first.status, second.status].sort()).toEqual([201, 409]);
  const active = await store.get<{ id: string }>(["openfx-console", "node", "active"]);
  const credential = await store.get<{ nodeId: string }>([
    "openfx-console",
    "node",
    "credential",
  ]);
  expect(credential?.value.nodeId).toBe(active?.value.id);
});

Deno.test("failed pairing transaction leaves code, node, and credential unchanged", async () => {
  const base = createMemoryConsoleStore();
  const failing: ConsoleStore = {
    ...base,
    atomic(_operation: ConsoleAtomicOperation) {
      return Promise.resolve(false);
    },
  };
  const { plane } = harness({ store: failing });
  const cookie = await login(plane);
  const code = await createPairingCode(plane, cookie);
  const before = await base.list({ prefix: ["openfx-console", "pairings"] });
  const response = await pairNodeHandler(
    jsonRequest("http://localhost/api/node/pair", pairBody(code)),
    plane,
  );
  expect(response.status).toBe(409);
  expect(await base.get(["openfx-console", "node", "active"])).toBeNull();
  expect(await base.get(["openfx-console", "node", "credential"])).toBeNull();
  expect((await base.list({ prefix: ["openfx-console", "pairings"] }))[0]?.value)
    .toEqual(before[0]?.value);
});

Deno.test("H3 adapter stops a chunked oversized body before unbounded buffering", async () => {
  let cancelled = false;
  let chunks = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunks += 1;
      controller.enqueue(new Uint8Array(16 * 1024));
      if (chunks > 20) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const webRequest = new Request("http://localhost/api/node/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const event = {
    method: "POST",
    web: { request: webRequest },
    context: { clientAddress: "203.0.113.8" },
    node: { req: { socket: {} } },
  } as unknown as H3Event;
  const adapted = await createWebRequest(event, "POST");
  const { plane } = harness();
  const response = await pairNodeHandler(adapted, plane);
  expect(response.status).toBe(413);
  expect(cancelled).toBe(true);
  expect(chunks).toBeLessThan(20);
});

Deno.test("login throttling ignores arbitrary forwarded-for spoofing", async () => {
  const { plane } = harness();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await createAdminSessionHandler(
      jsonRequest("https://openfx.example/api/admin/session", { key: "wrong" }, {
        "x-forwarded-for": `203.0.113.${attempt}`,
      }),
      plane,
    );
    expect(response.status).toBe(attempt === 4 ? 429 : 401);
  }
});

Deno.test("SSE append uses expiry and resume uses a bounded cursor range", async () => {
  const base = createMemoryConsoleStore();
  const listCalls: ConsoleListOptions[] = [];
  const setExpiries: number[] = [];
  const store: ConsoleStore = {
    ...base,
    list<T>(options: ConsoleListOptions) {
      listCalls.push(options);
      return base.list<T>(options);
    },
    set(key, value, options) {
      if (key[1] === "events") setExpiries.push(options?.expireIn ?? 0);
      return base.set(key, value, options);
    },
    atomic(operation) {
      for (const item of operation.sets) {
        if (item.key[1] === "events") setExpiries.push(item.options?.expireIn ?? 0);
      }
      return base.atomic(operation);
    },
  };
  const { plane } = harness({ store });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  await nodeEventsHandler(
    jsonRequest("http://localhost/api/node/events", {
      nodeId: paired.node.id,
      protocolVersion: 1,
      events: [{
        type: "agent.delta",
        data: { messageId: "m1", delta: "x", sequence: 1 },
      }],
    }, { authorization: `Bearer ${paired.nodeSecret}` }),
    plane,
  );
  expect(listCalls.filter((call) => call.prefix[1] === "events")).toHaveLength(0);
  expect(setExpiries.some((expiry) => expiry > 0)).toBe(true);

  await plane.events.snapshot(
    new Request("http://localhost/api/console/events", {
      headers: { cookie, "last-event-id": "1" },
    }),
  );
  const eventList = listCalls.find((call) => call.prefix[1] === "events");
  expect(eventList?.start).toEqual(["openfx-console", "events", 2]);
  expect(eventList?.limit).toBeGreaterThan(0);
});

Deno.test("telemetry rejects future timestamps and retention uses server receipt time", async () => {
  let now = START;
  const store = createMemoryConsoleStore({ now: () => now });
  const { plane } = harness({ store, now: () => now });
  const cookie = await login(plane);
  const paired = await pair(plane, cookie);
  const authorization = `Bearer ${paired.nodeSecret}`;
  const post = (collectedAt: number) =>
    nodeTelemetryHandler(
      jsonRequest("http://localhost/api/node/telemetry", {
        nodeId: paired.node.id,
        protocolVersion: 1,
        sample: telemetrySample(collectedAt),
      }, { authorization }),
      plane,
    );
  expect((await post(now + 10 * 60_000)).status).toBe(400);
  expect((await post(now + 30_000)).status).toBe(202);

  now += 7 * 24 * 60 * 60_000 + 1;
  const freshCookie = await login(plane);
  const history = await plane.console.telemetry(
    new Request("http://localhost/api/console/telemetry", {
      headers: { cookie: freshCookie },
    }),
  );
  expect((await history.json()).minutes).toHaveLength(0);
});

Deno.test("SSE catch-up keeps all retained ids ordered before a live event", async () => {
  const { plane } = harness();
  const cookie = await login(plane);
  for (let id = 1; id <= 300; id += 1) {
    await plane.events.append("agent.delta", { id });
  }

  const response = await plane.events.stream(
    new Request("http://localhost/api/console/events", { headers: { cookie } }),
  );
  const reader = response.body!.getReader();
  await plane.events.append("agent.delta", { id: 301 });

  const decoder = new TextDecoder();
  let text = "";
  const completed = (async () => {
    while (true) {
      const result = await reader.read();
      if (result.done) return false;
      text += decoder.decode(result.value, { stream: true });
      if ([...text.matchAll(/^id: (\d+)$/gm)].length === 301) return true;
    }
  })();
  const caughtUp = await Promise.race([
    completed,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 250)),
  ]);
  await reader.cancel();
  expect(caughtUp).toBe(true);

  const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
  expect(ids).toEqual(Array.from({ length: 301 }, (_, index) => index + 1));
});

Deno.test("Deno KV failures after initialization are stable unavailable errors", async () => {
  const failingKv = {
    get() {
      throw new Error("kv get offline");
    },
  } as unknown as Deno.Kv;
  const store = createDenoConsoleStore(failingKv);
  await expect(store.get(["key"])).rejects.toBeInstanceOf(
    ConsoleStoreUnavailableError,
  );

  const plane = createConsoleControlPlane({
    store,
    env: { OPENFX_ADMIN_KEY: "correct horse battery staple" },
  });
  const response = await createAdminSessionHandler(
    jsonRequest("https://openfx.example/api/admin/session", {
      key: "correct horse battery staple",
    }),
    plane,
  );
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: "control_plane_unavailable",
  });
});

Deno.test("Deno KV adapter wraps every runtime operation but preserves conflicts", async () => {
  const unavailable = (operation: "get" | "set" | "delete" | "list" | "atomic") =>
    createDenoConsoleStore(failingDenoKv(operation));

  await expect(unavailable("get").get(["key"])).rejects.toBeInstanceOf(
    ConsoleStoreUnavailableError,
  );
  await expect(unavailable("set").set(["key"], true)).rejects.toBeInstanceOf(
    ConsoleStoreUnavailableError,
  );
  await expect(unavailable("delete").delete(["key"])).rejects.toBeInstanceOf(
    ConsoleStoreUnavailableError,
  );
  await expect(
    unavailable("list").list({ prefix: ["key"] }),
  ).rejects.toBeInstanceOf(ConsoleStoreUnavailableError);
  await expect(
    unavailable("atomic").atomic({ checks: [], sets: [] }),
  ).rejects.toBeInstanceOf(ConsoleStoreUnavailableError);

  const conflict = createDenoConsoleStore({
    atomic: () => atomicOperation(() => Promise.resolve({ ok: false })),
  } as unknown as Deno.Kv);
  await expect(conflict.atomic({ checks: [], sets: [] })).resolves.toBe(false);
});

function telemetrySample(collectedAt: number) {
  return {
    collectedAt,
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
}

function failingDenoKv(
  operation: "get" | "set" | "delete" | "list" | "atomic",
): Deno.Kv {
  const fail = () => {
    throw new Error(`kv ${operation} offline`);
  };
  return {
    get: operation === "get" ? fail : undefined,
    set: operation === "set" ? fail : undefined,
    delete: operation === "delete" ? fail : undefined,
    list: operation === "list"
      ? () => ({
        [Symbol.asyncIterator]() {
          return {
            next() {
              fail();
              return Promise.resolve({ done: true, value: undefined });
            },
          };
        },
      })
      : undefined,
    atomic: operation === "atomic"
      ? () => atomicOperation(() => Promise.reject(new Error("kv atomic offline")))
      : undefined,
  } as unknown as Deno.Kv;
}

function atomicOperation(commit: () => Promise<{ ok: boolean }>) {
  const operation = {
    check: () => operation,
    set: () => operation,
    delete: () => operation,
    commit,
  };
  return operation;
}
