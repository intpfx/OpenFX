import { assertEquals } from "@std/assert";

import { SafetyActionGate } from "../../../domains/e/src/core/safety-action-gate.ts";
import type { BoundaryRequest } from "../../../domains/e/src/core/types.ts";
import {
  createDesktopJournal,
  createMemoryJournalStorage,
} from "../src/core/durable-journal.ts";

const requestFixture = (gate: SafetyActionGate): BoundaryRequest => {
  const action = gate.prepareAction({
    id: "action-1",
    kind: "external_effect",
    title: "process.kill requires approval",
    target: "process.kill",
    preview: JSON.stringify({ pid: 42, identity: "launchd@1" }),
    state: "draft",
  });
  return {
    id: "request-1",
    reason: "Agent requested process.kill",
    action,
    parameterFingerprint: action.parameterFingerprint,
    state: "pending",
    createdAt: 1_000,
    expiresAt: 301_000,
  };
};

Deno.test("resolution claim atomically updates approval authority, UI request, and audit", async () => {
  const storage = createMemoryJournalStorage();
  const journal = createDesktopJournal(storage, {
    now: () => 1_000,
    createId: () => "audit-1",
  });
  const gate = new SafetyActionGate({
    now: () => 1_000,
    createId: () => "unused",
    consumptionStore: journal,
  });
  const request = requestFixture(gate);
  await journal.registerRequest(request, "node-1");

  await gate.resolveBoundaryRequest(
    request,
    "approved",
  );

  const reconstructed = createDesktopJournal(storage, {
    now: () => 1_001,
    createId: () => "audit-2",
  });
  assertEquals((await reconstructed.get(request.id))?.state, "approved");
  assertEquals((await reconstructed.listAudit()).map((event) => event.action), [
    "process.kill.requested",
    "process.kill.approved",
  ]);
});

Deno.test("crash after execution intent becomes terminal ambiguous and never replays the effect", async () => {
  const storage = createMemoryJournalStorage();
  const firstJournal = createDesktopJournal(storage, {
    now: () => 1_000,
    createId: (() => {
      let id = 0;
      return () => `audit-${++id}`;
    })(),
  });
  const firstGate = new SafetyActionGate({
    now: () => 1_000,
    createId: () => "unused",
    consumptionStore: firstJournal,
  });
  const request = requestFixture(firstGate);
  await firstJournal.registerRequest(request, "node-1");
  const approved = await firstGate.resolveBoundaryRequest(request, "approved");

  // Simulate a process crash after the durable application claim but before the
  // native effect/outcome record. The callback intentionally never runs here.
  assertEquals(
    (await firstJournal.claimApplication({
      actionId: approved.action.id,
      parameterFingerprint: approved.parameterFingerprint!,
      now: 1_001,
    })).status,
    "claimed",
  );

  const reconstructed = createDesktopJournal(storage, {
    now: () => 1_002,
    createId: () => "audit-recovery",
  });
  await reconstructed.recoverIncompleteExecutions();
  assertEquals((await reconstructed.get(request.id))?.action.state, "failed");
  assertEquals((await reconstructed.listAudit()).at(-1)?.outcome, "failed");
  assertEquals((await reconstructed.listAudit()).at(-1)?.metadata, {
    executionState: "ambiguous",
  });

  let effects = 0;
  const replayGate = new SafetyActionGate({
    now: () => 1_003,
    createId: () => "unused",
    consumptionStore: reconstructed,
  });
  const result = await replayGate.applyAction({
    action: approved.action,
    parameterFingerprint: approved.parameterFingerprint,
    apply: () => Promise.resolve(++effects),
  });
  assertEquals(result.applied, false);
  assertEquals(result.error?.code, "approval_already_applied");
  assertEquals(effects, 0);
});

Deno.test("application outcome and replay nonce claims survive reconstruction", async () => {
  const storage = createMemoryJournalStorage();
  const journal = createDesktopJournal(storage, {
    now: () => 1_000,
    createId: () => "audit-1",
  });
  const gate = new SafetyActionGate({
    now: () => 1_000,
    createId: () => "unused",
    consumptionStore: journal,
  });
  const request = requestFixture(gate);
  await journal.registerRequest(request, "node-1");
  const approved = await gate.resolveBoundaryRequest(request, "approved");
  const application = await gate.applyAction({
    action: approved.action,
    parameterFingerprint: approved.parameterFingerprint,
    apply: () => Promise.resolve({ ok: true }),
  });
  await journal.recordApplicationOutcome(
    { ...approved, action: application.action },
    application,
    "node-1",
  );
  assertEquals(await journal.claimReplayNonce("nonce-1", 31_000, 1_000), true);

  const reconstructed = createDesktopJournal(storage, {
    now: () => 1_001,
    createId: () => "audit-2",
  });
  assertEquals((await reconstructed.get(request.id))?.action.state, "applied");
  assertEquals(
    await reconstructed.claimReplayNonce("nonce-1", 31_000, 1_001),
    false,
  );
  assertEquals(
    await reconstructed.claimReplayNonce("nonce-1", 62_000, 31_001),
    true,
  );
});
