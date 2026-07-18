import { expect } from "@std/expect";

import {
  appendAgentDelta,
  applyHeartbeatTransition,
  approvalRefreshPlan,
  buildEventStreamUrl,
  type ConsoleMemory,
  createAgentTurn,
  createConsoleClient,
  emptyConsoleMemory,
  handleConsoleSessionMessage,
  heartbeatRefreshPlan,
  isConsoleLogoutMessage,
  refreshAfterApproval,
} from "../src/console/client-runtime.ts";

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
