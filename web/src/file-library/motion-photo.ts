const XMP_SCAN_BYTES = 512 * 1024;
const FALLBACK_TAIL_BYTES = 8 * 1024 * 1024;
const MIN_VIDEO_BYTES = 8 * 1024;
const XMP_END = "</x:xmpmeta>";

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractXmp(file: File): Promise<string | null> {
  return file.slice(0, XMP_SCAN_BYTES).text().then((header) => {
    const start = header.indexOf("<x:xmpmeta");
    const end = header.indexOf(XMP_END, Math.max(0, start));
    if (start < 0 || end < 0) return null;
    return header.slice(start, end + XMP_END.length);
  });
}

export function readMotionPhotoOffset(xmp: string): number | null {
  const names = ["MicroVideoOffset", "GCamera:MicroVideoOffset"];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const element = new RegExp(`<[^>]*${escaped}[^>]*>([^<]+)<\/[^>]+>`, "i")
      .exec(xmp)?.[1];
    const attribute = new RegExp(`(?:[\\w-]+:)?${escaped}="([^"]+)"`, "i")
      .exec(xmp)?.[1];
    const value = parsePositiveInteger(element) ?? parsePositiveInteger(attribute);
    if (value) return value;
  }
  return null;
}

export function xmpIndicatesMotionPhoto(xmp: string): boolean {
  return /(?:MotionPhoto|MicroVideo)\s*(?:=|>)/i.test(xmp) ||
    /Item:Mime="video\/mp4"/i.test(xmp) ||
    /GContainer:Item/i.test(xmp);
}

async function isMp4At(file: File, start: number): Promise<boolean> {
  if (start <= 0 || start >= file.size - MIN_VIDEO_BYTES) return false;
  const header = new Uint8Array(await file.slice(start, start + 32).arrayBuffer());
  const signature = new TextEncoder().encode("ftyp");
  outer: for (let index = 0; index <= header.length - signature.length; index += 1) {
    for (let offset = 0; offset < signature.length; offset += 1) {
      if (header[index + offset] !== signature[offset]) continue outer;
    }
    return true;
  }
  return false;
}

async function findMp4InTail(file: File): Promise<number | null> {
  const tailStart = Math.max(0, file.size - FALLBACK_TAIL_BYTES);
  const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
  const signature = new TextEncoder().encode("ftyp");

  outer: for (let index = 4; index <= tail.length - signature.length; index += 1) {
    for (let offset = 0; offset < signature.length; offset += 1) {
      if (tail[index + offset] !== signature[offset]) continue outer;
    }
    const start = tailStart + index - 4;
    if (await isMp4At(file, start)) return start;
  }
  return null;
}

/**
 * Browser adaptation of LivpExplorer's Motion Photo XMP extraction path.
 * It reads only the XMP header and the video tail, not the whole image into memory.
 */
export async function extractMotionPhotoVideo(file: File): Promise<Blob | null> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "jpg" && extension !== "jpeg") return null;

  const xmp = await extractXmp(file);
  if (!xmp || !xmpIndicatesMotionPhoto(xmp)) return null;

  const offset = readMotionPhotoOffset(xmp);
  const starts = new Set<number>();
  if (offset) {
    starts.add(offset);
    starts.add(file.size - offset);
  }

  for (const start of starts) {
    if (await isMp4At(file, start)) {
      return file.slice(start, file.size, "video/mp4");
    }
  }

  const fallback = await findMp4InTail(file);
  return fallback === null ? null : file.slice(fallback, file.size, "video/mp4");
}
