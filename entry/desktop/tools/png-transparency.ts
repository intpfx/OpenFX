export interface PngTransparency {
  width: number;
  height: number;
  cornerAlpha: [number, number, number, number];
  transparentPixels: number;
  visiblePixels: number;
  opaquePixels: number;
  totalPixels: number;
}

export async function inspectPngTransparency(
  bytes: Uint8Array,
): Promise<PngTransparency> {
  const alpha = await decodeRgbaPngAlpha(bytes);
  const totalPixels = alpha.values.length;
  return {
    width: alpha.width,
    height: alpha.height,
    cornerAlpha: [
      alpha.values[0],
      alpha.values[alpha.width - 1],
      alpha.values[(alpha.height - 1) * alpha.width],
      alpha.values[totalPixels - 1],
    ],
    transparentPixels: alpha.values.filter((value) => value === 0).length,
    visiblePixels: alpha.values.filter((value) => value > 0).length,
    opaquePixels: alpha.values.filter((value) => value === 255).length,
    totalPixels,
  };
}

async function decodeRgbaPngAlpha(
  bytes: Uint8Array,
): Promise<{ width: number; height: number; values: number[] }> {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  assert(
    signature.every((value, index) => bytes[index] === value),
    "Tray icon is not a PNG.",
  );
  let offset = signature.length;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      assert(data[8] === 8, "Tray PNG must use 8-bit channels.");
      assert(data[9] === 6, "Tray PNG must use RGBA color.");
      assert(data[12] === 0, "Tray PNG must not be interlaced.");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  assert(width > 0 && height > 0 && idat.length > 0, "Tray PNG is incomplete.");
  const compressedLength = idat.reduce((sum, chunk) => sum + chunk.length, 0);
  const compressed = new Uint8Array(compressedLength);
  let compressedOffset = 0;
  for (const chunk of idat) {
    compressed.set(chunk, compressedOffset);
    compressedOffset += chunk.length;
  }
  const decompressed = new Uint8Array(
    await new Response(
      new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate")),
    ).arrayBuffer(),
  );
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = new Uint8Array(height * stride);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = decompressed[sourceOffset++];
    for (let column = 0; column < stride; column += 1) {
      const raw = decompressed[sourceOffset++];
      const target = row * stride + column;
      const left = column >= bytesPerPixel ? pixels[target - bytesPerPixel] : 0;
      const up = row > 0 ? pixels[target - stride] : 0;
      const upLeft = row > 0 && column >= bytesPerPixel
        ? pixels[target - stride - bytesPerPixel]
        : 0;
      pixels[target] = unfilterByte(filter, raw, left, up, upLeft);
    }
  }
  const values: number[] = [];
  for (let index = 3; index < pixels.length; index += 4) values.push(pixels[index]);
  return { width, height, values };
}

function unfilterByte(
  filter: number,
  raw: number,
  left: number,
  up: number,
  upLeft: number,
): number {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 0xff;
  if (filter === 2) return (raw + up) & 0xff;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (raw + paeth(left, up, upLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter: ${filter}`);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
