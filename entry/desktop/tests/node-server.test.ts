import { assertEquals } from "@std/assert";

import {
  createReplayProtector,
  createWebCryptoAdapter,
  openRelayEnvelope,
  sealRelayEnvelope,
  signRequest,
} from "../../../domains/_shared/openfx-node/mod.ts";
import { requestJson } from "../src/native/http-json.ts";
import { startNodeServer } from "../src/native/node-server.ts";

Deno.test("node:http server exposes minimal health and encrypted relay only", async () => {
  const crypto = createWebCryptoAdapter(globalThis.crypto);
  const secret = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
  const server = await startNodeServer({
    host: "127.0.0.1",
    port: 0,
    crypto,
    loadSecret: () => Promise.resolve(secret),
    dispatch: (request) => Promise.resolve({ ok: true, route: request.path }),
  });
  try {
    assertEquals(
      await requestJson({
        protocol: "http:",
        hostname: "127.0.0.1",
        port: server.port,
        path: "/v1/health",
        method: "GET",
      }),
      { status: 200, body: { ok: true, protocolVersion: 1 } },
    );
    const signed = await signRequest(
      crypto,
      secret,
      { method: "GET", path: "/v1/processes", body: null },
    );
    const envelope = await sealRelayEnvelope(crypto, secret, signed);
    const response = await requestJson({
      protocol: "http:",
      hostname: "127.0.0.1",
      port: server.port,
      path: "/v1/relay",
      method: "POST",
      body: envelope,
    });
    assertEquals(response.status, 200);
    assertEquals(
      await openRelayEnvelope(crypto, secret, response.body as never, {
        replayProtector: createReplayProtector(),
      }),
      { ok: true, route: "/v1/processes" },
    );
    assertEquals(
      await requestJson({
        protocol: "http:",
        hostname: "127.0.0.1",
        port: server.port,
        path: "/v1/system/overview",
        method: "GET",
      }),
      { status: 404, body: { ok: false, error: "node_route_not_allowed" } },
    );
  } finally {
    await server.close();
  }
});
