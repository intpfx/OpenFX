import { expect } from "@std/expect";

import {
  BOUNDED_DENO_ENTRY_MARKER,
  createDenoRequestHandler,
  readBoundedRequestBody,
  TRUSTED_REMOTE_ADDRESS_HEADER,
} from "../server/runtime/deno-request.ts";
import { assertSafeDenoBundle } from "../tools/verify-deno-entry.ts";

const remoteInfo = (hostname: string) => ({ remoteAddr: { hostname } });

Deno.test("Deno entry rejects chunked bodies above 64 KiB before localFetch", async () => {
  let localFetchCalls = 0;
  let cancelled = false;
  let pulls = 0;
  const handler = createDenoRequestHandler({
    localFetch() {
      localFetchCalls += 1;
      return Promise.resolve(new Response("unexpected"));
    },
  });
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(16 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });

  const response = await handler(
    new Request("https://openfx.example/api/how-much/upload", {
      method: "POST",
      body,
    }),
    remoteInfo("203.0.113.9"),
  );

  expect(response.status).toBe(413);
  expect(localFetchCalls).toBe(0);
  expect(cancelled).toBe(true);
  expect(pulls).toBeLessThan(10);
});

Deno.test("bounded Deno body reader accepts exactly 64 KiB", async () => {
  const result = await readBoundedRequestBody(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1024));
        controller.close();
      },
    }),
  );
  expect(result?.byteLength).toBe(64 * 1024);
});

Deno.test("Deno entry keeps websocket upgrades on the websocket adapter", async () => {
  let upgrades = 0;
  let localFetchCalls = 0;
  const handler = createDenoRequestHandler({
    localFetch() {
      localFetchCalls += 1;
      return Promise.resolve(new Response("unexpected"));
    },
    websocket: {
      handleUpgrade() {
        upgrades += 1;
        return new Response(null, { status: 101 });
      },
    },
  });
  const response = await handler(
    new Request("https://openfx.example/ws", {
      headers: { upgrade: "websocket" },
    }),
    remoteInfo("203.0.113.7"),
  );
  expect(response.status).toBe(101);
  expect(upgrades).toBe(1);
  expect(localFetchCalls).toBe(0);
});

Deno.test("build verifier rejects the unrestricted preset entry", () => {
  expect(() =>
    assertSafeDenoBundle(`
      Deno.serve(async (request) => {
        const body = await request.arrayBuffer();
        return localFetch("/", { body });
      });
    `)
  ).toThrow();

  expect(() =>
    assertSafeDenoBundle(`
      const marker = "${BOUNDED_DENO_ENTRY_MARKER}";
      const header = "${TRUSTED_REMOTE_ADDRESS_HEADER}";
    `)
  ).not.toThrow();
});
