import {
  appendFile,
  chmod,
  mkdir,
  open,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

import type { JournalEvent, JournalStorage } from "../core/durable-journal.ts";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const LOCK_STALE_MS = 10_000;
const LOCK_ATTEMPTS = 400;

export const createFileJournalStorage = (path: string): JournalStorage => {
  const lockPath = `${path}.lock`;
  return {
    async transact<Result>(
      operation: (
        events: readonly JournalEvent[],
      ) => { result: Result; append?: JournalEvent[] },
    ): Promise<Result> {
      const release = await acquireLock(path, lockPath);
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

const acquireLock = async (
  path: string,
  lockPath: string,
): Promise<() => Promise<void>> => {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
  await chmod(directory, DIRECTORY_MODE);
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", FILE_MODE);
      await handle.writeFile(`${process.pid}\n${Date.now()}\n`, "utf8");
      await handle.sync();
      return async () => {
        await handle.close();
        await unlink(lockPath).catch((error) => {
          if ((error as { code?: string }).code !== "ENOENT") throw error;
        });
      };
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
      await removeStaleLock(lockPath);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw new Error("journal_lock_timeout");
};

const removeStaleLock = async (lockPath: string): Promise<void> => {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > LOCK_STALE_MS) await unlink(lockPath);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
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
