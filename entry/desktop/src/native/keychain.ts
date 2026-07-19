import { spawnSync } from "node:child_process";

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

const systemExecFileText: ExecFileText = (file, args, input) => {
  const result = spawnSync(file, [...args], {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    input: input ?? "",
    encoding: "utf8",
  });
  if (result.error) return Promise.reject(result.error);
  if (result.status !== 0) {
    return Promise.reject(
      new Error(`security_exit_${result.status}: ${result.stderr.trim()}`),
    );
  }
  return Promise.resolve(result.stdout);
};

export const createKeychain = (
  execute: ExecFileText = systemExecFileText,
  service = KEYCHAIN_SERVICE,
): NodeKeychain => ({
  async write(account, secret) {
    await execute("/usr/bin/security", [
      "add-generic-password",
      "-U",
      "-s",
      service,
      "-a",
      account,
      "-w",
      secret,
    ]);
  },
  async read(account) {
    try {
      return (
        await execute("/usr/bin/security", [
          "find-generic-password",
          "-s",
          service,
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
        service,
        "-a",
        account,
      ]);
    } catch {
      // Deleting a missing item is idempotent.
    }
  },
});
