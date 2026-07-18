import { execFileSync } from "node:child_process";

import { parseSystemCommandOutputs } from "../core/system-parsers.ts";
import type { ParsedSystemState } from "../core/types.ts";

export const ALLOWED_APPLICATIONS = Object.freeze([
  "Activity Monitor",
  "Finder",
  "Safari",
  "System Settings",
]);

export type MacExecFile = (
  file: string,
  args: readonly string[],
) => string;

export interface MacSystemAdapter {
  collect(): Promise<ParsedSystemState>;
  kill(pid: number): Promise<{ ok: true; pid: number }>;
  openApplication(
    application: string,
  ): Promise<{ ok: boolean; application?: string; error?: string }>;
}

const executeSystemFile: MacExecFile = (file, args) =>
  String(execFileSync(file, [...args], { encoding: "utf8", timeout: 8_000 }));

export const createMacSystemAdapter = (
  execute: MacExecFile = executeSystemFile,
): MacSystemAdapter => ({
  collect() {
    return Promise.resolve(parseSystemCommandOutputs({
      top: execute("/usr/bin/top", ["-l", "1", "-n", "0"]),
      memsize: execute("/usr/sbin/sysctl", ["-n", "hw.memsize"]),
      vmStat: execute("/usr/bin/vm_stat", []),
      df: execute("/bin/df", ["-k", "/"]),
      netstat: execute("/usr/sbin/netstat", ["-ibn"]),
      battery: execute("/usr/bin/pmset", ["-g", "batt"]),
      processes: execute("/bin/ps", ["-Ao", "pid=,pcpu=,pmem=,comm="]),
      ifconfig: execute("/sbin/ifconfig", []),
    }));
  },
  kill(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 1) {
      return Promise.reject(new Error("invalid_pid"));
    }
    execute("/bin/kill", ["-TERM", String(pid)]);
    return Promise.resolve({ ok: true, pid });
  },
  openApplication(application) {
    if (!ALLOWED_APPLICATIONS.includes(application)) {
      return Promise.resolve({ ok: false, error: "application_not_allowed" });
    }
    execute("/usr/bin/open", ["-a", application]);
    return Promise.resolve({ ok: true, application });
  },
});
