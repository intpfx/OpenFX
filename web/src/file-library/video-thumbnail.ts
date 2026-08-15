export type ThumbnailFrameDiagnostics = {
  timestampSec: number;
  meanLuma: number;
  standardDeviation: number;
  edgeScore: number;
  darkPixelRatio: number;
  score: number;
  accepted: boolean;
};

type PixelBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type GeneratedVideoThumbnail = {
  blob: Blob;
  width: number;
  height: number;
  selectedTimestampSec: number;
  durationSec: number;
};

export type GeneratedVideoFingerprintFrames = {
  frames: Blob[];
  timestampsSec: number[];
  durationSec: number;
};

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 180;

export function buildThumbnailCandidateTimestamps(durationSec: number): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const openingGuardSec = Math.min(30, Math.max(0.1, durationSec * 0.08));
  const closingGuardSec = Math.min(60, Math.max(0.1, durationSec * 0.12));
  const latestTimestampSec = Math.max(openingGuardSec, durationSec - closingGuardSec);
  const candidates = [0.08, 0.12, 0.2, 0.3]
    .map((ratio) =>
      Math.min(latestTimestampSec, Math.max(openingGuardSec, durationSec * ratio))
    )
    .map((timestamp) => Math.round(timestamp * 1000) / 1000)
    .sort((left, right) => left - right);
  return candidates.filter((timestamp, index) =>
    index === 0 || Math.abs(timestamp - candidates[index - 1]) >= 0.25
  );
}

export function buildVideoFingerprintTimestamps(
  durationSec: number,
  sampleCount = 8,
): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || sampleCount <= 0) return [];
  if (sampleCount === 1) return [Math.round(durationSec * 0.5 * 1000) / 1000];
  const firstRatio = 0.08;
  const lastRatio = 0.92;
  return Array.from({ length: sampleCount }, (_, index) => {
    const ratio = firstRatio + (lastRatio - firstRatio) * index / (sampleCount - 1);
    return Math.round(durationSec * ratio * 1000) / 1000;
  });
}

export function scoreThumbnailPixels(
  frame: PixelBuffer,
): Omit<ThumbnailFrameDiagnostics, "timestampSec"> {
  const stride = 4;
  let sampleCount = 0;
  let darkPixelCount = 0;
  let lumaSum = 0;
  let lumaSquaredSum = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  const rowLuma = new Float32Array(Math.ceil(frame.width / stride));
  const previousRowLuma = new Float32Array(rowLuma.length);

  for (let y = 0; y < frame.height; y += stride) {
    let previousLuma: number | null = null;
    let sampleX = 0;
    for (let x = 0; x < frame.width; x += stride) {
      const offset = (y * frame.width + x) * 4;
      const luma = frame.data[offset] * 0.2126 +
        frame.data[offset + 1] * 0.7152 +
        frame.data[offset + 2] * 0.0722;
      rowLuma[sampleX] = luma;
      sampleCount += 1;
      lumaSum += luma;
      lumaSquaredSum += luma * luma;
      if (luma < 24) darkPixelCount += 1;
      if (previousLuma != null) {
        edgeSum += Math.abs(luma - previousLuma);
        edgeCount += 1;
      }
      if (y > 0) {
        edgeSum += Math.abs(luma - previousRowLuma[sampleX]);
        edgeCount += 1;
      }
      previousLuma = luma;
      sampleX += 1;
    }
    previousRowLuma.set(rowLuma);
  }

  const meanLuma = sampleCount > 0 ? lumaSum / sampleCount : 0;
  const variance = sampleCount > 0
    ? Math.max(0, lumaSquaredSum / sampleCount - meanLuma * meanLuma)
    : 0;
  const standardDeviation = Math.sqrt(variance);
  const edgeScore = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const darkPixelRatio = sampleCount > 0 ? darkPixelCount / sampleCount : 1;
  const accepted = meanLuma >= 24 && meanLuma <= 235 && darkPixelRatio <= 0.72 &&
    standardDeviation >= 12 && edgeScore >= 4;
  const score = standardDeviation * 0.8 + edgeScore * 1.4 - darkPixelRatio * 80 -
    Math.max(0, 35 - meanLuma) * 2 - Math.max(0, meanLuma - 225) * 2;
  return { meanLuma, standardDeviation, edgeScore, darkPixelRatio, score, accepted };
}

export function selectBestThumbnailFrame(
  candidates: readonly ThumbnailFrameDiagnostics[],
): ThumbnailFrameDiagnostics | null {
  if (candidates.length === 0) return null;
  const accepted = candidates.filter((candidate) => candidate.accepted);
  const pool = accepted.length > 0 ? accepted : candidates;
  return pool.reduce((best, candidate) =>
    candidate.score > best.score ? candidate : best
  );
}

function waitForMediaEvent(
  target: HTMLMediaElement,
  success: string,
  timeoutMs = 12_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(
      () => finish(new Error("视频帧读取超时")),
      timeoutMs,
    );
    const onSuccess = () => finish();
    const onError = () => finish(new Error("浏览器无法解码该视频以生成缩略图"));
    const finish = (error?: Error) => {
      globalThis.clearTimeout(timeout);
      target.removeEventListener(success, onSuccess);
      target.removeEventListener("error", onError);
      error ? reject(error) : resolve();
    };
    target.addEventListener(success, onSuccess, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function seek(video: HTMLVideoElement, timestampSec: number): Promise<void> {
  if (Math.abs(video.currentTime - timestampSec) < 0.01 && video.readyState >= 2) {
    return;
  }
  const ready = waitForMediaEvent(video, "seeked");
  video.currentTime = timestampSec;
  await ready;
}

function drawVideoCover(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
): void {
  const scale = Math.max(
    THUMBNAIL_WIDTH / video.videoWidth,
    THUMBNAIL_HEIGHT / video.videoHeight,
  );
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  context.drawImage(
    video,
    (THUMBNAIL_WIDTH - width) / 2,
    (THUMBNAIL_HEIGHT - height) / 2,
    width,
    height,
  );
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("无法编码视频缩略图")),
      "image/webp",
      0.82,
    );
  });
}

export async function createVideoFingerprintFrames(
  file: File,
): Promise<GeneratedVideoFingerprintFrames> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = objectUrl;

  try {
    await waitForMediaEvent(video, "loadedmetadata");
    if (
      !Number.isFinite(video.duration) || video.duration <= 0 ||
      video.videoWidth <= 0 || video.videoHeight <= 0
    ) {
      throw new Error("视频缺少可用于相似分析的画面或时长信息");
    }
    const canvas = document.createElement("canvas");
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持视频相似分析画布");

    const timestampsSec = buildVideoFingerprintTimestamps(video.duration);
    const frames: Blob[] = [];
    for (const timestampSec of timestampsSec) {
      await seek(video, timestampSec);
      context.clearRect(0, 0, canvas.width, canvas.height);
      drawVideoCover(context, video);
      frames.push(await canvasToWebp(canvas));
    }
    return { frames, timestampsSec, durationSec: video.duration };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function createVideoThumbnail(
  file: File,
): Promise<GeneratedVideoThumbnail> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = objectUrl;

  try {
    await waitForMediaEvent(video, "loadedmetadata");
    if (
      !Number.isFinite(video.duration) || video.duration <= 0 ||
      video.videoWidth <= 0 || video.videoHeight <= 0
    ) {
      throw new Error("视频缺少可用的画面或时长信息");
    }

    const canvas = document.createElement("canvas");
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器不支持缩略图画布");

    const candidates: Array<
      { diagnostic: ThumbnailFrameDiagnostics; image: ImageData }
    > = [];
    for (const timestampSec of buildThumbnailCandidateTimestamps(video.duration)) {
      await seek(video, timestampSec);
      context.clearRect(0, 0, canvas.width, canvas.height);
      drawVideoCover(context, video);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      candidates.push({
        diagnostic: { timestampSec, ...scoreThumbnailPixels(image) },
        image,
      });
    }

    const selected = selectBestThumbnailFrame(
      candidates.map((candidate) => candidate.diagnostic),
    );
    if (!selected) throw new Error("无法选择可用的视频画面");
    const selectedImage = candidates.find((candidate) =>
      candidate.diagnostic.timestampSec === selected.timestampSec
    )?.image;
    if (!selectedImage) throw new Error("选中的视频画面不可用");
    context.putImageData(selectedImage, 0, 0);

    return {
      blob: await canvasToWebp(canvas),
      width: canvas.width,
      height: canvas.height,
      selectedTimestampSec: selected.timestampSec,
      durationSec: video.duration,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
