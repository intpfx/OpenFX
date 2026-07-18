import { assertEquals } from "@std/assert";
import { appendFile, chmod, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { createDesktopJournal } from "../src/core/durable-journal.ts";
import { createFileJournalStorage } from "../src/native/file-journal-storage.ts";

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
