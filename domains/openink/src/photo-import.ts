import type { PhotoPixels, PhotoQuad, Point } from "./photo-cleanup.ts";

export type DecodedPhoto = Readonly<{
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  sourceWidth: number;
  sourceHeight: number;
  processingImage: PhotoPixels;
  previewUrl: string;
}>;

const MAX_PROCESSING_DIMENSION = 1800;
const MAX_OUTPUT_DIMENSION = 1400;

function distance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function createDefaultPhotoQuad(width: number, height: number): PhotoQuad {
  const insetX = width * 0.035;
  const insetY = height * 0.035;
  return {
    topLeft: { x: insetX, y: insetY },
    topRight: { x: width - insetX, y: insetY },
    bottomRight: { x: width - insetX, y: height - insetY },
    bottomLeft: { x: insetX, y: height - insetY },
  };
}

export function photoCleanupOutputSize(
  quad: PhotoQuad,
): Readonly<{ width: number; height: number }> {
  const width = Math.max(
    1,
    Math.round(
      (distance(quad.topLeft, quad.topRight) +
        distance(quad.bottomLeft, quad.bottomRight)) / 2,
    ),
  );
  const height = Math.max(
    1,
    Math.round(
      (distance(quad.topLeft, quad.bottomLeft) +
        distance(quad.topRight, quad.bottomRight)) / 2,
    ),
  );
  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function scalePhotoQuad(
  quad: PhotoQuad,
  scaleX: number,
  scaleY: number,
): PhotoQuad {
  const scale = (point: Point): Point => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  });
  return {
    topLeft: scale(quad.topLeft),
    topRight: scale(quad.topRight),
    bottomRight: scale(quad.bottomRight),
    bottomLeft: scale(quad.bottomLeft),
  };
}

export async function decodePhotoFile(file: File): Promise<DecodedPhoto> {
  if (!file.type.startsWith("image/") || file.size === 0) {
    throw new Error("请选择有效的照片文件");
  }
  const previewUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = previewUrl;
    await image.decode();
    if (image.naturalWidth < 1 || image.naturalHeight < 1) {
      throw new Error("照片尺寸无效");
    }
    const processingScale = Math.min(
      1,
      MAX_PROCESSING_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * processingScale));
    const height = Math.max(1, Math.round(image.naturalHeight * processingScale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("当前浏览器无法读取照片像素");
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    return {
      name: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight,
      processingImage: { width, height, pixels },
      previewUrl,
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}
