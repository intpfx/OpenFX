import { assertEquals } from "@std/assert";

import { createControlPlaneClient } from "../src/native/control-plane-client.ts";
import { createNodeEventReporter } from "../src/native/node-event-reporter.ts";
import { SafetyActionGate } from "../../../domains/e/src/core/safety-action-gate.ts";
import {
  createAgentToolRuntime,
  createMemoryApprovalRequestRepository,
} from "../src/core/agent-runtime.ts";
import { createDesktopRouteDispatcher } from "../src/core/route-dispatcher.ts";

Deno.test("runtime events are delivered in order through POST /api/node/events", async () => {
  const requests: Array<{ path: string; body?: unknown }> = [];
  const client = createControlPlaneClient((request) => {
    requests.push({ path: request.path, body: request.body });
    return Promise.resolve({ status: 202, body: { ok: true } });
  });
  const reporter = createNodeEventReporter(client);
  reporter.setPairing({
    preferences: {
      serverUrl: "https://openfx.example",
      nodeId: "node-1",
      nodeName: "Studio Mac",
      relayEnabled: true,
      pairedAt: 1,
      launchMode: "regular",
      reduceMotion: false,
    },
    nodeSecret: "secret",
  });

  await Promise.all([
    reporter.emit({
      type: "agent.delta",
      data: { messageId: "m1", delta: "A", sequence: 1 },
    }),
    reporter.emit({
      type: "approval.requested",
      data: { id: "a1", summary: "Kill process" },
    }),
    reporter.emit({
      type: "approval.resolved",
      data: { id: "a1", decision: "approved" },
    }),
  ]);

  assertEquals(requests.map((request) => request.path), [
    "/api/node/events",
    "/api/node/events",
    "/api/node/events",
  ]);
  assertEquals(requests.map((request) => request.body), [
    {
      nodeId: "node-1",
      protocolVersion: 1,
      events: [{
        type: "agent.delta",
        data: { messageId: "m1", delta: "A", sequence: 1 },
      }],
    },
    {
      nodeId: "node-1",
      protocolVersion: 1,
      events: [{
        type: "approval.requested",
        data: { id: "a1", summary: "Kill process" },
      }],
    },
    {
      nodeId: "node-1",
      protocolVersion: 1,
      events: [{
        type: "approval.resolved",
        data: { id: "a1", decision: "approved" },
      }],
    },
  ]);
});

Deno.test("Agent runtime approvals and produced chat deltas use the control-plane event path", async () => {
  const delivered: Array<Record<string, unknown>> = [];
  const client = createControlPlaneClient((request) => {
    if (request.path === "/api/node/events") {
      delivered.push(request.body as Record<string, unknown>);
    }
    return Promise.resolve({ status: 202, body: { ok: true } });
  });
  const reporter = createNodeEventReporter(client);
  reporter.setPairing({
    preferences: {
      serverUrl: "https://openfx.example",
      nodeId: "node-1",
      nodeName: "Studio Mac",
      relayEnabled: true,
      pairedAt: 1,
      launchMode: "regular",
      reduceMotion: false,
    },
    nodeSecret: "secret",
  });
  const approvals = createMemoryApprovalRequestRepository();
  let id = 0;
  const runtime = createAgentToolRuntime({
    gate: new SafetyActionGate({
      now: () => 1_000,
      createId: () => `gate-${++id}`,
      consumptionStore: approvals,
    }),
    approvals,
    audit: {
      append: (event) => approvals.appendAudit(event),
      list: (limit) => approvals.listAudit(limit),
    },
    nodeId: () => "node-1",
    ownPid: () => 99,
    now: () => 1_000,
    createId: () => `runtime-${++id}`,
    read: {
      overview: () => Promise.resolve({}),
      processes: () => Promise.resolve([]),
      network: () => Promise.resolve({}),
      relay: () => Promise.resolve({}),
    },
    effects: {
      inspectProcess: () => Promise.resolve(null),
      kill: () => Promise.resolve({ ok: true }),
      openApplication: () => Promise.resolve({ ok: true }),
      updateRelay: () => Promise.resolve({ ok: true }),
    },
    events: {
      approvalRequested: (request) =>
        reporter.emit({
          type: "approval.requested",
          data: { id: request.id, summary: request.reason },
        }),
      approvalResolved: (request, decision) =>
        reporter.emit({
          type: "approval.resolved",
          data: { id: request.id, decision },
        }),
    },
  });
  const invocation = await runtime.invoke("app.open", { application: "Safari" });
  await runtime.resolve({
    id: invocation.approval!.id,
    decision: "approved",
    parameterFingerprint: invocation.approval!.parameterFingerprint!,
  });

  const route = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({}),
    async chat(_message, onDelta) {
      await onDelta("A");
      await onDelta("B");
      return { content: "AB", toolCalls: [] };
    },
    agentDelta: (data) => reporter.emit({ type: "agent.delta", data }),
    invokeTool: (toolId, input) => runtime.invoke(toolId, input),
    listApprovals: () => runtime.listApprovals(),
    resolveApproval: (input) => runtime.resolve(input),
  }, { createId: () => "message-1" });
  await route({
    method: "POST",
    path: "/v1/agent/messages",
    body: { message: "hello" },
  });

  assertEquals(
    delivered.flatMap((body) =>
      (body.events as Array<{ type: string }>).map((event) => event.type)
    ),
    [
      "approval.requested",
      "approval.resolved",
      "agent.delta",
      "agent.delta",
    ],
  );
});
