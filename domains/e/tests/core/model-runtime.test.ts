import { assertEquals } from "jsr:@std/assert";

import {
  DeepSeekProvider,
  normalizeReasoningTrace,
  RoutedModelRuntime,
  StaticModelProvider,
} from "../../src/mod.ts";

Deno.test("RoutedModelRuntime records fallback and normalized reasoning trace", async () => {
  const runtime = new RoutedModelRuntime([
    {
      role: "default",
      providers: [
        new StaticModelProvider({
          provider: "primary",
          modelId: "primary-model",
          responses: [new Error("temporary failure")],
        }),
        new StaticModelProvider({
          provider: "backup",
          modelId: "backup-model",
          responses: [{
            content: '{"kind":"complete","result":"ok"}',
            reasoning: "short reasoning",
            messageStitching: "provider-native",
          }],
        }),
      ],
      tokenBudget: 8192,
      latencyBudgetMs: 3000,
    },
  ]);

  const response = await runtime.complete({
    role: "default",
    messages: [{ role: "user", content: "hello" }],
  });

  assertEquals(response.route.provider, "backup");
  assertEquals(response.route.modelId, "backup-model");
  assertEquals(response.route.fallbackOccurred, true);
  assertEquals(response.route.fallbackChain, ["primary-model", "backup-model"]);
  assertEquals(response.route.tokenBudget, 8192);
  assertEquals(response.route.latencyBudgetMs, 3000);
  assertEquals(response.route.reasoningTrace, {
    kind: "summary",
    content: "short reasoning",
  });
  assertEquals(response.route.messageStitching, "provider-native");
});

Deno.test("normalizeReasoningTrace handles raw provider traces", () => {
  assertEquals(
    normalizeReasoningTrace({ content: "ok", rawReasoning: { tokens: 3 } }),
    {
      kind: "provider_trace",
      content: '{"tokens":3}',
    },
  );
  assertEquals(normalizeReasoningTrace({ content: "ok" }), { kind: "none" });
});

Deno.test("RoutedModelRuntime can use DeepSeekProvider as a reference adapter", async () => {
  const runtime = new RoutedModelRuntime([
    {
      role: "slow",
      providers: [
        new DeepSeekProvider({
          apiKey: "test-key",
          baseUrl: "https://example.test",
          fetcher: () =>
            Promise.resolve(
              new Response(
                JSON.stringify({
                  choices: [{
                    message: {
                      content: '{"kind":"complete","result":"ok"}',
                      reasoning_content: "Deep reasoning.",
                    },
                  }],
                }),
                { status: 200 },
              ),
            ),
        }),
      ],
      tokenBudget: 16384,
      latencyBudgetMs: 10_000,
    },
  ]);

  const response = await runtime.complete({
    role: "slow",
    messages: [{ role: "user", content: "think deeply" }],
    reasoningEffort: "max",
  });

  assertEquals(response.route.provider, "deepseek");
  assertEquals(response.route.reasoningTrace, {
    kind: "summary",
    content: "Deep reasoning.",
  });
  assertEquals(response.route.messageStitching, "deepseek-standard");
});
