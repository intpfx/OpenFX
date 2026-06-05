/**
 * bytes-codec — 类型安全的双向序列化协议
 *
 * 提取自 core/serve.js FrameBase.$encoder / FrameBase.$deliver（第2054-2295行）
 *
 * 核心思路：每个值都标注其原始 JS 类型，格式为 `{TypeName[key]: value}`。
 * 支持 String/Number/Boolean/Undefined/Null/ArrayBuffer/Blob/
 * Uint8Array/Int8Array/Uint16Array/Int16Array/Uint32Array/Int32Array/
 * Float32Array/Float64Array/BigInt/BigInt64Array/BigUint64Array/
 * Map/Set/Array/Object 的递归编解码。
 *
 * encode() 将任意 JS 值编码为 Uint8Array（JSON 字节序列）
 * decode() 将 Uint8Array 还原为原始 JS 值
 *
 * 适用场景：WebSocket 消息传输、跨进程/跨 Worker 通信、持久化存储。
 *
 * @module
 */

// ── 类型探测 ──

const TYPE_TAG = Object.prototype.toString;

/**
 * 获取值的实际 JS 类型字符串。
 * 对于非 Object 类型直接返回 `toString` 标签（如 "Uint8Array"），
 * 对于 Object 类型则返回 constructor.name（用于区分子类）。
 *
 * 提取自 core/serve.js FrameBase.$obType（第1997-2004行）
 */
function obType(value: unknown): string {
  const tag = TYPE_TAG.call(value);
  const type = tag.slice(8, -1);
  if (type !== "Object") return type;
  return (value as object).constructor?.name ?? "Object";
}

// ── 编码中间类型 ──

/** 编码中间格式：类型前缀 key → 序列化值 */
type EncodedMessage = Record<string, unknown>;

// ── 编码 ──

/**
 * 将任意 JS 值编码为 Uint8Array。
 *
 * 非对象值（string、number、boolean 等）会自动包装为 `{v: value}` 再编码，
 * 以便 decode 时能正确还原。对象值直接编码。
 *
 * 支持的类型（递归）：
 *   String / Number / Boolean / Null / Undefined /
 *   ArrayBuffer / BigInt / Deno.KvU64 /
 *   Blob / Uint8Array / Uint8ClampedArray / Uint16Array / Uint32Array /
 *   Int8Array / Int16Array / Int32Array / Float32Array / Float64Array /
 *   BigInt64Array / BigUint64Array /
 *   Map / Set / Array / Object
 *
 * 提取自 core/serve.js FrameBase.$encoder（第2054-2149行）
 */
export async function encode(value: unknown): Promise<Uint8Array> {
  return encodeInternal(value, false) as Promise<Uint8Array>;
}

/**
 * 内部递归编码实现。
 *
 * @param data  - 待编码的数据（顶层为任意值，递归时为 Record）
 * @param recursion - 是否为递归调用
 * @returns 顶层返回 Uint8Array，递归返回 EncodedMessage
 */
async function encodeInternal(
  data: unknown,
  recursion: boolean,
): Promise<Uint8Array | EncodedMessage> {
  // 顶层非对象值自动包装
  if (!recursion) {
    const dt = obType(data);
    if (dt === "Object" || dt === "Array" || dt === "Map" || dt === "Set") {
      return encodeInternal(data, true) as Promise<Uint8Array>;
    }
    // 基本类型包装为对象
    const wrapped: Record<string, unknown> = { v: data };
    return encodeInternal(wrapped, true) as Promise<Uint8Array>;
  }

  const record = data as Record<string, unknown>;
  const output: EncodedMessage = {};
  const promises: Promise<void>[] = [];

  for (const key of Object.keys(record)) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = record[key];
    const dt = obType(value);

    switch (dt) {
      case "Null":
      case "String":
      case "Number":
      case "Boolean": {
        output[`${dt}[${key}]`] = value;
        break;
      }

      case "Undefined": {
        output[`Undefined[${key}]`] = "undefined";
        break;
      }

      case "ArrayBuffer": {
        output[`ArrayBuffer[${key}]`] = Array.from(
          new Uint8Array(value as ArrayBuffer),
        );
        break;
      }

      case "Deno.KvU64":
      case "BigInt": {
        output[`${dt}[${key}]`] = (value as bigint).toString();
        break;
      }

      case "BigInt64Array":
      case "BigUint64Array": {
        output[`${dt}[${key}]`] = Array.from(
          value as BigInt64Array | BigUint64Array,
          (v: bigint) => Number(v),
        );
        break;
      }

      case "Blob": {
        const blob = value as Blob;
        promises.push(
          (async () => {
            const buf = await blob.arrayBuffer();
            output[`Blob[${key}]`] = Array.from(new Uint8Array(buf));
          })(),
        );
        break;
      }

      // 所有 TypedArray
      case "Uint8Array":
      case "Uint8ClampedArray":
      case "Uint16Array":
      case "Uint32Array":
      case "Int8Array":
      case "Int16Array":
      case "Int32Array":
      case "Float32Array":
      case "Float64Array": {
        output[`${dt}[${key}]`] = Array.from(value as ArrayLike<number>);
        break;
      }

      case "Map": {
        const map: Record<string, unknown> = {};
        for (const [mk, mv] of value as Map<string, unknown>) {
          map[mk] = mv;
        }
        output[`Map[${key}]`] = await encodeInternal(map, true);
        break;
      }

      case "Set": {
        const arr = Array.from(value as Set<unknown>);
        output[`Set[${key}]`] = await encodeInternal(arr, true);
        break;
      }

      case "Array": {
        // 数组转对象（索引为 key）
        const obj: Record<string, unknown> = {};
        const arr = value as unknown[];
        for (let i = 0; i < arr.length; i++) obj[i] = arr[i];
        output[`Array[${key}]`] = await encodeInternal(obj, true);
        break;
      }

      case "Object": {
        output[`Object[${key}]`] = await encodeInternal(
          value as Record<string, unknown>,
          true,
        );
        break;
      }

      default: {
        throw new Error(
          `bytes-codec: 不支持的数据类型 "${dt}" (key: "${key}")`,
        );
      }
    }
  }

  await Promise.all(promises);

  if (recursion) {
    return output;
  }
  return new TextEncoder().encode(JSON.stringify(output));
}

// ── 解码 ──

/**
 * 将 encode() 编码的 Uint8Array 还原为原始 JS 值。
 *
 * 如果编码时自动包装了非对象值（{v: ...}），解码时会自动解包。
 *
 * 输入也可以是 Blob 或已解析的 EncodedMessage（递归模式，内部使用）。
 *
 * 提取自 core/serve.js FrameBase.$deliver（第2206-2295行）
 */
export async function decode(data: Uint8Array): Promise<unknown> {
  const result = await decodeInternal(data, false);
  // 自动解包：如果结果只有一个 key "v"，说明原始值是基本类型
  if (
    result !== null &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    !(result instanceof Map) &&
    !(result instanceof Set)
  ) {
    const keys = Object.keys(result);
    if (keys.length === 1 && keys[0] === "v") {
      return (result as Record<string, unknown>).v;
    }
  }
  return result;
}

/**
 * 内部递归解码实现。
 *
 * @param data      - 编码后的数据
 * @param recursion - 是否为递归调用
 * @returns 还原后的键值对象
 */
async function decodeInternal(
  data: Uint8Array | Blob | EncodedMessage,
  recursion: boolean,
): Promise<Record<string, unknown>> {
  let input: Record<string, unknown>;

  if (data instanceof Blob) {
    const buf = await data.arrayBuffer();
    input = JSON.parse(new TextDecoder().decode(buf));
  } else if (recursion) {
    input = data as EncodedMessage;
  } else {
    input = JSON.parse(new TextDecoder().decode(data as Uint8Array));
  }

  const items = Object.keys(input).filter((k) => k.endsWith("]"));
  const output: Record<string, unknown> = {};

  for (const key of items) {
    // key 形如 "TypeName[propertyName]"
    const bracketIdx = key.indexOf("[");
    const dataType = key.slice(0, bracketIdx);
    const newKey = key.slice(bracketIdx + 1, -1);
    const raw = input[key];

    let newValue: unknown;

    switch (dataType) {
      case "String":
      case "Number":
      case "Boolean": {
        newValue = raw;
        break;
      }
      case "Null": {
        newValue = null;
        break;
      }
      case "Undefined": {
        newValue = undefined;
        break;
      }
      case "ArrayBuffer": {
        newValue = new Uint8Array(raw as number[]).buffer;
        break;
      }
      case "Deno.KvU64":
      case "BigInt": {
        newValue = BigInt(raw as string);
        break;
      }
      case "BigInt64Array":
      case "BigUint64Array": {
        const Ctor = globalThis[dataType as keyof typeof globalThis] as
          | BigInt64ArrayConstructor
          | BigUint64ArrayConstructor
          | undefined;
        if (Ctor) {
          newValue = new Ctor((raw as number[]).map((v) => BigInt(v)));
        } else {
          newValue = raw;
        }
        break;
      }
      case "Blob": {
        newValue = new Blob([new Uint8Array(raw as number[])]);
        break;
      }
      case "Map": {
        const transient = await decodeInternal(raw as EncodedMessage, true);
        newValue = new Map(Object.entries(transient));
        break;
      }
      case "Set": {
        const transient = await decodeInternal(raw as EncodedMessage, true);
        newValue = new Set(Object.values(transient));
        break;
      }
      case "Array": {
        const transient = await decodeInternal(raw as EncodedMessage, true);
        newValue = Object.values(transient);
        break;
      }
      case "Object": {
        newValue = await decodeInternal(raw as EncodedMessage, true);
        break;
      }
      case "Uint8Array":
      case "Uint8ClampedArray":
      case "Uint16Array":
      case "Uint32Array":
      case "Int8Array":
      case "Int16Array":
      case "Int32Array":
      case "Float32Array":
      case "Float64Array": {
        const Ctor = globalThis[dataType as keyof typeof globalThis] as
          | Uint8ArrayConstructor
          | Uint8ClampedArrayConstructor
          | Uint16ArrayConstructor
          | Uint32ArrayConstructor
          | Int8ArrayConstructor
          | Int16ArrayConstructor
          | Int32ArrayConstructor
          | Float32ArrayConstructor
          | Float64ArrayConstructor
          | undefined;
        newValue = Ctor ? new Ctor(raw as number[]) : raw;
        break;
      }
      default: {
        // 未知类型原样返回
        newValue = raw;
        break;
      }
    }

    output[newKey] = newValue;
  }

  return output;
}
