import { expect } from "@std/expect";

import {
  createPrivateMeshTransferSession,
  PRIVATE_MESH_MAX_REMOTE_THUMBNAIL_BYTES,
  PRIVATE_MESH_PRESERVE_ABORT_REASON,
  type PrivateMeshCatalogEntry,
} from "../src/file-library/private-mesh-transfer.ts";

class PairedDataChannel extends EventTarget {
  readyState: RTCDataChannelState = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  peer?: PairedDataChannel;
  transform?: (data: string) => string;

  send(data: string): void {
    const transformed = this.transform?.(data) ?? data;
    queueMicrotask(() => {
      this.peer?.dispatchEvent(
        new MessageEvent("message", { data: transformed }),
      );
    });
  }

  close(): void {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  }
}

function pairedChannels(): [RTCDataChannel, RTCDataChannel] {
  const left = new PairedDataChannel();
  const right = new PairedDataChannel();
  left.peer = right;
  right.peer = left;
  return [left as unknown as RTCDataChannel, right as unknown as RTCDataChannel];
}

Deno.test("private mesh transfer lists metadata then fetches a small file on demand", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const catalog: PrivateMeshCatalogEntry[] = [{
    itemId: "photo-1",
    name: "photo.jpg",
    kind: "image",
    type: "image/jpeg",
    size: 18,
    updatedAt: "2026-08-15T00:00:00.000Z",
  }];
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve(catalog),
    readFile: (itemId) => {
      if (itemId !== "photo-1") throw new Error("missing file");
      return Promise.resolve(
        new File(["small remote photo"], "photo.jpg", { type: "image/jpeg" }),
      );
    },
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });

  await expect(requester.requestCatalog()).resolves.toEqual(catalog);
  const file = await requester.requestFile("photo-1");
  expect(file.name).toBe("photo.jpg");
  expect(file.type).toBe("image/jpeg");
  await expect(file.text()).resolves.toBe("small remote photo");

  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer rejects same-size file corruption", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const providerDataChannel = providerChannel as unknown as PairedDataChannel;
  providerDataChannel.transform = (data) => {
    const message = JSON.parse(data);
    if (message.type !== "file-chunk") return data;
    const bytes = Uint8Array.from(atob(message.bytes), (value) => value.charCodeAt(0));
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    message.bytes = btoa(String.fromCharCode(...bytes));
    return JSON.stringify(message);
  };
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () =>
      Promise.resolve(
        new File(["same-size-content"], "photo.jpg", { type: "image/jpeg" }),
      ),
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });

  await expect(requester.requestFile("photo-1")).rejects.toThrow(
    "完整性校验失败",
  );

  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer cancellation stops the remote sender", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const controller = new AbortController();
  const outboundTypes: string[] = [];
  const providerDataChannel = providerChannel as unknown as PairedDataChannel;
  providerDataChannel.transform = (data) => {
    const message = JSON.parse(data);
    outboundTypes.push(message.type);
    if (message.type === "file-chunk") controller.abort();
    return data;
  };
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () =>
      Promise.resolve(
        new File([new Uint8Array(48 * 1024)], "archive.zip", {
          type: "application/zip",
        }),
      ),
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });

  await expect(
    requester.requestFile("archive", { signal: controller.signal }),
  ).rejects.toThrow("已取消读取远程文件");
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(outboundTypes).toContain("file-chunk");
  expect(outboundTypes.filter((type) => type === "file-chunk").length).toBeLessThan(
    4,
  );
  expect(outboundTypes).not.toContain("file-end");

  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer preserves its sink for a resumable session stop", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const controller = new AbortController();
  (providerChannel as unknown as PairedDataChannel).transform = (data) => {
    const message = JSON.parse(data);
    if (message.type === "file-chunk") {
      controller.abort(PRIVATE_MESH_PRESERVE_ABORT_REASON);
    }
    return data;
  };
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.resolve(new File(["resume later"], "resume.txt")),
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });
  let disposition: string | undefined;

  await expect(requester.requestFileToSink("resume", {
    start: () => Promise.resolve(),
    write: () => Promise.resolve(),
    commit: () => Promise.resolve(),
    abort: (_error, value) => {
      disposition = value;
      return Promise.resolve();
    },
  }, { signal: controller.signal })).rejects.toThrow("已取消读取远程文件");

  expect(disposition).toBe("preserve");
  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer applies sink backpressure one chunk at a time", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const outboundChunkIndexes: number[] = [];
  const providerDataChannel = providerChannel as unknown as PairedDataChannel;
  providerDataChannel.transform = (data) => {
    const message = JSON.parse(data);
    if (message.type === "file-chunk") outboundChunkIndexes.push(message.index);
    return data;
  };
  const sourceBytes = new Uint8Array(30 * 1024);
  sourceBytes.fill(0x5a);
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () =>
      Promise.resolve(
        new File([sourceBytes], "stream.bin", {
          type: "application/octet-stream",
        }),
      ),
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });
  let releaseFirstWrite: (() => void) | undefined;
  let markFirstWrite: (() => void) | undefined;
  const firstWrite = new Promise<void>((resolve) => {
    markFirstWrite = resolve;
  });
  const received: Uint8Array[] = [];
  let committed = false;

  const transfer = requester.requestFileToSink("stream", {
    start: (metadata) => {
      expect(metadata).toMatchObject({ name: "stream.bin", size: sourceBytes.length });
      return Promise.resolve();
    },
    write: async (chunk) => {
      received.push(chunk.slice());
      if (received.length === 1) {
        markFirstWrite?.();
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
      }
    },
    commit: () => {
      committed = true;
      return Promise.resolve();
    },
    abort: () => Promise.resolve(),
  });

  await firstWrite;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(outboundChunkIndexes).toEqual([0]);
  releaseFirstWrite?.();
  await expect(transfer).resolves.toMatchObject({ name: "stream.bin" });
  expect(outboundChunkIndexes).toEqual([0, 1, 2]);
  expect(received.reduce((sum, chunk) => sum + chunk.length, 0)).toBe(
    sourceBytes.length,
  );
  expect(committed).toBe(true);

  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer tracks progress when the sink transfers chunk buffers", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const sourceBytes = new Uint8Array(30 * 1024);
  sourceBytes.fill(0x5a);
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () =>
      Promise.resolve(
        new File([sourceBytes], "worker.bin", {
          type: "application/octet-stream",
        }),
      ),
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });
  let receivedBytes = 0;
  let committed = false;

  await expect(requester.requestFileToSink("worker", {
    start: () => Promise.resolve(),
    write: (chunk) => {
      receivedBytes += chunk.byteLength;
      structuredClone(chunk, { transfer: [chunk.buffer] });
    },
    commit: () => {
      committed = true;
    },
    abort: () => undefined,
  })).resolves.toMatchObject({ name: "worker.bin", size: sourceBytes.length });

  expect(receivedBytes).toBe(sourceBytes.length);
  expect(committed).toBe(true);
  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer resumes a staged file on a new data channel", async () => {
  const sourceBytes = new Uint8Array(30 * 1024);
  for (let index = 0; index < sourceBytes.length; index += 1) {
    sourceBytes[index] = index % 251;
  }
  const received: Uint8Array[] = [];
  let checkpoint:
    | { offset: number; chunks: number; chainSha256: string }
    | undefined;
  let abortDisposition: string | undefined;
  const [firstRequesterChannel, firstProviderChannel] = pairedChannels();
  const firstProvider = createPrivateMeshTransferSession(firstProviderChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.resolve(new File([sourceBytes], "resume.bin")),
  });
  const firstRequester = createPrivateMeshTransferSession(firstRequesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });

  const interrupted = firstRequester.requestFileToSink("resume", {
    start: () => Promise.resolve(),
    write: (chunk, nextCheckpoint) => {
      received.push(chunk.slice());
      checkpoint = nextCheckpoint;
      firstRequester.dispose();
      return Promise.resolve();
    },
    commit: () => Promise.reject(new Error("must not commit")),
    abort: (_reason, disposition) => {
      abortDisposition = disposition;
      return Promise.resolve();
    },
  });
  await expect(interrupted).rejects.toThrow("设备传输会话已关闭");
  await new Promise((resolve) => setTimeout(resolve, 0));
  firstProvider.dispose();

  expect(checkpoint).toMatchObject({ offset: 12 * 1024, chunks: 1 });
  expect(abortDisposition).toBe("preserve");

  const [secondRequesterChannel, secondProviderChannel] = pairedChannels();
  const resumedChunkIndexes: number[] = [];
  (secondProviderChannel as unknown as PairedDataChannel).transform = (data) => {
    const message = JSON.parse(data);
    if (message.type === "file-chunk") resumedChunkIndexes.push(message.index);
    return data;
  };
  const secondProvider = createPrivateMeshTransferSession(secondProviderChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.resolve(new File([sourceBytes], "resume.bin")),
  });
  const secondRequester = createPrivateMeshTransferSession(secondRequesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });

  await secondRequester.requestFileToSink("resume", {
    start: () => Promise.resolve(checkpoint),
    write: (chunk, nextCheckpoint) => {
      received.push(chunk.slice());
      checkpoint = nextCheckpoint;
      return Promise.resolve();
    },
    commit: () => Promise.resolve(),
    abort: () => Promise.resolve(),
  });

  expect(resumedChunkIndexes).toEqual([1, 2]);
  expect(checkpoint).toMatchObject({ offset: sourceBytes.length, chunks: 3 });
  const combined = new Uint8Array(
    received.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of received) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  expect(combined).toEqual(sourceBytes);

  secondRequester.dispose();
  secondProvider.dispose();
});

Deno.test("private mesh transfer discards a checkpoint that no longer matches the source", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () =>
      Promise.resolve(new File([new Uint8Array(13 * 1024)], "changed.bin")),
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });
  let disposition: string | undefined;

  await expect(requester.requestFileToSink("changed", {
    start: () =>
      Promise.resolve({
        offset: 12 * 1024,
        chunks: 1,
        chainSha256: "f".repeat(64),
      }),
    write: () => Promise.reject(new Error("must not write")),
    commit: () => Promise.reject(new Error("must not commit")),
    abort: (_error, value) => {
      disposition = value;
      return Promise.resolve();
    },
  })).rejects.toThrow("续传检查点与远程原件不匹配");

  expect(disposition).toBe("discard");
  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer aborts its sink when a chunk is corrupted", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const providerDataChannel = providerChannel as unknown as PairedDataChannel;
  providerDataChannel.transform = (data) => {
    const message = JSON.parse(data);
    if (message.type !== "file-chunk") return data;
    const bytes = Uint8Array.from(atob(message.bytes), (value) => value.charCodeAt(0));
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    message.bytes = btoa(String.fromCharCode(...bytes));
    return JSON.stringify(message);
  };
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.resolve(new File(["verified"], "verified.txt")),
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });
  let commits = 0;
  let aborts = 0;

  await expect(requester.requestFileToSink("verified", {
    start: () => Promise.resolve(),
    write: () => Promise.resolve(),
    commit: () => {
      commits += 1;
      return Promise.resolve();
    },
    abort: () => {
      aborts += 1;
      return Promise.resolve();
    },
  })).rejects.toThrow("完整性校验失败");
  expect(commits).toBe(0);
  expect(aborts).toBe(1);

  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer preserves the last durable checkpoint after a sink write failure", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.resolve(new File(["retry"], "retry.txt")),
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });
  let disposition: string | undefined;

  await expect(requester.requestFileToSink("retry", {
    start: () => Promise.resolve(),
    write: () => Promise.reject(new Error("checkpoint write failed")),
    commit: () => Promise.resolve(),
    abort: (_error, value) => {
      disposition = value;
      return Promise.resolve();
    },
  })).rejects.toThrow("checkpoint write failed");

  expect(disposition).toBe("preserve");
  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer notifies a connected peer when its local catalog changes", async () => {
  const [leftChannel, rightChannel] = pairedChannels();
  let resolveInvalidation: (() => void) | undefined;
  const invalidated = new Promise<void>((resolve) => {
    resolveInvalidation = resolve;
  });
  const left = createPrivateMeshTransferSession(leftChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
    onCatalogChanged: () => resolveInvalidation?.(),
  });
  const right = createPrivateMeshTransferSession(rightChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });

  await right.notifyCatalogChanged();
  await invalidated;

  left.dispose();
  right.dispose();
});

Deno.test("private mesh transfer fetches a bounded derived thumbnail without reading the original", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  let originalReads = 0;
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => {
      originalReads += 1;
      return Promise.reject(new Error("original must not be read"));
    },
    readThumbnail: (itemId) => {
      if (itemId !== "photo-1") throw new Error("missing thumbnail");
      return Promise.resolve(
        new Blob(["derived-preview"], { type: "image/webp" }),
      );
    },
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });

  const thumbnail = await requester.requestThumbnail("photo-1");

  expect(thumbnail.type).toBe("image/webp");
  await expect(thumbnail.text()).resolves.toBe("derived-preview");
  expect(originalReads).toBe(0);

  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer rejects an oversized derived thumbnail", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
    readThumbnail: () =>
      Promise.resolve(
        new Blob(
          [new Uint8Array(PRIVATE_MESH_MAX_REMOTE_THUMBNAIL_BYTES + 1)],
          { type: "image/webp" },
        ),
      ),
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });

  await expect(requester.requestThumbnail("photo-1")).rejects.toThrow(
    "超过 128 KiB",
  );

  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer rejects invalid local file metadata", async () => {
  const [requesterChannel, providerChannel] = pairedChannels();
  const provider = createPrivateMeshTransferSession(providerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () =>
      Promise.resolve(
        new File(["invalid"], "x".repeat(256), { type: "text/plain" }),
      ),
  });
  const requester = createPrivateMeshTransferSession(requesterChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });

  await expect(requester.requestFile("bad-file")).rejects.toThrow(
    "本机文件元数据无效",
  );
  await expect(requester.requestFile("")).rejects.toThrow("远程文件 ID 无效");

  requester.dispose();
  provider.dispose();
});

Deno.test("private mesh transfer delivers and acknowledges an epoch update", async () => {
  const [ownerChannel, memberChannel] = pairedChannels();
  const received: string[] = [];
  const owner = createPrivateMeshTransferSession(ownerChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
  });
  const member = createPrivateMeshTransferSession(memberChannel, {
    listCatalog: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error("unused")),
    acceptEpochUpdate: (updateCode) => {
      received.push(updateCode);
      return Promise.resolve();
    },
  });

  await expect(owner.sendEpochUpdate("openfx-epoch-v1.signed"))
    .resolves.toBeUndefined();
  expect(received).toEqual(["openfx-epoch-v1.signed"]);

  owner.dispose();
  member.dispose();
});
