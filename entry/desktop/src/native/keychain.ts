import { spawn } from "node:child_process";

export const KEYCHAIN_SERVICE = "OpenFX Node";

export type ExecFileText = (
  file: string,
  args: readonly string[],
  input?: string,
) => Promise<string>;

export interface NodeKeychain {
  write(account: string, secret: string): Promise<void>;
  read(account: string): Promise<string | null>;
  remove(account: string): Promise<void>;
}

const systemExecFileText: ExecFileText = (file, args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, [...args], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => stdout += chunk);
    child.stderr.on("data", (chunk: string) => stderr += chunk);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`security_exit_${code}: ${stderr.trim()}`));
    });
    child.stdin.end(input ?? "");
  });

export const createKeychain = (
  execute: ExecFileText = systemExecFileText,
): NodeKeychain => ({
  async write(account, secret) {
    await execute("/usr/bin/security", [
      "add-generic-password",
      "-U",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
    ], `${secret}\n`);
  },
  async read(account) {
    try {
      return (
        await execute("/usr/bin/security", [
          "find-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          account,
          "-w",
        ])
      ).trim() || null;
    } catch {
      return null;
    }
  },
  async remove(account) {
    try {
      await execute("/usr/bin/security", [
        "delete-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
      ]);
    } catch {
      // Deleting a missing item is idempotent.
    }
  },
});
