import { assertEquals, assertRejects } from "jsr:@std/assert";

import {
  APPROVAL_TTL_MS,
  type ApprovalConsumptionStore,
  ApprovalGateError,
  InMemoryApprovalConsumptionStore,
  SafetyActionGate,
} from "../../src/mod.ts";

Deno.test("SafetyActionGate fingerprints approvals and gives them a five-minute expiry", async () => {
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1"),
    now: () => 1_000,
  });

  const request = await gate.createBoundaryRequest("change relay", action());

  assertEquals(request.expiresAt, 1_000 + APPROVAL_TTL_MS);
  assertEquals(request.parameterFingerprint, request.action.parameterFingerprint);
  assertEquals(typeof request.parameterFingerprint, "string");
});

Deno.test("SafetyActionGate rejects an expired approval with an audit-ready record", async () => {
  let now = 1_000;
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "resolution-1"),
    now: () => now,
  });
  const request = await gate.createBoundaryRequest("change relay", action());
  now = request.expiresAt;

  const error = await assertRejects(
    () => gate.approveBoundaryRequest(request),
    ApprovalGateError,
    "approval_expired",
  ) as ApprovalGateError;

  assertEquals(error.error.code, "approval_expired");
  assertEquals(error.record.state, "expired");
  assertEquals(error.record.requestId, request.id);
});

Deno.test("SafetyActionGate uses the registered expiry when a request is mutated", async () => {
  let now = 1_000;
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "resolution-1"),
    now: () => now,
  });
  const request = await gate.createBoundaryRequest("change relay", action());
  now = request.expiresAt;

  const error = await assertRejects(
    () =>
      gate.approveBoundaryRequest({
        ...request,
        expiresAt: request.expiresAt + APPROVAL_TTL_MS,
      }),
    ApprovalGateError,
    "approval_expired",
  ) as ApprovalGateError;

  assertEquals(error.error.code, "approval_expired");
  assertEquals(error.record.state, "expired");
});

Deno.test("SafetyActionGate rejects a stale parameter fingerprint before apply", async () => {
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "resolution-1", "application-1"),
    now: () => 2_000,
  });
  const approved = await gate.approveBoundaryRequest(
    await gate.createBoundaryRequest("change relay", action()),
  );

  const result = await gate.applyAction({
    action: approved.action,
    parameterFingerprint: "different-parameters",
    apply: () => Promise.resolve("must not run"),
  });

  assertEquals(result.applied, false);
  assertEquals(result.error?.code, "approval_fingerprint_mismatch");
  assertEquals(result.record.state, "stale");
});

Deno.test("SafetyActionGate recomputes the fingerprint when an approved action is mutated", async () => {
  let applyCount = 0;
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "application-1"),
    now: () => 2_500,
  });
  const approved = await gate.approveBoundaryRequest(
    await gate.createBoundaryRequest("change relay", action()),
  );

  const result = await gate.applyAction({
    action: {
      ...approved.action,
      target: "relay://attacker-controlled",
      preview: '{"enabled":false}',
    },
    apply: () => {
      applyCount++;
      return Promise.resolve("must not run");
    },
  });

  assertEquals(result.applied, false);
  assertEquals(result.error?.code, "approval_fingerprint_mismatch");
  assertEquals(result.record.state, "stale");
  assertEquals(applyCount, 0);
});

Deno.test("SafetyActionGate rejects application before an approved resolution", async () => {
  let applyCount = 0;
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "application-1"),
    now: () => 2_750,
  });
  const pending = await gate.createBoundaryRequest("change relay", action());

  const result = await gate.applyAction({
    action: { ...pending.action, state: "approved" },
    apply: () => {
      applyCount++;
      return Promise.resolve("must not run");
    },
  });

  assertEquals(result.applied, false);
  assertEquals(result.error?.code, "approval_not_approved");
  assertEquals(result.record.state, "rejected");
  assertEquals(applyCount, 0);
});

Deno.test("SafetyActionGate rejects a rejected action mutated to approved", async () => {
  let applyCount = 0;
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "application-1"),
    now: () => 2_875,
  });
  const rejected = await gate.rejectBoundaryRequest(
    await gate.createBoundaryRequest("change relay", action()),
  );

  const result = await gate.applyAction({
    action: { ...rejected.action, state: "approved" },
    apply: () => {
      applyCount++;
      return Promise.resolve("must not run");
    },
  });

  assertEquals(result.applied, false);
  assertEquals(result.error?.code, "approval_not_approved");
  assertEquals(result.record.state, "rejected");
  assertEquals(applyCount, 0);
});

Deno.test("SafetyActionGate cannot resolve the same approval twice", async () => {
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "resolution-1", "resolution-2"),
    now: () => 3_000,
  });
  const request = await gate.createBoundaryRequest("change relay", action());
  await gate.resolveBoundaryRequest(request, "approved");

  const error = await assertRejects(
    () => gate.resolveBoundaryRequest(request, "rejected"),
    ApprovalGateError,
    "approval_already_resolved",
  ) as ApprovalGateError;

  assertEquals(error.error.code, "approval_already_resolved");
  assertEquals(error.record.state, "replayed");
});

Deno.test("SafetyActionGate atomically rejects resolution replay across instances", async () => {
  const consumptionStore = new InMemoryApprovalConsumptionStore();
  const firstGate = new SafetyActionGate({
    consumptionStore,
    createId: fixedIds("boundary-1"),
    now: () => 3_500,
  });
  const replayGate = new SafetyActionGate({
    consumptionStore,
    createId: fixedIds("resolution-replay"),
    now: () => 3_500,
  });
  const request = await firstGate.createBoundaryRequest("change relay", action());
  await firstGate.resolveBoundaryRequest(request, "approved");

  const error = await assertRejects(
    () => replayGate.resolveBoundaryRequest(request, "rejected"),
    ApprovalGateError,
    "approval_already_resolved",
  ) as ApprovalGateError;

  assertEquals(error.error.code, "approval_already_resolved");
  assertEquals(error.record.state, "replayed");
});

Deno.test("SafetyActionGate consumes an approval once even when replayed concurrently", async () => {
  let applyCount = 0;
  const gate = new SafetyActionGate({
    createId: fixedIds(
      "boundary-1",
      "resolution-1",
      "application-1",
      "application-2",
    ),
    now: () => 4_000,
  });
  const approved = await gate.approveBoundaryRequest(
    await gate.createBoundaryRequest("change relay", action()),
  );
  const apply = async () => {
    applyCount++;
    await Promise.resolve();
    return "done";
  };

  const [first, replay] = await Promise.all([
    gate.applyAction({ action: approved.action, apply }),
    gate.applyAction({ action: approved.action, apply }),
  ]);

  assertEquals(first.applied, true);
  assertEquals(replay.applied, false);
  assertEquals(replay.error?.code, "approval_already_applied");
  assertEquals(replay.record.state, "replayed");
  assertEquals(applyCount, 1);
});

Deno.test("SafetyActionGate atomically consumes application across instances", async () => {
  let applyCount = 0;
  const consumptionStore = new InMemoryApprovalConsumptionStore();
  const firstGate = new SafetyActionGate({
    consumptionStore,
    createId: fixedIds("boundary-1", "application-1"),
    now: () => 4_500,
  });
  const replayGate = new SafetyActionGate({
    consumptionStore,
    createId: fixedIds("application-replay"),
    now: () => 4_500,
  });
  const approved = await firstGate.approveBoundaryRequest(
    await firstGate.createBoundaryRequest("change relay", action()),
  );
  const apply = async () => {
    applyCount++;
    await Promise.resolve();
    return "done";
  };

  const [first, replay] = await Promise.all([
    firstGate.applyAction({ action: approved.action, apply }),
    replayGate.applyAction({ action: approved.action, apply }),
  ]);

  assertEquals(first.applied, true);
  assertEquals(replay.applied, false);
  assertEquals(replay.error?.code, "approval_already_applied");
  assertEquals(replay.record.state, "replayed");
  assertEquals(applyCount, 1);
});

Deno.test("SafetyActionGate awaits an asynchronous atomic consumption store", async () => {
  const delegate = new InMemoryApprovalConsumptionStore();
  const asynchronousStore: ApprovalConsumptionStore = {
    async registerIfAbsent(approval) {
      await Promise.resolve();
      return await delegate.registerIfAbsent(approval);
    },
    async claimResolution(input) {
      await Promise.resolve();
      return await delegate.claimResolution(input);
    },
    async claimApplication(input) {
      await Promise.resolve();
      return await delegate.claimApplication(input);
    },
  };
  const gate = new SafetyActionGate({
    consumptionStore: asynchronousStore,
    createId: fixedIds("boundary-1", "application-1"),
    now: () => 5_000,
  });

  const request = await gate.createBoundaryRequest("change relay", action());
  const approved = await gate.approveBoundaryRequest(request);
  const result = await gate.applyAction({
    action: approved.action,
    apply: () => Promise.resolve("done"),
  });

  assertEquals(result.applied, true);
  assertEquals(result.record.state, "applied");
});

function action() {
  return {
    id: "action-1",
    kind: "external_effect" as const,
    title: "Change relay",
    target: "relay://settings",
    preview: '{"enabled":true}',
    state: "draft" as const,
  };
}

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}
