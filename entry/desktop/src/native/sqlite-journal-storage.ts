import { chmodSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { JournalEvent, JournalStorage } from "../core/durable-journal.ts";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const INITIALIZATION_ATTEMPTS = 12;
const INITIALIZATION_BUSY_TIMEOUT_MS = 250;
const TRANSACTION_BUSY_TIMEOUT_MS = 5_000;

export interface SqliteJournalStorageOptions {
  legacyJournalPath?: string;
}

export const createSqliteJournalStorage = (
  path: string,
  options: SqliteJournalStorageOptions = {},
): JournalStorage => {
  let databaseInstance: DatabaseSync | null = null;
  let databasePromise: Promise<DatabaseSync> | null = null;
  const ensureDatabase = async (): Promise<void> => {
    if (databaseInstance) return;
    if (databasePromise) {
      databaseInstance = await databasePromise;
      return;
    }
    const pending = initializeDatabase(path, options.legacyJournalPath);
    databasePromise = pending;
    try {
      databaseInstance = await pending;
    } catch (error) {
      if (databasePromise === pending) databasePromise = null;
      throw error;
    }
  };

  return {
    async transact<Result>(
      operation: (
        events: readonly JournalEvent[],
      ) => { result: Result; append?: JournalEvent[] },
    ): Promise<Result> {
      if (!databaseInstance) await ensureDatabase();
      const db = databaseInstance;
      if (!db) throw new Error("sqlite_database_unavailable");
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
        secureDatabaseFiles(path);
        return mutation.result;
      } catch (error) {
        if (transactionOpen) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // SQLite already rolled the transaction back.
          }
        }
        secureDatabaseFiles(path);
        throw error;
      }
    },
    async claimReplayNonce(nonce, expiresAt, now) {
      if (!databaseInstance) await ensureDatabase();
      const db = databaseInstance;
      if (!db) throw new Error("sqlite_database_unavailable");
      let transactionOpen = false;
      try {
        db.exec("BEGIN IMMEDIATE");
        transactionOpen = true;
        db.prepare("DELETE FROM replay_nonces WHERE expires_at <= ?").run(now);
        const claimed = db.prepare(
          "INSERT OR IGNORE INTO replay_nonces(nonce, expires_at) VALUES (?, ?)",
        ).run(nonce, expiresAt).changes === 1;
        db.exec("COMMIT");
        transactionOpen = false;
        secureDatabaseFiles(path);
        return claimed;
      } catch (error) {
        if (transactionOpen) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // SQLite already rolled the transaction back.
          }
        }
        secureDatabaseFiles(path);
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
  mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
  chmodSync(directory, DIRECTORY_MODE);
  for (
    const lockPath of new Set([
      `${path}.lock`,
      ...(legacyJournalPath ? [`${legacyJournalPath}.lock`] : []),
    ])
  ) {
    try {
      unlinkSync(lockPath);
    } catch (error) {
      ignoreMissing(error);
    }
  }

  for (let attempt = 1; attempt <= INITIALIZATION_ATTEMPTS; attempt += 1) {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(path);
      chmodSync(path, FILE_MODE);
      db.exec(`PRAGMA busy_timeout = ${INITIALIZATION_BUSY_TIMEOUT_MS}`);
      if (readJournalMode(db) !== "wal") {
        const enabledMode = readJournalMode(db, "PRAGMA journal_mode = WAL");
        if (enabledMode !== "wal") {
          throw new Error(`journal_mode_wal_unavailable:${enabledMode}`);
        }
      }
      db.exec("PRAGMA synchronous = FULL");
      db.exec("PRAGMA wal_autocheckpoint = 100");
      db.exec(`
        BEGIN IMMEDIATE;
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
        CREATE TABLE IF NOT EXISTS replay_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          legacy_imported INTEGER NOT NULL CHECK (legacy_imported IN (0, 1))
        );
        INSERT OR IGNORE INTO replay_state(id, legacy_imported) VALUES (1, 0);
        CREATE TABLE IF NOT EXISTS replay_nonces (
          nonce TEXT PRIMARY KEY,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS replay_nonces_by_expiry
          ON replay_nonces(expires_at);
        COMMIT;
      `);
      secureDatabaseFiles(path);
      migrateLegacyJournal(db, legacyJournalPath);
      migrateLegacyReplayClaims(db);
      db.exec(`PRAGMA busy_timeout = ${TRANSACTION_BUSY_TIMEOUT_MS}`);
      secureDatabaseFiles(path);
      return db;
    } catch (error) {
      if (db) {
        db.close();
        secureDatabaseFiles(path);
      }
      if (
        !isTransientSqliteInitializationError(error) ||
        attempt === INITIALIZATION_ATTEMPTS
      ) {
        throw error;
      }
      await waitForInitializationRetry(attempt);
    }
  }
  throw new Error("sqlite_initialization_attempts_exhausted");
};

const migrateLegacyReplayClaims = (db: DatabaseSync): void => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db.prepare(
      "SELECT legacy_imported FROM replay_state WHERE id = 1",
    ).get() as { legacy_imported: number };
    if (current.legacy_imported === 0) {
      const insert = db.prepare(`
        INSERT INTO replay_nonces(nonce, expires_at) VALUES (?, ?)
        ON CONFLICT(nonce) DO UPDATE SET
          expires_at = MAX(replay_nonces.expires_at, excluded.expires_at)
      `);
      const rows = db.prepare(
        "SELECT payload FROM journal_events ORDER BY sequence",
      ).all() as Array<{ payload: unknown }>;
      for (const row of rows) {
        const event = JSON.parse(String(row.payload)) as JournalEvent;
        if (event.type === "replay.claimed") {
          insert.run(event.nonce, event.expiresAt);
        }
      }
      db.prepare("DELETE FROM replay_nonces WHERE expires_at <= ?").run(Date.now());
      const updated = db.prepare(
        "UPDATE replay_state SET legacy_imported = 1 " +
          "WHERE id = 1 AND legacy_imported = 0",
      ).run();
      if (updated.changes !== 1) throw new Error("replay_migration_conflict");
    }
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS reject_legacy_replay_claims
      BEFORE INSERT ON journal_events
      WHEN CASE
        WHEN json_valid(NEW.payload)
          THEN json_extract(NEW.payload, '$.type') = 'replay.claimed'
        ELSE 0
      END
      BEGIN
        SELECT RAISE(ABORT, 'legacy_replay_claims_disabled');
      END;
    `);
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

const readJournalMode = (
  db: DatabaseSync,
  statement = "PRAGMA journal_mode",
): string => {
  const row = db.prepare(statement).get() as
    | { journal_mode?: unknown }
    | undefined;
  return String(row?.journal_mode ?? "").toLowerCase();
};

const isTransientSqliteInitializationError = (error: unknown): boolean => {
  const sqliteError = error as {
    code?: unknown;
    errno?: unknown;
    errcode?: unknown;
    resultCode?: unknown;
    baseCode?: unknown;
    extendedCode?: unknown;
    extendedResultCode?: unknown;
    message?: unknown;
  };
  const numericCodes = [
    sqliteError.errno,
    sqliteError.errcode,
    sqliteError.resultCode,
    sqliteError.baseCode,
    sqliteError.extendedCode,
    sqliteError.extendedResultCode,
    sqliteError.code,
  ];
  if (
    numericCodes.some((code) => {
      if (typeof code !== "number") return false;
      const baseCode = code & 0xff;
      return baseCode === 5 || baseCode === 6;
    })
  ) {
    return true;
  }
  // Message text is authoritative only when the SQLite binding identifies the
  // error. JSON SyntaxError content must never opt itself into initialization retry.
  if (typeof sqliteError.code !== "string") return false;
  if (/^SQLITE_(?:BUSY|LOCKED)(?:_[A-Z0-9_]+)?$/.test(sqliteError.code)) {
    return true;
  }
  if (sqliteError.code !== "ERR_SQLITE_ERROR") return false;
  return sqliteError.message === "database is locked" ||
    sqliteError.message === "database table is locked";
};

const waitForInitializationRetry = async (attempt: number): Promise<void> => {
  const ceiling = Math.min(125, 8 * (2 ** (attempt - 1)));
  const floor = Math.ceil(ceiling / 2);
  const delay = floor + Math.floor(Math.random() * (ceiling - floor + 1));
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
};

const migrateLegacyJournal = (
  db: DatabaseSync,
  legacyJournalPath?: string,
): void => {
  const imported = db.prepare(
    "SELECT legacy_imported FROM journal_state WHERE id = 1",
  ).get() as { legacy_imported: number };
  if (imported.legacy_imported === 1) return;
  const events = legacyJournalPath ? readLegacyEvents(legacyJournalPath) : [];

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

const readLegacyEvents = (path: string): JournalEvent[] => {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
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

const secureDatabaseFiles = (path: string): void => {
  chmodSync(dirname(path), DIRECTORY_MODE);
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      chmodSync(file, FILE_MODE);
    } catch (error) {
      ignoreMissing(error);
    }
  }
};

const ignoreMissing = (error: unknown): void => {
  if ((error as { code?: string }).code !== "ENOENT") throw error;
};
