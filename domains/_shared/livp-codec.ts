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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const HEADER = encoder.encode("LIVP\n"); // 5 bytes
const MARKER_TEXT = "LIVP_BOUNDARY_MARKER";
const MARKER_BYTES = encoder.encode(MARKER_TEXT); // 21 bytes
const GUARD = new Uint8Array([0xff, 0xff, 0xff, 0xff]);

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
      return "image/heic";
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
      return "video/mp4";
    default:
      return "video/quicktime";
  }
}
