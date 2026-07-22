import { assertEquals, assertRejects } from "@std/assert";

import {
  createMacSystemAdapter,
  type MacSystemAdapter,
} from "../src/native/mac-system.ts";
import type { ParsedSystemState } from "../src/core/types.ts";

Deno.test("macOS adapter uses fixed executables and argument arrays for monitoring/effects", async () => {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const adapter = createMacSystemAdapter((file, args, callback) => {
    calls.push({ file, args: [...args] });
    if (file === "/usr/sbin/sysctl") return callback(null, "100", "");
    if (args.includes("pid=,lstart=,comm=")) {
      return callback(null, "42 Mon Jul 18 20:00:00 2026 worker\n", "");
    }
    callback(null, "", "");
  });

  await collectOnce(adapter);
  await adapter.kill(42, {
    pid: 42,
    command: "worker",
    startedAt: "Mon Jul 18 20:00:00 2026",
  });
  await adapter.openApplication("Safari");
  await adapter.openConsole("https://console.example");
  await assertRejects(
    () => adapter.openApplication("../../Calculator"),
    Error,
    "application_not_allowed",
  );
  await assertRejects(
    () => adapter.openConsole("http://console.example"),
    Error,
    "https_required",
  );

  assertEquals(calls, [
    {
      file: "/usr/bin/top",
      args: [
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
    },
    { file: "/usr/sbin/sysctl", args: ["-n", "hw.memsize"] },
    { file: "/usr/bin/vm_stat", args: [] },
    { file: "/bin/df", args: ["-k", "/"] },
    { file: "/usr/sbin/netstat", args: ["-ibn"] },
    { file: "/usr/bin/pmset", args: ["-g", "batt"] },
    { file: "/sbin/ifconfig", args: [] },
    {
      file: "/bin/ps",
      args: ["-p", "42", "-o", "pid=,lstart=,comm="],
    },
    { file: "/bin/kill", args: ["-TERM", "42"] },
    { file: "/usr/bin/open", args: ["-a", "Safari"] },
    { file: "/usr/bin/open", args: ["https://console.example/"] },
  ]);
});

Deno.test("macOS adapter includes privacy IPv6 addresses from the full interface state", async () => {
  const stableAddress = "2409:8a62:3214:3940:400:976e:1038:5e26";
  const privacyAddress = "2409:8a62:3214:3940:c52e:bd6f:339d:e79e";
  const adapter = createMacSystemAdapter((file, _args, callback) => {
    if (file === "/usr/sbin/sysctl") return callback(null, "100", "");
    if (file === "/sbin/ifconfig") {
      return callback(
        null,
        `en1: flags=8863<UP>\n` +
          `\tinet6 ${stableAddress} prefixlen 64 autoconf secured\n` +
          `\tinet6 ${privacyAddress} prefixlen 64 autoconf temporary\n`,
        "",
      );
    }
    callback(null, "", "");
  });

  assertEquals((await collectOnce(adapter)).network.ipv6Addresses, [
    stableAddress,
    privacyAddress,
  ]);
});

Deno.test("system collection starts every fixed command asynchronously in parallel", async () => {
  const started: string[] = [];
  const pending = new Map<
    string,
    (error: Error | null, stdout: string, stderr: string) => void
  >();
  const adapter = createMacSystemAdapter((file, _args, callback) => {
    started.push(file);
    pending.set(file, callback);
  });

  const collecting = collectOnce(adapter);
  await Promise.resolve();
  assertEquals(started, [
    "/usr/bin/top",
    "/usr/sbin/sysctl",
    "/usr/bin/vm_stat",
    "/bin/df",
    "/usr/sbin/netstat",
    "/usr/bin/pmset",
    "/sbin/ifconfig",
  ]);
  for (const callback of pending.values()) callback(null, "", "");
  assertEquals((await collecting).processes, []);
});

const collectOnce = (adapter: MacSystemAdapter) =>
  new Promise<ParsedSystemState>(
    (resolve, reject) => {
      adapter.collect((error, state) => {
        if (error) reject(error);
        else if (state) resolve(state);
        else reject(new Error("missing system state"));
      });
    },
  );
