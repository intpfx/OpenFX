import { assertEquals } from "@std/assert";

import { SafetyActionGate } from "../../../domains/e/src/core/safety-action-gate.ts";
import {
  type AgentToolRuntimeDependencies,
  createAgentToolRuntime,
  createMemoryApprovalRequestRepository,
} from "../src/core/agent-runtime.ts";
import { createAuditLog } from "../src/core/audit-log.ts";

Deno.test("effectful Agent tools wait for a durable Task 1 approval before execution", async () => {
  const approvals = createMemoryApprovalRequestRepository();
  const auditLines: string[] = [];
  const audit = createAuditLog({
    appendLine(line) {
      auditLines.push(line);
      return Promise.resolve();
    },
    readText: () => Promise.resolve(auditLines.join("")),
  });
  let now = 1_000;
  let nextId = 0;
  const createGate = () =>
    new SafetyActionGate({
      now: () => now,
      createId: () => `id-${++nextId}`,
      consumptionStore: approvals,
    });
  const killed: number[] = [];
  const baseDependencies: Omit<
    AgentToolRuntimeDependencies,
    "gate" | "approvals" | "audit"
  > = {
    nodeId: () => "node-1",
    ownPid: () => 99,
    now: () => now,
    createId: () => `tool-${++nextId}`,
    read: {
      overview: () => Promise.resolve({ cpuUsagePercent: 5 }),
      processes: () => Promise.resolve([]),
      network: () => Promise.resolve({ publicIpv6: null }),
      relay: () => Promise.resolve({ enabled: true }),
    },
    effects: {
      inspectProcess: (pid) =>
        Promise.resolve({ pid, command: "worker", startedAt: "start-a" }),
      kill(pid) {
        killed.push(pid);
        return Promise.resolve({ pid });
      },
      openApplication: () => Promise.resolve({ opened: true }),
      updateRelay: () => Promise.resolve({ enabled: true }),
    },
  };
  const runtime = createAgentToolRuntime({
    ...baseDependencies,
    gate: createGate(),
    approvals,
    audit,
  });

  const proposed = await runtime.invoke("process.kill", { pid: 42 });
  assertEquals(proposed.approvalRequired, true);
  assertEquals(killed, []);
  const request = (await approvals.list())[0]!;

  now += 1;
  const restarted = createAgentToolRuntime({
    ...baseDependencies,
    gate: createGate(),
    approvals,
    audit,
  });
  const applied = await restarted.resolve({
    id: request.id,
    decision: "approved",
    parameterFingerprint: request.parameterFingerprint!,
  });

  assertEquals(applied.applied, true);
  assertEquals(killed, [42]);
  assertEquals((await approvals.listAudit()).map((event) => event.action), [
    "process.kill.requested",
    "process.kill.approved",
    "process.kill.applied",
  ]);
});

Deno.test("read-only Agent tools execute directly and unknown tools stay closed", async () => {
  const audit = createAuditLog({
    appendLine: () => Promise.resolve(),
    readText: () => Promise.resolve(""),
  });
  const approvals = createMemoryApprovalRequestRepository();
  const runtime = createAgentToolRuntime({
    gate: new SafetyActionGate({
      now: () => 1,
      createId: () => "id",
      consumptionStore: approvals,
    }),
    approvals,
    audit,
    nodeId: () => "node-1",
    ownPid: () => 99,
    now: () => 1,
    createId: () => "tool-1",
    read: {
      overview: () => Promise.resolve({ cpuUsagePercent: 5 }),
      processes: () => Promise.resolve([]),
      network: () => Promise.resolve({ publicIpv6: null }),
      relay: () => Promise.resolve({ enabled: true }),
    },
    effects: {
      inspectProcess: (pid) =>
        Promise.resolve({ pid, command: "worker", startedAt: "start-a" }),
      kill: () => Promise.resolve({}),
      openApplication: () => Promise.resolve({}),
      updateRelay: () => Promise.resolve({}),
    },
  });

  assertEquals(await runtime.invoke("system.getOverview", {}), {
    ok: true,
    approvalRequired: false,
    result: { cpuUsagePercent: 5 },
  });
  assertEquals(await runtime.invoke("shell.exec", { command: "id" }), {
    ok: false,
    approvalRequired: false,
    error: "node_route_not_allowed",
  });
});

Deno.test("a mismatched resolution fingerprint does not consume the pending approval", async () => {
  const approvals = createMemoryApprovalRequestRepository();
  const gate = new SafetyActionGate({
    now: () => 100,
    createId: () => "request-1",
    consumptionStore: approvals,
  });
  let applications = 0;
  const runtime = createAgentToolRuntime({
    gate,
    approvals,
    audit: createAuditLog({
      appendLine: () => Promise.resolve(),
      readText: () => Promise.resolve(""),
    }),
    nodeId: () => "node-1",
    ownPid: () => 99,
    now: () => 100,
    createId: () => "action-1",
    read: {
      overview: () => Promise.resolve({}),
      processes: () => Promise.resolve([]),
      network: () => Promise.resolve({}),
      relay: () => Promise.resolve({}),
    },
    effects: {
      inspectProcess: (pid) =>
        Promise.resolve({ pid, command: "worker", startedAt: "start-a" }),
      kill: () => Promise.resolve(++applications),
      openApplication: () => Promise.resolve({}),
      updateRelay: () => Promise.resolve({}),
    },
  });
  await runtime.invoke("process.kill", { pid: 42 });
  const request = (await approvals.list())[0]!;

  assertEquals(
    await runtime.resolve({
      id: request.id,
      decision: "approved",
      parameterFingerprint: "wrong",
    }),
    {
      ok: false,
      applied: false,
      error: "approval_fingerprint_mismatch",
    },
  );
  assertEquals(
    (await runtime.resolve({
      id: request.id,
      decision: "approved",
      parameterFingerprint: request.parameterFingerprint!,
    })).applied,
    true,
  );
  assertEquals(applications, 1);
});

Deno.test("invalid applications and the node process pid are rejected before approval", async () => {
  const approvals = createMemoryApprovalRequestRepository();
  const runtime = createAgentToolRuntime({
    gate: new SafetyActionGate({
      now: () => 1,
      createId: () => "request",
      consumptionStore: approvals,
    }),
    approvals,
    audit: createAuditLog({
      appendLine: () => Promise.resolve(),
      readText: () => Promise.resolve(""),
    }),
    nodeId: () => "node-1",
    ownPid: () => 99,
    now: () => 1,
    createId: () => "action",
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
  });

  assertEquals(await runtime.invoke("app.open", { application: "Calculator" }), {
    ok: false,
    approvalRequired: false,
    error: "node_invalid_request",
  });
  assertEquals(await runtime.invoke("process.kill", { pid: 99 }), {
    ok: false,
    approvalRequired: false,
    error: "node_invalid_request",
  });
  assertEquals(await approvals.list(), []);
});

Deno.test("process approval binds identity and a changed pid identity fails the effect", async () => {
  const approvals = createMemoryApprovalRequestRepository();
  const gate = new SafetyActionGate({
    now: () => 1_000,
    createId: () => "request-1",
    consumptionStore: approvals,
  });
  let identity = { pid: 42, command: "worker", startedAt: "start-a" };
  let kills = 0;
  const runtime = createAgentToolRuntime({
    gate,
    approvals,
    audit: createAuditLog({
      appendLine: () => Promise.resolve(),
      readText: () => Promise.resolve(""),
    }),
    nodeId: () => "node-1",
    ownPid: () => 99,
    now: () => 1_000,
    createId: () => "action-1",
    read: {
      overview: () => Promise.resolve({}),
      processes: () => Promise.resolve([]),
      network: () => Promise.resolve({}),
      relay: () => Promise.resolve({}),
    },
    effects: {
      inspectProcess: () => Promise.resolve(identity),
      kill(_pid, expected) {
        if (
          expected.command !== identity.command ||
          expected.startedAt !== identity.startedAt
        ) return Promise.reject(new Error("process_identity_changed"));
        kills += 1;
        return Promise.resolve({ ok: true });
      },
      openApplication: () => Promise.resolve({ ok: true }),
      updateRelay: () => Promise.resolve({ ok: true }),
    },
  });

  await runtime.invoke("process.kill", { pid: 42 });
  const request = (await approvals.list())[0]!;
  assertEquals(JSON.parse(request.action.preview!), {
    pid: 42,
    command: "worker",
    startedAt: "start-a",
  });
  identity = { ...identity, startedAt: "start-b" };
  const result = await runtime.resolve({
    id: request.id,
    decision: "approved",
    parameterFingerprint: request.parameterFingerprint!,
  });
  assertEquals(result.applied, false);
  assertEquals(result.error, "action_failed");
  assertEquals(kills, 0);
});

Deno.test("a resolved native ok:false is recorded as effect failure", async () => {
  const approvals = createMemoryApprovalRequestRepository();
  const runtime = createAgentToolRuntime({
    gate: new SafetyActionGate({
      now: () => 1_000,
      createId: () => "request-1",
      consumptionStore: approvals,
    }),
    approvals,
    audit: createAuditLog({
      appendLine: () => Promise.resolve(),
      readText: () => Promise.resolve(""),
    }),
    nodeId: () => "node-1",
    ownPid: () => 99,
    now: () => 1_000,
    createId: () => "action-1",
    read: {
      overview: () => Promise.resolve({}),
      processes: () => Promise.resolve([]),
      network: () => Promise.resolve({}),
      relay: () => Promise.resolve({}),
    },
    effects: {
      inspectProcess: () => Promise.resolve(null),
      kill: () => Promise.resolve({ ok: true }),
      openApplication: () => Promise.resolve({ ok: false }),
      updateRelay: () => Promise.resolve({ ok: true }),
    },
  });

  await runtime.invoke("app.open", { application: "Safari" });
  const request = (await approvals.list())[0]!;
  const result = await runtime.resolve({
    id: request.id,
    decision: "approved",
    parameterFingerprint: request.parameterFingerprint!,
  });
  assertEquals(result.applied, false);
  assertEquals(result.error, "action_failed");
});
