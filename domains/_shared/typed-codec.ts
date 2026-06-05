/**
 * typed-codec — 类型感知的 JS 序列化/反序列化工具
 *
 * from intpfx/esn (Edge Storage Node) — typed encoder/decoder
 *
 * JSON 无法直接表达 Map、Set、BigInt、Blob、TypedArray 等 JS 类型。
 * 本模块通过类型前缀 key（如 `String[name]`、`Blob[data]`）在 JSON 中
 * 保留类型信息，实现任意 JS 数据的可靠传输。
 *
 * 适用场景：WebSocket 消息序列化、跨进程通信、localStorage 存储复杂类型。
 *
 * @module
 */

// ── 类型探测 ──

const TYPE_TAG = Object.prototype.toString;

/** 获取值的实际 JS 类型字符串（如 "Map"、"Uint8Array"） */
export const getJsType = (value: unknown): string => {
  const tag = TYPE_TAG.call(value);
  const type = tag.slice(8, -1);
  if (type !== "Object") return type;
  return (value as object).constructor?.name ?? "Object";
};

// ── 编码 ──

/** 编码中间格式 — 类型前缀 key 到序列化值的映射 */
export type EncodedMessage = Record<string, unknown>;

/**
 * 将任意 JS 数据编码为 JSON 兼容的格式（保留类型信息）
 *
 * 顶层返回 Uint8Array（JSON 编码后的字节序列）
 * 递归时返回 EncodedMessage（中间对象格式）
 *
 * 支持类型：
 *   String / Number / Boolean / Null / Undefined
 *   ArrayBuffer / BigInt / Deno.KvU64
 *   Blob / Uint8Array / 其他 TypedArray
 *   Map / Set / Array / Object
 */
export const encode = async (
  data: Record<string, unknown>,
  recursion = false,
): Promise<Uint8Array | EncodedMessage> => {
  const output: EncodedMessage = {};
  const promises: Promise<void>[] = [];

  for (const key of Object.keys(data)) {
    const value = data[key];
    const dt = getJsType(value);

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
        output[`ArrayBuffer[${key}]`] = Array.from(new Uint8Array(value as ArrayBuffer));
        break;
      }

      case "Deno.KvU64":
      case "BigInt": {
        output[`${dt}[${key}]`] = (value as BigInt).toString();
        break;
      }

      case "BigInt64Array":
      case "BigUint64Array": {
        output[`${dt}[${key}]`] = Array.from(
          value as BigInt64Array | BigUint64Array,
          (v: BigInt) => Number(v),
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

      // 所有 TypedArray（含 Uint8Array、Float64Array 等）
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
        output[`Map[${key}]`] = await encode(map, true);
        break;
      }

      case "Set": {
        const arr = Array.from(value as Set<unknown>);
        output[`Set[${key}]`] = await encode(arr, true);
        break;
      }

      case "Array": {
        // 数组转对象（索引为 key）
        const obj: Record<string, unknown> = {};
        const arr = value as unknown[];
        for (let i = 0; i < arr.length; i++) obj[i] = arr[i];
        output[`Array[${key}]`] = await encode(obj, true);
        break;
      }

      case "Object": {
        output[`Object[${key}]`] = await encode(value as Record<string, unknown>, true);
        break;
      }

      default: {
        throw new Error(`typed-codec: 不支持的数据类型 "${dt}" (key: "${key}")`);
      }
    }
  }

  await Promise.all(promises);
  return recursion ? output : new TextEncoder().encode(JSON.stringify(output));
};

// ── 解码 ──

/**
 * 将 encode() 编码的数据还原为原始的 JS 类型
 *
 * 输入：Uint8Array（JSON 字节）、Blob、或已解析的 EncodedMessage（递归模式）
 * 返回：还原后的键值对象
 */
export const decode = async (
  data: Uint8Array | Blob | EncodedMessage,
  recursion = false,
): Promise<Record<string, unknown>> => {
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
    const bracketIdx = key.indexOf("[");
    const dataType = key.slice(0, bracketIdx);
    const newKey = key.slice(bracketIdx + 1, -1);
    const raw = input[key];

    let newValue: unknown;

    switch (dataType) {
      case "String": {
        newValue = raw;
        break;
      }
      case "Number": {
        newValue = raw;
        break;
      }
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
        newValue = new globalThis[dataType as keyof typeof globalThis](
          (raw as number[]).map((v: number) => BigInt(v)),
        );
        break;
      }
      case "Blob": {
        newValue = new Blob([new Uint8Array(raw as number[])]);
        break;
      }
      case "Map": {
        const transient = await decode(raw as EncodedMessage, true);
        newValue = new Map(Object.entries(transient));
        break;
      }
      case "Set": {
        const transient = await decode(raw as EncodedMessage, true);
        newValue = new Set(Object.values(transient));
        break;
      }
      case "Array": {
        const transient = await decode(raw as EncodedMessage, true);
        newValue = Object.values(transient);
        break;
      }
      case "Object": {
        newValue = await decode(raw as EncodedMessage, true);
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
        newValue = new globalThis[dataType as keyof typeof globalThis](raw as number[]);
        break;
      }
      default: {
        newValue = raw;
        break;
      }
    }

    output[newKey] = newValue;
  }

  return output;
};
