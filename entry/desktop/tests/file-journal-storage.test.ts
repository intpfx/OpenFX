import { assertEquals, assertRejects } from "@std/assert";
import { appendFile, chmod, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createDesktopJournal } from "../src/core/durable-journal.ts";
import {
  acquireFileJournalLock,
  createFileJournalStorage,
} from "../src/native/file-journal-storage.ts";

const lockFixture = (token: string, pid: number, createdAt = 0): string =>
  `${JSON.stringify({ token, pid, createdAt })}\n`;

Deno.test("journal storage creates and repairs private directory/file modes", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-journal-mode-" });
  const directory = join(root, "OpenFX Node");
  const path = join(directory, "journal.jsonl");
  const journal = createDesktopJournal(createFileJournalStorage(path), {
    now: () => 1,
    createId: () => "audit-1",
  });

  await journal.appendAudit({
    category: "node",
    action: "mode.test",
    outcome: "succeeded",
  });
  assertEquals((await stat(directory)).mode & 0o777, 0o700);
  assertEquals((await stat(path)).mode & 0o777, 0o600);

  await chmod(directory, 0o755);
  await chmod(path, 0o644);
  await journal.appendAudit({
    category: "node",
    action: "mode.repair",
    outcome: "succeeded",
  });
  assertEquals((await stat(directory)).mode & 0o777, 0o700);
  assertEquals((await stat(path)).mode & 0o777, 0o600);
});

Deno.test("journal repairs a crash-truncated final record before future appends", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-journal-partial-" });
  const path = join(root, "journal.jsonl");
  const first = createDesktopJournal(createFileJournalStorage(path), {
    now: () => 1,
    createId: () => "audit-1",
  });
  await first.appendAudit({
    category: "node",
    action: "before-crash",
    outcome: "succeeded",
  });
  await appendFile(path, '{"type":"audit.appended"');

  const reconstructed = createDesktopJournal(createFileJournalStorage(path), {
    now: () => 2,
    createId: () => "audit-2",
  });
  await reconstructed.appendAudit({
    category: "node",
    action: "after-restart",
    outcome: "succeeded",
  });

  assertEquals((await reconstructed.listAudit()).map((event) => event.action), [
    "before-crash",
    "after-restart",
  ]);
  assertEquals((await readFile(path, "utf8")).includes('appended"{'), false);
});

Deno.test("separate file-journal instances make one atomic replay claim", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-journal-claim-" });
  const path = join(root, "journal.jsonl");
  const first = createDesktopJournal(createFileJournalStorage(path));
  const second = createDesktopJournal(createFileJournalStorage(path));

  assertEquals(
    (await Promise.all([
      first.claimReplayNonce("same", 31_000, 1_000),
      second.claimReplayNonce("same", 31_000, 1_000),
    ])).sort(),
    [false, true],
  );
});

Deno.test("a stale-looking lock owned by a live process is never stolen", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-journal-live-lock-" });
  const path = join(root, "journal.jsonl");
  const lockPath = `${path}.lock`;
  await writeFile(lockPath, lockFixture("live-owner", 42));

  await assertRejects(
    () =>
      acquireFileJournalLock(path, {
        now: () => 20_000,
        staleMs: 10_000,
        attempts: 1,
        retryDelayMs: 0,
        isProcessAlive: () => Promise.resolve(true),
        createToken: () => "contender",
        pid: 43,
      }),
    Error,
    "journal_lock_timeout",
  );
  assertEquals(await readFile(lockPath, "utf8"), lockFixture("live-owner", 42));
});

Deno.test("a stale lock with a provably dead owner is recovered", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-journal-dead-lock-" });
  const path = join(root, "journal.jsonl");
  const lockPath = `${path}.lock`;
  await writeFile(lockPath, lockFixture("dead-owner", 42));

  const release = await acquireFileJournalLock(path, {
    now: () => 20_000,
    staleMs: 10_000,
    attempts: 2,
    retryDelayMs: 0,
    isProcessAlive: () => Promise.resolve(false),
    createToken: () => "new-owner",
    pid: 43,
  });
  assertEquals(
    JSON.parse(await readFile(lockPath, "utf8")),
    { token: "new-owner", pid: 43, createdAt: 20_000 },
  );
  await release();
  await assertRejects(() => readFile(lockPath, "utf8"), Error, "ENOENT");
});

Deno.test("an old release cannot unlink a replacement lock", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-journal-successor-" });
  const path = join(root, "journal.jsonl");
  const lockPath = `${path}.lock`;
  const release = await acquireFileJournalLock(path, {
    now: () => 1,
    createToken: () => "old-owner",
    pid: 42,
  });
  await unlink(lockPath);
  await writeFile(lockPath, lockFixture("replacement", 43, 2));

  await release();

  assertEquals(
    await readFile(lockPath, "utf8"),
    lockFixture("replacement", 43, 2),
  );
});

Deno.test("separate journal instances cannot both claim one approval", async () => {
  const root = await Deno.makeTempDir({ prefix: "openfx-journal-approval-" });
  const path = join(root, "journal.jsonl");
  const first = createDesktopJournal(createFileJournalStorage(path));
  const second = createDesktopJournal(createFileJournalStorage(path));
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
