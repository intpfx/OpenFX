/// <reference lib="webworker" />

import { createInkSdf } from "./ink-sdf.ts";
import { cleanPhotoToMask, type PhotoPixels } from "./photo-cleanup.ts";
import type {
  PhotoCleanupWorkerRequest,
  PhotoCleanupWorkerResponse,
} from "./photo-cleanup-worker-protocol.ts";

let source: PhotoPixels | null = null;

function respond(
  message: PhotoCleanupWorkerResponse,
  transfer: Transferable[] = [],
): void {
  globalThis.postMessage(message, { transfer });
}

globalThis.addEventListener(
  "message",
  (event: MessageEvent<PhotoCleanupWorkerRequest>) => {
    const request = event.data;
    try {
      if (request.type === "init") {
        source = {
          width: request.width,
          height: request.height,
          pixels: new Uint8ClampedArray(request.pixels),
        };
        respond({ type: "ready", requestId: request.requestId });
        return;
      }
      if (!source) throw new Error("OpenInk 照片处理器尚未初始化");
      const mask = cleanPhotoToMask(
        source,
        request.quad,
        request.output,
        request.settings,
      );
      const sdf = createInkSdf(mask);
      const maskBuffer = mask.coverage.slice().buffer;
      const sdfBuffer = sdf.distance.slice().buffer;
      respond(
        {
          type: "result",
          requestId: request.requestId,
          width: mask.width,
          height: mask.height,
          mask: maskBuffer,
          sdf: sdfBuffer,
        },
        [maskBuffer, sdfBuffer],
      );
    } catch (error) {
      respond({
        type: "error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : "照片清理失败",
      });
    }
  },
);
