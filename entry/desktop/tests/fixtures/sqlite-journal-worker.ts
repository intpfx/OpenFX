import { createDesktopJournal } from "../../src/core/durable-journal.ts";
import { createSqliteJournalStorage } from "../../src/native/sqlite-journal-storage.ts";

const [databasePath, nonce] = Deno.args;
if (!databasePath || !nonce) {
  throw new Error("usage: sqlite-journal-worker <database-path> <nonce>");
}

const journal = createDesktopJournal(createSqliteJournalStorage(databasePath));
console.log(JSON.stringify(await journal.claimReplayNonce(nonce, 31_000, 1_000)));
