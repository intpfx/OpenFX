import type { LibraryPhotoMetadata } from "./model.ts";
import { extractMotionPhotoVideo } from "./motion-photo.ts";
import { parseJpegPhotoMetadata } from "./photo-metadata.ts";

export type PhotoAnalysisResult = {
  metadata: LibraryPhotoMetadata;
  motion?: Blob;
};

export type PhotoAnalysisWorkerResponse =
  | { ok: true; result: PhotoAnalysisResult }
  | { ok: false; error: string };

export async function analyzePhotoFile(source: File): Promise<PhotoAnalysisResult> {
  const extension = source.name.split(".").pop()?.toLowerCase();
  const isJpeg = source.type === "image/jpeg" || extension === "jpg" ||
    extension === "jpeg";
  const metadata = isJpeg
    ? parseJpegPhotoMetadata(
      new Uint8Array(await source.slice(0, 2 * 1024 * 1024).arrayBuffer()),
    )
    : {};
  const motion = isJpeg ? await extractMotionPhotoVideo(source) : null;
  return { metadata, motion: motion ?? undefined };
}

export function analyzePhotoInWorker(
  source: File,
  signal?: AbortSignal,
): Promise<PhotoAnalysisResult> {
  if (typeof Worker === "undefined") return analyzePhotoFile(source);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./photo-analysis.worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("照片分析已取消", "AbortError"));
    };
    worker.onmessage = (event: MessageEvent<PhotoAnalysisWorkerResponse>) => {
      finish();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "照片分析 Worker 失败"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else worker.postMessage(source);
  });
}
