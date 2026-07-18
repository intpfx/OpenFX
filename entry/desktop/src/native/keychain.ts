import { execFileSync } from "node:child_process";

export const KEYCHAIN_SERVICE = "OpenFX Node";

export type ExecFileText = (
  file: string,
  args: readonly string[],
) => string;

export interface NodeKeychain {
  write(account: string, secret: string): Promise<void>;
  read(account: string): Promise<string | null>;
  remove(account: string): Promise<void>;
}

const systemExecFileText: ExecFileText = (file, args) =>
  String(execFileSync(file, [...args], { encoding: "utf8" }));

export const createKeychain = (
  execute: ExecFileText = systemExecFileText,
): NodeKeychain => ({
  write(account, secret) {
    execute("/usr/bin/security", [
      "add-generic-password",
      "-U",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
      secret,
    ]);
    return Promise.resolve();
  },
  read(account) {
    try {
      return Promise.resolve(
        execute("/usr/bin/security", [
          "find-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          account,
          "-w",
        ]).trim() || null,
      );
    } catch {
      return Promise.resolve(null);
    }
  },
  remove(account) {
    try {
      execute("/usr/bin/security", [
        "delete-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
      ]);
    } catch {
      // Deleting a missing item is idempotent.
    }
    return Promise.resolve();
  },
});
