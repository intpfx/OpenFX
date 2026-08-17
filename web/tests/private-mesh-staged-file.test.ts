import { expect } from "@std/expect";

import {
  assertPrivateMeshFileCapacity,
  createPrivateMeshStagedFileSink,
} from "../src/file-library/private-mesh-staged-file.ts";

const METADATA = {
  itemId: "remote-1",
  name: "archive.bin",
  mimeType: "application/octet-stream",
  lastModified: 1_723_683_600_000,
  size: 5,
} as const;

function checkpoint(offset: number, chunks: number, fill: string) {
  return {
    offset,
    chunks,
    chainSha256: fill.repeat(64),
  };
}

Deno.test("private mesh staged file commits only after the declared bytes arrive", async () => {
  const events: string[] = [];
  const sink = createPrivateMeshStagedFileSink({
    open: (metadata) => {
      events.push(`open:${metadata.name}:${metadata.size}`);
      return Promise.resolve({
        write: (chunk, offset) => {
          events.push(`write:${offset}:${chunk.length}`);
          return Promise.resolve();
        },
        commit: () => {
          events.push("commit");
          return Promise.resolve();
        },
        preserve: () => Promise.resolve(),
        discard: () => {
          events.push("discard");
          return Promise.resolve();
        },
      });
    },
  });

  await sink.start(METADATA);
  await sink.write(new Uint8Array([1, 2]), checkpoint(2, 1, "1"));
  await sink.write(new Uint8Array([3, 4, 5]), checkpoint(5, 2, "2"));
  await sink.commit();

  expect(events).toEqual([
    "open:archive.bin:5",
    "write:0:2",
    "write:2:3",
    "commit",
  ]);
});

Deno.test("private mesh staged file keeps byte offsets when the writer transfers chunks", async () => {
  const writes: number[] = [];
  let committed = false;
  const sink = createPrivateMeshStagedFileSink({
    open: () =>
      Promise.resolve({
        write: (chunk, offset) => {
          writes.push(offset);
          structuredClone(chunk, { transfer: [chunk.buffer] });
        },
        commit: () => {
          committed = true;
        },
        preserve: () => undefined,
        discard: () => undefined,
      }),
  });

  await sink.start(METADATA);
  await sink.write(new Uint8Array([1, 2]), checkpoint(2, 1, "1"));
  await sink.write(new Uint8Array([3, 4, 5]), checkpoint(5, 2, "2"));
  await sink.commit();

  expect(writes).toEqual([0, 2]);
  expect(committed).toBe(true);
});

Deno.test("private mesh staged file discards incomplete and cancelled imports", async () => {
  const events: string[] = [];
  const createSink = () =>
    createPrivateMeshStagedFileSink({
      open: () =>
        Promise.resolve({
          write: () => Promise.resolve(),
          commit: () => {
            events.push("commit");
            return Promise.resolve();
          },
          preserve: () => Promise.resolve(),
          discard: () => {
            events.push("discard");
            return Promise.resolve();
          },
        }),
    });

  const incomplete = createSink();
  await incomplete.start(METADATA);
  await incomplete.write(new Uint8Array([1, 2]), checkpoint(2, 1, "1"));
  await expect(incomplete.commit()).rejects.toThrow("暂存文件长度不完整");

  const cancelled = createSink();
  await cancelled.start(METADATA);
  await cancelled.write(new Uint8Array([1]), checkpoint(1, 1, "1"));
  await cancelled.abort(new Error("cancelled"), "discard");

  expect(events).toEqual(["discard", "discard"]);
});

Deno.test("private mesh staged file cleans up when cancellation races opening", async () => {
  const events: string[] = [];
  let releaseOpen: (() => void) | undefined;
  let markOpening: (() => void) | undefined;
  const opening = new Promise<void>((resolve) => {
    markOpening = resolve;
  });
  const sink = createPrivateMeshStagedFileSink({
    open: async () => {
      events.push("open");
      markOpening?.();
      await new Promise<void>((resolve) => {
        releaseOpen = resolve;
      });
      return {
        write: () => Promise.resolve(),
        commit: () => Promise.resolve(),
        preserve: () => Promise.resolve(),
        discard: () => {
          events.push("discard");
          return Promise.resolve();
        },
      };
    },
  });

  const start = sink.start(METADATA);
  await opening;
  const abort = sink.abort(new Error("cancelled while opening"), "discard");
  releaseOpen?.();
  await Promise.all([start, abort]);

  expect(events).toEqual(["open", "discard"]);
});

Deno.test("private mesh staged file preserves and restores a durable checkpoint", async () => {
  const events: string[] = [];
  let storedCheckpoint:
    | { offset: number; chunks: number; chainSha256: string }
    | undefined;
  const adapter = {
    open: () => {
      events.push(`open:${storedCheckpoint?.offset ?? 0}`);
      return Promise.resolve({
        checkpoint: storedCheckpoint,
        write: (
          chunk: Uint8Array<ArrayBuffer>,
          offset: number,
          checkpoint: { offset: number; chunks: number; chainSha256: string },
        ) => {
          events.push(`write:${offset}:${chunk.length}`);
          storedCheckpoint = checkpoint;
          return Promise.resolve();
        },
        commit: () => {
          events.push("commit");
          storedCheckpoint = undefined;
          return Promise.resolve();
        },
        preserve: () => {
          events.push("preserve");
          return Promise.resolve();
        },
        discard: () => {
          events.push("discard");
          storedCheckpoint = undefined;
          return Promise.resolve();
        },
      });
    },
  };
  const firstCheckpoint = {
    offset: 2,
    chunks: 1,
    chainSha256: "1".repeat(64),
  };
  const first = createPrivateMeshStagedFileSink(adapter);

  await first.start(METADATA);
  await first.write(new Uint8Array([1, 2]), firstCheckpoint);
  await first.abort(new Error("connection closed"), "preserve");

  const resumed = createPrivateMeshStagedFileSink(adapter);
  await expect(resumed.start(METADATA)).resolves.toEqual(firstCheckpoint);
  await resumed.write(new Uint8Array([3, 4, 5]), {
    offset: 5,
    chunks: 2,
    chainSha256: "2".repeat(64),
  });
  await resumed.commit();

  expect(events).toEqual([
    "open:0",
    "write:0:2",
    "preserve",
    "open:2",
    "write:2:3",
    "commit",
  ]);
  expect(storedCheckpoint).toBeUndefined();
});

Deno.test("private mesh staged file checks remaining OPFS capacity with headroom", () => {
  expect(() => assertPrivateMeshFileCapacity({ usage: 900, quota: 1_000 }, 101))
    .toThrow("OPFS 可用空间不足");
  expect(() =>
    assertPrivateMeshFileCapacity(
      { usage: 100, quota: 1024 * 1024 },
      100,
    )
  ).not.toThrow();
  expect(() =>
    assertPrivateMeshFileCapacity({ usage: undefined, quota: undefined }, 100)
  ).not.toThrow();
});

Deno.test("private mesh staged file discards an invalid restored checkpoint", async () => {
  let discarded = false;
  const sink = createPrivateMeshStagedFileSink({
    open: () =>
      Promise.resolve({
        checkpoint: checkpoint(6, 1, "1"),
        write: () => Promise.resolve(),
        commit: () => Promise.resolve(),
        preserve: () => Promise.resolve(),
        discard: () => {
          discarded = true;
          return Promise.resolve();
        },
      }),
  });

  await expect(sink.start(METADATA)).rejects.toThrow("暂存文件检查点无效");
  expect(discarded).toBe(true);
});
