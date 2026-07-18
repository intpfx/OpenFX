import { assertEquals } from "@std/assert";

import type { BoundaryRequest } from "../../../domains/e/src/core/types.ts";
import {
  type JsonStringPersistence,
  PersistentApprovalRequestRepository,
} from "../src/core/persistent-approval-requests.ts";

Deno.test("pending approval requests and their resolution survive repository reconstruction", async () => {
  let raw: string | null = null;
  const persistence: JsonStringPersistence = {
    read: () => Promise.resolve(raw),
    compareAndSet(expected, next) {
      if (raw !== expected) return Promise.resolve(false);
      raw = next;
      return Promise.resolve(true);
    },
  };
  const pending: BoundaryRequest = {
    id: "request-1",
    reason: "Agent requested relay.update",
    action: {
      id: "action-1",
      kind: "external_effect",
      title: "relay.update requires approval",
      target: "relay.update",
      preview: JSON.stringify({ enabled: false }),
      parameterFingerprint: "fingerprint-1",
      state: "ready",
    },
    parameterFingerprint: "fingerprint-1",
    state: "pending",
    createdAt: 1,
    expiresAt: 301_000,
  };

  await new PersistentApprovalRequestRepository(persistence).save(pending);
  const afterRestart = new PersistentApprovalRequestRepository(persistence);
  assertEquals(await afterRestart.get("request-1"), pending);

  await afterRestart.save({ ...pending, state: "approved", resolvedAt: 2 });
  assertEquals(
    await new PersistentApprovalRequestRepository(persistence).list(),
    [{
      ...pending,
      state: "approved",
      resolvedAt: 2,
    }],
  );
});
