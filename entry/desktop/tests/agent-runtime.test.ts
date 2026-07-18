import { assertEquals } from "@std/assert";

import { SafetyActionGate } from "../../../domains/e/src/core/safety-action-gate.ts";
import {
  type AgentToolRuntimeDependencies,
  createAgentToolRuntime,
  createMemoryApprovalRequestRepository,
} from "../src/core/agent-runtime.ts";
import { createAuditLog } from "../src/core/audit-log.ts";
import { PersistentApprovalConsumptionStore } from "../src/core/persistent-approval-store.ts";

Deno.test("effectful Agent tools wait for a durable Task 1 approval before execution", async () => {
  let approvalState: string | null = null;
  const persistence = {
    read: () => Promise.resolve(approvalState),
    compareAndSet(expected: string | null, next: string) {
      if (approvalState !== expected) return Promise.resolve(false);
      approvalState = next;
      return Promise.resolve(true);
    },
  };
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
      consumptionStore: new PersistentApprovalConsumptionStore(persistence),
    });
  const killed: number[] = [];
  const baseDependencies: Omit<
    AgentToolRuntimeDependencies,
    "gate" | "approvals" | "audit"
  > = {
    nodeId: () => "node-1",
    now: () => now,
    createId: () => `tool-${++nextId}`,
    read: {
      overview: () => Promise.resolve({ cpuUsagePercent: 5 }),
      processes: () => Promise.resolve([]),
      network: () => Promise.resolve({ publicIpv6: null }),
      relay: () => Promise.resolve({ enabled: true }),
    },
    effects: {
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
  assertEquals((await audit.list()).map((event) => event.action), [
    "process.kill.requested",
    "process.kill.applied",
  ]);
});

Deno.test("read-only Agent tools execute directly and unknown tools stay closed", async () => {
  const audit = createAuditLog({
    appendLine: () => Promise.resolve(),
    readText: () => Promise.resolve(""),
  });
  const runtime = createAgentToolRuntime({
    gate: new SafetyActionGate({ now: () => 1, createId: () => "id" }),
    approvals: createMemoryApprovalRequestRepository(),
    audit,
    nodeId: () => "node-1",
    now: () => 1,
    createId: () => "tool-1",
    read: {
      overview: () => Promise.resolve({ cpuUsagePercent: 5 }),
      processes: () => Promise.resolve([]),
      network: () => Promise.resolve({ publicIpv6: null }),
      relay: () => Promise.resolve({ enabled: true }),
    },
    effects: {
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
  let approvalState: string | null = null;
  const persistence = {
    read: () => Promise.resolve(approvalState),
    compareAndSet(expected: string | null, next: string) {
      if (approvalState !== expected) return Promise.resolve(false);
      approvalState = next;
      return Promise.resolve(true);
    },
  };
  const approvals = createMemoryApprovalRequestRepository();
  const gate = new SafetyActionGate({
    now: () => 100,
    createId: () => "request-1",
    consumptionStore: new PersistentApprovalConsumptionStore(persistence),
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
    now: () => 100,
    createId: () => "action-1",
    read: {
      overview: () => Promise.resolve({}),
      processes: () => Promise.resolve([]),
      network: () => Promise.resolve({}),
      relay: () => Promise.resolve({}),
    },
    effects: {
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
