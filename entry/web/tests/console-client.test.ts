import { expect } from "@std/expect";

import {
  appendAgentDelta,
  applyHeartbeatTransition,
  approvalRefreshPlan,
  buildEventStreamUrl,
  type ConsoleMemory,
  createAgentTurn,
  createAgentTurnCompletionGate,
  createAuthenticatedConsoleRequest,
  createConsoleClient,
  createSessionGeneration,
  emptyConsoleMemory,
  handleConsoleSessionMessage,
  heartbeatRefreshPlan,
  isConsoleLogoutMessage,
  refreshAfterApproval,
  resolveAgentCompletionMessageId,
} from "../src/console/client-runtime.ts";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => resolve = done);
  return { promise, resolve };
};

Deno.test("console client rejects HTTP 200 payload failures", async () => {
  for (
    const code of [
      "agent_offline",
      "approval_expired",
      "approval_fingerprint_mismatch",
      "effect_failed",
    ]
  ) {
    const client = createConsoleClient(() =>
      Promise.resolve(Response.json({ ok: false, applied: false, error: code }))
    );
    await expect(client.request("/api/console/test")).rejects.toMatchObject({
      code,
      status: 200,
    });
  }
});

Deno.test("console client clears authenticated memory on any 401", async () => {
  let memory: ConsoleMemory = {
    ...emptyConsoleMemory(),
    availability: "online" as const,
    overview: { cpuUsagePercent: 20 },
    messages: [{ role: "assistant" as const, content: "secret", createdAt: 1 }],
    approvals: [{ id: "approval-1" }],
  };
  let unauthorizedCalls = 0;
  const client = createConsoleClient(
    () =>
      Promise.resolve(
        Response.json({ ok: false, error: "unauthorized" }, { status: 401 }),
      ),
    () => {
      unauthorizedCalls += 1;
      memory = emptyConsoleMemory();
    },
  );

  await expect(client.request("/api/console/overview")).rejects.toMatchObject({
    code: "unauthorized",
  });
  expect(unauthorizedCalls).toBe(1);
  expect(memory).toEqual(emptyConsoleMemory());
  expect(isConsoleLogoutMessage({ type: "logout" })).toBe(true);
  expect(isConsoleLogoutMessage({ type: "login" })).toBe(false);
});

Deno.test("agent deltas only accumulate for the current message and next sequence", () => {
  const initial = createAgentTurn("turn-current");
  expect(appendAgentDelta(initial, {
    messageId: "historical",
    sequence: 1,
    delta: "old",
  })).toEqual(initial);

  const first = appendAgentDelta(initial, {
    messageId: "turn-current",
    sequence: 1,
    delta: "新",
  });
  expect(first).toMatchObject({ text: "新", lastSequence: 1 });
  expect(appendAgentDelta(first, {
    messageId: "turn-current",
    sequence: 3,
    delta: "乱序",
  })).toEqual(first);
  expect(appendAgentDelta(first, {
    messageId: "turn-current",
    sequence: 1,
    delta: "重复",
  })).toEqual(first);
  expect(appendAgentDelta(first, {
    messageId: "another-turn",
    sequence: 2,
    delta: "串线",
  })).toEqual(first);
});

Deno.test("event stream starts at the live cursor instead of replaying backlog", () => {
  expect(buildEventStreamUrl()).toBe("/api/console/events?after=latest");
});

Deno.test("approved applied effects refresh every dependent node surface", () => {
  expect(approvalRefreshPlan({ ok: true, applied: true }, "approved")).toEqual([
    "approvals",
    "overview",
    "relay",
    "processes",
    "telemetry",
  ]);
  expect(approvalRefreshPlan({ ok: true, applied: false }, "rejected")).toEqual([
    "approvals",
  ]);
});

Deno.test("approved applied effects actually invoke every dependent refresh", async () => {
  const calls: string[] = [];
  const refreshers = Object.fromEntries(
    ["approvals", "overview", "relay", "processes", "telemetry"].map((name) => [
      name,
      () => {
        calls.push(name);
        return Promise.resolve();
      },
    ]),
  );

  await refreshAfterApproval({ ok: true, applied: true }, "approved", refreshers);
  expect(calls.sort()).toEqual([
    "approvals",
    "overview",
    "processes",
    "relay",
    "telemetry",
  ]);
});

Deno.test("heartbeat transitions refresh online data and mark offline data stale", () => {
  expect(heartbeatRefreshPlan("online")).toEqual({
    availability: "online",
    stale: false,
    refresh: true,
  });
  expect(heartbeatRefreshPlan("offline")).toEqual({
    availability: "offline",
    stale: true,
    refresh: false,
  });
  expect(heartbeatRefreshPlan("degraded")).toEqual({
    availability: "degraded",
    stale: true,
    refresh: false,
  });
});

Deno.test("heartbeat transition mutates client state and refreshes only online data", async () => {
  let availability = "unknown";
  let stale = false;
  let refreshes = 0;
  const effects = {
    setAvailability: (value: string) => availability = value,
    setStale: (value: boolean) => stale = value,
    refreshNodeData: () => {
      refreshes += 1;
      return Promise.resolve();
    },
  };

  await applyHeartbeatTransition("offline", effects);
  expect({ availability, stale, refreshes }).toEqual({
    availability: "offline",
    stale: true,
    refreshes: 0,
  });
  await applyHeartbeatTransition("online", effects);
  expect({ availability, stale, refreshes }).toEqual({
    availability: "online",
    stale: false,
    refreshes: 1,
  });
});

Deno.test("cross-tab logout message actually invokes the session reset", () => {
  let resets = 0;
  expect(handleConsoleSessionMessage({ type: "login" }, () => resets++)).toBe(false);
  expect(handleConsoleSessionMessage({ type: "logout" }, () => resets++)).toBe(true);
  expect(resets).toBe(1);
});

Deno.test("a request that resolves after session reset cannot commit authenticated state", async () => {
  const response = deferred<Response>();
  const client = createConsoleClient(() => response.promise);
  const session = createSessionGeneration();
  session.activate();
  const request = createAuthenticatedConsoleRequest(client.request, session);
  let overview: unknown = null;
  const pending = request<{ overview: unknown }>("/api/console/overview")
    .then((payload) => overview = payload.overview);

  session.invalidate();
  response.resolve(Response.json({ ok: true, overview: { cpu: 99 } }));

  await expect(pending).rejects.toMatchObject({
    name: "ConsoleStaleRequestError",
  });
  expect(overview).toBe(null);
});

Deno.test("Agent requests completing in reverse order cannot overwrite the current turn", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  let call = 0;
  const client = createConsoleClient(() =>
    call++ === 0 ? first.promise : second.promise
  );
  const turns = createAgentTurnCompletionGate();
  let status = "";

  turns.begin("turn-a");
  const pendingA = client.request<{ messageId: string; message: string }>("/agent")
    .then((payload) =>
      turns.complete("turn-a", payload.messageId, () => status = payload.message)
    );
  turns.begin("turn-b");
  const pendingB = client.request<{ messageId: string; message: string }>("/agent")
    .then((payload) =>
      turns.complete("turn-b", payload.messageId, () => status = payload.message)
    );

  second.resolve(Response.json({ ok: true, messageId: "turn-b", message: "B" }));
  await expect(pendingB).resolves.toBe(true);
  first.resolve(Response.json({ ok: true, messageId: "turn-a", message: "A" }));
  await expect(pendingA).resolves.toBe(false);
  expect(status).toBe("B");
});

Deno.test("an old Agent error completing after a new success cannot overwrite status", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  let call = 0;
  const client = createConsoleClient(() =>
    call++ === 0 ? first.promise : second.promise
  );
  const turns = createAgentTurnCompletionGate();
  let status = "";

  turns.begin("turn-a");
  const pendingA = client.request<{ messageId: string; message: string }>("/agent")
    .catch((error) =>
      turns.complete("turn-a", error.payload?.messageId, () => status = error.message)
    );
  turns.begin("turn-b");
  const pendingB = client.request<{ messageId: string; message: string }>("/agent")
    .then((payload) =>
      turns.complete("turn-b", payload.messageId, () => status = payload.message)
    );

  second.resolve(Response.json({ ok: true, messageId: "turn-b", message: "B" }));
  await expect(pendingB).resolves.toBe(true);
  first.resolve(Response.json({
    ok: false,
    error: "agent_offline",
    messageId: "turn-a",
  }));
  await expect(pendingA).resolves.toBe(false);
  expect(status).toBe("B");
});

Deno.test("the current Agent request owns an error that omits messageId", async () => {
  const client = createConsoleClient(() =>
    Promise.resolve(Response.json(
      { ok: false, error: "node_offline" },
      { status: 503 },
    ))
  );
  const turns = createAgentTurnCompletionGate();
  turns.begin("turn-current");
  let status = "Agent 正在处理";

  const applied = await client.request("/agent").catch((error) =>
    turns.complete(
      "turn-current",
      resolveAgentCompletionMessageId(error, "turn-current"),
      () => status = error.message,
    )
  );

  expect(applied).toBe(true);
  expect(status).toBe("Mac 节点当前离线");
});

Deno.test("only a 401 from the current authenticated generation resets the session", async () => {
  const oldResponse = deferred<Response>();
  let resets = 0;
  const session = createSessionGeneration();
  session.activate();
  const oldRequest = createAuthenticatedConsoleRequest(
    createConsoleClient(() => oldResponse.promise).request,
    session,
    () => resets++,
  );
  const pending = oldRequest("/api/console/overview");

  session.invalidate();
  session.activate();
  oldResponse.resolve(Response.json(
    { ok: false, error: "unauthorized" },
    { status: 401 },
  ));

  await expect(pending).rejects.toMatchObject({ name: "ConsoleStaleRequestError" });
  expect(resets).toBe(0);
});
