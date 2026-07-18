import { assertEquals } from "@std/assert";

import {
  createReplayProtector,
  createWebCryptoAdapter,
  openRelayEnvelope,
  sealRelayEnvelope,
} from "../../../domains/_shared/openfx-node/mod.ts";
import { createKeychain, KEYCHAIN_SERVICE } from "../src/native/keychain.ts";
import { createNodeCryptoAdapter } from "../src/native/node-crypto.ts";
import { createOmlxClient } from "../src/native/omlx-client.ts";

Deno.test("node:crypto adapter interoperates with the shared WebCrypto envelope", async () => {
  const nodeCrypto = createNodeCryptoAdapter();
  const webCrypto = createWebCryptoAdapter(globalThis.crypto);
  const secret = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
  const envelope = await sealRelayEnvelope(nodeCrypto, secret, { ok: true }, {
    now: () => 1_000_000,
  });

  assertEquals(
    await openRelayEnvelope(webCrypto, secret, envelope, {
      now: () => 1_000_000,
      replayProtector: createReplayProtector(),
    }),
    { ok: true },
  );
});

Deno.test("Keychain adapter uses /usr/bin/security argument arrays without a shell", async () => {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const keychain = createKeychain((file, args) => {
    calls.push({ file, args: [...args] });
    return args[0] === "find-generic-password" ? "secret-value\n" : "";
  });

  await keychain.write("node-1", "secret-value");
  assertEquals(await keychain.read("node-1"), "secret-value");
  await keychain.remove("node-1");

  assertEquals(KEYCHAIN_SERVICE, "OpenFX Node");
  assertEquals(calls, [
    {
      file: "/usr/bin/security",
      args: [
        "add-generic-password",
        "-U",
        "-s",
        "OpenFX Node",
        "-a",
        "node-1",
        "-w",
        "secret-value",
      ],
    },
    {
      file: "/usr/bin/security",
      args: [
        "find-generic-password",
        "-s",
        "OpenFX Node",
        "-a",
        "node-1",
        "-w",
      ],
    },
    {
      file: "/usr/bin/security",
      args: ["delete-generic-password", "-s", "OpenFX Node", "-a", "node-1"],
    },
  ]);
});

Deno.test("OMLX client is fixed to the loopback v1 chat endpoint and reports offline", async () => {
  const calls: unknown[] = [];
  const online = createOmlxClient((request) => {
    calls.push(request);
    return Promise.resolve({
      status: 200,
      body: {
        choices: [{ message: { content: "Local response", tool_calls: [] } }],
      },
    });
  });
  assertEquals((await online.chat("hello")).content, "Local response");
  assertEquals(calls, [{
    protocol: "http:",
    hostname: "127.0.0.1",
    port: 8000,
    path: "/v1/chat/completions",
    method: "POST",
    body: {
      model: "local",
      messages: [{ role: "user", content: "hello" }],
      tools: online.tools,
    },
  }]);

  const offline = createOmlxClient(() =>
    Promise.reject(new Error("connection refused"))
  );
  assertEquals(await offline.status(), {
    online: false,
    errorMessage: "connection refused",
  });
});
