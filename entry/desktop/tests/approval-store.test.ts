import { assertEquals } from "@std/assert";

import { SafetyActionGate } from "../../../domains/e/src/core/safety-action-gate.ts";
import type { ProposedAction } from "../../../domains/e/src/core/types.ts";
import {
  type ApprovalPersistence,
  PersistentApprovalConsumptionStore,
} from "../src/core/persistent-approval-store.ts";

Deno.test("approval authority survives desktop store reconstruction and consumes once", async () => {
  let serialized: string | null = null;
  const persistence: ApprovalPersistence = {
    read: () => Promise.resolve(serialized),
    compareAndSet(expected, next) {
      if (serialized !== expected) return Promise.resolve(false);
      serialized = next;
      return Promise.resolve(true);
    },
  };
  let now = 10_000;
  let nextId = 0;
  const action: ProposedAction = {
    id: "action-kill-42",
    kind: "external_effect",
    title: "Terminate process 42",
    target: "process.kill",
    preview: JSON.stringify({ pid: 42 }),
    state: "draft",
  };

  const createdBy = new SafetyActionGate({
    now: () => now,
    createId: () => `request-${++nextId}`,
    consumptionStore: new PersistentApprovalConsumptionStore(persistence),
  });
  const request = await createdBy.createBoundaryRequest(
    "Agent requested process.kill",
    action,
  );

  const resolvedBy = new SafetyActionGate({
    now: () => ++now,
    createId: () => `record-${++nextId}`,
    consumptionStore: new PersistentApprovalConsumptionStore(persistence),
  });
  const approved = await resolvedBy.approveBoundaryRequest(request);

  let applications = 0;
  const appliedBy = new SafetyActionGate({
    now: () => ++now,
    createId: () => `record-${++nextId}`,
    consumptionStore: new PersistentApprovalConsumptionStore(persistence),
  });
  const first = await appliedBy.applyAction({
    action: approved.action,
    parameterFingerprint: approved.parameterFingerprint,
    apply: () => Promise.resolve(++applications),
  });

  const replayedBy = new SafetyActionGate({
    now: () => ++now,
    createId: () => `record-${++nextId}`,
    consumptionStore: new PersistentApprovalConsumptionStore(persistence),
  });
  const replay = await replayedBy.applyAction({
    action: approved.action,
    parameterFingerprint: approved.parameterFingerprint,
    apply: () => Promise.resolve(++applications),
  });

  assertEquals(first.applied, true);
  assertEquals(first.result, 1);
  assertEquals(replay.applied, false);
  assertEquals(replay.error?.code, "approval_already_applied");
  assertEquals(applications, 1);
});

Deno.test("persistent approval registration never overwrites an existing action", async () => {
  let serialized: string | null = null;
  const persistence: ApprovalPersistence = {
    read: () => Promise.resolve(serialized),
    compareAndSet(expected, next) {
      if (serialized !== expected) return Promise.resolve(false);
      serialized = next;
      return Promise.resolve(true);
    },
  };
  const store = new PersistentApprovalConsumptionStore(persistence);
  const first = await store.registerIfAbsent({
    requestId: "request-1",
    actionId: "action-1",
    parameterFingerprint: "fingerprint-1",
    expiresAt: 100,
  });
  const conflicting = await store.registerIfAbsent({
    requestId: "request-2",
    actionId: "action-1",
    parameterFingerprint: "fingerprint-2",
    expiresAt: 200,
  });

  assertEquals(conflicting, first);
});
