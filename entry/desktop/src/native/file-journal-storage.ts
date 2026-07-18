import {
  appendFile,
  chmod,
  mkdir,
  open,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

import type { JournalEvent, JournalStorage } from "../core/durable-journal.ts";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const LOCK_STALE_MS = 10_000;
const LOCK_ATTEMPTS = 400;

interface LockRecord {
  token: string;
  pid: number;
  createdAt: number;
}

export interface FileJournalLockOptions {
  now?: () => number;
  staleMs?: number;
  attempts?: number;
  retryDelayMs?: number;
  createToken?: () => string;
  pid?: number;
  isProcessAlive?: (pid: number) => boolean | Promise<boolean>;
}

export const createFileJournalStorage = (path: string): JournalStorage => {
  return {
    async transact<Result>(
      operation: (
        events: readonly JournalEvent[],
      ) => { result: Result; append?: JournalEvent[] },
    ): Promise<Result> {
      const release = await acquireFileJournalLock(path);
      try {
        const events = await readEvents(path);
        const mutation = operation(events);
        if (mutation.append?.length) {
          const payload = mutation.append.map((event) =>
            JSON.stringify(event)
          ).join("\n") +
            "\n";
          await appendFile(path, payload, { encoding: "utf8", mode: FILE_MODE });
          const handle = await open(path, "r");
          try {
            await handle.sync();
          } finally {
            await handle.close();
          }
        }
        await secureModes(path);
        return mutation.result;
      } finally {
        await release();
      }
    },
  };
};

export const acquireFileJournalLock = async (
  path: string,
  options: FileJournalLockOptions = {},
): Promise<() => Promise<void>> => {
  const lockPath = `${path}.lock`;
  const directory = dirname(path);
  const now = options.now ?? Date.now;
  const staleMs = options.staleMs ?? LOCK_STALE_MS;
  const attempts = options.attempts ?? LOCK_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? 5;
  const isProcessAlive = options.isProcessAlive ?? defaultProcessAlive;
  const record: LockRecord = {
    token: options.createToken?.() ?? crypto.randomUUID(),
    pid: options.pid ?? process.pid,
    createdAt: now(),
  };
  await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
  await chmod(directory, DIRECTORY_MODE);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", FILE_MODE);
      try {
        await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
        await handle.sync();
      } catch (error) {
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
        throw error;
      }
      return async () => {
        await handle.close();
        const current = await readLockRecord(lockPath);
        if (current?.token !== record.token) return;
        await unlink(lockPath).catch(ignoreMissing);
      };
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
      await removeDeadOwnerLock(lockPath, {
        now: now(),
        staleMs,
        isProcessAlive,
      });
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  throw new Error("journal_lock_timeout");
};

const removeDeadOwnerLock = async (
  lockPath: string,
  options: {
    now: number;
    staleMs: number;
    isProcessAlive(pid: number): boolean | Promise<boolean>;
  },
): Promise<void> => {
  const candidate = await readLockRecord(lockPath);
  if (!candidate || options.now - candidate.createdAt <= options.staleMs) return;
  if (await options.isProcessAlive(candidate.pid)) return;
  const current = await readLockRecord(lockPath);
  if (current?.token !== candidate.token) return;
  await unlink(lockPath).catch(ignoreMissing);
};

const readLockRecord = async (lockPath: string): Promise<LockRecord | null> => {
  try {
    const value = JSON.parse(await readFile(lockPath, "utf8")) as Partial<LockRecord>;
    return typeof value.token === "string" && value.token.length > 0 &&
        Number.isSafeInteger(value.pid) && Number(value.pid) > 0 &&
        typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
      ? {
        token: value.token,
        pid: Number(value.pid),
        createdAt: value.createdAt,
      }
      : null;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
};

const defaultProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code !== "ESRCH";
  }
};

const ignoreMissing = (error: unknown): void => {
  if ((error as { code?: string }).code !== "ENOENT") throw error;
};

const readEvents = async (path: string): Promise<JournalEvent[]> => {
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
  const lines = text.split("\n");
  const events: JournalEvent[] = [];
  let trailingPartial = false;
  const lastNonEmpty = lines.findLastIndex((line) => line.trim().length > 0);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as JournalEvent);
    } catch (error) {
      if (index === lastNonEmpty) {
        trailingPartial = true;
        break;
      }
      throw error;
    }
  }
  if (trailingPartial) {
    const repaired = events.length > 0
      ? `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
      : "";
    await writeFile(path, repaired, { encoding: "utf8", mode: FILE_MODE });
  }
  return events;
};

const secureModes = async (path: string): Promise<void> => {
  await chmod(dirname(path), DIRECTORY_MODE);
  try {
    await chmod(path, FILE_MODE);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
};
