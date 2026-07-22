import { expect } from "@std/expect";

import {
  BOUNDED_DENO_ENTRY_MARKER,
  createDenoRequestHandler,
  readBoundedRequestBody,
  TRUSTED_REMOTE_ADDRESS_HEADER,
} from "../server/runtime/deno-request.ts";
import { createDenoServeOptions } from "../server/runtime/deno-serve-options.ts";
import { assertSafeDenoBundle } from "../tools/verify-deno-entry.ts";
import {
  createConsoleControlPlane,
  createMemoryConsoleStore,
} from "../server/console/control-plane.ts";

const remoteInfo = (hostname: string) => ({ remoteAddr: { hostname } });

Deno.test("Deno entry binds only the marked local runtime to IPv4 loopback", () => {
  expect(createDenoServeOptions("/tmp/openfx-local-runtime")).toEqual({
    hostname: "127.0.0.1",
  });
  expect(createDenoServeOptions("   ")).toEqual({});
  expect(createDenoServeOptions(undefined)).toEqual({});
});

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
    new Request("https://openfx.example/api/node/pair", {
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

Deno.test("trusted Deno remote address owns one login rate bucket", async () => {
  const plane = createConsoleControlPlane({
    store: createMemoryConsoleStore(),
    env: { OPENFX_ADMIN_KEY: "correct horse battery staple" },
  });
  const seenTrustedAddresses: string[] = [];
  const seenForwardedAddresses: string[] = [];
  const seenCloudflareAddresses: Array<string | null> = [];
  const handler = createDenoRequestHandler({
    localFetch(path, init) {
      const headers = new Headers(init.headers);
      seenTrustedAddresses.push(headers.get(TRUSTED_REMOTE_ADDRESS_HEADER) ?? "");
      seenForwardedAddresses.push(headers.get("x-forwarded-for") ?? "");
      seenCloudflareAddresses.push(headers.get("cf-connecting-ip"));
      return plane.adminSession.create(
        new Request(`https://openfx.example${path}`, {
          method: init.method,
          headers,
          body: init.body as BodyInit,
        }),
      );
    },
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await handler(
      new Request("https://openfx.example/api/admin/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `198.51.100.${attempt}`,
          "cf-connecting-ip": `2001:db8::${attempt}`,
          [TRUSTED_REMOTE_ADDRESS_HEADER]: `192.0.2.${attempt}`,
        },
        body: JSON.stringify({ key: "wrong" }),
      }),
      remoteInfo("203.0.113.44"),
    );
    expect(response.status).toBe(attempt === 4 ? 429 : 401);
  }
  expect(new Set(seenTrustedAddresses)).toEqual(new Set(["203.0.113.44"]));
  expect(new Set(seenForwardedAddresses)).toEqual(new Set(["203.0.113.44"]));
  expect(new Set(seenCloudflareAddresses)).toEqual(new Set([null]));
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
