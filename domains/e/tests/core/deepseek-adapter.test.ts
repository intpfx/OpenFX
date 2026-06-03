import { assertEquals } from "jsr:@std/assert";

import {
  buildDeepSeekChatRequest,
  DeepSeekProvider,
  normalizeDeepSeekReasoningEffort,
  parseDeepSeekChatResponse,
  stitchDeepSeekAssistantMessage,
  toDeepSeekMessage,
} from "../../src/mod.ts";

Deno.test("buildDeepSeekChatRequest enables thinking mode and maps reasoning effort", () => {
  const request = buildDeepSeekChatRequest({
    role: "default",
    reasoningEffort: "xhigh",
    messages: [{ role: "user", content: "hello" }],
  }, {
    modelId: "deepseek-v4-pro",
  });

  assertEquals(request, {
    model: "deepseek-v4-pro",
    messages: [{ role: "user", content: "hello" }],
    reasoning_effort: "max",
    extra_body: { thinking: { type: "enabled" } },
  });
});

Deno.test("toDeepSeekMessage preserves reasoning content and tool calls for tool subturns", () => {
  const toolCalls = [{
    id: "call-1",
    type: "function" as const,
    function: { name: "get_weather", arguments: '{"city":"Hangzhou"}' },
  }];

  assertEquals(
    toDeepSeekMessage({
      role: "assistant",
      content: "",
      reasoningContent: "I need to call the weather tool.",
      toolCalls,
    }),
    {
      role: "assistant",
      content: "",
      reasoning_content: "I need to call the weather tool.",
      tool_calls: toolCalls,
    },
  );

  assertEquals(
    toDeepSeekMessage({
      role: "tool",
      content: "Cloudy",
      toolCallId: "call-1",
    }),
    {
      role: "tool",
      content: "Cloudy",
      tool_call_id: "call-1",
    },
  );
});

Deno.test("parseDeepSeekChatResponse normalizes reasoning_content and tool calls", () => {
  const response = parseDeepSeekChatResponse({
    choices: [{
      message: {
        content: "",
        reasoning_content: "Need tool",
        tool_calls: [{
          id: "call-1",
          type: "function",
          function: { name: "get_date", arguments: "{}" },
        }],
      },
    }],
  });

  assertEquals(response, {
    content: "",
    reasoning: "Need tool",
    rawReasoning: "Need tool",
    toolCalls: [{
      id: "call-1",
      type: "function",
      function: { name: "get_date", arguments: "{}" },
    }],
    messageStitching: "deepseek-tool-subturn-requires-reasoning-content",
  });
  assertEquals(stitchDeepSeekAssistantMessage(response), {
    role: "assistant",
    content: "",
    reasoningContent: "Need tool",
    toolCalls: response.toolCalls,
  });
});

Deno.test("DeepSeekProvider sends OpenAI-compatible thinking request and parses response", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const provider = new DeepSeekProvider({
    apiKey: "test-key",
    modelId: "deepseek-v4-pro",
    baseUrl: "https://example.test",
    fetcher: (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: '{"kind":"complete","result":"ok"}',
                reasoning_content: "Reasoned.",
              },
            }],
          }),
          { status: 200 },
        ),
      );
    },
  });

  const response = await provider.complete({
    role: "default",
    messages: [{ role: "user", content: "hello" }],
    reasoningEffort: "low",
  });

  assertEquals(capturedUrl, "https://example.test/chat/completions");
  assertEquals(
    (capturedInit?.headers as Record<string, string>).authorization,
    "Bearer test-key",
  );
  assertEquals(JSON.parse(String(capturedInit?.body)), {
    model: "deepseek-v4-pro",
    messages: [{ role: "user", content: "hello" }],
    reasoning_effort: "high",
    extra_body: { thinking: { type: "enabled" } },
  });
  assertEquals(response.reasoning, "Reasoned.");
  assertEquals(response.content, '{"kind":"complete","result":"ok"}');
});

Deno.test("normalizeDeepSeekReasoningEffort follows DeepSeek compatibility mapping", () => {
  assertEquals(normalizeDeepSeekReasoningEffort("low"), "high");
  assertEquals(normalizeDeepSeekReasoningEffort("medium"), "high");
  assertEquals(normalizeDeepSeekReasoningEffort("high"), "high");
  assertEquals(normalizeDeepSeekReasoningEffort("xhigh"), "max");
  assertEquals(normalizeDeepSeekReasoningEffort("max"), "max");
});
