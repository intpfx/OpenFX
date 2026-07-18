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
import { connect } from "node:net";

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
      {
        request: {
          nonce: signed.nonce,
          method: "GET",
          path: "/v1/processes",
        },
        result: { ok: true, route: "/v1/processes" },
      },
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

Deno.test("node server returns stable 413 JSON for a 70 KiB request", async () => {
  const server = await startNodeServer({
    host: "127.0.0.1",
    port: 0,
    crypto: createWebCryptoAdapter(globalThis.crypto),
    loadSecret: () =>
      Promise.resolve(new TextEncoder().encode("0123456789abcdef0123456789abcdef")),
    dispatch: () => Promise.resolve({}),
  });
  try {
    assertEquals(
      await requestJson({
        protocol: "http:",
        hostname: "127.0.0.1",
        port: server.port,
        path: "/v1/relay",
        method: "POST",
        body: { padding: "x".repeat(70 * 1024) },
      }),
      {
        status: 413,
        body: { ok: false, error: "node_invalid_request" },
      },
    );
  } finally {
    await server.close();
  }
});

Deno.test("node server returns stable 408 JSON for a slow request body", async () => {
  const server = await startNodeServer({
    host: "127.0.0.1",
    port: 0,
    crypto: createWebCryptoAdapter(globalThis.crypto),
    loadSecret: () =>
      Promise.resolve(new TextEncoder().encode("0123456789abcdef0123456789abcdef")),
    dispatch: () => Promise.resolve({}),
    requestTimeoutMs: 30,
  });
  try {
    const response = await new Promise<string>((resolve, reject) => {
      const socket = connect(server.port, "127.0.0.1");
      let received = "";
      socket.setEncoding("utf8");
      socket.on("connect", () => {
        socket.write(
          "POST /v1/relay HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{",
        );
      });
      socket.on("data", (chunk) => received += chunk);
      socket.on("end", () => resolve(received));
      socket.on("error", reject);
    });
    assertEquals(response.includes("HTTP/1.1 408 Request Timeout"), true);
    assertEquals(
      response.endsWith('{"ok":false,"error":"node_invalid_request"}'),
      true,
    );
  } finally {
    await server.close();
  }
});

Deno.test("node server aborts dispatch when the Relay client disconnects", async () => {
  const crypto = createWebCryptoAdapter(globalThis.crypto);
  const secret = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
  let dispatchStarted!: () => void;
  let dispatchAborted!: () => void;
  const started = new Promise<void>((resolve) => dispatchStarted = resolve);
  const aborted = new Promise<void>((resolve) => dispatchAborted = resolve);
  const server = await startNodeServer({
    host: "127.0.0.1",
    port: 0,
    crypto,
    loadSecret: () => Promise.resolve(secret),
    dispatch: (_request, signal) => {
      dispatchStarted();
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          dispatchAborted();
          reject(new Error("relay_client_aborted"));
        }, { once: true });
      });
    },
  });
  try {
    const signed = await signRequest(
      crypto,
      secret,
      { method: "POST", path: "/v1/agent/messages", body: { message: "slow" } },
    );
    const envelope = await sealRelayEnvelope(crypto, secret, signed);
    const payload = JSON.stringify(envelope);
    const socket = connect(server.port, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    socket.write(
      `POST /v1/relay HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${
        new TextEncoder().encode(payload).byteLength
      }\r\n\r\n${payload}`,
    );
    await started;
    socket.destroy();
    await Promise.race([
      aborted,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("dispatch was not aborted")), 250)
      ),
    ]);
  } finally {
    await server.close();
  }
});
