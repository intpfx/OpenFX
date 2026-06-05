/**
 * 微信 .dat 文件解密模块
 *
 * 来源: hiverepo git 历史
 * 原始文件: modules/decrypt_wechat_datfile.js
 * 原始 commit: cede623 (restart) — Verses 0.9.x 时期
 * 仓库: https://github.com/... (hiverepo)
 *
 * 算法说明:
 * 微信 PC 端将接收到的图片文件（JPG 等）异或加密后以 .dat 后缀存储。
 * JPG 文件头第一个字节固定为 0xFF (255)，将加密文件的第一个字节与 0xFF
 * 异或即可得到密钥，再用该密钥异或整个文件即可还原。
 *
 * 重构要点:
 * - 移除 Deno 特定 API（Deno.readDirSync, Deno.readFileSync 等）
 * - 纯函数式设计，仅操作内存中的字节数据
 * - 完整的 TypeScript 类型注解
 */

/** 解密结果，包含解密后的数据和提取的异或密钥 */
export interface DecryptResult {
  /** 解密后的数据 */
  decrypted: Uint8Array;
  /** 从文件头提取的异或密钥 (0-255) */
  key: number;
}

/** JPG 文件魔数首字节 */
const JPG_MAGIC_FIRST_BYTE = 0xff;

/**
 * 将输入归一化为 Uint8Array
 */
function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

/**
 * 解密微信 .dat 文件（内存版本）
 *
 * 从加密数据中提取异或密钥并解密全部内容。
 * 假设加密前的原始文件为 JPG 格式（首字节 0xFF）。
 *
 * @param input - 加密的 .dat 文件内容（ArrayBuffer 或 Uint8Array）
 * @returns 包含解密后数据和密钥的结果对象
 *
 * @example
 * ```ts
 * const encrypted = await Deno.readFile('image.dat');
 * const { decrypted, key } = decryptWechatDatFile(encrypted);
 * await Deno.writeFile('image.jpg', decrypted);
 * console.log(`XOR key: ${key}`);
 * ```
 */
export function decryptWechatDatFile(
  input: ArrayBuffer | Uint8Array,
): DecryptResult {
  const data = toUint8Array(input);

  if (data.length === 0) {
    return { decrypted: new Uint8Array(0), key: 0 };
  }

  // 提取密钥: JPG 首字节 0xFF XOR 加密文件首字节
  const key = (JPG_MAGIC_FIRST_BYTE ^ data[0]) & 0xff;

  // 全文明文异或解密
  const decrypted = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    decrypted[i] = (data[i] ^ key) & 0xff;
  }

  return { decrypted, key };
}

/**
 * 使用已知密钥解密微信 .dat 数据
 *
 * 当密钥已通过其他方式获取时，可直接调用此函数进行解密。
 *
 * @param input - 加密数据
 * @param key - 异或密钥 (0-255)
 * @returns 解密后的数据
 */
export function decryptWechatDat(
  input: ArrayBuffer | Uint8Array,
  key: number,
): Uint8Array {
  const data = toUint8Array(input);
  const keyByte = key & 0xff;
  const decrypted = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    decrypted[i] = (data[i] ^ keyByte) & 0xff;
  }
  return decrypted;
}

/**
 * 从加密数据中提取异或密钥
 *
 * 假设原始文件为 JPG 格式，首字节固定为 0xFF。
 *
 * @param input - 加密数据（至少 1 字节）
 * @returns 异或密钥 (0-255)
 */
export function extractXorKey(input: ArrayBuffer | Uint8Array): number {
  const data = toUint8Array(input);
  if (data.length === 0) return 0;
  return (JPG_MAGIC_FIRST_BYTE ^ data[0]) & 0xff;
}
