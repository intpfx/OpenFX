import { execFile } from "node:child_process";

import { parseSystemCommandOutputs } from "../core/system-parsers.ts";
import type { ProcessIdentity } from "../core/agent-runtime.ts";
import { ALLOWED_APPLICATIONS } from "../core/effect-policy.ts";
import type { ParsedSystemState } from "../core/types.ts";

export type MacExecFile = (
  file: string,
  args: readonly string[],
) => Promise<string>;

export interface MacSystemAdapter {
  collect(): Promise<ParsedSystemState>;
  inspectProcess(pid: number): Promise<ProcessIdentity | null>;
  kill(
    pid: number,
    expected: ProcessIdentity,
  ): Promise<{ ok: true; pid: number }>;
  openApplication(
    application: string,
  ): Promise<{ ok: boolean; application?: string; error?: string }>;
  openConsole(serverUrl: string): Promise<{ ok: true; url: string }>;
}

const executeSystemFile: MacExecFile = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { encoding: "utf8", timeout: 8_000, shell: false },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${error.message}: ${String(stderr).trim()}`));
          return;
        }
        resolve(String(stdout));
      },
    );
  });

export const createMacSystemAdapter = (
  execute: MacExecFile = executeSystemFile,
): MacSystemAdapter => {
  const inspectProcess = async (pid: number): Promise<ProcessIdentity | null> => {
    if (!Number.isSafeInteger(pid) || pid <= 1) return Promise.resolve(null);
    const output = (await execute("/bin/ps", [
      "-p",
      String(pid),
      "-o",
      "pid=,lstart=,comm=",
    ])).trim();
    const match = output.match(
      /^(\d+)\s+(.{24})\s+(.+)$/,
    );
    return match
      ? {
        pid: Number(match[1]),
        startedAt: match[2]!.trim(),
        command: match[3]!.trim(),
      }
      : null;
  };
  return {
    async collect() {
      const [
        top,
        memsize,
        vmStat,
        df,
        netstat,
        battery,
        processes,
        ifconfig,
      ] = await Promise.all([
        execute("/usr/bin/top", ["-l", "1", "-n", "0"]),
        execute("/usr/sbin/sysctl", ["-n", "hw.memsize"]),
        execute("/usr/bin/vm_stat", []),
        execute("/bin/df", ["-k", "/"]),
        execute("/usr/sbin/netstat", ["-ibn"]),
        execute("/usr/bin/pmset", ["-g", "batt"]),
        execute("/bin/ps", ["-Ao", "pid=,pcpu=,pmem=,comm="]),
        execute("/sbin/ifconfig", []),
      ]);
      return parseSystemCommandOutputs({
        top,
        memsize,
        vmStat,
        df,
        netstat,
        battery,
        processes,
        ifconfig,
      });
    },
    inspectProcess,
    async kill(pid, expected) {
      if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) {
        throw new Error("invalid_pid");
      }
      const current = await inspectProcess(pid);
      if (
        !current || current.pid !== expected.pid ||
        current.command !== expected.command ||
        current.startedAt !== expected.startedAt
      ) throw new Error("process_identity_changed");
      await execute("/bin/kill", ["-TERM", String(pid)]);
      return { ok: true, pid };
    },
    async openApplication(application) {
      if (!ALLOWED_APPLICATIONS.includes(application)) {
        throw new Error("application_not_allowed");
      }
      await execute("/usr/bin/open", ["-a", application]);
      return { ok: true, application };
    },
    async openConsole(serverUrl) {
      let url: URL;
      try {
        url = new URL("/admin", serverUrl);
      } catch {
        throw new Error("https_required");
      }
      if (url.protocol !== "https:") throw new Error("https_required");
      await execute("/usr/bin/open", [url.toString()]);
      return { ok: true, url: url.toString() };
    },
  };
};
