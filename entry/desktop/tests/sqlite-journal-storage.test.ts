import { assertEquals, assertRejects } from "@std/assert";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { JournalEvent } from "../src/core/durable-journal.ts";
import { createDesktopJournal } from "../src/core/durable-journal.ts";
import { createSqliteJournalStorage } from "../src/native/sqlite-journal-storage.ts";

const auditEvent = (id: string, action: string): JournalEvent => ({
  type: "audit.appended",
  audit: {
    id,
    category: "node",
    action,
    outcome: "succeeded",
    createdAt: Number(id.replace(/\D/g, "")) || 1,
  },
});

Deno.test("SQLite journal cleans obsolete locks and repairs private modes", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-sqlite-mode-" });
  const directory = join(root, "OpenFX Node");
  const databasePath = join(directory, "journal.sqlite");
  const legacyPath = join(directory, "journal.jsonl");
  await mkdir(directory);
  await writeFile(`${databasePath}.lock`, "");
  await writeFile(`${legacyPath}.lock`, '{"token":');

  const journal = createDesktopJournal(
    createSqliteJournalStorage(databasePath, {
      legacyJournalPath: legacyPath,
    }),
    { now: () => 1, createId: () => "audit-1" },
  );
  await journal.appendAudit({
    category: "node",
    action: "mode.test",
    outcome: "succeeded",
  });

  assertEquals((await stat(directory)).mode & 0o777, 0o700);
  assertEquals((await stat(databasePath)).mode & 0o777, 0o600);
  assertEquals((await stat(`${databasePath}-wal`)).mode & 0o777, 0o600);
  assertEquals((await stat(`${databasePath}-shm`)).mode & 0o777, 0o600);
  await assertRejects(() => readFile(`${databasePath}.lock`), Error, "ENOENT");
  await assertRejects(() => readFile(`${legacyPath}.lock`), Error, "ENOENT");

  await chmod(directory, 0o755);
  await chmod(databasePath, 0o644);
  await journal.appendAudit({
    category: "node",
    action: "mode.repair",
    outcome: "succeeded",
  });
  assertEquals((await stat(directory)).mode & 0o777, 0o700);
  assertEquals((await stat(databasePath)).mode & 0o777, 0o600);
  assertEquals((await stat(`${databasePath}-wal`)).mode & 0o777, 0o600);
  assertEquals((await stat(`${databasePath}-shm`)).mode & 0o777, 0o600);
});

Deno.test("SQLite journal imports committed JSONL and ignores a crash-truncated tail once", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-sqlite-migrate-" });
  const databasePath = join(root, "journal.sqlite");
  const legacyPath = join(root, "journal.jsonl");
  await writeFile(
    legacyPath,
    `${JSON.stringify(auditEvent("audit-1", "before-migration"))}\n{"type":`,
  );

  const first = createDesktopJournal(
    createSqliteJournalStorage(databasePath, {
      legacyJournalPath: legacyPath,
    }),
    { now: () => 2, createId: () => "audit-2" },
  );
  await first.appendAudit({
    category: "node",
    action: "after-migration",
    outcome: "succeeded",
  });
  const reconstructed = createDesktopJournal(
    createSqliteJournalStorage(databasePath, { legacyJournalPath: legacyPath }),
  );

  assertEquals((await reconstructed.listAudit()).map((event) => event.action), [
    "before-migration",
    "after-migration",
  ]);
});

Deno.test("SQLite journal rolls back every inserted event when a transaction fails", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-sqlite-rollback-" });
  const databasePath = join(root, "journal.sqlite");
  const storage = createSqliteJournalStorage(databasePath);
  await storage.transact(() => ({
    result: undefined,
    append: [auditEvent("audit-1", "committed")],
  }));

  await assertRejects(() =>
    storage.transact(() => ({
      result: undefined,
      append: [
        auditEvent("audit-2", "must-roll-back"),
        { ...auditEvent("audit-3", "invalid"), invalid: 1n } as unknown as JournalEvent,
      ],
    })), TypeError);

  const reconstructed = createDesktopJournal(
    createSqliteJournalStorage(databasePath),
  );
  assertEquals((await reconstructed.listAudit()).map((event) => event.action), [
    "committed",
  ]);
});

Deno.test("independent SQLite connections make one atomic replay claim", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-sqlite-replay-" });
  const databasePath = join(root, "journal.sqlite");
  const first = createDesktopJournal(createSqliteJournalStorage(databasePath));
  const second = createDesktopJournal(createSqliteJournalStorage(databasePath));

  assertEquals(
    (await Promise.all([
      first.claimReplayNonce("same", 31_000, 1_000),
      second.claimReplayNonce("same", 31_000, 1_000),
    ])).sort(),
    [false, true],
  );
  await assertRejects(() => readFile(`${databasePath}.lock`), Error, "ENOENT");
});

Deno.test("independent SQLite connections cannot both claim one approval", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-sqlite-approval-" });
  const databasePath = join(root, "journal.sqlite");
  const first = createDesktopJournal(createSqliteJournalStorage(databasePath));
  const second = createDesktopJournal(createSqliteJournalStorage(databasePath));
  await first.registerRequest({
    id: "request-1",
    reason: "Agent requested app.open",
    action: {
      id: "action-1",
      kind: "external_effect",
      title: "app.open requires approval",
      target: "app.open",
      preview: '{"application":"Safari"}',
      parameterFingerprint: "fingerprint-1",
      state: "ready",
    },
    parameterFingerprint: "fingerprint-1",
    state: "pending",
    createdAt: 1,
    expiresAt: 30_001,
  }, "node-1");

  assertEquals(
    (await Promise.all([
      first.claimResolution({
        requestId: "request-1",
        resolution: "approved",
        parameterFingerprint: "fingerprint-1",
        now: 2,
      }),
      second.claimResolution({
        requestId: "request-1",
        resolution: "approved",
        parameterFingerprint: "fingerprint-1",
        now: 2,
      }),
    ])).map((result) => result.status).sort(),
    ["already_claimed", "claimed"],
  );
});
