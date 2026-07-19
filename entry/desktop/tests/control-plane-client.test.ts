import { assert, assertEquals, assertRejects } from "@std/assert";

import {
  createWebCryptoAdapter,
  signedRequestFromHeaders,
  verifySignedRequest,
} from "../../../domains/_shared/openfx-node/mod.ts";
import { decodeBase64Url } from "../../../domains/_shared/openfx-node/encoding.ts";
import { sanitizeDesktopPreferences } from "../src/core/desktop-state.ts";
import { createControlPlaneClient } from "../src/native/control-plane-client.ts";
import { createPairingService } from "../src/native/pairing-service.ts";
import type { DesktopPreferences } from "../src/core/types.ts";
import type { HttpJsonRequest } from "../src/native/omlx-client.ts";

Deno.test("control-plane pairing and reports use HTTPS v1 contracts", async () => {
  const requests: unknown[] = [];
  const client = createControlPlaneClient((request) => {
    requests.push(request);
    if (request.path === "/api/node/pair") {
      return Promise.resolve({
        status: 201,
        body: {
          ok: true,
          node: { id: "node-1", name: "Studio Mac" },
          nodeSecret: "encoded-secret",
        },
      });
    }
    return Promise.resolve({ status: 202, body: { ok: true } });
  });

  const pair = await client.pair({
    serverUrl: "https://openfx.example/path",
    code: "01234567",
    name: "Studio Mac",
    publicIpv6: "240e::1",
  });
  await client.heartbeat({
    serverUrl: "https://openfx.example",
    nodeId: pair.node.id,
    nodeSecret: pair.nodeSecret,
    publicIpv6: "240e::1",
    availability: "online",
  });

  const heartbeat = requests[1] as HttpJsonRequest;
  assertEquals(heartbeat.headers?.authorization, undefined);
  assertEquals(heartbeat.headers?.["x-openfx-node-version"], "1");
  assert(
    Number.isSafeInteger(
      Number(heartbeat.headers?.["x-openfx-node-timestamp"]),
    ),
  );
  assert(heartbeat.headers?.["x-openfx-node-nonce"]);
  assert(heartbeat.headers?.["x-openfx-node-content-sha256"]);
  assert(heartbeat.headers?.["x-openfx-node-signature"]);
  assertEquals(JSON.stringify(heartbeat).includes(pair.nodeSecret), false);
  const signed = signedRequestFromHeaders(new Headers(heartbeat.headers), {
    method: heartbeat.method,
    path: heartbeat.path,
    body: heartbeat.body,
  });
  assertEquals(
    await verifySignedRequest(
      createWebCryptoAdapter(),
      decodeBase64Url(pair.nodeSecret),
      signed,
      {
        now: () => signed.timestamp,
        replayProtector: { consume() {} },
      },
    ),
    true,
  );

  assertEquals(requests, [
    {
      protocol: "https:",
      hostname: "openfx.example",
      port: 443,
      path: "/api/node/pair",
      method: "POST",
      body: {
        code: "01234567",
        name: "Studio Mac",
        protocolVersion: 1,
        publicIpv6: "240e::1",
        port: 24_531,
      },
    },
    {
      protocol: "https:",
      hostname: "openfx.example",
      port: 443,
      path: "/api/node/heartbeat",
      method: "POST",
      headers: heartbeat.headers,
      body: {
        nodeId: "node-1",
        protocolVersion: 1,
        publicIpv6: "240e::1",
        port: 24_531,
        availability: "online",
      },
    },
  ]);
});

Deno.test("pairing stores nodeSecret only in Keychain and recovers it after restart", async () => {
  let preferences: DesktopPreferences | null = null;
  const secrets = new Map<string, string>();
  const service = createPairingService({
    client: {
      pair: () =>
        Promise.resolve({
          node: { id: "node-1", name: "Studio Mac" },
          nodeSecret: "encoded-secret",
        }),
    },
    preferences: {
      load: () => Promise.resolve(preferences),
      update(patch) {
        preferences = mergePreferences(preferences, patch);
        return Promise.resolve(preferences);
      },
    },
    keychain: {
      write(account, secret) {
        secrets.set(account, secret);
        return Promise.resolve();
      },
      read: (account) => Promise.resolve(secrets.get(account) ?? null),
      remove(account) {
        secrets.delete(account);
        return Promise.resolve();
      },
    },
    now: () => 123,
  });

  await service.pair({
    serverUrl: "https://openfx.example",
    code: "01234567",
    name: "Studio Mac",
    publicIpv6: "240e::1",
  });

  assertEquals(preferences, {
    serverUrl: "https://openfx.example",
    nodeId: "node-1",
    nodeName: "Studio Mac",
    relayEnabled: true,
    pairedAt: 123,
    launchMode: "regular",
    reduceMotion: false,
  });
  assertEquals(JSON.stringify(preferences).includes("secret"), false);
  assertEquals(await service.restore(), {
    preferences: {
      serverUrl: "https://openfx.example",
      nodeId: "node-1",
      nodeName: "Studio Mac",
      relayEnabled: true,
      pairedAt: 123,
      launchMode: "regular",
      reduceMotion: false,
    },
    nodeSecret: "encoded-secret",
  });
});

Deno.test("pairing preserves menu-bar launch and static-core preferences", async () => {
  let preferences: DesktopPreferences | null = {
    serverUrl: "https://old.openfx.example",
    nodeId: "old-node",
    nodeName: "Old Mac",
    relayEnabled: false,
    pairedAt: 1,
    launchMode: "menuBarOnly",
    reduceMotion: true,
  };
  const service = createPairingService({
    client: {
      pair: () =>
        Promise.resolve({
          node: { id: "node-2", name: "Studio Mac" },
          nodeSecret: "encoded-secret-2",
        }),
    },
    preferences: {
      load: () => Promise.resolve(preferences),
      update(patch) {
        preferences = mergePreferences(preferences, patch);
        return Promise.resolve(preferences);
      },
    },
    keychain: {
      write: () => Promise.resolve(),
      read: () => Promise.resolve(null),
      remove: () => Promise.resolve(),
    },
    now: () => 456,
  });

  const paired = await service.pair({
    serverUrl: "https://openfx.example",
    code: "01234567",
    name: "Studio Mac",
    publicIpv6: "240e::1",
  });

  assertEquals(paired.preferences.launchMode, "menuBarOnly");
  assertEquals(paired.preferences.reduceMotion, true);
  assertEquals(preferences?.launchMode, "menuBarOnly");
  assertEquals(preferences?.reduceMotion, true);
});

Deno.test("pairing atomically updates preferences without awaiting store load", async () => {
  const calls: string[] = [];
  const service = createPairingService({
    client: {
      pair() {
        calls.push("https-pair");
        return Promise.resolve({
          node: { id: "node-3", name: "Studio Mac" },
          nodeSecret: "encoded-secret-3",
        });
      },
    },
    preferences: {
      load() {
        calls.push("unexpected-async-load");
        return new Promise<DesktopPreferences | null>(() => {});
      },
      update(patch) {
        calls.push("atomic-update");
        return Promise.resolve(mergePreferences(null, patch));
      },
    },
    keychain: {
      write: () => Promise.resolve(),
      read: () => Promise.resolve(null),
      remove: () => Promise.resolve(),
    },
  });

  await service.pair({
    serverUrl: "https://openfx.example",
    code: "01234567",
    name: "Studio Mac",
    publicIpv6: "240e::1",
  });

  assertEquals(calls.includes("unexpected-async-load"), false);
  assertEquals(calls, ["https-pair", "atomic-update"]);
});

Deno.test("pair completion preserves menu-bar and static-core changes made while HTTPS is pending", async () => {
  const pairResult = deferred<{
    node: { id: string; name: string };
    nodeSecret: string;
  }>();
  let preferences: DesktopPreferences | null = {
    serverUrl: "https://old.openfx.example",
    nodeId: "old-node",
    nodeName: "Old Mac",
    relayEnabled: true,
    pairedAt: 1,
    launchMode: "regular",
    reduceMotion: false,
  };
  const store = {
    load: () => Promise.resolve(preferences),
    update(patch: Partial<DesktopPreferences>) {
      preferences = mergePreferences(preferences, patch);
      return Promise.resolve(preferences);
    },
  };
  const service = createPairingService({
    client: { pair: () => pairResult.promise },
    preferences: store,
    keychain: {
      write: () => Promise.resolve(),
      read: () => Promise.resolve(null),
      remove: () => Promise.resolve(),
    },
  });

  const pairing = service.pair({
    serverUrl: "https://openfx.example",
    code: "01234567",
    name: "Studio Mac",
    publicIpv6: "240e::1",
  });
  await store.update({
    launchMode: "menuBarOnly",
    reduceMotion: true,
  });
  pairResult.resolve({
    node: { id: "node-new", name: "Studio Mac" },
    nodeSecret: "encoded-secret-new",
  });

  const paired = await pairing;
  assertEquals(paired.preferences.launchMode, "menuBarOnly");
  assertEquals(paired.preferences.reduceMotion, true);
  assertEquals(preferences?.launchMode, "menuBarOnly");
  assertEquals(preferences?.reduceMotion, true);
});

Deno.test("pair completion preserves regular animated changes made while Keychain is pending", async () => {
  const keychainWrite = deferred<void>();
  let preferences: DesktopPreferences | null = {
    serverUrl: "https://old.openfx.example",
    nodeId: "old-node",
    nodeName: "Old Mac",
    relayEnabled: true,
    pairedAt: 1,
    launchMode: "menuBarOnly",
    reduceMotion: true,
  };
  const store = {
    load: () => Promise.resolve(preferences),
    update(patch: Partial<DesktopPreferences>) {
      preferences = mergePreferences(preferences, patch);
      return Promise.resolve(preferences);
    },
  };
  const service = createPairingService({
    client: {
      pair: () =>
        Promise.resolve({
          node: { id: "node-new", name: "Studio Mac" },
          nodeSecret: "encoded-secret-new",
        }),
    },
    preferences: store,
    keychain: {
      write: () => keychainWrite.promise,
      read: () => Promise.resolve(null),
      remove: () => Promise.resolve(),
    },
  });

  const pairing = service.pair({
    serverUrl: "https://openfx.example",
    code: "01234567",
    name: "Studio Mac",
    publicIpv6: "240e::1",
  });
  await Promise.resolve();
  await store.update({
    launchMode: "regular",
    reduceMotion: false,
  });
  keychainWrite.resolve();

  const paired = await pairing;
  assertEquals(paired.preferences.launchMode, "regular");
  assertEquals(paired.preferences.reduceMotion, false);
  assertEquals(preferences?.launchMode, "regular");
  assertEquals(preferences?.reduceMotion, false);
});

Deno.test("preference commit failure keeps the latest UI choices and reports the commit error", async () => {
  const preferences: DesktopPreferences = {
    serverUrl: "https://old.openfx.example",
    nodeId: "old-node",
    nodeName: "Old Mac",
    relayEnabled: true,
    pairedAt: 1,
    launchMode: "menuBarOnly",
    reduceMotion: true,
  };
  const removedAccounts: string[] = [];
  const service = createPairingService({
    client: {
      pair: () =>
        Promise.resolve({
          node: { id: "node-new", name: "Studio Mac" },
          nodeSecret: "encoded-secret-new",
        }),
    },
    preferences: {
      load: () => Promise.resolve(preferences),
      update() {
        return Promise.reject(new Error("preferences_write_failed"));
      },
    },
    keychain: {
      write: () => Promise.resolve(),
      read: () => Promise.resolve(null),
      remove(account) {
        removedAccounts.push(account);
        return Promise.reject(new Error("keychain_cleanup_failed"));
      },
    },
  });

  await assertRejects(
    () =>
      service.pair({
        serverUrl: "https://openfx.example",
        code: "01234567",
        name: "Studio Mac",
        publicIpv6: "240e::1",
      }),
    Error,
    "preferences_write_failed",
  );
  assertEquals(removedAccounts, ["node-new"]);
  assertEquals(preferences?.launchMode, "menuBarOnly");
  assertEquals(preferences?.reduceMotion, true);
});

Deno.test("post-pair signed reports preserve the HTTPS-only control-plane boundary", async () => {
  let requests = 0;
  const client = createControlPlaneClient(() => {
    requests += 1;
    return Promise.resolve({ status: 202, body: { ok: true } });
  });

  await assertRejects(
    () =>
      client.heartbeat({
        serverUrl: "http://openfx.example",
        nodeId: "node-1",
        nodeSecret: "encoded-secret",
        publicIpv6: "240e::1",
        availability: "online",
      }),
    Error,
    "https_required",
  );
  assertEquals(requests, 0);
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mergePreferences(
  current: DesktopPreferences | null,
  patch: Partial<DesktopPreferences>,
): DesktopPreferences {
  return sanitizeDesktopPreferences({ ...(current ?? {}), ...patch });
}
