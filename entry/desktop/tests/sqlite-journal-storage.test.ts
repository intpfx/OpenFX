import { assertEquals, assertRejects } from "@std/assert";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

const workerPath = fileURLToPath(
  new URL("./fixtures/sqlite-journal-worker.ts", import.meta.url),
);

const runClaimWorkers = async (
  databasePath: string,
  nonce: string,
  count: number,
): Promise<boolean[]> => {
  const results = await Promise.all(
    Array.from({ length: count }, () =>
      new Deno.Command("deno", {
        args: [
          "run",
          "--quiet",
          "--allow-read",
          "--allow-write",
          workerPath,
          databasePath,
          nonce,
        ],
        stdout: "piped",
        stderr: "piped",
      }).output()),
  );
  const failures = results
    .filter((result) => !result.success)
    .map((result) => new TextDecoder().decode(result.stderr).trim());
  assertEquals(failures, []);
  return results.map((result) =>
    JSON.parse(new TextDecoder().decode(result.stdout).trim()) as boolean
  );
};

Deno.test("separate processes survive concurrent SQLite cold starts", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-sqlite-process-" });
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const claims = await runClaimWorkers(
      join(root, `pair-${iteration}.sqlite`),
      `pair-${iteration}`,
      2,
    );
    assertEquals(claims.filter(Boolean).length, 1);
  }

  const claims = await runClaimWorkers(
    join(root, "twelve.sqlite"),
    "twelve",
    12,
  );
  assertEquals(claims.filter(Boolean).length, 1);
});

Deno.test("a storage instance recovers after its first initialization rejects", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-sqlite-recover-" });
  const databasePath = join(root, "journal.sqlite");
  await mkdir(databasePath);
  const storage = createSqliteJournalStorage(databasePath);

  await assertRejects(() => storage.transact(() => ({ result: "unreachable" })), Error);
  await rm(databasePath, { recursive: true });

  assertEquals(
    await storage.transact(() => ({ result: "recovered" })),
    "recovered",
  );
});

Deno.test("non-transient SQLite initialization errors are not retried", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-sqlite-invalid-" });
  const databasePath = join(root, "journal.sqlite");
  await writeFile(databasePath, "not a sqlite database");
  const storage = createSqliteJournalStorage(databasePath);
  const originalSetTimeout = globalThis.setTimeout;
  let scheduledRetries = 0;
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    scheduledRetries += 1;
    return originalSetTimeout(...args);
  }) as typeof setTimeout;
  try {
    await assertRejects(
      () => storage.transact(() => ({ result: "unreachable" })),
      Error,
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  assertEquals(scheduledRetries, 0);
});

Deno.test("legacy JSON errors cannot impersonate a retryable SQLite lock", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-sqlite-provenance-" });
  const databasePath = join(root, "journal.sqlite");
  const legacyPath = join(root, "journal.jsonl");
  await writeFile(
    legacyPath,
    [
      JSON.stringify(auditEvent("audit-1", "before-corruption")),
      "database is locked",
      JSON.stringify(auditEvent("audit-2", "after-corruption")),
    ].join("\n"),
  );
  const storage = createSqliteJournalStorage(databasePath, {
    legacyJournalPath: legacyPath,
  });
  const originalSetTimeout = globalThis.setTimeout;
  let scheduledRetries = 0;
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    scheduledRetries += 1;
    return originalSetTimeout(...args);
  }) as typeof setTimeout;
  try {
    await assertRejects(
      () => storage.transact(() => ({ result: "unreachable" })),
      SyntaxError,
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  assertEquals(scheduledRetries, 0);
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
