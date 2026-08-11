import { FILE_FINGERPRINT_VERSION, type FileFingerprint } from "./similarity-core.ts";

export type VideoFingerprintInput = {
  durationSec: number;
  timestampsSec: number[];
  frames: Blob[];
};

export type FileFingerprintInput = {
  source: Blob;
  motion?: Blob;
  still?: Blob;
  video?: VideoFingerprintInput;
};

export type VisualHasher = (image: Blob) => Promise<string>;

export type FileFingerprintWorkerResponse =
  | { ok: true; fingerprint: FileFingerprint }
  | { ok: false; error: string };

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Blob(source: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await source.arrayBuffer());
  return bytesToHex(new Uint8Array(digest));
}

export async function createFileFingerprint(
  input: FileFingerprintInput,
  hashVisual?: VisualHasher,
): Promise<FileFingerprint> {
  const [sourceHash, motionHash] = await Promise.all([
    sha256Blob(input.source),
    input.motion ? sha256Blob(input.motion) : Promise.resolve(undefined),
  ]);
  const exact = {
    algorithm: "sha-256" as const,
    source: sourceHash,
    motion: motionHash,
  };
  if (!hashVisual || (!input.still && !input.video?.frames.length)) {
    return {
      version: FILE_FINGERPRINT_VERSION,
      status: "completed",
      exact,
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const [stillHash, videoHashes] = await Promise.all([
      input.still ? hashVisual(input.still) : Promise.resolve(undefined),
      input.video
        ? Promise.all(input.video.frames.map((frame) => hashVisual(frame)))
        : Promise.resolve(undefined),
    ]);
    return {
      version: FILE_FINGERPRINT_VERSION,
      status: "completed",
      exact,
      still: stillHash ? { algorithm: "pdq-256", hash: stillHash } : undefined,
      video: input.video && videoHashes?.length
        ? {
          algorithm: "pdq-256-sequence",
          durationSec: input.video.durationSec,
          timestampsSec: input.video.timestampsSec,
          hashes: videoHashes,
        }
        : undefined,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      version: FILE_FINGERPRINT_VERSION,
      status: "completed",
      exact,
      updatedAt: new Date().toISOString(),
      error: error instanceof Error
        ? `视觉指纹不可用：${error.message}`
        : "视觉指纹不可用",
    };
  }
}

export function analyzeFileFingerprintInWorker(
  input: FileFingerprintInput,
  signal?: AbortSignal,
): Promise<FileFingerprint> {
  if (typeof Worker === "undefined") return createFileFingerprint(input);
  return new Promise((resolve, reject) => {
    const worker = new Worker("/pdq/fingerprint-worker.js");
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("文件指纹分析已取消", "AbortError"));
    };
    worker.onmessage = (event: MessageEvent<FileFingerprintWorkerResponse>) => {
      finish();
      if (event.data.ok) resolve(event.data.fingerprint);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "文件指纹 Worker 失败"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else worker.postMessage(input);
  });
}
