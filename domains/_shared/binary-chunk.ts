/**
 * binary-chunk — 二进制分片分离器
 *
 * from core/serve.js (ProxyServer.Agent.$decompose, ~L2155-2200)
 *
 * 用 4 个连续 0xFF 字节作为分隔标记，将混合二进制数据流分离为头部（JSON）和
 * 数据体。典型场景：WebSocket 接收到的混合二进制消息中，前段是 JSON 元数据，
 * 后段是实际的二进制负载（如图片、音频等），通过 4 个 0xFF 分隔。
 *
 * 使用方式：
 *
 * ```ts
 * import { decompose } from "./binary-chunk.ts";
 *
 * const mixed = new Uint8Array([...jsonBytes, 0xFF, 0xFF, 0xFF, 0xFF, ...binaryBody]);
 * const { decomposed, undecomposed } = decompose(mixed);
 * // decomposed   → Uint8Array (JSON 头部)
 * // undecomposed → Uint8Array | null (二进制体)
 * ```
 *
 * @module
 */

// ── 类型定义 ──

/**
 * 分解结果
 *
 * - `decomposed`：分隔标记之前的头部数据（通常是 JSON 字节序列）
 * - `undecomposed`：分隔标记之后的数据体；若无分隔标记则为 null
 */
export interface DecomposeResult {
  /** 分隔标记之前的部分（头部数据） */
  decomposed: Uint8Array;
  /** 分隔标记之后的部分（数据体），未找到分隔标记时为 null */
  undecomposed: Uint8Array | null;
}

// ── 内部工具 ──

/**
 * 获取值的 JS 类型字符串（如 "Blob"、"Uint8Array"、"ArrayBuffer"）
 *
 * 从 serve.js Agent.$obType 内联提取。
 */
const getJsType = (value: unknown): string => {
  const tag = Object.prototype.toString.call(value);
  const type = tag.slice(8, -1);
  if (type !== "Object") return type;
  return (value as object).constructor?.name ?? "Object";
};

/**
 * 分隔标记：4 个连续的 0xFF 字节
 */
const DELIMITER: readonly number[] = [0xff, 0xff, 0xff, 0xff];

// ── 导出函数 ──

/**
 * 分解混合二进制数据流
 *
 * 扫描输入数据，找到 4 个连续 0xFF 字节作为分隔标记，将数据分为两部分：
 *
 * - `decomposed`：分隔标记之前的字节（不包含分隔标记本身）
 * - `undecomposed`：分隔标记之后的字节；若未找到分隔标记则为 null
 *
 * 接受 Blob、ArrayBuffer 或 Uint8Array。Blob 和 ArrayBuffer 会先转换为
 * Uint8Array 进行处理。
 *
 * > 来自 serve.js ProxyServer.Agent.$decompose（~L2155-2200），
 * > 提取为独立纯函数。
 *
 * @param input - 待分解的二进制数据
 * @returns 分解结果，包含头部和数据体两部分
 * @throws {Error} 当输入类型不受支持时抛出
 *
 * @example
 * ```ts
 * // 构造一个混合二进制数据（JSON 头 + 分隔标记 + 二进制体）
 * const header = new TextEncoder().encode('{"type":"image"}');
 * const body = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG 头
 * const combined = new Uint8Array([...header, 0xff, 0xff, 0xff, 0xff, ...body]);
 *
 * const { decomposed, undecomposed } = decompose(combined);
 * console.log(new TextDecoder().decode(decomposed)); // '{"type":"image"}'
 * console.log(undecomposed); // Uint8Array([0x89, 0x50, 0x4e, 0x47])
 * ```
 */
export const decompose = async (
  input: Uint8Array | ArrayBuffer | Blob,
): Promise<DecomposeResult> => {
  // 统一转换为 Uint8Array
  let data: Uint8Array;
  const dataType = getJsType(input);

  switch (dataType) {
    case "Blob": {
      data = new Uint8Array(await (input as Blob).arrayBuffer());
      break;
    }
    case "ArrayBuffer": {
      data = new Uint8Array(input as ArrayBuffer);
      break;
    }
    case "Uint8Array": {
      data = input as Uint8Array;
      break;
    }
    default: {
      throw new Error(
        `分解资产时出错 - 不支持的参数类型: ${dataType}`,
      );
    }
  }

  // 扫描 4 个连续 0xFF 字节
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === DELIMITER[count]) {
      count++;
      if (count === DELIMITER.length) {
        // 找到完整分隔标记：data[i-3..i] 是四个 0xFF
        return {
          decomposed: data.slice(0, i - 3), // 分隔标记之前的部分
          undecomposed: data.slice(i + 1), // 分隔标记之后的部分
        };
      }
    } else {
      count = 0;
      // 优化：倒数第二个元素为 0xFF 时会导致逃逸 for 循环，
      // 此时在此返回（与原始实现一致的边界处理）
      if (i === data.length - 2) {
        return { decomposed: data, undecomposed: null };
      }
    }
  }

  // 未找到完整分隔标记
  return { decomposed: data, undecomposed: null };
};
