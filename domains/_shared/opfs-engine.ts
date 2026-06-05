/**
 * opfs-engine — OPFS（Origin Private File System）浏览器文件存储引擎
 *
 * from intpfx/esn (Edge Storage Node) — DataEngine
 *
 * 在浏览器沙箱内提供完整的文件存储能力——增删改查、元数据追踪、存储容量
 * 管理、文件过滤搜索。所有数据仅对当前 origin 可见，不会离开浏览器。
 *
 * 使用方式：
 *
 * ```ts
 * import { createOpfsEngine } from "./opfs-engine.ts";
 *
 * const engine = await createOpfsEngine();
 *
 * // 写入文件
 * const blob = new Blob(["hello world"]);
 * await engine.set("hello.txt", blob);
 *
 * // 读取文件
 * const file = await engine.get("hello.txt");
 *
 * // 搜索文件（按后缀）
 * const images = await engine.get({ endsWith: ".png" });
 *
 * // 删除文件
 * await engine.delete("hello.txt");
 *
 * // 查看存储用量
 * const { quota, usage } = await engine.capacity();
 * ```
 *
 * 注意：OPFS 仅在安全上下文（HTTPS / localhost）中可用，需要用户
 * 交互授权后才能写入。
 *
 * @module
 */

// ── 类型定义 ──

export interface FileMeta {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  private: boolean;
  price: number;
  whiteList: string[];
  secretKey: string | null;
  owner: string;
}

export interface StorageInfo {
  uuid: string;
  key: string;
  map: Record<string, FileMeta>;
  quota: string;
  usage: string;
  private: boolean;
  adspace: string;
}

export interface FileFilter {
  startsWith?: string;
  endsWith?: string;
  includes?: string;
  limit?: number;
}

export interface OpfsEngine {
  /** 获取存储信息（含元数据 map） */
  info: () => Promise<StorageInfo>;

  /** 获取存储容量信息 */
  capacity: () => Promise<{ quota: string; usage: string }>;

  /** 设置 UUID */
  setUuid: (uuid: string) => Promise<void>;

  /** 写入文件（第二个参数为 Blob 或可 JSON 序列化的值） */
  set: (key: string, value: Blob | unknown, owner?: string) => Promise<{ type: string }>;

  /** 删除文件 */
  delete: (key: string) => Promise<{ type: string }>;

  /** 清空所有文件 */
  clear: () => Promise<{ type: string }>;

  /** 读取单个文件 */
  get: (key: string) => Promise<File>;

  /** 读取多个文件（按 key 列表） */
  getMany: (...keys: string[]) => Promise<Record<string, File>>;

  /** 列出所有文件 */
  getAll: () => Promise<Record<string, File>>;

  /** 按条件过滤文件 */
  getFiltered: (filter: FileFilter) => Promise<Record<string, File>>;

  /** 请求数据持久化 */
  persist: () => Promise<{ type: string; reason: string }>;

  /** 检查数据是否已持久化 */
  persisted: () => Promise<{ type: string; reason: string }>;
}

// ── 工具函数 ──

/** 容量数值转人类可读字符串 */
const formatBytes = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(2)} ${units[idx]}`;
};

// ── 常量 ──

const META_FILENAME = ".info";
const DEFAULT_UUID = "00000000-0000-0000-0000-000000000000";

// ── 引擎创建 ──

/**
 * 创建 OPFS 文件存储引擎
 *
 * 需要浏览器支持 OPFS（Chrome 86+ / Edge 86+ / Firefox 111+）。
 * 在不支持的环境下会 reject。
 */
export const createOpfsEngine = async (): Promise<OpfsEngine> => {
  const root = await navigator.storage.getDirectory();
  const errorLog: unknown[] = [];

  const readOpfsFile = async (name: string): Promise<File> => {
    try {
      const handle = await root.getFileHandle(name);
      return await handle.getFile();
    } catch {
      return new File([], name);
    }
  };

  const writeOpfsFile = async (
    name: string,
    data: Blob | Uint8Array,
  ): Promise<void> => {
    const handle = await root.getFileHandle(name, { create: true });
    const payload = data instanceof Blob
      ? new Uint8Array(await data.arrayBuffer())
      : data;
    const access = await (handle as any).createSyncAccessHandle?.()
      ?? await handle.createWritable();
    await access.truncate(0);
    await access.write(payload);
    await access.flush?.();
    await access.close();
  };

  const createDefaultMeta = async (uuid?: string): Promise<StorageInfo> => {
    const { quota, usage } = await navigator.storage.estimate();
    return {
      uuid: uuid ?? DEFAULT_UUID,
      key: "",
      map: {},
      quota: formatBytes(quota ?? 0),
      usage: formatBytes(usage ?? 0),
      private: true,
      adspace: "",
    };
  };

  // 读取或初始化元数据
  const loadStorageMeta = async (uuid?: string): Promise<StorageInfo> => {
    const file = await readOpfsFile(META_FILENAME);
    if (file.size === 0) {
      const meta = await createDefaultMeta(uuid);
      await writeOpfsFile(META_FILENAME, new TextEncoder().encode(JSON.stringify(meta)));
      return meta;
    }
    return JSON.parse(await file.text());
  };

  const saveStorageMeta = async (
    meta: StorageInfo,
    extra?: { deleteKey?: string; setKey?: string; setInfo?: FileMeta },
  ): Promise<StorageInfo> => {
    const { quota, usage } = await navigator.storage.estimate();
    meta.quota = formatBytes(quota ?? 0);
    meta.usage = formatBytes(usage ?? 0);

    if (extra?.deleteKey) {
      delete meta.map[extra.deleteKey];
    }
    if (extra?.setKey && extra?.setInfo) {
      meta.map[extra.setKey] = extra.setInfo;
    }

    await writeOpfsFile(META_FILENAME, new TextEncoder().encode(JSON.stringify(meta)));
    return meta;
  };

  // ── 构建引擎 ──

  let meta = await loadStorageMeta();

  const engine: OpfsEngine = {
    info: async () => meta,

    capacity: async () => {
      const { quota, usage } = await navigator.storage.estimate();
      return {
        quota: formatBytes(quota ?? 0),
        usage: formatBytes(usage ?? 0),
      };
    },

    setUuid: async (uuid: string) => {
      meta.uuid = uuid;
      await writeOpfsFile(META_FILENAME, new TextEncoder().encode(JSON.stringify(meta)));
    },

    set: async (key, value, owner) => {
      const payload = value instanceof Blob
        ? value
        : new Blob([JSON.stringify(value)]);

      await writeOpfsFile(key, payload);

      if (key !== META_FILENAME) {
        const file = await readOpfsFile(key);
        const fileMeta: FileMeta = {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          private: true,
          price: 0,
          whiteList: [],
          secretKey: null,
          owner: owner ?? meta.uuid,
        };
        meta = await saveStorageMeta(meta, { setKey: key, setInfo: fileMeta });
      }

      return { type: "set_success" };
    },

    delete: async (key) => {
      try {
        await root.removeEntry(key);
        meta = await saveStorageMeta(meta, { deleteKey: key });
        return { type: "delete_success" };
      } catch (err) {
        logs.push(err);
        return { type: "delete_fail" };
      }
    },

    clear: async () => {
      try {
        const uuid = meta.uuid;
        await root.remove({ recursive: true });
        meta = await loadStorageMeta(uuid);
        return { type: "clear_success" };
      } catch (err) {
        logs.push(err);
        return { type: "clear_fail" };
      }
    },

    get: (key) => readOpfsFile(key),

    getMany: async (...keys) => {
      const output: Record<string, File> = {};
      for (const key of keys) {
        output[key] = await readOpfsFile(key);
      }
      return output;
    },

    getAll: async () => {
      const output: Record<string, File> = {};
      for await (const [name, handle] of root.entries()) {
        output[name] = await (handle as FileSystemFileHandle).getFile();
      }
      return output;
    },

    getFiltered: async (filter) => {
      const { startsWith = "", endsWith = "", includes = "", limit = Infinity } = filter;
      const output: Record<string, File> = {};
      for await (const [name, handle] of root.entries()) {
        if (startsWith && !name.startsWith(startsWith)) continue;
        if (endsWith && !name.endsWith(endsWith)) continue;
        if (includes && !name.includes(includes)) continue;
        output[name] = await (handle as FileSystemFileHandle).getFile();
        if (Object.keys(output).length >= limit) break;
      }
      return output;
    },

    persist: async () => {
      const result = await navigator.storage.persist();
      return result
        ? { type: "success", reason: "数据持久化请求成功" }
        : { type: "error", reason: "数据持久化请求失败" };
    },

    persisted: async () => {
      const result = await navigator.storage.persisted();
      return result
        ? { type: "success", reason: "数据持久化已授权" }
        : { type: "error", reason: "数据持久化未授权" };
    },
  };

  return engine;
};
