import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert";

import {
  InMemoryFileResourceReader,
  InMemoryKvStore,
  WorkspaceResources,
} from "../../src/mod.ts";

Deno.test("WorkspaceResources resolves file resources with digest and anchors", async () => {
  const store = new InMemoryKvStore();
  const resources = new WorkspaceResources({
    agentId: "agent-1",
    store,
    fileReader: new InMemoryFileResourceReader({
      "/workspace/app.ts": "const answer = 42;\nconsole.log(answer);\n",
    }),
  });

  const resolved = await resources.resolve("file:///workspace/app.ts", {
    anchorText: "answer",
  });

  assertEquals(resolved.uri, "file:///workspace/app.ts");
  assertEquals(resolved.mediaType, "text/typescript");
  assertEquals(resolved.summary, "const answer = 42;");
  assertEquals(resolved.anchors?.length, 2);
  assertEquals(resolved.anchors?.[0], {
    id: "anchor:1:7",
    line: 1,
    column: 7,
    length: 6,
    text: "answer",
  });
  assertEquals(resolved.digest.length, 64);
});

Deno.test("WorkspaceResources requires an injected file reader for file resources", async () => {
  const store = new InMemoryKvStore();
  const resources = new WorkspaceResources({ agentId: "agent-1", store });

  await assertRejects(
    () => resources.resolve("file:///workspace/app.ts"),
    Error,
    "No FileResourceReader",
  );
});

Deno.test("WorkspaceResources resolves memory entries by agent prefix", async () => {
  const store = new InMemoryKvStore();
  await store.set("agent:agent-1:memory:fact:9:m1", { content: "likes concise docs" });
  await store.set("agent:agent-2:memory:fact:9:m2", { content: "other agent" });

  const resources = new WorkspaceResources({ agentId: "agent-1", store });
  const resolved = await resources.resolve("memory://fact:", { anchorText: "concise" });

  assertEquals(resolved.metadata?.count, 1);
  assertEquals(resolved.mediaType, "application/x-ndjson");
  assertEquals(resolved.anchors?.length, 1);
  assertExists(resolved.content.match("likes concise docs"));
});

Deno.test("WorkspaceResources resolves session messages by session prefix", async () => {
  const store = new InMemoryKvStore();
  await store.set("agent:agent-1:session:s1:message:001:m1", { role: "user" });
  await store.set("agent:agent-1:session:s2:message:001:m2", { role: "assistant" });

  const resources = new WorkspaceResources({
    agentId: "agent-1",
    sessionId: "s1",
    store,
  });
  const resolved = await resources.resolve("session://");

  assertEquals(resolved.metadata?.prefix, "agent:agent-1:session:s1:message:");
  assertEquals(resolved.metadata?.count, 1);
  assertExists(resolved.content.match("user"));
});
