import { assertEquals } from "@std/assert";

import { createControlPlaneClient } from "../src/native/control-plane-client.ts";
import { createPairingService } from "../src/native/pairing-service.ts";
import type { DesktopPreferences } from "../src/core/types.ts";

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
      headers: { authorization: "Bearer encoded-secret" },
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
      save(value) {
        preferences = value;
        return Promise.resolve();
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
  });
  assertEquals(JSON.stringify(preferences).includes("secret"), false);
  assertEquals(await service.restore(), {
    preferences: {
      serverUrl: "https://openfx.example",
      nodeId: "node-1",
      nodeName: "Studio Mac",
      relayEnabled: true,
      pairedAt: 123,
    },
    nodeSecret: "encoded-secret",
  });
});
