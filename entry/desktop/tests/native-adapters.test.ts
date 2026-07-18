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

Deno.test("Keychain sends the secret through stdin and never exposes it in argv", async () => {
  const calls: Array<{
    file: string;
    args: readonly string[];
    input?: string;
  }> = [];
  const keychain = createKeychain((file, args, input) => {
    calls.push({ file, args: [...args], input });
    return Promise.resolve(
      args[0] === "find-generic-password" ? "secret-value\n" : "",
    );
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
      ],
      input: "secret-value\n",
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
      input: undefined,
    },
    {
      file: "/usr/bin/security",
      args: ["delete-generic-password", "-s", "OpenFX Node", "-a", "node-1"],
      input: undefined,
    },
  ]);
  assertEquals(calls.some((call) => call.args.includes("secret-value")), false);
});

Deno.test("Keychain supports an isolated service for integration recovery", async () => {
  const calls: Array<readonly string[]> = [];
  const keychain = createKeychain((_file, args) => {
    calls.push([...args]);
    return Promise.resolve("");
  }, "OpenFX Node Integration test-run");

  await keychain.write("node-test", "secret-value");
  await keychain.remove("node-test");

  assertEquals(calls.map((args) => args.slice(0, 6)), [
    [
      "add-generic-password",
      "-U",
      "-s",
      "OpenFX Node Integration test-run",
      "-a",
      "node-test",
    ],
    [
      "delete-generic-password",
      "-s",
      "OpenFX Node Integration test-run",
      "-a",
      "node-test",
    ],
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

Deno.test("OMLX SSE chunks emit deltas as produced and reconstruct tool calls", async () => {
  const deltas: string[] = [];
  const requests: unknown[] = [];
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (request, onChunk) => {
      requests.push(request);
      onChunk('data: {"choices":[{"delta":{"content":"Hel"}}]}\n');
      onChunk(
        'data: {"choices":[{"delta":{"content":"lo","tool_calls":[{"index":0,"id":"call-1","function":{"name":"app.","arguments":"{\\"application\\":\\""}}]}}]}\n',
      );
      onChunk(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"open","arguments":"Safari\\"}"}}]}}]}\n\ndata: [DONE]\n',
      );
      return Promise.resolve({ status: 200 });
    },
  );

  assertEquals(
    await client.chat("hello", (delta) => {
      deltas.push(delta);
    }),
    {
      content: "Hello",
      toolCalls: [{
        id: "call-1",
        name: "app.open",
        arguments: { application: "Safari" },
      }],
    },
  );
  assertEquals(deltas, ["Hel", "lo"]);
  assertEquals(requests, [{
    protocol: "http:",
    hostname: "127.0.0.1",
    port: 8000,
    path: "/v1/chat/completions",
    method: "POST",
    body: {
      model: "local",
      messages: [{ role: "user", content: "hello" }],
      tools: client.tools,
      stream: true,
    },
  }]);
});
