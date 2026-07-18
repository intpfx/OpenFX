import { assertEquals } from "@std/assert";

import { createDesktopRouteDispatcher } from "../src/core/route-dispatcher.ts";

Deno.test("OMLX failure marks Agent offline while monitoring and manual routes keep working", async () => {
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({ cpuUsagePercent: 21 }),
    processes: () => Promise.resolve([{ pid: 1 }]),
    network: () => Promise.resolve({ publicIpv6: "240e::1" }),
    relay: () => Promise.resolve({ enabled: true }),
    chat: () => Promise.reject(new Error("connection refused")),
    invokeTool: () => Promise.resolve({ ok: true }),
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({ ok: true }),
  });

  assertEquals(
    await dispatcher({
      method: "POST",
      path: "/v1/agent/messages",
      body: { message: "status" },
    }),
    {
      ok: false,
      error: "agent_offline",
      agent: { online: false, errorMessage: "connection refused" },
    },
  );
  assertEquals(
    await dispatcher({
      method: "GET",
      path: "/v1/system/overview",
      body: null,
    }),
    {
      ok: true,
      overview: { cpuUsagePercent: 21 },
      network: { publicIpv6: "240e::1" },
      relay: { enabled: true },
    },
  );
  assertEquals(
    await dispatcher({ method: "GET", path: "/v1/processes", body: null }),
    { ok: true, processes: [{ pid: 1 }] },
  );
});

Deno.test("relay updates become approval-required relay.update tool requests", async () => {
  const calls: Array<{ toolId: string; input: Record<string, unknown> }> = [];
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({ enabled: true }),
    chat: () => Promise.resolve({ content: "", toolCalls: [] }),
    invokeTool(toolId, input) {
      calls.push({ toolId, input });
      return Promise.resolve({ ok: true, approvalRequired: true });
    },
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({ ok: true }),
  });

  assertEquals(
    await dispatcher({
      method: "POST",
      path: "/v1/relay",
      body: { enabled: false },
    }),
    { ok: true, approvalRequired: true },
  );
  assertEquals(calls, [{ toolId: "relay.update", input: { enabled: false } }]);
});
