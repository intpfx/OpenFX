import { chmod, mkdir, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { JournalEvent, JournalStorage } from "../core/durable-journal.ts";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

export interface SqliteJournalStorageOptions {
  legacyJournalPath?: string;
}

export const createSqliteJournalStorage = (
  path: string,
  options: SqliteJournalStorageOptions = {},
): JournalStorage => {
  let databasePromise: Promise<DatabaseSync> | null = null;
  const database = () =>
    databasePromise ??= initializeDatabase(path, options.legacyJournalPath);

  return {
    async transact<Result>(
      operation: (
        events: readonly JournalEvent[],
      ) => { result: Result; append?: JournalEvent[] },
    ): Promise<Result> {
      const db = await database();
      let transactionOpen = false;
      try {
        db.exec("BEGIN IMMEDIATE");
        transactionOpen = true;
        const events = db.prepare(
          "SELECT payload FROM journal_events ORDER BY sequence",
        ).all().map((row) =>
          JSON.parse(String((row as { payload: unknown }).payload)) as JournalEvent
        );
        const mutation = operation(events);
        if (mutation.append?.length) {
          const state = db.prepare(
            "SELECT version FROM journal_state WHERE id = 1",
          ).get() as { version: number };
          const insert = db.prepare(
            "INSERT INTO journal_events(payload) VALUES (?)",
          );
          for (const event of mutation.append) {
            insert.run(JSON.stringify(event));
          }
          const updated = db.prepare(
            "UPDATE journal_state SET version = version + 1 " +
              "WHERE id = 1 AND version = ?",
          ).run(state.version);
          if (updated.changes !== 1) throw new Error("journal_state_conflict");
        }
        db.exec("COMMIT");
        transactionOpen = false;
        await secureDatabaseFiles(path);
        return mutation.result;
      } catch (error) {
        if (transactionOpen) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // SQLite already rolled the transaction back.
          }
        }
        await secureDatabaseFiles(path);
        throw error;
      }
    },
  };
};

const initializeDatabase = async (
  path: string,
  legacyJournalPath?: string,
): Promise<DatabaseSync> => {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
  await chmod(directory, DIRECTORY_MODE);
  await Promise.all(
    [
      ...new Set([
        `${path}.lock`,
        ...(legacyJournalPath ? [`${legacyJournalPath}.lock`] : []),
      ]),
    ].map((lockPath) => unlink(lockPath).catch(ignoreMissing)),
  );

  const db = new DatabaseSync(path);
  await chmod(path, FILE_MODE);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = FULL");
  db.exec("PRAGMA wal_autocheckpoint = 100");
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      legacy_imported INTEGER NOT NULL CHECK (legacy_imported IN (0, 1))
    );
    INSERT OR IGNORE INTO journal_state(id, version, legacy_imported)
      VALUES (1, 0, 0);
    CREATE TABLE IF NOT EXISTS journal_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL
    );
  `);
  await secureDatabaseFiles(path);
  await migrateLegacyJournal(db, legacyJournalPath);
  await secureDatabaseFiles(path);
  return db;
};

const migrateLegacyJournal = async (
  db: DatabaseSync,
  legacyJournalPath?: string,
): Promise<void> => {
  const imported = db.prepare(
    "SELECT legacy_imported FROM journal_state WHERE id = 1",
  ).get() as { legacy_imported: number };
  if (imported.legacy_imported === 1) return;
  const events = legacyJournalPath ? await readLegacyEvents(legacyJournalPath) : [];

  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db.prepare(
      "SELECT version, legacy_imported FROM journal_state WHERE id = 1",
    ).get() as { version: number; legacy_imported: number };
    if (current.legacy_imported === 0) {
      const insert = db.prepare(
        "INSERT INTO journal_events(payload) VALUES (?)",
      );
      for (const event of events) insert.run(JSON.stringify(event));
      const updated = db.prepare(
        "UPDATE journal_state SET version = version + 1, legacy_imported = 1 " +
          "WHERE id = 1 AND version = ? AND legacy_imported = 0",
      ).run(current.version);
      if (updated.changes !== 1) throw new Error("journal_migration_conflict");
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // SQLite already rolled the transaction back.
    }
    throw error;
  }
};

const readLegacyEvents = async (path: string): Promise<JournalEvent[]> => {
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const lines = text.split("\n");
  const lastNonEmpty = lines.findLastIndex((line) => line.trim().length > 0);
  const events: JournalEvent[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as JournalEvent);
    } catch (error) {
      if (index === lastNonEmpty) break;
      throw error;
    }
  }
  return events;
};

const secureDatabaseFiles = async (path: string): Promise<void> => {
  await chmod(dirname(path), DIRECTORY_MODE);
  await Promise.all(
    [path, `${path}-wal`, `${path}-shm`].map((file) =>
      chmod(file, FILE_MODE).catch(ignoreMissing)
    ),
  );
};

const ignoreMissing = (error: unknown): void => {
  if ((error as { code?: string }).code !== "ENOENT") throw error;
};
