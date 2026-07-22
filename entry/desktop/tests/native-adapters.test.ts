import { assertEquals, assertRejects } from "@std/assert";

import {
  createReplayProtector,
  createWebCryptoAdapter,
  openRelayEnvelope,
  sealRelayEnvelope,
} from "../../../domains/_shared/openfx-node/mod.ts";
import { createKeychain, KEYCHAIN_SERVICE } from "../src/native/keychain.ts";
import { createNodeCryptoAdapter } from "../src/native/node-crypto.ts";
import { createOmlxClient } from "../src/native/omlx-client.ts";
import { httpsCaCertificatePath, requestTextStream } from "../src/native/http-json.ts";

Deno.test("loopback HTTPS discovers the local mkcert root without launch environment overrides", () => {
  assertEquals(
    httpsCaCertificatePath("127.0.0.1", {}, "/Users/tester"),
    "/Users/tester/Library/Application Support/mkcert/rootCA.pem",
  );
  assertEquals(
    httpsCaCertificatePath("::1", { CAROOT: "/private/ca" }, "/Users/tester"),
    "/private/ca/rootCA.pem",
  );
});

Deno.test("public HTTPS never receives an implicit local mkcert root", () => {
  assertEquals(
    httpsCaCertificatePath("api6.ipify.org", {}, "/Users/tester"),
    undefined,
  );
  assertEquals(
    httpsCaCertificatePath("127.0.0.1.example", {}, "/Users/tester"),
    undefined,
  );
  assertEquals(
    httpsCaCertificatePath(
      "api6.ipify.org",
      { NODE_EXTRA_CA_CERTS: "/private/explicit.pem" },
      "/Users/tester",
    ),
    "/private/explicit.pem",
  );
});

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

Deno.test("Keychain invokes the fixed security binary without shell interpolation", async () => {
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
        "secret-value",
      ],
      input: undefined,
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

Deno.test("OMLX rejects malformed SSE JSON with a bounded Agent error", async () => {
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (_request, onChunk) => {
      onChunk("data: {not-json}\n");
      return Promise.resolve({ status: 200 });
    },
  );

  await assertRejects(
    () => client.chat("hello", () => {}),
    Error,
    "omlx_sse_invalid_json",
  );
});

Deno.test("OMLX converts a throwing delta callback into an Agent error", async () => {
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    async (_request, onChunk) => {
      await onChunk('data: {"choices":[{"delta":{"content":"hello"}}]}\n');
      return { status: 200 };
    },
  );

  await assertRejects(
    () =>
      client.chat("hello", () => {
        throw new Error("consumer exploded");
      }),
    Error,
    "omlx_delta_callback_failed",
  );
});

Deno.test("OMLX rejects oversized no-newline input before line accumulation grows", async () => {
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (_request, onChunk) => {
      onChunk(`data: ${"x".repeat(64 * 1024)}`);
      return Promise.resolve({ status: 200 });
    },
  );

  await assertRejects(
    () => client.chat("hello", () => {}),
    Error,
    "omlx_sse_line_too_large",
  );
});

Deno.test("OMLX bounds streamed content accumulation", async () => {
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (_request, onChunk) => {
      for (let index = 0; index < 5; index += 1) {
        onChunk(`data: ${
          JSON.stringify({
            choices: [{ delta: { content: "x".repeat(60 * 1024) } }],
          })
        }\n`);
      }
      return Promise.resolve({ status: 200 });
    },
  );

  await assertRejects(
    () => client.chat("hello", () => {}),
    Error,
    "omlx_content_too_large",
  );
});

Deno.test("OMLX bounds streamed tool argument accumulation", async () => {
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (_request, onChunk) => {
      for (let index = 0; index < 2; index += 1) {
        onChunk(`data: ${
          JSON.stringify({
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  function: {
                    name: index === 0 ? "system.overview" : "",
                    arguments: "x".repeat(40 * 1024),
                  },
                }],
              },
            }],
          })
        }\n`);
      }
      return Promise.resolve({ status: 200 });
    },
  );

  await assertRejects(
    () => client.chat("hello", () => {}),
    Error,
    "omlx_tool_arguments_too_large",
  );
});

Deno.test("OMLX bounds the number of streamed data frames", async () => {
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (_request, onChunk) => {
      const frame = 'data: {"choices":[{"delta":{}}]}\n';
      onChunk(frame.repeat(1_025));
      return Promise.resolve({ status: 200 });
    },
  );

  await assertRejects(
    () => client.chat("hello", () => {}),
    Error,
    "omlx_sse_too_many_frames",
  );
});

Deno.test("native text streaming catches a throwing chunk callback", async () => {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    () =>
      new Response('data: {"choices":[]}\n', {
        headers: { "content-type": "text/event-stream" },
      }),
  );
  const address = server.addr as Deno.NetAddr;

  try {
    await assertRejects(
      () =>
        requestTextStream({
          protocol: "http:",
          hostname: "127.0.0.1",
          port: address.port,
          path: "/v1/chat/completions",
          method: "POST",
          body: {},
        }, () => {
          throw new Error("consumer exploded");
        }),
      Error,
      "http_stream_consumer_failed",
    );
  } finally {
    await server.shutdown();
  }
});

Deno.test("rejecting Agent delta cancels an OMLX stream that never ends", async () => {
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let cancelled = false;
  const encoder = new TextEncoder();
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"hello"}}]}\n',
              ),
            );
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
  );
  const address = server.addr as Deno.NetAddr;
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (request, onChunk) =>
      requestTextStream({ ...request, port: address.port }, onChunk),
  );
  const chat = client.chat(
    "hello",
    () => Promise.reject(new Error("delta sink unavailable")),
  ).then(
    () => "unexpected_success",
    (error) => error instanceof Error ? error.message : String(error),
  );

  try {
    assertEquals(await settleWithin(chat, 250), "omlx_delta_callback_failed");
    assertEquals(await waitFor(() => cancelled, 100), true);
  } finally {
    closeStream(streamController);
    await chat;
    await server.shutdown();
  }
});

Deno.test("native text streaming has an absolute deadline despite trickle traffic", async () => {
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;
  const encoder = new TextEncoder();
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            controller.enqueue(encoder.encode(": keepalive\n"));
            interval = setInterval(() => {
              controller.enqueue(encoder.encode(": keepalive\n"));
            }, 5);
          },
          cancel() {
            cancelled = true;
            clearInterval(interval);
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
  );
  const address = server.addr as Deno.NetAddr;
  const request = requestTextStream(
    {
      protocol: "http:",
      hostname: "127.0.0.1",
      port: address.port,
      path: "/v1/chat/completions",
      method: "POST",
      body: {},
    },
    () => {},
    { absoluteDeadlineMs: 40 },
  ).then(
    () => "unexpected_success",
    (error) => error instanceof Error ? error.message : String(error),
  );

  try {
    assertEquals(await settleWithin(request, 250), "http_stream_deadline");
    assertEquals(await waitFor(() => cancelled, 100), true);
  } finally {
    clearInterval(interval);
    closeStream(streamController);
    await request;
    await server.shutdown();
  }
});

Deno.test("Relay abort cancels the native OMLX request", async () => {
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let cancelled = false;
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            controller.enqueue(new TextEncoder().encode(": keepalive\n"));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
  );
  const address = server.addr as Deno.NetAddr;
  const controller = new AbortController();
  const request = requestTextStream(
    {
      protocol: "http:",
      hostname: "127.0.0.1",
      port: address.port,
      path: "/v1/chat/completions",
      method: "POST",
      body: {},
    },
    () => {},
    { signal: controller.signal },
  ).then(
    () => "unexpected_success",
    (error) => error instanceof Error ? error.message : String(error),
  );

  try {
    assertEquals(await waitFor(() => streamController !== null, 100), true);
    controller.abort();
    assertEquals(await settleWithin(request, 250), "http_stream_aborted");
    assertEquals(await waitFor(() => cancelled, 100), true);
  } finally {
    closeStream(streamController);
    await request;
    await server.shutdown();
  }
});

Deno.test("OMLX bounds blank and comment line parsing work", async () => {
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (_request, onChunk) => {
      onChunk("\n".repeat(1_000_000));
      return Promise.resolve({ status: 200 });
    },
  );

  await assertRejects(
    () => client.chat("hello", () => {}),
    Error,
    "omlx_sse_too_many_lines",
  );
});

Deno.test("OMLX observes rejecting deltas when a later line in the same chunk fails", async () => {
  const cases = [
    {
      suffix: "data: {not-json}\n",
      error: "omlx_sse_invalid_json",
    },
    {
      suffix: `data: ${"x".repeat(64 * 1024)}\n`,
      error: "omlx_sse_line_too_large",
    },
  ];

  for (const testCase of cases) {
    const client = createOmlxClient(
      () => Promise.reject(new Error("unexpected JSON request")),
      (_request, onChunk) => {
        onChunk(
          'data: {"choices":[{"delta":{"content":"hello"}}]}\n' +
            testCase.suffix,
        );
        return Promise.resolve({ status: 200 });
      },
    );

    await assertRejects(
      () =>
        client.chat("hello", () => Promise.reject(new Error("delta sink unavailable"))),
      Error,
      testCase.error,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

Deno.test("OMLX deadline covers a never-settling delta after the stream completes", async () => {
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (_request, onChunk) => {
      onChunk('data: {"choices":[{"delta":{"content":"hello"}}]}\n');
      return Promise.resolve({ status: 200 });
    },
    { streamDeadlineMs: 40 },
  );
  const chat = client.chat("hello", () => new Promise<void>(() => {})).then(
    () => "unexpected_success",
    (error) => error instanceof Error ? error.message : String(error),
  );

  assertEquals(await settleWithin(chat, 250), "omlx_stream_deadline");
});

Deno.test("OMLX queued deltas share one total deadline", async () => {
  const invoked: string[] = [];
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (_request, onChunk) => {
      onChunk(
        'data: {"choices":[{"delta":{"content":"A"}}]}\n' +
          'data: {"choices":[{"delta":{"content":"B"}}]}\n' +
          'data: {"choices":[{"delta":{"content":"C"}}]}\n',
      );
      return Promise.resolve({ status: 200 });
    },
    { streamDeadlineMs: 50 },
  );
  const chat = client.chat("hello", async (delta) => {
    invoked.push(delta);
    await new Promise((resolve) => setTimeout(resolve, 35));
  }).then(
    () => "unexpected_success",
    (error) => error instanceof Error ? error.message : String(error),
  );

  assertEquals(await settleWithin(chat, 250), "omlx_stream_deadline");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assertEquals(invoked, ["A", "B"]);
});

Deno.test("OMLX follow-up serializes assistant tool calls and bounded tool results", async () => {
  const requests: unknown[] = [];
  const client = createOmlxClient((request) => {
    requests.push(request);
    return Promise.resolve({
      status: 200,
      body: { choices: [{ message: { content: "最终回答", tool_calls: [] } }] },
    });
  });

  const result = await client.chat("检查进程", undefined, [{
    assistant: {
      content: "",
      toolCalls: [{ id: "call-1", name: "process.list", arguments: {} }],
    },
    toolResults: [{
      toolCallId: "call-1",
      content: '{"ok":true,"processes":[{"pid":42}]}',
    }],
  }]);

  assertEquals(result.content, "最终回答");
  assertEquals(requests, [{
    protocol: "http:",
    hostname: "127.0.0.1",
    port: 8000,
    path: "/v1/chat/completions",
    method: "POST",
    body: {
      model: "local",
      messages: [
        { role: "user", content: "检查进程" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: { name: "process.list", arguments: "{}" },
          }],
        },
        {
          role: "tool",
          tool_call_id: "call-1",
          content: '{"ok":true,"processes":[{"pid":42}]}',
        },
      ],
      tools: client.tools,
    },
  }]);
});

Deno.test("OMLX follow-up calls share one caller-owned absolute deadline", async () => {
  const deadlines: Array<number | undefined> = [];
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (_request, onChunk, options) => {
      deadlines.push(options?.deadlineAt);
      onChunk('data: {"choices":[{"delta":{"content":"ok"}}]}\n');
      return Promise.resolve({ status: 200 });
    },
  );
  const deadlineAt = Date.now() + 1_000;

  await client.chat("one", () => {}, [], { deadlineAt });
  await client.chat("two", () => {}, [], { deadlineAt });

  assertEquals(deadlines, [deadlineAt, deadlineAt]);
});

Deno.test("OMLX aborts while draining a delta after the HTTP stream ended", async () => {
  const controller = new AbortController();
  let deltaStarted!: () => void;
  const started = new Promise<void>((resolve) => deltaStarted = resolve);
  const client = createOmlxClient(
    () => Promise.reject(new Error("unexpected JSON request")),
    (_request, onChunk) => {
      onChunk('data: {"choices":[{"delta":{"content":"pending"}}]}\n');
      return Promise.resolve({ status: 200 });
    },
  );
  const chat = client.chat(
    "hello",
    () => {
      deltaStarted();
      return new Promise(() => {});
    },
    [],
    { deadlineAt: Date.now() + 1_000, signal: controller.signal },
  ).then(
    () => "unexpected_success",
    (error) => error instanceof Error ? error.message : String(error),
  );
  await started;
  controller.abort();

  assertEquals(await settleWithin(chat, 100), "omlx_request_aborted");
});

const settleWithin = async (
  promise: Promise<string>,
  timeoutMs: number,
): Promise<string> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve("test_timeout"), timeoutMs);
  });
  const result = await Promise.race([promise, timeout]);
  clearTimeout(timer);
  return result;
};

const waitFor = async (
  predicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return predicate();
};

const closeStream = (
  controller: ReadableStreamDefaultController<Uint8Array> | null,
): void => {
  try {
    controller?.close();
  } catch {
    // The client already cancelled the stream.
  }
};
