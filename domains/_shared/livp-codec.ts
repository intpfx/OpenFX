/**
 * LIVP binary format codec — pure functions, zero DOM dependencies.
 *
 * Format layout (encode):
 *   "LIVP\n"                    5 bytes  magic header
 *   + Uint32LE(metadataLength)  4 bytes  JSON byte length
 *   + JSON metadata             N bytes  UTF-8 encoded metadata object
 *   + image data                M bytes  raw image bytes
 *   + boundary marker           (4 + 21 + 4 + 4) bytes
 *      0xFF × 4                                start guard
 *      "LIVP_BOUNDARY_MARKER" (UTF-8)          marker text
 *      Uint32LE(imageLength)                   image byte length for quick seek
 *      0xFF × 4                                end guard
 *   + video data                K bytes  raw video bytes
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LivpMetadata {
  version: string;
  timestamp: string;
  stillImageTime: number;
  imageFormat: string;
  videoFormat: string;
  originalImageFormat?: string;
  originalVideoFormat?: string;
  [key: string]: unknown;
}

export interface LivpDecoded {
  /** Raw image bytes */
  image: Uint8Array;
  /** Raw video bytes */
  video: Uint8Array;
  /** Parsed metadata object */
  metadata: LivpMetadata;
  /** MIME type for the image (derived from metadata.imageFormat) */
  imageMimeType: string;
  /** MIME type for the video (derived from metadata.videoFormat) */
  videoMimeType: string;
}

export type LivpContainerFormat = "openfx-binary" | "zip" | "unknown";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const HEADER = encoder.encode("LIVP\n"); // 5 bytes
const MARKER_TEXT = "LIVP_BOUNDARY_MARKER";
const MARKER_BYTES = encoder.encode(MARKER_TEXT); // 21 bytes
const GUARD = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;

/** Concatenate multiple Uint8Arrays into one. */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.byteLength;
  }
  return out;
}

/** Write a 32-bit unsigned integer in little-endian order. */
function uint32LE(value: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, value, true);
  return new Uint8Array(buf);
}

/** Read a 32-bit unsigned integer in little-endian from a DataView. */
function readUint32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Replace a file extension (case-insensitive).
 *
 * @example
 *   replaceFileExtension('photo.HEIC', 'heic', 'livp')  // 'photo.livp'
 */
export function replaceFileExtension(
  filename: string,
  oldExt: string,
  newExt: string,
): string {
  const regex = new RegExp(`\\.${oldExt}$`, "i");
  return filename.replace(regex, `.${newExt}`);
}

/**
 * Encode a LIVP file from separate image and video byte arrays.
 *
 * @param image  Raw image bytes (e.g. AVIF, HEIC, PNG, JPEG).
 * @param video  Raw video bytes (e.g. WebM VP8, MP4, MOV).
 * @param metadata  Key metadata describing the contents.
 * @returns A single Uint8Array representing the .livp file.
 */
export function encodeLivp(
  image: Uint8Array,
  video: Uint8Array,
  metadata: LivpMetadata,
): Uint8Array {
  // 1. Serialise metadata
  const metadataJson = encoder.encode(JSON.stringify(metadata));
  const metadataLenBytes = uint32LE(metadataJson.byteLength);

  // 2. Build boundary marker
  //    [4 × 0xFF] [MARKER_TEXT] [Uint32LE imageLength] [4 × 0xFF]
  const imageLenBytes = uint32LE(image.byteLength);
  const boundary = concat(GUARD, MARKER_BYTES, imageLenBytes, GUARD);

  // 3. Assemble
  return concat(HEADER, metadataLenBytes, metadataJson, image, boundary, video);
}

/**
 * Decode a LIVP binary buffer into its constituent parts.
 *
 * @param data  A Uint8Array containing the full .livp file.
 * @returns Parsed image, video, and metadata.
 * @throws If the header or boundary marker cannot be found.
 */
export function decodeLivp(data: Uint8Array): LivpDecoded {
  // 1. Validate header
  if (data.byteLength < HEADER.byteLength + 4) {
    throw new Error("LIVP decode: data too short for header");
  }
  for (let i = 0; i < HEADER.byteLength; i++) {
    if (data[i] !== HEADER[i]) {
      throw new Error('LIVP decode: invalid header — expected "LIVP\\n"');
    }
  }

  // 2. Read metadata length
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const metadataLength = readUint32LE(view, HEADER.byteLength); // offset 5

  // 3. Parse metadata JSON
  const metaStart = HEADER.byteLength + 4; // offset 9
  const metaEnd = metaStart + metadataLength;
  if (metaEnd > data.byteLength) {
    throw new Error("LIVP decode: metadata length exceeds data bounds");
  }
  const metadataJson = decoder.decode(data.slice(metaStart, metaEnd));
  const metadata: LivpMetadata = JSON.parse(metadataJson);

  // 4. Locate boundary marker in remaining data
  const remaining = data.slice(metaEnd);
  const boundaryIdx = indexOfBytes(remaining, MARKER_BYTES);

  if (boundaryIdx === -1) {
    throw new Error("LIVP decode: boundary marker not found");
  }

  // Boundary layout (relative to `remaining`):
  //   [image data] [GUARD(4)] [MARKER(21)] [imageLen(4)] [GUARD(4)] [video data]
  //                 ^
  //                 markerStart = boundaryIdx - 4

  const markerStart = boundaryIdx - 4;
  if (markerStart < 0) {
    throw new Error("LIVP decode: corrupted boundary marker");
  }

  // 5. Extract image (from start of remaining to markerStart)
  const imageData = remaining.slice(0, markerStart);

  // 6. Video starts after the full boundary marker
  //    GUARD(4) + MARKER(21) + imageLen(4) + GUARD(4) = 33 bytes total
  const videoStart = markerStart + 4 + MARKER_BYTES.byteLength + 4 + 4;
  const videoData = remaining.slice(videoStart);

  // 7. Derive MIME types
  const imageFormat = (metadata.imageFormat || "heic").toLowerCase();
  const videoFormat = (metadata.videoFormat || "mov").toLowerCase();

  const imageMimeType = mimeForImage(imageFormat);
  const videoMimeType = mimeForVideo(videoFormat);

  return { image: imageData, video: videoData, metadata, imageMimeType, videoMimeType };
}

export function detectLivpContainer(data: Uint8Array): LivpContainerFormat {
  if (data.byteLength >= HEADER.byteLength) {
    let isBinary = true;
    for (let index = 0; index < HEADER.byteLength; index += 1) {
      if (data[index] !== HEADER[index]) {
        isBinary = false;
        break;
      }
    }
    if (isBinary) return "openfx-binary";
  }
  if (
    data.byteLength >= 4 &&
    new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true) ===
      ZIP_LOCAL_SIGNATURE
  ) {
    return "zip";
  }
  return "unknown";
}

type ZipEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

function findZipEnd(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_SIGNATURE) return offset;
  }
  return -1;
}

function listZipEntries(data: Uint8Array): ZipEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const end = findZipEnd(view);
  if (end < 0) throw new Error("LIVP ZIP: 找不到中央目录");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (
      offset + 46 > view.byteLength ||
      view.getUint32(offset, true) !== ZIP_CENTRAL_SIGNATURE
    ) {
      throw new Error("LIVP ZIP: 中央目录损坏");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(data.slice(offset + 46, offset + 46 + nameLength));
    entries.push({
      name,
      compression: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipEntry(data: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (
    entry.localOffset + 30 > view.byteLength ||
    view.getUint32(entry.localOffset, true) !== ZIP_LOCAL_SIGNATURE
  ) {
    throw new Error(`LIVP ZIP: ${entry.name} 的本地文件头损坏`);
  }
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = data.slice(start, start + entry.compressedSize);
  if (compressed.byteLength !== entry.compressedSize) {
    throw new Error(`LIVP ZIP: ${entry.name} 数据不完整`);
  }
  if (entry.compression === 0) return compressed;
  if (entry.compression !== 8 || typeof DecompressionStream === "undefined") {
    throw new Error(`LIVP ZIP: 不支持压缩方法 ${entry.compression}`);
  }
  const format = "deflate-raw" as CompressionFormat;
  const stream = new Blob([compressed]).stream().pipeThrough(
    new DecompressionStream(format),
  );
  const output = new Uint8Array(await new Response(stream).arrayBuffer());
  if (entry.uncompressedSize && output.byteLength !== entry.uncompressedSize) {
    throw new Error(`LIVP ZIP: ${entry.name} 解压长度不匹配`);
  }
  return output;
}

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** Decode both the historical OpenFX binary container and ZIP-based LIVP archives. */
export async function decodeLivpArchive(data: Uint8Array): Promise<LivpDecoded> {
  const format = detectLivpContainer(data);
  if (format === "openfx-binary") return decodeLivp(data);
  if (format !== "zip") throw new Error("LIVP: 未知容器格式");

  const entries = listZipEntries(data).filter((entry) => !entry.name.endsWith("/"));
  const imageEntry = entries.find((entry) =>
    ["avif", "heic", "heif", "jpeg", "jpg", "png", "webp"].includes(
      extensionOf(entry.name),
    )
  );
  const videoEntry = entries.find((entry) =>
    ["m4v", "mov", "mp4", "webm"].includes(extensionOf(entry.name))
  );
  if (!imageEntry || !videoEntry) {
    throw new Error("LIVP ZIP: 必须同时包含图片和视频");
  }
  const metadataEntry = entries.find((entry) =>
    entry.name.toLowerCase().endsWith("metadata.json")
  );
  const [image, video, metadataBytes] = await Promise.all([
    readZipEntry(data, imageEntry),
    readZipEntry(data, videoEntry),
    metadataEntry ? readZipEntry(data, metadataEntry) : Promise.resolve(undefined),
  ]);
  const imageFormat = extensionOf(imageEntry.name).replace("jpeg", "jpg");
  const videoFormat = extensionOf(videoEntry.name);
  let suppliedMetadata: Partial<LivpMetadata> = {};
  if (metadataBytes) {
    try {
      suppliedMetadata = JSON.parse(decoder.decode(metadataBytes));
    } catch {
      suppliedMetadata = {};
    }
  }
  const metadata: LivpMetadata = {
    version: "2",
    timestamp: new Date(0).toISOString(),
    stillImageTime: 0,
    ...suppliedMetadata,
    imageFormat,
    videoFormat,
  };
  return {
    image,
    video,
    metadata,
    imageMimeType: mimeForImage(imageFormat),
    videoMimeType: mimeForVideo(videoFormat),
  };
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipLocalHeader(
  name: Uint8Array,
  content: Uint8Array,
  crc: number,
): Uint8Array {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, ZIP_LOCAL_SIGNATURE, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, content.byteLength, true);
  view.setUint32(22, content.byteLength, true);
  view.setUint16(26, name.byteLength, true);
  return concat(header, name, content);
}

function zipCentralHeader(
  name: Uint8Array,
  content: Uint8Array,
  crc: number,
  localOffset: number,
): Uint8Array {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, ZIP_CENTRAL_SIGNATURE, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, content.byteLength, true);
  view.setUint32(24, content.byteLength, true);
  view.setUint16(28, name.byteLength, true);
  view.setUint32(42, localOffset, true);
  return concat(header, name);
}

/** Create the canonical OpenFX LIVP archive: an uncompressed, UTF-8 ZIP container. */
export function encodeLivpArchive(
  image: Uint8Array,
  video: Uint8Array,
  metadata: LivpMetadata,
): Uint8Array {
  const files = [
    { name: `live.${metadata.imageFormat.toLowerCase()}`, content: image },
    { name: `live.${metadata.videoFormat.toLowerCase()}`, content: video },
    { name: "metadata.json", content: encoder.encode(JSON.stringify(metadata)) },
  ];
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.content);
    const local = zipLocalHeader(name, file.content, crc);
    locals.push(local);
    centrals.push(zipCentralHeader(name, file.content, crc, localOffset));
    localOffset += local.byteLength;
  }
  const central = concat(...centrals);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, ZIP_END_SIGNATURE, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, central.byteLength, true);
  endView.setUint32(16, localOffset, true);
  return concat(...locals, central, end);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the first occurrence of `needle` in `haystack`.
 * Returns the index, or -1 if not found.
 */
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  const limit = haystack.byteLength - needle.byteLength;
  outer: for (let i = 0; i <= limit; i++) {
    for (let j = 0; j < needle.byteLength; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function mimeForImage(fmt: string): string {
  switch (fmt) {
    case "avif":
      return "image/avif";
    case "heic":
    case "heif":
      return "image/heic";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function mimeForVideo(fmt: string): string {
  switch (fmt) {
    case "webm":
      return "video/webm; codecs=av01.0.05M.08";
    case "mp4":
    case "m4v":
      return "video/mp4";
    default:
      return "video/quicktime";
  }
}
