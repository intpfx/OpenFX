import { execFile } from "node:child_process";

import { parseSystemCommandOutputs } from "../core/system-parsers.ts";
import type { ProcessIdentity } from "../core/agent-runtime.ts";
import { ALLOWED_APPLICATIONS } from "../core/effect-policy.ts";
import type { ParsedSystemState, SystemCommandOutputs } from "../core/types.ts";

export type MacExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;
export type MacExecFile = (
  file: string,
  args: readonly string[],
  callback: MacExecFileCallback,
) => void;
export type MacSystemCollectionCallback = (
  error: unknown | null,
  state: ParsedSystemState | null,
) => void;

export interface MacSystemAdapter {
  collect(callback: MacSystemCollectionCallback): void;
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

const executeSystemFile: MacExecFile = (file, args, callback) =>
  execFile(
    file,
    [...args],
    { encoding: "utf8", timeout: 8_000, shell: false },
    (error, stdout, stderr) => {
      callback(error, String(stdout), String(stderr));
    },
  );

const SYSTEM_COMMANDS = [
  [
    "top",
    "/usr/bin/top",
    [
      "-l",
      "2",
      "-s",
      "1",
      "-o",
      "cpu",
      "-n",
      "100",
      "-stats",
      "pid,cpu,mem,command",
    ],
  ],
  ["memsize", "/usr/sbin/sysctl", ["-n", "hw.memsize"]],
  ["vmStat", "/usr/bin/vm_stat", []],
  ["df", "/bin/df", ["-k", "/"]],
  ["netstat", "/usr/sbin/netstat", ["-ibn"]],
  ["battery", "/usr/bin/pmset", ["-g", "batt"]],
  ["networkState", "/usr/sbin/scutil", ["--nwi"]],
] as const satisfies ReadonlyArray<
  readonly [
    Exclude<keyof SystemCommandOutputs, "processes">,
    string,
    readonly string[],
  ]
>;

const executeOnce = (
  execute: MacExecFile,
  file: string,
  args: readonly string[],
): Promise<string> =>
  new Promise((resolve, reject) => {
    execute(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(commandError(error, stderr));
        return;
      }
      resolve(stdout);
    });
  });

const collectSystemState = (
  execute: MacExecFile,
  callback: MacSystemCollectionCallback,
): void => {
  const outputs: SystemCommandOutputs = {
    top: "",
    memsize: "",
    vmStat: "",
    df: "",
    netstat: "",
    battery: "",
    processes: "",
    networkState: "",
  };
  let remaining = SYSTEM_COMMANDS.length;
  let settled = false;
  for (const [key, file, args] of SYSTEM_COMMANDS) {
    execute(file, args, (error, stdout, stderr) => {
      if (settled) return;
      if (error) {
        settled = true;
        clearSystemCommandOutputs(outputs);
        callback(commandError(error, stderr), null);
        return;
      }
      outputs[key] = stdout;
      remaining -= 1;
      if (remaining > 0) return;
      settled = true;
      outputs.processes = outputs.top;
      try {
        const state = parseSystemCommandOutputs(outputs);
        clearSystemCommandOutputs(outputs);
        callback(null, state);
      } catch (parseError) {
        clearSystemCommandOutputs(outputs);
        callback(parseError, null);
      }
    });
  }
};

const clearSystemCommandOutputs = (outputs: SystemCommandOutputs): void => {
  outputs.top = "";
  outputs.memsize = "";
  outputs.vmStat = "";
  outputs.df = "";
  outputs.netstat = "";
  outputs.battery = "";
  outputs.processes = "";
  outputs.networkState = "";
};

const commandError = (error: Error, stderr: string): Error =>
  new Error(`${error.message}: ${stderr.trim()}`);

export const createMacSystemAdapter = (
  execute: MacExecFile = executeSystemFile,
): MacSystemAdapter => {
  const inspectProcess = async (pid: number): Promise<ProcessIdentity | null> => {
    if (!Number.isSafeInteger(pid) || pid <= 1) return Promise.resolve(null);
    const output = (await executeOnce(execute, "/bin/ps", [
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
    collect: (callback) => collectSystemState(execute, callback),
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
      await executeOnce(execute, "/bin/kill", ["-TERM", String(pid)]);
      return { ok: true, pid };
    },
    async openApplication(application) {
      if (!ALLOWED_APPLICATIONS.includes(application)) {
        throw new Error("application_not_allowed");
      }
      await executeOnce(execute, "/usr/bin/open", ["-a", application]);
      return { ok: true, application };
    },
    async openConsole(serverUrl) {
      let url: URL;
      try {
        url = new URL("/", serverUrl);
      } catch {
        throw new Error("https_required");
      }
      if (url.protocol !== "https:") throw new Error("https_required");
      await executeOnce(execute, "/usr/bin/open", [url.toString()]);
      return { ok: true, url: url.toString() };
    },
  };
};
