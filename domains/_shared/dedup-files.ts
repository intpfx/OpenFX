/**
 * dedup-files — 运行时无关的文件查重工具
 *
 * 通过抽象 I/O 层与哈希接口实现跨运行时（Deno / Node / Browser）复用。
 * 不依赖任何特定运行时 API；所有平台相关操作由调用方注入。
 */

// ── 公共类型 ───────────────────────────────────────────────────────

/** 文件/目录条目 */
export interface FileEntry {
  /** 文件或目录名（不含路径） */
  name: string;
  /** 完整路径 */
  path: string;
  /** 是否为目录 */
  isDirectory: boolean;
  /** 是否为普通文件 */
  isFile: boolean;
}

/** 查重结果 */
export interface DedupResult {
  /** hash → 拥有该哈希的所有文件路径集合（仅包含重复项，即 size > 1 的组） */
  duplicates: Map<string, Set<string>>;
  /** 扫描到的文件总数 */
  totalFiles: number;
}

/** 查重选项 */
export interface DedupOptions {
  /** 扫描起始路径 */
  path?: string;
  /** Worker 数量（仅在启用 worker 池时有效）；默认尽可能多 */
  workerCount?: number;
}

/** 进度回调：每批次日志触发一次，logs 为当前全部日志行 */
export type ProgressCallback = (logs: string[]) => void;

// ── 抽象接口 ───────────────────────────────────────────────────────

/**
 * 文件系统适配器 —— 调用方实现以支持特定运行时。
 */
export interface FileSystemAdapter {
  /**
   * 递归遍历目录。
   * 返回的 AsyncIterable 每一项是目录下的直接子条目（文件/目录）。
   * 调用方（核心函数）负责递归进入子目录。
   */
  walkDir(path: string): AsyncIterable<FileEntry>;

  /** 读取文件全部内容 */
  readFile(path: string): Promise<Uint8Array>;

  /** 判断路径是否为隐藏文件/目录（POSIX: 点号前缀；Windows: attrib + 前缀） */
  isHidden(path: string): Promise<boolean> | boolean;

  /** 拼接路径片段（等价于 path.join） */
  joinPath(...segments: string[]): string | Promise<string>;
}

/**
 * 哈希函数 —— 接收文件数据，返回十六进制摘要字符串。
 *
 * 建议使用 SHA-256（抗碰撞，速度快）。
 *
 * ```ts
 * const myHash: HashFunction = async (data) => {
 *   const digest = await crypto.subtle.digest('SHA-256', data);
 *   return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
 * };
 * ```
 */
export type HashFunction = (data: Uint8Array) => Promise<string>;

/**
 * Worker 抽象 —— 与 Web Worker API 兼容的最小接口。
 *
 * Worker 收到 `{ filenames: string[] }`，应逐个计算哈希并回传：
 * - `{ type: 'on', hash: string, filename: string }` 每个文件完成时
 * - `{ type: 'off', name: string, taskCount: number }` 全部完成时
 * - `{ type: 'error', message: string }` 出错时
 */
export interface WorkerLike {
  postMessage(data: unknown): void;
  onmessage: ((ev: MessageEvent<WorkerMessage>) => void) | null;
  terminate(): void;
}

/** Worker → 主线程的消息 */
export type WorkerMessage =
  | { type: "on"; hash: string; filename: string }
  | { type: "off"; name: string; taskCount: number }
  | { type: "error"; message: string };

/**
 * Worker 工厂：给定 worker 代码（字符串/URL），创建 WorkerLike 实例。
 *
 * 不同运行时的示例：
 * - Browser: `(code) => new Worker(URL.createObjectURL(new Blob([code])))`
 * - Deno:    `(code) => new Worker(URL.createObjectURL(new Blob([code])), { type: 'module', deno: { permissions: 'inherit' } })`
 */
export type CreateWorker = (code: string, name: string) => WorkerLike;

// ═══════════════════════════════════════════════════════════════════
// 核心函数
// ═══════════════════════════════════════════════════════════════════

/**
 * 查找重复文件。
 *
 * 1. 递归遍历目录，收集所有非隐藏文件的路径
 * 2. 对每个文件计算哈希（支持 Worker 池并行或单线程串行）
 * 3. 按哈希分组，返回所有 size ≥ 2 的重复组
 *
 * @param adapter      文件系统适配器（注入运行时 I/O）
 * @param hashFn       哈希函数（注入哈希算法）
 * @param options      可选配置
 * @param onProgress   进度回调（每批次日志推送一次）
 * @param createWorker Worker 工厂（提供则启用 Worker 池；否则单线程串行）
 *
 * @example
 * ```ts
 * import { findDuplicateFiles, createDenoFileSystemAdapter, sha256Hash } from './dedup-files.ts';
 *
 * const result = await findDuplicateFiles(
 *   createDenoFileSystemAdapter(),
 *   sha256Hash,
 *   { path: Deno.cwd() },
 *   (logs) => console.clear() || logs.forEach(l => console.log(l)),
 * );
 * console.log('重复组数:', result.duplicates.size);
 * ```
 */
export async function findDuplicateFiles(
  adapter: FileSystemAdapter,
  hashFn: HashFunction,
  options: DedupOptions = {},
  onProgress?: ProgressCallback,
  createWorker?: CreateWorker,
): Promise<DedupResult> {
  // ── 日志 & 进度 ─────────────────────────────────────────────
  const logs: string[] = [];

  const pushLog = (msg: string): void => {
    logs.push(msg);
    onProgress?.(logs);
  };

  // ── 1. 遍历收集文件 ────────────────────────────────────────
  const dirPath = options.path ?? ".";
  const files: string[] = [];
  const hiddenCache = new Map<string, boolean>();

  const checkHidden = async (p: string): Promise<boolean> => {
    const c = hiddenCache.get(p);
    if (c !== undefined) return c;
    const h = await adapter.isHidden(p);
    hiddenCache.set(p, h);
    return h;
  };

  const walk = async (dir: string): Promise<void> => {
    for await (const entry of adapter.walkDir(dir)) {
      const fullPath = await adapter.joinPath(dir, entry.name);
      if (entry.isDirectory) {
        if (await checkHidden(fullPath)) {
          pushLog(`跳过隐藏文件夹: ${fullPath}`);
        } else {
          await walk(fullPath);
        }
      } else if (entry.isFile) {
        files.push(fullPath);
      }
    }
  };

  await walk(dirPath);
  pushLog(`文件总数: ${files.length}`);

  if (files.length === 0) {
    return { duplicates: new Map(), totalFiles: 0 };
  }

  // ── 2. 哈希计算 ────────────────────────────────────────────
  const hashMap = new Map<string, string>(); // hash → 首个文件路径
  const duplicates = new Map<string, Set<string>>(); // hash → 重复文件集
  let completed = 0;

  const recordHash = (hash: string, filename: string): void => {
    if (hashMap.has(hash)) {
      const group = duplicates.get(hash);
      if (group) {
        group.add(filename);
      } else {
        const s = new Set<string>();
        s.add(hashMap.get(hash)!);
        s.add(filename);
        duplicates.set(hash, s);
      }
    } else {
      hashMap.set(hash, filename);
    }
  };

  const progressLine = (): string => {
    const pct = Math.min(Math.floor((completed / files.length) * 100), 100);
    const bar = "=".repeat(Math.floor(pct / 2));
    return `[${bar.padEnd(50)}] ${pct}%`;
  };

  const updateProgress = (): void => {
    const line = progressLine();
    const idx = logs.findIndex((l) => l.includes("%"));
    if (idx === -1) logs.unshift(line);
    else logs[idx] = line;
    onProgress?.(logs);
  };

  if (createWorker) {
    // ── Worker 池并行模式 ──────────────────────────────────

    // 生成可在 Worker 中独立运行的哈希代码。
    // Worker 使用 adapter.readFile 的函数体（字符串形式），
    // 以及 hashFn 的函数体，在 Worker 作用域内重建计算逻辑。
    //
    // 注意：此序列化方式要求 readFile 与 hashFn 为不捕获外部闭包的纯函数。
    // 若无法满足此约束，调用方应在 createWorker 中预置完整的 Worker 代码，
    // 此时 workerCode 不会被使用（createWorker 可忽略其参数）。
    const workerCode = generateWorkerCode(
      hashFn.toString(),
      adapter.readFile.toString(),
    );

    const concurrency = options.workerCount ?? Math.min(
      typeof navigator !== "undefined" &&
        typeof navigator.hardwareConcurrency === "number"
        ? navigator.hardwareConcurrency
        : 4,
      files.length,
    );
    pushLog(`Worker 数量: ${concurrency}`);

    const workers: WorkerLike[] = [];
    let doneCount = 0;

    const donePromise = new Promise<void>((resolve) => {
      for (let i = 0; i < concurrency; i++) {
        const name = `dedup-${i}`;
        const w = createWorker(workerCode, name);
        w.onmessage = (ev: MessageEvent<WorkerMessage>) => {
          const msg = ev.data;
          switch (msg.type) {
            case "on":
              recordHash(msg.hash, msg.filename);
              completed++;
              if (completed % 50 === 0 || completed === files.length) updateProgress();
              break;
            case "off":
              pushLog(`${msg.name} 已完成 ${msg.taskCount} 个任务`);
              w.terminate();
              doneCount++;
              if (doneCount === concurrency) {
                pushLog("所有任务已完成");
                resolve();
              }
              break;
            case "error":
              pushLog(`Worker 错误: ${msg.message}`);
              break;
          }
        };
        workers.push(w);
      }

      // 分配任务（轮转切片）
      const chunkSize = Math.ceil(files.length / concurrency);
      for (let i = 0; i < concurrency; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, files.length);
        const filenames = files.slice(start, end);
        workers[i].postMessage({ filenames });
        pushLog(`分配任务给 dedup-${i}, 任务数量: ${filenames.length}`);
      }
    });

    await donePromise;

    // 最终进度
    completed = files.length;
    updateProgress();
  } else {
    // ── 单线程串行模式 ──────────────────────────────────────
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const data = await adapter.readFile(file);
        const hash = await hashFn(data);
        recordHash(hash, file);
      } catch (err) {
        pushLog(`读取失败: ${file} — ${String(err)}`);
      }
      completed = i + 1;
      if (completed % 10 === 0 || completed === files.length) updateProgress();
    }
  }

  // ── 3. 清理：仅保留重复组 ──────────────────────────────────
  for (const [hash, group] of duplicates) {
    if (group.size <= 1) duplicates.delete(hash);
  }

  if (duplicates.size === 0) {
    pushLog("没有重复文件");
  } else {
    pushLog(`发现 ${duplicates.size} 组重复文件`);
  }

  return { duplicates, totalFiles: files.length };
}

// ═══════════════════════════════════════════════════════════════════
// Worker 代码生成（内部工具）
// ═══════════════════════════════════════════════════════════════════

/**
 * 生成 Worker 内执行的 JavaScript 源码。
 *
 * 将 hashFn 与 readFile 的函数体以字符串形式注入 Worker，
 * 使 Worker 可独立完成「读取 → 哈希」流水线。
 *
 * **限制**：要求 hashFn 与 readFile 为不捕获外部闭包的纯函数。
 * 若函数依赖外部导入/闭包，请使用 createWorker 自定义完整 Worker 代码。
 *
 * @internal 由 findDuplicateFiles 自动调用；一般无需手动使用
 */
export function generateWorkerCode(
  hashFnSrc: string,
  readFileSrc: string,
): string {
  return `
const hashImpl = (${hashFnSrc});
const readFileImpl = (${readFileSrc});

async function computeHash(filename) {
  const data = await readFileImpl(filename);
  return await hashImpl(data);
}

self.onmessage = async (event) => {
  try {
    const { filenames } = event.data;
    let remaining = filenames.length;
    if (remaining === 0) {
      self.postMessage({ type: 'off', name: self.name, taskCount: 0 });
      return;
    }
    for (const filename of filenames) {
      const hash = await computeHash(filename);
      self.postMessage({ type: 'on', hash, filename });
      remaining--;
      if (remaining === 0) {
        self.postMessage({ type: 'off', name: self.name, taskCount: filenames.length });
      }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error) });
  }
};
`;
}

// ═══════════════════════════════════════════════════════════════════
// 预设：Deno 运行时
// ═══════════════════════════════════════════════════════════════════

/**
 * Deno 文件系统适配器。
 *
 * 需要全局 `Deno` 与 `jsr:@std/path`（用于 joinPath）。
 *
 * ```ts
 * const adapter = createDenoFileSystemAdapter();
 * ```
 */
export function createDenoFileSystemAdapter(): FileSystemAdapter {
  let _join: ((...segments: string[]) => string) | null = null;

  const getJoin = async (): Promise<(...segments: string[]) => string> => {
    if (!_join) {
      const mod = await import("jsr:@std/path");
      _join = mod.join;
    }
    return _join;
  };

  return {
    async *walkDir(dirPath: string): AsyncIterable<FileEntry> {
      for await (const entry of Deno.readDir(dirPath)) {
        const join = await getJoin();
        yield {
          name: entry.name,
          path: join(dirPath, entry.name),
          isDirectory: entry.isDirectory,
          isFile: entry.isFile,
        };
      }
    },

    async readFile(path: string): Promise<Uint8Array> {
      return Deno.readFile(path);
    },

    isHidden(path: string): boolean {
      try {
        if (Deno.build.os === "windows") {
          const name = path.split(/[\\/]/).pop()!;
          return name.startsWith(".");
        }
      } catch { /* Deno.build 不可用时忽略 */ }
      const name = path.split("/").pop() ?? path;
      return name.startsWith(".");
    },

    async joinPath(...segments: string[]): Promise<string> {
      const join = await getJoin();
      return join(...segments);
    },
  };
}

/**
 * Web Crypto SHA-256 哈希（Deno / Browser 通用）。
 *
 * 使用全局 `crypto.subtle`。
 *
 * ```ts
 * const digest = await sha256Hash(new TextEncoder().encode('hello'));
 * ```
 */
export async function sha256Hash(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}
