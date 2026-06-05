import { expect } from "@std/expect";

import {
  decryptWechatDat,
  decryptWechatDatFile,
  extractXorKey,
} from "../wechat-dat.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** JPG 文件头前 8 字节 (SOI + APP0/JFIF marker) */
const JPG_HEADER = new Uint8Array([
  0xFF,
  0xD8,
  0xFF,
  0xE0,
  0x00,
  0x10,
  0x4A,
  0x46,
]);

/** 使用给定密钥异或加密数据 */
function xorEncrypt(data: Uint8Array, key: number): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = (data[i] ^ key) & 0xff;
  }
  return result;
}

/** 生成指定长度的随机字节数组 (非加密用途，仅测试数据) */
function randomBytes(length: number): Uint8Array {
  const result = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = (Math.random() * 256) | 0;
  }
  // 确保首字节为 0xFF 以模拟 JPG 文件
  if (length > 0) result[0] = 0xFF;
  return result;
}

// ─── decryptWechatDatFile ──────────────────────────────────────────────────────

Deno.test("decryptWechatDatFile: JPG header roundtrip with known key", () => {
  const key = 0x5A;
  const encrypted = xorEncrypt(JPG_HEADER, key);
  const { decrypted, key: extractedKey } = decryptWechatDatFile(encrypted);

  expect(extractedKey).toBe(key);
  expect(decrypted).toEqual(JPG_HEADER);
});

Deno.test("decryptWechatDatFile: full random JPG roundtrip", () => {
  const original = randomBytes(1024);
  const key = 0x7B;
  const encrypted = xorEncrypt(original, key);
  const { decrypted, key: extractedKey } = decryptWechatDatFile(encrypted);

  expect(extractedKey).toBe(key);
  expect(decrypted).toEqual(original);
});

Deno.test("decryptWechatDatFile: works with various keys", () => {
  const original = randomBytes(256);
  for (const key of [0x01, 0x55, 0xAA, 0xFF, 0x3C, 0xC3, 0x7E]) {
    const encrypted = xorEncrypt(original, key);
    const { decrypted, key: extractedKey } = decryptWechatDatFile(encrypted);

    expect(extractedKey).toBe(key);
    expect(decrypted).toEqual(original);
  }
});

Deno.test("decryptWechatDatFile: single byte input", () => {
  // 单字节 JPG 魔数加密
  const original = new Uint8Array([0xFF]);
  const key = 0x42;
  const encrypted = xorEncrypt(original, key);
  const { decrypted, key: extractedKey } = decryptWechatDatFile(encrypted);

  expect(extractedKey).toBe(key);
  expect(decrypted).toEqual(original);
});

Deno.test("decryptWechatDatFile: empty input returns empty result", () => {
  const { decrypted, key } = decryptWechatDatFile(new Uint8Array(0));

  expect(decrypted.length).toBe(0);
  expect(key).toBe(0);
});

Deno.test("decryptWechatDatFile: accepts ArrayBuffer", () => {
  const key = 0x3F;
  const encrypted = xorEncrypt(JPG_HEADER, key);
  const { decrypted, key: extractedKey } = decryptWechatDatFile(
    encrypted.buffer as ArrayBuffer,
  );

  expect(extractedKey).toBe(key);
  expect(decrypted).toEqual(JPG_HEADER);
});

Deno.test("decryptWechatDatFile: different keys produce different encrypted data", () => {
  const original = JPG_HEADER;
  const enc1 = xorEncrypt(original, 0x10);
  const enc2 = xorEncrypt(original, 0x20);

  // 加密结果不同
  expect(enc1).not.toEqual(enc2);

  // 但解密后都应还原
  const { decrypted: dec1 } = decryptWechatDatFile(enc1);
  const { decrypted: dec2 } = decryptWechatDatFile(enc2);
  expect(dec1).toEqual(original);
  expect(dec2).toEqual(original);
});

// ─── decryptWechatDat ──────────────────────────────────────────────────────────

Deno.test("decryptWechatDat: decrypts with explicit key", () => {
  const original = randomBytes(512);
  const key = 0x6D;
  const encrypted = xorEncrypt(original, key);
  const decrypted = decryptWechatDat(encrypted, key);

  expect(decrypted).toEqual(original);
});

Deno.test("decryptWechatDat: produces same result as decryptWechatDatFile", () => {
  const original = randomBytes(256);
  const key = 0x3A;
  const encrypted = xorEncrypt(original, key);

  const { decrypted: autoDecrypted } = decryptWechatDatFile(encrypted);
  const manualDecrypted = decryptWechatDat(encrypted, key);

  expect(manualDecrypted).toEqual(autoDecrypted);
  expect(manualDecrypted).toEqual(original);
});

Deno.test("decryptWechatDat: wrong key produces different result", () => {
  const original = randomBytes(128);
  const key = 0x4B;
  const encrypted = xorEncrypt(original, key);
  const wrongDecrypted = decryptWechatDat(encrypted, 0x7F);

  expect(wrongDecrypted).not.toEqual(original);
});

Deno.test("decryptWechatDat: key is masked to 0-255", () => {
  const original = new Uint8Array([0x41, 0x42, 0x43]);
  const key = 0x100 | 0x5A; // 0x15A → masked to 0x5A
  const encrypted = xorEncrypt(original, 0x5A);
  const decrypted = decryptWechatDat(encrypted, key);

  expect(decrypted).toEqual(original);
});

Deno.test("decryptWechatDat: empty input returns empty array", () => {
  const result = decryptWechatDat(new Uint8Array(0), 0x55);
  expect(result.length).toBe(0);
});

Deno.test("decryptWechatDat: double XOR returns original", () => {
  const original = randomBytes(64);
  const key = 0x2E;
  const encrypted = decryptWechatDat(original, key); // encrypt by XOR
  const decrypted = decryptWechatDat(encrypted, key);

  expect(decrypted).toEqual(original);
});

// ─── extractXorKey ─────────────────────────────────────────────────────────────

Deno.test("extractXorKey: extracts correct key from JPG header", () => {
  const key = 0x8C;
  const encrypted = xorEncrypt(JPG_HEADER, key);
  const extracted = extractXorKey(encrypted);

  expect(extracted).toBe(key);
});

Deno.test("extractXorKey: key 0 yields 0xFF first byte", () => {
  // key=0 时加密后首字节 = 0xFF ^ 0 = 0xFF
  const encrypted = new Uint8Array([0xFF, 0x00, 0x00]);
  const key = extractXorKey(encrypted);

  expect(key).toBe(0);
});

Deno.test("extractXorKey: key 0xFF yields 0x00 first byte", () => {
  // key=0xFF 时加密后首字节 = 0xFF ^ 0xFF = 0x00
  const encrypted = new Uint8Array([0x00, 0x00, 0x00]);
  const key = extractXorKey(encrypted);

  expect(key).toBe(0xFF);
});

Deno.test("extractXorKey: various keys", () => {
  for (const key of [1, 7, 31, 64, 100, 128, 200, 255]) {
    const encrypted = new Uint8Array([(0xFF ^ key) & 0xff]);
    const extracted = extractXorKey(encrypted);
    expect(extracted).toBe(key);
  }
});

Deno.test("extractXorKey: empty input returns 0", () => {
  expect(extractXorKey(new Uint8Array(0))).toBe(0);
});

Deno.test("extractXorKey: accepts ArrayBuffer", () => {
  const key = 0x3C;
  const encrypted = xorEncrypt(JPG_HEADER, key);
  const extracted = extractXorKey(encrypted.buffer as ArrayBuffer);

  expect(extracted).toBe(key);
});

Deno.test("extractXorKey: key matches decryptWechatDatFile key", () => {
  const original = randomBytes(512);
  const key = 0xB4;
  const encrypted = xorEncrypt(original, key);

  const extractedKey = extractXorKey(encrypted);
  const { key: fileKey } = decryptWechatDatFile(encrypted);

  expect(extractedKey).toBe(fileKey);
  expect(extractedKey).toBe(key);
});
