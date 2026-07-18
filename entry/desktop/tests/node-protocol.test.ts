import { assertEquals, assertRejects } from "@std/assert";

import {
  createReplayProtector,
  createWebCryptoAdapter,
  openRelayEnvelope,
  sealRelayEnvelope,
  signRequest,
} from "../../../domains/_shared/openfx-node/mod.ts";
import {
  createNodeRelayProtocol,
  PUBLIC_NODE_HEALTH,
} from "../src/core/node-protocol.ts";

const NOW = 5_000_000;
const SECRET = new TextEncoder().encode("0123456789abcdef0123456789abcdef");

Deno.test("public node health is minimal and stable", () => {
  assertEquals(PUBLIC_NODE_HEALTH, { ok: true, protocolVersion: 1 });
  assertEquals(Object.keys(PUBLIC_NODE_HEALTH), ["ok", "protocolVersion"]);
});

Deno.test("node relay opens, verifies, dispatches, and seals an allowed fixed route", async () => {
  const crypto = createWebCryptoAdapter(globalThis.crypto);
  const seen: Array<{ method: string; path: string; body: unknown }> = [];
  const protocol = createNodeRelayProtocol({
    crypto,
    secret: SECRET,
    now: () => NOW,
    dispatch(request) {
      seen.push(request);
      return Promise.resolve({ ok: true, overview: { cpuUsagePercent: 12 } });
    },
  });
  const signed = await signRequest(
    crypto,
    SECRET,
    { method: "GET", path: "/v1/system/overview", body: null },
    { now: () => NOW },
  );
  const envelope = await sealRelayEnvelope(crypto, SECRET, signed, {
    now: () => NOW,
  });

  const responseEnvelope = await protocol.handle(envelope);
  const response = await openRelayEnvelope(crypto, SECRET, responseEnvelope, {
    now: () => NOW,
    replayProtector: createReplayProtector(),
  });

  assertEquals(seen, [{
    method: "GET",
    path: "/v1/system/overview",
    body: null,
  }]);
  assertEquals(response, { ok: true, overview: { cpuUsagePercent: 12 } });
});

Deno.test("node relay rejects authenticated routes outside the Task 2 fixed map", async () => {
  const crypto = createWebCryptoAdapter(globalThis.crypto);
  const protocol = createNodeRelayProtocol({
    crypto,
    secret: SECRET,
    now: () => NOW,
    dispatch: () => Promise.resolve({ ok: true }),
  });
  const signed = await signRequest(
    crypto,
    SECRET,
    { method: "POST", path: "/v1/shell", body: { command: "id" } },
    { now: () => NOW },
  );
  const envelope = await sealRelayEnvelope(crypto, SECRET, signed, {
    now: () => NOW,
  });

  await assertRejects(
    () => protocol.handle(envelope),
    Error,
    "node_route_not_allowed",
  );
});

Deno.test("node relay rejects a replayed authenticated envelope", async () => {
  const crypto = createWebCryptoAdapter(globalThis.crypto);
  const protocol = createNodeRelayProtocol({
    crypto,
    secret: SECRET,
    now: () => NOW,
    dispatch: () => Promise.resolve({ ok: true }),
  });
  const signed = await signRequest(
    crypto,
    SECRET,
    { method: "GET", path: "/v1/processes", body: null },
    { now: () => NOW },
  );
  const envelope = await sealRelayEnvelope(crypto, SECRET, signed, {
    now: () => NOW,
  });

  await protocol.handle(envelope);
  await assertRejects(
    () => protocol.handle(envelope),
    Error,
    "node_replay_detected",
  );
});
