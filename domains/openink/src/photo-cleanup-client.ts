import type { InkSdf } from "./ink-sdf.ts";
import type {
  InkMask,
  PhotoCleanupSettings,
  PhotoPixels,
  PhotoQuad,
} from "./photo-cleanup.ts";
import type {
  PhotoCleanupWorkerRequest,
  PhotoCleanupWorkerResponse,
} from "./photo-cleanup-worker-protocol.ts";

export type PhotoCleanupResult = Readonly<{ mask: InkMask; sdf: InkSdf }>;

export type PhotoCleanupProcessor = Readonly<{
  process(
    quad: PhotoQuad,
    output: Readonly<{ width: number; height: number }>,
    settings: PhotoCleanupSettings,
  ): Promise<PhotoCleanupResult>;
  dispose(): void;
}>;

type PendingRequest = Readonly<{
  resolve(value: PhotoCleanupWorkerResponse): void;
  reject(error: unknown): void;
}>;

export async function createPhotoCleanupProcessor(
  image: PhotoPixels,
): Promise<PhotoCleanupProcessor> {
  const worker = new Worker(new URL("./photo-cleanup.worker.ts", import.meta.url), {
    type: "module",
  });
  const pending = new Map<number, PendingRequest>();
  let requestId = 0;
  let disposed = false;

  worker.addEventListener(
    "message",
    (event: MessageEvent<PhotoCleanupWorkerResponse>) => {
      const request = pending.get(event.data.requestId);
      if (!request) return;
      pending.delete(event.data.requestId);
      if (event.data.type === "error") request.reject(new Error(event.data.message));
      else request.resolve(event.data);
    },
  );
  worker.addEventListener("error", (event) => {
    for (const request of pending.values()) {
      request.reject(new Error(event.message || "照片处理器已停止"));
    }
    pending.clear();
  });

  function send(
    request: PhotoCleanupWorkerRequest,
    transfer: Transferable[] = [],
  ): Promise<PhotoCleanupWorkerResponse> {
    if (disposed) return Promise.reject(new Error("照片处理器已关闭"));
    return new Promise((resolve, reject) => {
      pending.set(request.requestId, { resolve, reject });
      worker.postMessage(request, transfer);
    });
  }

  const pixels = image.pixels.slice().buffer;
  const readyId = ++requestId;
  await send(
    {
      type: "init",
      requestId: readyId,
      width: image.width,
      height: image.height,
      pixels,
    },
    [pixels],
  );

  return {
    async process(quad, output, settings) {
      const response = await send({
        type: "process",
        requestId: ++requestId,
        quad,
        output,
        settings,
      });
      if (response.type !== "result") throw new Error("照片清理没有返回结果");
      return {
        mask: {
          width: response.width,
          height: response.height,
          coverage: new Uint8Array(response.mask),
        },
        sdf: {
          width: response.width,
          height: response.height,
          distance: new Float32Array(response.sdf),
        },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      for (const request of pending.values()) {
        request.reject(new Error("照片处理器已关闭"));
      }
      pending.clear();
    },
  };
}
