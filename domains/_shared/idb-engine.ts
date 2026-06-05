/**
 * idb-engine — IndexedDB 原子操作引擎
 *
 * from core/serve.js (ProxyServer.Agent.opDataBase + .atomic, ~L919-1601)
 *
 * 在浏览器 IndexedDB 之上提供纯函数风格的 CRUD 抽象层：
 *
 * - 自动创建/升级数据库和 stores
 * - 统一的事务管理（readonly / readwrite）
 * - 类型安全的泛型操作（add / put / get / getAll / getByIndex / delete / clear）
 * - 数据库生命周期管理（open / close / destroy）
 *
 * 注意：仅在浏览器环境（安全上下文）中可用。IndexedDB 不是 Node.js 的标准 API。
 *
 * 使用方式：
 *
 * ```ts
 * import { openDatabase, add, get, getAll, delete_, closeDatabase, destroyDatabase } from "./idb-engine.ts";
 *
 * // 定义 stores 结构
 * const stores: StoreSchema[] = [
 *   { name: "users", id: "email", auto: false, indexes: [{ name: "ageIdx", key: "age", unique: false }] },
 * ];
 *
 * // 打开数据库（自动创建/升级）
 * const { db, nextVersion } = await openDatabase({ dbName: "myApp", version: 1, stores });
 *
 * // 写入数据
 * await add(db, "users", { email: "alice@example.com", name: "Alice", age: 30 });
 *
 * // 按主键读取
 * const { content: user } = await get<{ email: string; name: string; age: number }>(db, "users", "alice@example.com");
 *
 * // 全量读取
 * const { content: allUsers } = await getAll(db, "users");
 *
 * // 按索引读取
 * const { content: byAge } = await getByIndex(db, "users", "ageIdx", 30);
 *
 * // 删除
 * await delete_(db, "users", "alice@example.com");
 *
 * // 关闭 / 销毁
 * closeDatabase(db);
 * await destroyDatabase("myApp");
 * ```
 *
 * @module
 */

// ── 类型定义 ──

/** 索引定义 */
export interface IndexSchema {
  /** 索引名称 */
  name: string;
  /** 索引字段 key */
  key: string;
  /** 是否唯一索引 */
  unique: boolean;
}

/** Store（对象仓库）定义 */
export interface StoreSchema {
  /** store 名称 */
  name: string;
  /** 主键字段名 */
  id: string;
  /** 主键是否自增 */
  auto: boolean;
  /** 索引列表 */
  indexes: IndexSchema[];
}

/** openDatabase 配置 */
export interface OpenDatabaseConfig {
  /** 数据库名称（默认 "database"） */
  dbName?: string;
  /** 数据库版本号（默认 1） */
  version?: number;
  /** Stores 定义 */
  stores?: StoreSchema[];
}

/** openDatabase 返回值 */
export interface OpenDatabaseResult {
  /** IndexedDB 数据库实例 */
  db: IDBDatabase;
  /** 下一个可用版本号（用于后续升级） */
  nextVersion: number;
}

/** 数据库操作结果（统一返回格式） */
export interface IDBResult<T = unknown> {
  /** 操作返回的内容 */
  content: T;
  /** 操作状态 */
  status: string;
}

// ── 默认 stores ──

/** 源码默认 stores 配置（serve.js 中 opDataBase 的默认值） */
export const DEFAULT_STORES: StoreSchema[] = [
  { name: "infos", id: "key", auto: false, indexes: [] },
  { name: "libs", id: "key", auto: false, indexes: [] },
  { name: "coins", id: "key", auto: false, indexes: [] },
  { name: "assets", id: "key", auto: false, indexes: [] },
  { name: "nodes", id: "key", auto: false, indexes: [] },
];

// ── 内部工具 ──

/** 跨浏览器获取 IndexedDB API */
const getIndexedDB = (): IDBFactory => {
  const g = globalThis as Record<string, unknown>;
  return (g.indexedDB ||
    g.mozIndexedDB ||
    g.webkitIndexedDB ||
    g.msIndexedDB) as IDBFactory;
};

/** 参数校验 → 不合法的快捷返回 */
const validate = (...args: unknown[]): IDBResult | null => {
  for (const arg of args) {
    if (typeof arg === "undefined") {
      return { content: "参数不合法", status: "error" };
    }
  }
  return null;
};

/**
 * Promise 化 IndexedDB 请求
 *
 * 将 IDBRequest 的 onsuccess / onerror 转换为 Promise。
 */
const promisifyRequest = <T>(request: IDBRequest<T>): Promise<IDBResult<T>> =>
  new Promise((resolve, reject) => {
    request.onsuccess = (event) => {
      resolve({
        content: (event.target as IDBRequest<T>).result,
        status: event.type,
      });
    };
    request.onerror = (event) => {
      reject({
        content: (event.target as IDBRequest<T>).result,
        status: event.type,
      });
    };
  });

// ── 数据库生命周期 ──

/**
 * 打开（或创建）IndexedDB 数据库
 *
 * 自动处理：
 * - 数据库不存在 → 创建数据库和所有 stores + 索引
 * - 数据库存在且 stores 结构匹配 → 直接打开
 * - 数据库存在但 stores 结构变化 → 升级（删除旧 store，创建新 store）
 *
 * > 来自 serve.js ProxyServer.Agent.opDataBase（~L919-1071）
 *
 * @param config - 数据库配置
 * @returns 数据库实例和下一个版本号
 *
 * @example
 * ```ts
 * const { db, nextVersion } = await openDatabase({
 *   dbName: "myApp",
 *   version: 1,
 *   stores: [{ name: "users", id: "id", auto: true, indexes: [] }],
 * });
 * ```
 */
export const openDatabase = (
  config: OpenDatabaseConfig = {},
): Promise<OpenDatabaseResult> => {
  const {
    dbName = "database",
    version = 1,
    stores = DEFAULT_STORES,
  } = config;

  return new Promise((resolve) => {
    const indexedDB = getIndexedDB();
    const request = indexedDB.open(dbName, version);

    // 打开成功
    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 绑定生命周期事件（与原实现一致）
      db.onabort = (ev) => console.log("数据库中止", ev);
      db.onclose = (ev) => console.log("数据库关闭", ev);
      db.onerror = (ev) => console.log("数据库报错", ev);
      db.onversionchange = (ev) => {
        // 数据库被销毁后触发
        const g = globalThis as Record<string, ((r: unknown) => void) | undefined>;
        if (g.destroyPromiseResolve) {
          g.destroyPromiseResolve({
            content: "数据库已被摧毁",
            status: "success",
          });
          delete g.destroyPromiseResolve;
        }
        console.log("数据库版本变化", ev);
      };

      // 比较现有 stores 与目标 stores 是否一致
      const existingNames = Array.from(db.objectStoreNames).sort();
      const targetNames = stores.map((s) => s.name).sort();
      const isEqual = existingNames.toString() === targetNames.toString();

      resolve({
        db,
        nextVersion: isEqual ? version : version + 1,
      });
    };

    // 打开失败
    request.onerror = (event) => {
      console.log("数据库打开报错", event);
      resolve({ nextVersion: version + 1 } as OpenDatabaseResult);
    };

    // 创建或升级（首次打开 / 版本号变化时触发）
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const existingNames = db.objectStoreNames;

      if (existingNames.length === 0) {
        // ── 首次创建：创建所有 stores ──
        for (const store of stores) {
          const objectStore = db.createObjectStore(store.name, {
            keyPath: store.id,
            autoIncrement: store.auto,
          });
          for (const index of store.indexes) {
            objectStore.createIndex(index.name, index.key, {
              unique: index.unique,
            });
          }
        }
        resolve({ db, nextVersion: version });
        return;
      }

      // ── 升级：计算需要删除/新增的 stores ──
      const targetNames = stores.map((s) => s.name);
      const noChangeList: string[] = [];
      const deleteList: string[] = [];

      for (const name of existingNames) {
        if (targetNames.includes(name)) {
          noChangeList.push(name);
        } else {
          deleteList.push(name);
        }
      }

      const addList = targetNames.filter((n) => !noChangeList.includes(n));

      // 删除过时的 stores
      for (const name of deleteList) {
        db.deleteObjectStore(name);
      }

      // 创建新增的 stores
      for (const store of stores) {
        if (addList.includes(store.name)) {
          const objectStore = db.createObjectStore(store.name, {
            keyPath: store.id,
            autoIncrement: store.auto,
          });
          for (const index of store.indexes) {
            objectStore.createIndex(index.name, index.key, {
              unique: index.unique,
            });
          }
        }
      }

      resolve({ db, nextVersion: version });
    };
  });
};

/**
 * 关闭数据库连接
 *
 * > 来自 serve.js atomic case "close"（~L1529-1542）
 *
 * @param db - 数据库实例
 * @returns 操作结果
 */
export const closeDatabase = (db: IDBDatabase): IDBResult => {
  const err = validate(db);
  if (err) return err;

  db.close();
  return { content: "数据库已关闭", status: "success" };
};

/**
 * 销毁数据库
 *
 * 删除整个 IndexedDB 数据库（包括所有 stores 和数据）。
 * 会触发已打开连接的 `onversionchange` 事件。
 *
 * > 来自 serve.js atomic case "destroy"（~L1576-1591）
 *
 * @param dbName - 要销毁的数据库名称
 * @returns 操作结果
 */
export const destroyDatabase = (dbName: string): Promise<IDBResult> => {
  const err = validate(dbName);
  if (err) return Promise.resolve(err);

  return new Promise((resolve) => {
    const indexedDB = getIndexedDB();
    indexedDB.deleteDatabase(dbName);
    (globalThis as Record<string, (r: unknown) => void>).destroyPromiseResolve =
      resolve;
  });
};

// ── 读操作 ──

/**
 * 按主键读取单条记录
 *
 * > 来自 serve.js atomic case "get"（~L1234-1265）
 *
 * @param db - 数据库实例
 * @param storeName - store 名称
 * @param key - 主键值
 * @returns 包含 content（记录值或 undefined）的结果
 *
 * @example
 * ```ts
 * const { content } = await get<MyType>(db, "users", "user-123");
 * ```
 */
export const get = <T = unknown>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<IDBResult<T | undefined>> => {
  const err = validate(db, storeName, key);
  if (err) return Promise.resolve(err);

  return promisifyRequest<T>(
    db.transaction([storeName], "readonly")
      .objectStore(storeName)
      .get(key),
  );
};

/**
 * 获取数据库中所有 stores 的名称列表
 *
 * > 来自 serve.js atomic case "getStores"（~L1267-1280）
 *
 * @param db - 数据库实例
 * @returns store 名称数组
 */
export const getStores = (db: IDBDatabase): IDBResult<string[]> => {
  const err = validate(db);
  if (err) return err;

  const stores = Array.from(db.objectStoreNames).sort();
  return { content: stores, status: "success" };
};

/**
 * 获取 store 中的所有记录
 *
 * > 来自 serve.js atomic case "getAll"（~L1282-1312）
 *
 * @param db - 数据库实例
 * @param storeName - store 名称
 * @returns 包含所有记录的结果
 *
 * @example
 * ```ts
 * const { content } = await getAll<MyType>(db, "users");
 * ```
 */
export const getAll = <T = unknown>(
  db: IDBDatabase,
  storeName: string,
): Promise<IDBResult<T[]>> => {
  const err = validate(db, storeName);
  if (err) return Promise.resolve(err);

  return promisifyRequest<T[]>(
    db.transaction([storeName], "readonly")
      .objectStore(storeName)
      .getAll(),
  );
};

/**
 * 按索引读取单条记录
 *
 * > 来自 serve.js atomic case "getByIndex"（~L1387-1420）
 *
 * @param db - 数据库实例
 * @param storeName - store 名称
 * @param indexName - 索引名称
 * @param indexValue - 索引值
 * @returns 包含匹配记录的结果
 */
export const getByIndex = <T = unknown>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  indexValue: IDBValidKey,
): Promise<IDBResult<T | undefined>> => {
  const err = validate(db, storeName, indexName, indexValue);
  if (err) return Promise.resolve(err);

  return promisifyRequest<T>(
    db.transaction([storeName], "readonly")
      .objectStore(storeName)
      .index(indexName)
      .get(indexValue),
  );
};

/**
 * 按索引游标读取所有匹配记录
 *
 * > 来自 serve.js atomic case "getByIndexCursor"（~L1422-1462）
 *
 * @param db - 数据库实例
 * @param storeName - store 名称
 * @param indexName - 索引名称
 * @param indexValue - 索引匹配值
 * @returns 包含所有匹配记录的结果
 */
export const getByIndexCursor = <T = unknown>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  indexValue: IDBValidKey,
): Promise<IDBResult<T[]>> => {
  const err = validate(db, storeName, indexName, indexValue);
  if (err) return Promise.resolve(err);

  return new Promise((resolve, reject) => {
    const list: T[] = [];
    const request = db
      .transaction([storeName], "readonly")
      .objectStore(storeName)
      .index(indexName)
      .openCursor(IDBKeyRange.only(indexValue));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        list.push(cursor.value);
        cursor.continue();
      } else {
        resolve({ content: list, status: event.type });
      }
    };
    request.onerror = (event) => {
      reject({
        content: (event.target as IDBRequest).result,
        status: event.type,
      });
    };
  });
};

/**
 * 获取 store 中记录总数
 *
 * > 来自 serve.js atomic case "count"（~L1497-1527）
 *
 * @param db - 数据库实例
 * @param storeName - store 名称
 * @param key - 可选的主键范围
 * @returns 记录数
 */
export const count = (
  db: IDBDatabase,
  storeName: string,
  key?: IDBValidKey | IDBKeyRange,
): Promise<IDBResult<number>> => {
  const err = validate(db, storeName);
  if (err) return Promise.resolve(err);

  return promisifyRequest<number>(
    db.transaction([storeName], "readonly")
      .objectStore(storeName)
      .count(key),
  );
};

// ── 写操作 ──

/**
 * 添加一条记录（主键冲突时失败）
 *
 * > 来自 serve.js atomic case "add"（~L1087-1119）
 *
 * @param db - 数据库实例
 * @param storeName - store 名称
 * @param data - 要添加的数据
 * @returns 包含新生成主键的结果
 */
export const add = <T = unknown>(
  db: IDBDatabase,
  storeName: string,
  data: T,
): Promise<IDBResult<IDBValidKey>> => {
  const err = validate(db, storeName, data);
  if (err) return Promise.resolve(err);

  return promisifyRequest<IDBValidKey>(
    db.transaction([storeName], "readwrite")
      .objectStore(storeName)
      .add(data as unknown as never),
  );
};

/**
 * 写入/更新一条记录（主键存在时覆盖，不存在时新增）
 *
 * > 来自 serve.js atomic case "put"（~L1121-1152）
 *
 * @param db - 数据库实例
 * @param storeName - store 名称
 * @param data - 要写入的数据
 * @returns 操作结果
 */
export const put = <T = unknown>(
  db: IDBDatabase,
  storeName: string,
  data: T,
): Promise<IDBResult<IDBValidKey>> => {
  const err = validate(db, storeName, data);
  if (err) return Promise.resolve(err);

  return promisifyRequest<IDBValidKey>(
    db.transaction([storeName], "readwrite")
      .objectStore(storeName)
      .put(data as unknown as never),
  );
};

/**
 * 按主键删除一条记录
 *
 * > 来自 serve.js atomic case "delete"（~L1154-1185）
 *
 * @param db - 数据库实例
 * @param storeName - store 名称
 * @param key - 主键值
 * @returns 操作结果
 */
export const delete_ = (
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<IDBResult<undefined>> => {
  const err = validate(db, storeName, key);
  if (err) return Promise.resolve(err);

  return promisifyRequest<undefined>(
    db.transaction([storeName], "readwrite")
      .objectStore(storeName)
      .delete(key),
  );
};

/**
 * 按索引游标删除所有匹配记录
 *
 * > 来自 serve.js atomic case "deleteByIndexCursor"（~L1187-1232）
 *
 * @param db - 数据库实例
 * @param storeName - store 名称
 * @param indexName - 索引名称
 * @param indexValue - 索引匹配值
 * @returns 操作结果
 */
export const deleteByIndexCursor = (
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  indexValue: IDBValidKey,
): Promise<IDBResult<null>> => {
  const err = validate(db, storeName, indexName, indexValue);
  if (err) return Promise.resolve(err);

  return new Promise((resolve, reject) => {
    const request = db
      .transaction([storeName], "readwrite")
      .objectStore(storeName)
      .index(indexName)
      .openCursor(IDBKeyRange.only(indexValue));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        const deleteRequest = cursor.delete();
        deleteRequest.onsuccess = (ev) => console.log("数据删除成功", ev);
        deleteRequest.onerror = (ev) => console.log("数据删除失败", ev);
        cursor.continue();
      } else {
        resolve({
          content: (event.target as IDBRequest).result,
          status: event.type,
        });
      }
    };
    request.onerror = (event) => {
      reject({
        content: (event.target as IDBRequest).result,
        status: event.type,
      });
    };
  });
};

/**
 * 清空 store 中的所有记录
 *
 * > 来自 serve.js atomic case "clear"（~L1544-1574）
 *
 * @param db - 数据库实例
 * @param storeName - store 名称
 * @returns 操作结果
 */
export const clear = (
  db: IDBDatabase,
  storeName: string,
): Promise<IDBResult<undefined>> => {
  const err = validate(db, storeName);
  if (err) return Promise.resolve(err);

  return promisifyRequest<undefined>(
    db.transaction([storeName], "readwrite")
      .objectStore(storeName)
      .clear(),
  );
};
