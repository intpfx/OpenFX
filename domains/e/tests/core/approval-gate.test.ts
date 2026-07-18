import { assertEquals, assertThrows } from "jsr:@std/assert";

import { APPROVAL_TTL_MS, ApprovalGateError, SafetyActionGate } from "../../src/mod.ts";

Deno.test("SafetyActionGate fingerprints approvals and gives them a five-minute expiry", () => {
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1"),
    now: () => 1_000,
  });

  const request = gate.createBoundaryRequest("change relay", action());

  assertEquals(request.expiresAt, 1_000 + APPROVAL_TTL_MS);
  assertEquals(request.parameterFingerprint, request.action.parameterFingerprint);
  assertEquals(typeof request.parameterFingerprint, "string");
});

Deno.test("SafetyActionGate rejects an expired approval with an audit-ready record", () => {
  let now = 1_000;
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "resolution-1"),
    now: () => now,
  });
  const request = gate.createBoundaryRequest("change relay", action());
  now = request.expiresAt;

  const error = assertThrows(
    () => gate.approveBoundaryRequest(request),
    ApprovalGateError,
    "approval_expired",
  ) as ApprovalGateError;

  assertEquals(error.error.code, "approval_expired");
  assertEquals(error.record.state, "expired");
  assertEquals(error.record.requestId, request.id);
});

Deno.test("SafetyActionGate rejects a stale parameter fingerprint before apply", async () => {
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "resolution-1", "application-1"),
    now: () => 2_000,
  });
  const approved = gate.approveBoundaryRequest(
    gate.createBoundaryRequest("change relay", action()),
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

Deno.test("SafetyActionGate cannot resolve the same approval twice", () => {
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "resolution-1", "resolution-2"),
    now: () => 3_000,
  });
  const request = gate.createBoundaryRequest("change relay", action());
  gate.resolveBoundaryRequest(request, "approved");

  const error = assertThrows(
    () => gate.resolveBoundaryRequest(request, "rejected"),
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
  const approved = gate.approveBoundaryRequest(
    gate.createBoundaryRequest("change relay", action()),
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
