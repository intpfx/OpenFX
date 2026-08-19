import type { InkSdf } from "./ink-sdf.ts";
import type { InkMask } from "./photo-cleanup.ts";

export type BinaryStore = Readonly<{
  readBytes(path: string): Promise<Uint8Array | null>;
  writeBytes(path: string, contents: Uint8Array): Promise<void>;
}>;

export type PhotoSourceAsset = Readonly<{
  assetId: string;
  mimeType: string;
  width: number;
  height: number;
  byteLength: number;
}>;

type StorePhotoSourceInput = Readonly<{
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}>;

function sourcePath(assetId: string): string {
  if (!/^[a-f0-9]{64}$/.test(assetId)) {
    throw new Error("OpenInk 照片资产标识无效");
  }
  return `assets/source/${assetId}.bin`;
}

function derivedPath(assetId: string): string {
  if (!/^[a-f0-9]{64}$/.test(assetId)) {
    throw new Error("OpenInk 派生资产标识无效");
  }
  return `assets/derived/${assetId}.bin`;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function storePhotoSource(
  store: BinaryStore,
  input: StorePhotoSourceInput,
): Promise<PhotoSourceAsset> {
  if (input.bytes.byteLength === 0 || !input.mimeType.startsWith("image/")) {
    throw new Error("OpenInk 照片原图无效");
  }
  if (
    !Number.isSafeInteger(input.width) || input.width < 1 ||
    !Number.isSafeInteger(input.height) || input.height < 1
  ) {
    throw new Error("OpenInk 照片尺寸无效");
  }
  const assetId = await sha256(input.bytes);
  const path = sourcePath(assetId);
  if (await store.readBytes(path) === null) {
    await store.writeBytes(path, input.bytes);
  }
  return {
    assetId,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    byteLength: input.bytes.byteLength,
  };
}

export async function loadPhotoSource(
  store: BinaryStore,
  assetId: string,
): Promise<Uint8Array> {
  const bytes = await store.readBytes(sourcePath(assetId));
  if (!bytes) throw new Error("OpenInk 照片原图缺失");
  return bytes;
}

function writeHeader(
  bytes: Uint8Array,
  magic: string,
  width: number,
  height: number,
): void {
  for (let index = 0; index < 4; index += 1) bytes[index] = magic.charCodeAt(index);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(4, width, true);
  view.setUint32(8, height, true);
}

function readHeader(
  bytes: Uint8Array,
  magic: string,
  bytesPerPixel: number,
): Readonly<{ width: number; height: number; dataOffset: number }> {
  if (bytes.byteLength < 12) throw new Error("OpenInk 派生资产损坏");
  const actualMagic = String.fromCharCode(...bytes.subarray(0, 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(4, true);
  const height = view.getUint32(8, true);
  if (
    actualMagic !== magic || width < 1 || height < 1 ||
    bytes.byteLength !== 12 + width * height * bytesPerPixel
  ) {
    throw new Error("OpenInk 派生资产损坏");
  }
  return { width, height, dataOffset: 12 };
}

function encodeMask(mask: InkMask): Uint8Array {
  const bytes = new Uint8Array(12 + mask.coverage.byteLength);
  writeHeader(bytes, "OIM1", mask.width, mask.height);
  bytes.set(mask.coverage, 12);
  return bytes;
}

function encodeSdf(sdf: InkSdf): Uint8Array {
  const bytes = new Uint8Array(12 + sdf.distance.length * 4);
  writeHeader(bytes, "OIS1", sdf.width, sdf.height);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < sdf.distance.length; index += 1) {
    view.setFloat32(12 + index * 4, sdf.distance[index], true);
  }
  return bytes;
}

async function storeDerivedAsset(
  store: BinaryStore,
  bytes: Uint8Array,
): Promise<string> {
  const assetId = await sha256(bytes);
  const path = derivedPath(assetId);
  if (await store.readBytes(path) === null) await store.writeBytes(path, bytes);
  return assetId;
}

export async function storeInkDerivatives(
  store: BinaryStore,
  input: Readonly<{ mask: InkMask; sdf: InkSdf }>,
): Promise<Readonly<{ maskAssetId: string; sdfAssetId: string }>> {
  if (input.mask.width !== input.sdf.width || input.mask.height !== input.sdf.height) {
    throw new Error("OpenInk 蒙版与 SDF 尺寸不一致");
  }
  const [maskAssetId, sdfAssetId] = await Promise.all([
    storeDerivedAsset(store, encodeMask(input.mask)),
    storeDerivedAsset(store, encodeSdf(input.sdf)),
  ]);
  return { maskAssetId, sdfAssetId };
}

async function loadDerivedAsset(
  store: BinaryStore,
  assetId: string,
): Promise<Uint8Array> {
  const bytes = await store.readBytes(derivedPath(assetId));
  if (!bytes) throw new Error("OpenInk 派生资产缺失");
  return bytes;
}

export async function loadInkMaskAsset(
  store: BinaryStore,
  assetId: string,
): Promise<InkMask> {
  const bytes = await loadDerivedAsset(store, assetId);
  const header = readHeader(bytes, "OIM1", 1);
  return {
    width: header.width,
    height: header.height,
    coverage: bytes.slice(header.dataOffset),
  };
}

export async function loadInkSdfAsset(
  store: BinaryStore,
  assetId: string,
): Promise<InkSdf> {
  const bytes = await loadDerivedAsset(store, assetId);
  const header = readHeader(bytes, "OIS1", 4);
  const distance = new Float32Array(header.width * header.height);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < distance.length; index += 1) {
    distance[index] = view.getFloat32(header.dataOffset + index * 4, true);
  }
  return { width: header.width, height: header.height, distance };
}
