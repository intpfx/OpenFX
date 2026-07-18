import { assertEquals, assertRejects } from "@std/assert";

import { createDesktopRouteDispatcher } from "../src/core/route-dispatcher.ts";

Deno.test("OMLX failure marks Agent offline while monitoring and manual routes keep working", async () => {
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({ cpuUsagePercent: 21 }),
    processes: () => Promise.resolve([{ pid: 1 }]),
    network: () => Promise.resolve({ publicIpv6: "240e::1" }),
    relay: () => Promise.resolve({ enabled: true }),
    chat: () => Promise.reject(new Error("connection refused")),
    agentDelta: () => Promise.resolve(),
    invokeTool: () => Promise.resolve({ ok: true }),
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({ ok: true }),
  });

  assertEquals(
    await dispatcher({
      method: "POST",
      path: "/v1/agent/messages",
      body: { message: "status" },
    }),
    {
      ok: false,
      error: "agent_offline",
      agent: { online: false, errorMessage: "connection refused" },
    },
  );
  assertEquals(
    await dispatcher({
      method: "GET",
      path: "/v1/system/overview",
      body: null,
    }),
    {
      ok: true,
      overview: { cpuUsagePercent: 21 },
      network: { publicIpv6: "240e::1" },
      relay: { enabled: true },
    },
  );
  assertEquals(
    await dispatcher({ method: "GET", path: "/v1/processes", body: null }),
    { ok: true, processes: [{ pid: 1 }] },
  );
});

Deno.test("relay updates become approval-required relay.update tool requests", async () => {
  const calls: Array<{ toolId: string; input: Record<string, unknown> }> = [];
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({ enabled: true }),
    chat: () => Promise.resolve({ content: "", toolCalls: [] }),
    agentDelta: () => Promise.resolve(),
    invokeTool(toolId, input) {
      calls.push({ toolId, input });
      return Promise.resolve({ ok: true, approvalRequired: true });
    },
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({ ok: true }),
  });

  assertEquals(
    await dispatcher({
      method: "POST",
      path: "/v1/relay",
      body: { enabled: false },
    }),
    { ok: true, approvalRequired: true },
  );
  assertEquals(calls, [{ toolId: "relay.update", input: { enabled: false } }]);
});

Deno.test("real chat deltas flow through the route callback with stable ordering", async () => {
  const events: unknown[] = [];
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({}),
    async chat(_message, onDelta) {
      await onDelta("A");
      await onDelta("B");
      return { content: "AB", toolCalls: [] };
    },
    agentDelta(input) {
      events.push(input);
      return Promise.resolve();
    },
    invokeTool: () => Promise.resolve({}),
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({}),
  }, { createId: () => "message-1" });

  assertEquals(
    await dispatcher({
      method: "POST",
      path: "/v1/agent/messages",
      body: { message: "hello" },
    }),
    {
      ok: true,
      message: "AB",
      toolResults: [],
      agent: { online: true, errorMessage: null },
    },
  );
  assertEquals(events, [
    { messageId: "message-1", delta: "A", sequence: 1 },
    { messageId: "message-1", delta: "B", sequence: 2 },
  ]);
});

Deno.test("client conversation id correlates every streamed Agent delta", async () => {
  const events: unknown[] = [];
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({}),
    async chat(_message, onDelta) {
      await onDelta("A");
      return { content: "A", toolCalls: [] };
    },
    agentDelta(input) {
      events.push(input);
      return Promise.resolve();
    },
    invokeTool: () => Promise.resolve({}),
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({}),
  }, { createId: () => "server-generated" });

  const result = await dispatcher({
    method: "POST",
    path: "/v1/agent/messages",
    body: { message: "hello", conversationId: "client-turn" },
  });

  assertEquals(result, {
    ok: true,
    message: "A",
    messageId: "client-turn",
    toolResults: [],
    agent: { online: true, errorMessage: null },
  });
  assertEquals(events, [
    { messageId: "client-turn", delta: "A", sequence: 1 },
  ]);
});

Deno.test("tool results return to OMLX before the user-visible final answer", async () => {
  const chatRounds: unknown[] = [];
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({}),
    async chat(_message, onDelta, rounds = []) {
      chatRounds.push(rounds);
      if (rounds.length === 0) {
        return {
          content: "",
          toolCalls: [{
            id: "call-processes",
            name: "process.list",
            arguments: {},
          }],
        };
      }
      await onDelta("当前有 1 个进程。");
      return { content: "当前有 1 个进程。", toolCalls: [] };
    },
    agentDelta: () => Promise.resolve(),
    invokeTool: () => Promise.resolve({ ok: true, processes: [{ pid: 42 }] }),
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({}),
  });

  const result = await dispatcher({
    method: "POST",
    path: "/v1/agent/messages",
    body: { message: "有几个进程？" },
  });

  assertEquals(chatRounds.length, 2);
  assertEquals(chatRounds[1], [{
    assistant: {
      content: "",
      toolCalls: [{
        id: "call-processes",
        name: "process.list",
        arguments: {},
      }],
    },
    toolResults: [{
      toolCallId: "call-processes",
      content: '{"ok":true,"processes":[{"pid":42}]}',
    }],
  }]);
  assertEquals((result as { message?: string }).message, "当前有 1 个进程。");
});

Deno.test("Agent history stays bounded by count and encoded bytes", async () => {
  let turn = 0;
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({}),
    chat: () =>
      Promise.resolve({
        content: `${++turn}:` + "x".repeat(60_000),
        toolCalls: [],
      }),
    agentDelta: () => Promise.resolve(),
    invokeTool: () => Promise.resolve({}),
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({}),
  });

  for (let index = 0; index < 12; index += 1) {
    await dispatcher({
      method: "POST",
      path: "/v1/agent/messages",
      body: { message: `turn-${index}` },
    });
  }
  const history = await dispatcher({
    method: "GET",
    path: "/v1/agent/messages",
    body: null,
  }) as { messages: Array<{ content: string }> };

  assertEquals(history.messages.length <= 30, true);
  assertEquals(
    new TextEncoder().encode(JSON.stringify(history)).byteLength <= 256 * 1024,
    true,
  );
  assertEquals(history.messages.some((message) => message.content === "turn-0"), false);
  assertEquals(history.messages.at(-1)?.content.startsWith("12:"), true);
});

Deno.test("tool results and client previews stay within UTF-8 byte budgets", async () => {
  let capturedToolContent = "";
  let call = 0;
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({}),
    chat: (_message, _onDelta, rounds = []) => {
      call += 1;
      if (call === 1) {
        return Promise.resolve({
          content: "",
          toolCalls: [{ id: "call-large", name: "process.list", arguments: {} }],
        });
      }
      capturedToolContent = rounds[0].toolResults[0].content;
      return Promise.resolve({ content: "已汇总。", toolCalls: [] });
    },
    agentDelta: () => Promise.resolve(),
    invokeTool: () => Promise.resolve({ output: "😀".repeat(100_000) }),
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({}),
  });

  const result = await dispatcher({
    method: "POST",
    path: "/v1/agent/messages",
    body: { message: "汇总" },
  }) as {
    toolResults: Array<{ content: string; truncated: boolean }>;
  };

  assertEquals(
    new TextEncoder().encode(capturedToolContent).byteLength <= 128 * 1024,
    true,
  );
  assertEquals(JSON.parse(capturedToolContent).truncated, true);
  assertEquals(
    new TextEncoder().encode(result.toolResults[0].content).byteLength <= 4 * 1024,
    true,
  );
  assertEquals(result.toolResults[0].truncated, true);
});

Deno.test("aborted Agent turns stop before tools and do not write history", async () => {
  const controller = new AbortController();
  let toolCalls = 0;
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({}),
    chat: (_message, _onDelta, _rounds, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(new Error("omlx_request_aborted")),
          { once: true },
        );
      }),
    agentDelta: () => Promise.resolve(),
    invokeTool: () => {
      toolCalls += 1;
      return Promise.resolve({});
    },
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({}),
  });
  const turn = dispatcher({
    method: "POST",
    path: "/v1/agent/messages",
    body: { message: "检查系统" },
  }, controller.signal);
  controller.abort();

  await assertRejects(() => turn, Error, "agent_turn_aborted");
  assertEquals(toolCalls, 0);
  assertEquals(
    await dispatcher({ method: "GET", path: "/v1/agent/messages", body: null }),
    {
      ok: true,
      messages: [],
      agent: { online: true, errorMessage: null },
    },
  );
});

Deno.test("abort settles a turn stuck inside a tool without writing history", async () => {
  const controller = new AbortController();
  let markToolStarted!: () => void;
  const toolStarted = new Promise<void>((resolve) => markToolStarted = resolve);
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({}),
    chat: () =>
      Promise.resolve({
        content: "",
        toolCalls: [{ id: "call-stuck", name: "process.list", arguments: {} }],
      }),
    agentDelta: () => Promise.resolve(),
    invokeTool: () => {
      markToolStarted();
      return new Promise(() => {});
    },
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({}),
  });
  const turn = dispatcher({
    method: "POST",
    path: "/v1/agent/messages",
    body: { message: "卡住的工具" },
  }, controller.signal);
  await toolStarted;
  controller.abort();

  await assertRejects(() => turn, Error, "agent_turn_aborted");
  assertEquals(
    await dispatcher({ method: "GET", path: "/v1/agent/messages", body: null }),
    {
      ok: true,
      messages: [],
      agent: { online: true, errorMessage: null },
    },
  );
});

Deno.test("one Agent deadline bounds a never-settling tool", async () => {
  const dispatcher = createDesktopRouteDispatcher({
    overview: () => Promise.resolve({}),
    processes: () => Promise.resolve([]),
    network: () => Promise.resolve({}),
    relay: () => Promise.resolve({}),
    chat: () =>
      Promise.resolve({
        content: "",
        toolCalls: [{ id: "call-stuck", name: "process.list", arguments: {} }],
      }),
    agentDelta: () => Promise.resolve(),
    invokeTool: () => new Promise(() => {}),
    listApprovals: () => Promise.resolve([]),
    resolveApproval: () => Promise.resolve({}),
  }, { agentTurnMs: 20 });

  const result = await dispatcher({
    method: "POST",
    path: "/v1/agent/messages",
    body: { message: "截止时间" },
  }) as { ok: boolean; error: string; agent: { errorMessage: string } };

  assertEquals(result.ok, false);
  assertEquals(result.error, "agent_offline");
  assertEquals(result.agent.errorMessage, "agent_turn_deadline");
});
