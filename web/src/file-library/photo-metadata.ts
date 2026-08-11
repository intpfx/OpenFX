import type { LibraryPhotoMetadata } from "./model.ts";

type TiffReader = {
  view: DataView;
  littleEndian: boolean;
  tiffOffset: number;
};

type IfdEntry = {
  type: number;
  count: number;
  valueOffset: number;
  inlineOffset: number;
};

const TYPE_BYTES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8,
};

function inBounds(view: DataView, offset: number, length: number): boolean {
  return offset >= 0 && length >= 0 && offset + length <= view.byteLength;
}

function readUint16(reader: TiffReader, offset: number): number {
  if (!inBounds(reader.view, offset, 2)) throw new Error("EXIF uint16 越界");
  return reader.view.getUint16(offset, reader.littleEndian);
}

function readUint32(reader: TiffReader, offset: number): number {
  if (!inBounds(reader.view, offset, 4)) throw new Error("EXIF uint32 越界");
  return reader.view.getUint32(offset, reader.littleEndian);
}

function readIfd(reader: TiffReader, relativeOffset: number): Map<number, IfdEntry> {
  const offset = reader.tiffOffset + relativeOffset;
  const count = readUint16(reader, offset);
  const entries = new Map<number, IfdEntry>();
  for (let index = 0; index < count; index += 1) {
    const entryOffset = offset + 2 + index * 12;
    if (!inBounds(reader.view, entryOffset, 12)) break;
    const tag = readUint16(reader, entryOffset);
    const type = readUint16(reader, entryOffset + 2);
    const valueCount = readUint32(reader, entryOffset + 4);
    const byteLength = (TYPE_BYTES[type] ?? 0) * valueCount;
    const inlineOffset = entryOffset + 8;
    const valueOffset = byteLength > 4
      ? reader.tiffOffset + readUint32(reader, inlineOffset)
      : inlineOffset;
    if (byteLength > 0 && inBounds(reader.view, valueOffset, byteLength)) {
      entries.set(tag, { type, count: valueCount, valueOffset, inlineOffset });
    }
  }
  return entries;
}

function readNumber(
  reader: TiffReader,
  entry: IfdEntry | undefined,
): number | undefined {
  if (!entry) return undefined;
  const offset = entry.valueOffset;
  if (entry.type === 1 || entry.type === 7) return reader.view.getUint8(offset);
  if (entry.type === 3) return readUint16(reader, offset);
  if (entry.type === 4) return readUint32(reader, offset);
  if (entry.type === 9) return reader.view.getInt32(offset, reader.littleEndian);
  if (entry.type === 5 || entry.type === 10) {
    const numerator = entry.type === 5
      ? readUint32(reader, offset)
      : reader.view.getInt32(offset, reader.littleEndian);
    const denominator = entry.type === 5
      ? readUint32(reader, offset + 4)
      : reader.view.getInt32(offset + 4, reader.littleEndian);
    return denominator === 0 ? undefined : numerator / denominator;
  }
  return undefined;
}

function readNumbers(reader: TiffReader, entry: IfdEntry | undefined): number[] {
  if (!entry) return [];
  const values: number[] = [];
  const stride = TYPE_BYTES[entry.type] ?? 0;
  for (let index = 0; index < entry.count; index += 1) {
    const value = readNumber(reader, {
      ...entry,
      count: 1,
      valueOffset: entry.valueOffset + index * stride,
    });
    if (value !== undefined) values.push(value);
  }
  return values;
}

function readText(reader: TiffReader, entry: IfdEntry | undefined): string | undefined {
  if (!entry || (entry.type !== 2 && entry.type !== 7)) return undefined;
  const bytes = new Uint8Array(
    reader.view.buffer,
    reader.view.byteOffset + entry.valueOffset,
    entry.count,
  );
  const value = new TextDecoder().decode(bytes).replace(/\0+$/, "").trim();
  return value || undefined;
}

function normalizeExifDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  return match
    ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`
    : value;
}

function readCoordinate(
  reader: TiffReader,
  coordinate: IfdEntry | undefined,
  reference: string | undefined,
): number | undefined {
  const parts = readNumbers(reader, coordinate);
  if (parts.length !== 3) return undefined;
  const value = parts[0] + parts[1] / 60 + parts[2] / 3600;
  return reference === "S" || reference === "W" ? -value : value;
}

function parseTiff(view: DataView, tiffOffset: number): LibraryPhotoMetadata {
  if (!inBounds(view, tiffOffset, 8)) return {};
  const byteOrder = String.fromCharCode(
    view.getUint8(tiffOffset),
    view.getUint8(tiffOffset + 1),
  );
  if (byteOrder !== "II" && byteOrder !== "MM") return {};
  const reader: TiffReader = {
    view,
    littleEndian: byteOrder === "II",
    tiffOffset,
  };
  if (readUint16(reader, tiffOffset + 2) !== 42) return {};

  const root = readIfd(reader, readUint32(reader, tiffOffset + 4));
  const exifPointer = readNumber(reader, root.get(0x8769));
  const gpsPointer = readNumber(reader, root.get(0x8825));
  const exif = exifPointer === undefined ? new Map() : readIfd(reader, exifPointer);
  const gps = gpsPointer === undefined ? new Map() : readIfd(reader, gpsPointer);
  const altitude = readNumber(reader, gps.get(0x0006));
  const altitudeRef = readNumber(reader, gps.get(0x0005));

  return compactPhotoMetadata({
    width: readNumber(reader, exif.get(0xa002)) ?? readNumber(reader, root.get(0x0100)),
    height: readNumber(reader, exif.get(0xa003)) ??
      readNumber(reader, root.get(0x0101)),
    orientation: readNumber(reader, root.get(0x0112)),
    capturedAt: normalizeExifDate(
      readText(reader, exif.get(0x9003)) ?? readText(reader, root.get(0x0132)),
    ),
    make: readText(reader, root.get(0x010f)),
    model: readText(reader, root.get(0x0110)),
    lensModel: readText(reader, exif.get(0xa434)),
    exposureTime: formatExposure(readNumber(reader, exif.get(0x829a))),
    fNumber: readNumber(reader, exif.get(0x829d)),
    iso: readNumber(reader, exif.get(0x8827)),
    focalLength: readNumber(reader, exif.get(0x920a)),
    latitude: readCoordinate(
      reader,
      gps.get(0x0002),
      readText(reader, gps.get(0x0001)),
    ),
    longitude: readCoordinate(
      reader,
      gps.get(0x0004),
      readText(reader, gps.get(0x0003)),
    ),
    altitude: altitude === undefined
      ? undefined
      : altitudeRef === 1
      ? -altitude
      : altitude,
    rating: readNumber(reader, root.get(0x4746)),
  });
}

function formatExposure(value: number | undefined): string | undefined {
  if (!value || value <= 0) return undefined;
  if (value >= 1) return `${Number(value.toFixed(2))} s`;
  return `1/${Math.round(1 / value)} s`;
}

export function compactPhotoMetadata(
  value: LibraryPhotoMetadata,
): LibraryPhotoMetadata {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as LibraryPhotoMetadata;
}

/** Parse the JPEG dimensions and embedded TIFF/EXIF block without decoding pixels. */
export function parseJpegPhotoMetadata(data: Uint8Array): LibraryPhotoMetadata {
  if (data.byteLength < 4 || data[0] !== 0xff || data[1] !== 0xd8) return {};
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 2;
  let dimensions: LibraryPhotoMetadata = {};
  let exif: LibraryPhotoMetadata = {};
  while (offset + 4 <= data.byteLength) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = view.getUint16(offset + 2, false);
    if (segmentLength < 2 || offset + 2 + segmentLength > data.byteLength) break;
    const payloadOffset = offset + 4;
    const isSof = [
      0xc0,
      0xc1,
      0xc2,
      0xc3,
      0xc5,
      0xc6,
      0xc7,
      0xc9,
      0xca,
      0xcb,
      0xcd,
      0xce,
      0xcf,
    ].includes(marker);
    if (isSof && segmentLength >= 7) {
      dimensions = {
        height: view.getUint16(payloadOffset + 1, false),
        width: view.getUint16(payloadOffset + 3, false),
      };
    }
    if (
      marker === 0xe1 && segmentLength >= 8 &&
      new TextDecoder().decode(data.slice(payloadOffset, payloadOffset + 6)) ===
        "Exif\0\0"
    ) {
      try {
        exif = parseTiff(view, payloadOffset + 6);
      } catch {
        exif = {};
      }
    }
    offset += segmentLength + 2;
  }
  return compactPhotoMetadata({ ...dimensions, ...exif });
}
