import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import type { AuditStorage } from "../core/audit-log.ts";

export const defaultAuditPath = (): string =>
  join(
    homedir(),
    "Library",
    "Application Support",
    "OpenFX Node",
    "audit.jsonl",
  );

export const createFileAuditStorage = (
  path = defaultAuditPath(),
): AuditStorage => ({
  async appendLine(line) {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, line, { encoding: "utf8", flag: "a" });
  },
  async readText() {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") return "";
      throw error;
    }
  },
});
