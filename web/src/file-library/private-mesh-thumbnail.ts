import { getFileExtension, type LibraryItem, type StoredFileRef } from "./model.ts";
import {
  PRIVATE_MESH_MAX_THUMBNAIL_BYTES,
  type PrivateMeshThumbnailDescriptor,
} from "./private-mesh-catalog.ts";

const PRIVATE_MESH_THUMBNAIL_EDGE = 320;
const RASTER_IMAGE_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const RASTER_IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "webp",
]);
const ENCODE_EDGES = [320, 256, 192, 160] as const;
const ENCODE_QUALITIES = [0.82, 0.66, 0.5] as const;

type DecodedImage = Readonly<{
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}>;

export function getPrivateMeshThumbnailSource(
  item: LibraryItem,
): StoredFileRef | null {
  if (item.kind === "video") return item.preview ?? null;
  if (item.kind !== "image") return null;
  if (item.preview) return item.preview;
  const mimeType = item.source.type.toLowerCase();
  const usesGenericMimeType = !mimeType || mimeType === "application/octet-stream";
  return RASTER_IMAGE_TYPES.has(mimeType) ||
      (usesGenericMimeType &&
        RASTER_IMAGE_EXTENSIONS.has(getFileExtension(item.source.name)))
    ? item.source
    : null;
}

export function describePrivateMeshThumbnail(
  item: LibraryItem,
): PrivateMeshThumbnailDescriptor | undefined {
  const source = getPrivateMeshThumbnailSource(item);
  return source
    ? { version: 1, revision: `${source.size}:${source.lastModified}` }
    : undefined;
}

export function fitPrivateMeshThumbnailDimensions(
  width: number,
  height: number,
  maximumEdge = PRIVATE_MESH_THUMBNAIL_EDGE,
): Readonly<{ width: number; height: number }> {
  if (
    !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) ||
    height <= 0 || !Number.isFinite(maximumEdge) || maximumEdge <= 0
  ) throw new Error("私有网络缩略图尺寸无效");
  const scale = Math.min(1, maximumEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodeImage(source: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source);
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          dispose: () => bitmap.close(),
        };
      }
      bitmap.close();
    } catch {
      // Fall back to an image element for browsers with partial ImageBitmap support.
    }
  }

  const objectUrl = URL.createObjectURL(source);
  const image = document.createElement("img");
  image.decoding = "async";
  image.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("无法解码缩略图图像")), {
        once: true,
      });
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("缩略图图像没有有效尺寸");
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => {
      image.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    },
  };
}

function encodeCanvasWebp(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== "image/webp") {
          reject(new Error("当前浏览器无法编码 WebP 缩略图"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

export async function createPrivateMeshThumbnail(source: File): Promise<Blob> {
  const decoded = await decodeImage(source);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持缩略图画布");

    for (const maximumEdge of ENCODE_EDGES) {
      const dimensions = fitPrivateMeshThumbnailDimensions(
        decoded.width,
        decoded.height,
        maximumEdge,
      );
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      for (const quality of ENCODE_QUALITIES) {
        const thumbnail = await encodeCanvasWebp(canvas, quality);
        if (
          thumbnail.size > 0 &&
          thumbnail.size <= PRIVATE_MESH_MAX_THUMBNAIL_BYTES
        ) return thumbnail;
      }
    }
    throw new Error("派生缩略图超过 128 KiB 上限");
  } finally {
    decoded.dispose();
  }
}
