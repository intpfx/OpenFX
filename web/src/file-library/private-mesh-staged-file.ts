import type {
  PrivateMeshFileCheckpoint,
  PrivateMeshFileMetadata,
  PrivateMeshFileSink,
} from "./private-mesh-transfer.ts";

const PRIVATE_MESH_STORAGE_HEADROOM_BYTES = 256 * 1024;

export function assertPrivateMeshFileCapacity(
  estimate: Readonly<{ usage?: number; quota?: number }>,
  remainingBytes: number,
): void {
  const { usage, quota } = estimate;
  if (
    !Number.isFinite(usage) || !Number.isFinite(quota) ||
    (usage as number) < 0 || (quota as number) <= 0
  ) return;
  const required = Math.max(0, remainingBytes) +
    PRIVATE_MESH_STORAGE_HEADROOM_BYTES;
  if ((quota as number) - (usage as number) < required) {
    throw new Error("OPFS 可用空间不足，无法继续接收远程文件");
  }
}

export type PrivateMeshStagedFileWriter = Readonly<{
  checkpoint?: PrivateMeshFileCheckpoint;
  write: (
    chunk: Uint8Array<ArrayBuffer>,
    offset: number,
    checkpoint: PrivateMeshFileCheckpoint,
  ) => void | Promise<void>;
  commit: () => void | Promise<void>;
  preserve: () => void | Promise<void>;
  discard: () => void | Promise<void>;
}>;

export type PrivateMeshStagedFileAdapter = Readonly<{
  open: (
    metadata: PrivateMeshFileMetadata,
  ) => PrivateMeshStagedFileWriter | Promise<PrivateMeshStagedFileWriter>;
}>;

type StagedFileState =
  | "idle"
  | "writing"
  | "committing"
  | "committed"
  | "preserved"
  | "discarded";

export function createPrivateMeshStagedFileSink(
  adapter: PrivateMeshStagedFileAdapter,
): PrivateMeshFileSink {
  let state: StagedFileState = "idle";
  let metadata: PrivateMeshFileMetadata | undefined;
  let writer: PrivateMeshStagedFileWriter | undefined;
  let received = 0;
  let operationQueue: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = operationQueue.then(operation);
    operationQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  async function discard(): Promise<void> {
    if (state === "committed" || state === "discarded") return;
    state = "discarded";
    const activeWriter = writer;
    writer = undefined;
    if (activeWriter) await activeWriter.discard();
  }

  async function preserve(): Promise<void> {
    if (
      state === "committed" || state === "discarded" || state === "preserved"
    ) return;
    state = "preserved";
    const activeWriter = writer;
    writer = undefined;
    if (activeWriter) await activeWriter.preserve();
  }

  return {
    start(value) {
      return enqueue(async () => {
        if (state !== "idle") throw new Error("暂存文件状态无效");
        if (!value.name.trim() || value.size < 0) {
          throw new Error("暂存文件元数据无效");
        }
        metadata = value;
        try {
          writer = await adapter.open(value);
          const checkpoint = writer.checkpoint;
          if (checkpoint) {
            if (
              !Number.isSafeInteger(checkpoint.offset) || checkpoint.offset < 0 ||
              checkpoint.offset > value.size ||
              !Number.isSafeInteger(checkpoint.chunks) || checkpoint.chunks < 0 ||
              !/^[0-9a-f]{64}$/u.test(checkpoint.chainSha256)
            ) throw new Error("暂存文件检查点无效");
            received = checkpoint.offset;
          }
          state = "writing";
          return checkpoint;
        } catch (error) {
          state = "discarded";
          const failedWriter = writer;
          writer = undefined;
          if (failedWriter) {
            try {
              await failedWriter.discard();
            } catch {
              // The invalid checkpoint remains the useful error for the caller.
            }
          }
          throw error;
        }
      });
    },
    write(chunk, checkpoint) {
      return enqueue(async () => {
        if (state !== "writing" || !metadata || !writer) {
          throw new Error("暂存文件尚未开始写入");
        }
        const chunkBytes = chunk.byteLength;
        if (received + chunkBytes > metadata.size) {
          throw new Error("暂存文件超过声明长度");
        }
        if (checkpoint.offset !== received + chunkBytes) {
          throw new Error("暂存文件检查点偏移无效");
        }
        await writer.write(chunk, received, checkpoint);
        received += chunkBytes;
      });
    },
    commit() {
      return enqueue(async () => {
        if (state !== "writing" || !metadata || !writer) {
          throw new Error("暂存文件状态无效");
        }
        if (received !== metadata.size) {
          await discard();
          throw new Error("暂存文件长度不完整");
        }
        state = "committing";
        try {
          await writer.commit();
          state = "committed";
          writer = undefined;
        } catch (error) {
          await preserve();
          throw error;
        }
      });
    },
    abort(_reason, disposition) {
      return enqueue(disposition === "preserve" ? preserve : discard);
    },
  };
}
