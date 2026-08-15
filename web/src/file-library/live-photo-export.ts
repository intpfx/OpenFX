import {
  encodeLivpArchive,
  encodeStoredZipArchive,
  type LivpMetadata,
} from "../../../domains/_shared/livp-codec.ts";
import type { LibraryPhotoMetadata } from "./model.ts";

export type LivePhotoExportFormat =
  | "original-pair"
  | "jpeg-pair"
  | "livp";

export type LivePhotoExportInput = {
  name: string;
  createdAt: string;
  still: File;
  jpeg?: File;
  motion: File;
  photo?: LibraryPhotoMetadata;
};

function extension(name: string, fallback: string): string {
  return name.match(/\.([^.]+)$/)?.[1] ?? fallback;
}

function baseName(name: string): string {
  return (name.replace(/[/\\\u0000-\u001f\u007f]/g, "-").replace(/\.[^.]+$/, "") ||
    "Live Photo").trim();
}

async function bytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export async function createLivePhotoExport(
  input: LivePhotoExportInput,
  format: LivePhotoExportFormat,
): Promise<File> {
  const base = baseName(input.name);
  const motionExtension = extension(input.motion.name, "mov");

  if (format === "original-pair") {
    const stillExtension = extension(input.still.name, "heic");
    const archive = encodeStoredZipArchive([
      { name: `${base}.${stillExtension}`, content: await bytes(input.still) },
      { name: `${base}.${motionExtension}`, content: await bytes(input.motion) },
    ]);
    return new File([archive as Uint8Array<ArrayBuffer>], `${base}.original.zip`, {
      type: "application/zip",
    });
  }

  const motionBytes = await bytes(input.motion);
  if (format === "jpeg-pair") {
    if (!input.jpeg) throw new Error("JPEG 兼容预览尚未生成，请稍后重试");
    const jpegBytes = await bytes(input.jpeg);
    const archive = encodeStoredZipArchive([
      { name: `${base}.jpg`, content: jpegBytes },
      { name: `${base}.${motionExtension}`, content: motionBytes },
    ]);
    return new File([archive as Uint8Array<ArrayBuffer>], `${base}.compatible.zip`, {
      type: "application/zip",
    });
  }

  const imageFormat = extension(input.still.name, "heic").toLowerCase();
  const videoFormat = motionExtension.toLowerCase();
  const metadata: LivpMetadata = {
    version: "2",
    timestamp: input.photo?.capturedAt ?? input.createdAt,
    stillImageTime: 0,
    imageFormat,
    videoFormat,
    photo: input.photo,
  };
  const archive = encodeLivpArchive(await bytes(input.still), motionBytes, metadata);
  return new File([archive as Uint8Array<ArrayBuffer>], `${base}.livp`, {
    type: "application/zip",
  });
}
