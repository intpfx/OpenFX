import { assertEquals } from "@std/assert";

import { readStartupMessages } from "../tools/integration-startup.ts";

Deno.test("startup reader tolerates quiet intervals until the absolute deadline", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const messages: Record<string, unknown>[] = [];
  setTimeout(() => {
    controller.enqueue(
      new TextEncoder().encode('{"phase":"paired","nodeId":"node-1"}\n'),
    );
  }, 25);
  setTimeout(() => {
    controller.enqueue(
      new TextEncoder().encode('{"phase":"ready","ok":true}\n'),
    );
  }, 45);

  const ready = await readStartupMessages(stream, {
    timeoutMs: 150,
    quietIntervalMs: 5,
    onMessage: (message) => messages.push(message),
  });
  controller.close();

  assertEquals(messages.map((message) => message.phase), ["paired", "ready"]);
  assertEquals(ready?.ok, true);
});

Deno.test("startup reader cancels a silent stream only at its total deadline", async () => {
  let cancelled = false;
  const startedAt = Date.now();
  const ready = await readStartupMessages(
    new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    }),
    {
      timeoutMs: 35,
      quietIntervalMs: 5,
      onMessage() {},
    },
  );

  assertEquals(ready, null);
  assertEquals(cancelled, true);
  assertEquals(Date.now() - startedAt >= 25, true);
});
