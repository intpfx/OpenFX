/**
 * ffmpeg.wasm pipeline — pure-function wrappers with progress callbacks.
 *
 * This module depends on the global `FFmpeg` namespace provided by
 * ffmpeg.wasm (loaded via CDN / script tag). The pipeline logic itself
 * is platform-agnostic; only the `FFmpeg` global and browser File/Blob
 * APIs tie it to the browser runtime.
 *
 * Core pattern:
 *   1. create pipeline (createFFmpeg + load) – once per session
 *   2. write input → run ffmpeg → read output → cleanup MEMFS
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for creating a pipeline instance. */
export interface FfmpegPipelineOptions {
  /**
   * URL to the ffmpeg-core.js / ffmpeg-core.wasm bundle.
   * Default: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
   */
  corePath?: string;

  /** Enable ffmpeg internal logging (logged to console). */
  log?: boolean;

  /**
   * Progress callback invoked for status updates.
   * Replaces the original DOM statusElement/message manipulation.
   */
  onProgress?: (message: string) => void;
}

/**
 * A ready-to-use ffmpeg.wasm pipeline instance.
 * Hold one instance and reuse it across multiple conversions.
 */
export interface FfmpegPipeline {
  /** The underlying ffmpeg.wasm instance. */
  ffmpeg: unknown;
  /** Bound fetchFile helper from the ffmpeg.wasm namespace. */
  fetchFile: (file: File | Blob) => Promise<Uint8Array>;
  /** Active onProgress callback. */
  onProgress?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Browser capability checks
// ---------------------------------------------------------------------------

/**
 * Check whether the current runtime supports SharedArrayBuffer.
 * ffmpeg.wasm requires SAB; without it the pipeline will not work.
 */
export function checkSharedArrayBufferSupport(): boolean {
  try {
    new SharedArrayBuffer(1);
    return true;
  } catch {
    return false;
  }
}

/**
 * Human-readable message explaining how to enable SharedArrayBuffer.
 * (The original returned HTML; we return plain text so the caller
 * can decide how to render it.)
 */
export function getSharedArrayBufferErrorMessage(): string {
  return [
    'SharedArrayBuffer 不可用',
    '',
    'ffmpeg.wasm 需要 SharedArrayBuffer 支持，但当前浏览器环境不支持此功能。',
    '要启用此功能，您需要：',
    '  1. 通过 HTTPS 访问此页面',
    '  2. 服务器设置以下 HTTP 头：',
    '     - Cross-Origin-Opener-Policy: same-origin',
    '     - Cross-Origin-Embedder-Policy: require-corp',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Pipeline factory
// ---------------------------------------------------------------------------

/**
 * Create and initialise an ffmpeg.wasm pipeline.
 *
 * Call this **once** and reuse the returned pipeline for all conversions
 * in the same session.  The underlying ffmpeg.wasm instance is loaded
 * asynchronously and kept alive.
 *
 * @throws If FFmpeg global is unavailable or SharedArrayBuffer is missing.
 */
export async function createFfmpegPipeline(
  options: FfmpegPipelineOptions = {},
): Promise<FfmpegPipeline> {
  const {
    corePath = 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    log = true,
    onProgress,
  } = options;

  if (typeof (globalThis as Record<string, unknown>).FFmpeg === 'undefined') {
    throw new Error(
      'FFmpeg 未加载，请确保已通过 CDN 引入 ffmpeg.wasm 库',
    );
  }

  if (!checkSharedArrayBufferSupport()) {
    throw new Error(
      '当前浏览器不支持 SharedArrayBuffer，无法使用 ffmpeg.wasm',
    );
  }

  const FFmpegNS = (globalThis as Record<string, unknown>).FFmpeg as {
    createFFmpeg: (opts: Record<string, unknown>) => unknown;
    fetchFile: (file: File | Blob) => Promise<Uint8Array>;
  };

  const ffmpeg = FFmpegNS.createFFmpeg({ log, corePath });

  onProgress?.('正在加载 FFmpeg...');
  await (ffmpeg as { load: () => Promise<void> }).load();
  onProgress?.('FFmpeg 已就绪');

  return {
    ffmpeg,
    fetchFile: FFmpegNS.fetchFile,
    onProgress,
  };
}

// ---------------------------------------------------------------------------
// MEMFS helpers (internal)
// ---------------------------------------------------------------------------

/** Type for the ffmpeg FS object (exposed for internal use). */
interface FfmpegFS {
  writeFile: (name: string, data: Uint8Array) => void;
  readFile: (name: string) => Uint8Array;
  unlink: (name: string) => void;
  readdir: (path: string) => string[];
  stat: (name: string) => { size: number };
}

function fs(pipeline: FfmpegPipeline): FfmpegFS {
  return (pipeline.ffmpeg as { FS: FfmpegFS }).FS;
}

// ---------------------------------------------------------------------------
// Generic video converter
// ---------------------------------------------------------------------------

/**
 * Convert a video file using an already-loaded pipeline.
 *
 * @param pipeline   Active pipeline from `createFfmpegPipeline`.
 * @param input      Browser File object to convert.
 * @param outputExt  Output file extension (e.g. 'webm', 'mp4').
 * @param ffmpegArgs Extra ffmpeg CLI arguments after `-i input`.
 *                   The output filename is always the last argument and is
 *                   managed internally — do NOT include it here.
 * @returns The converted file.
 */
export async function convertVideo(
  pipeline: FfmpegPipeline,
  input: File,
  outputExt: string,
  ffmpegArgs: string[],
): Promise<File> {
  const { ffmpeg, fetchFile, onProgress } = pipeline;
  const ffmpegRun = (ffmpeg as { run: (...args: string[]) => Promise<void> }).run;
  const memfs = fs(pipeline);

  const inputExt = input.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const inputName = `input.${inputExt}`;
  const outputName = `output.${outputExt}`;

  // 1. Write input to MEMFS
  onProgress?.(`正在处理 ${input.name}...`);
  const inputData = await fetchFile(input);
  memfs.writeFile(inputName, inputData);

  try {
    // 2. Run ffmpeg
    onProgress?.('正在转换视频...');
    await ffmpegRun('-i', inputName, ...ffmpegArgs, outputName);

    // 3. Verify output
    const files = memfs.readdir('/');
    if (!files.includes(outputName)) {
      throw new Error(`输出文件 ${outputName} 未生成`);
    }

    // 4. Read output (slice ensures ArrayBuffer backing, not ArrayBufferLike)
    const rawOut = memfs.readFile(outputName);
    if (rawOut.byteLength === 0) {
      throw new Error(`输出文件 ${outputName} 为空`);
    }
    const outData = rawOut.slice();

    // 5. Build output File
    const outFile = new File(
      [outData],
      replaceExtension(input.name, outputExt),
      { type: mimeForExt(outputExt) },
    );

    onProgress?.('转换完成!');
    return outFile;
  } finally {
    // 6. Cleanup (always)
    try { memfs.unlink(inputName); } catch { /* ignore */ }
    try { memfs.unlink(outputName); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Preset converters
// ---------------------------------------------------------------------------

/**
 * Convert any video to VP8 + Vorbis WebM.
 * Matches the original `convertVideoToAV1WebM` behaviour
 * (but uses VP8 for maximum browser compatibility).
 */
export async function convertToWebM(
  pipeline: FfmpegPipeline,
  input: File,
): Promise<File> {
  return convertVideo(pipeline, input, 'webm', [
    '-c:v', 'vp8',
    '-crf', '30',
    '-b:v', '1M',
    '-c:a', 'libvorbis',
    '-b:a', '128k',
  ]);
}

/**
 * Convert any video to H.264 + AAC MP4.
 * Matches the original `convertMovToMp4` behaviour.
 */
export async function convertToMp4(
  pipeline: FfmpegPipeline,
  input: File,
): Promise<File> {
  return convertVideo(pipeline, input, 'mp4', [
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-c:a', 'aac',
    '-strict', 'experimental',
    '-b:a', '128k',
    '-movflags', 'faststart',
  ]);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function replaceExtension(filename: string, newExt: string): string {
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}.${newExt}`;
}

function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'webm': return 'video/webm';
    case 'mp4':  return 'video/mp4';
    case 'mov':  return 'video/quicktime';
    default:     return 'video/webm';
  }
}
