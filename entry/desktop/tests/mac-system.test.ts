import { assertEquals, assertRejects } from "@std/assert";

import { createMacSystemAdapter } from "../src/native/mac-system.ts";

Deno.test("macOS adapter uses fixed executables and argument arrays for monitoring/effects", async () => {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const adapter = createMacSystemAdapter((file, args) => {
    calls.push({ file, args: [...args] });
    if (file === "/usr/sbin/sysctl") return Promise.resolve("100");
    if (args.includes("pid=,lstart=,comm=")) {
      return Promise.resolve("42 Mon Jul 18 20:00:00 2026 worker\n");
    }
    return Promise.resolve("");
  });

  await adapter.collect();
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
    { file: "/usr/bin/top", args: ["-l", "1", "-n", "0"] },
    { file: "/usr/sbin/sysctl", args: ["-n", "hw.memsize"] },
    { file: "/usr/bin/vm_stat", args: [] },
    { file: "/bin/df", args: ["-k", "/"] },
    { file: "/usr/sbin/netstat", args: ["-ibn"] },
    { file: "/usr/bin/pmset", args: ["-g", "batt"] },
    { file: "/bin/ps", args: ["-Ao", "pid=,pcpu=,pmem=,comm="] },
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

Deno.test("system collection starts every fixed command asynchronously in parallel", async () => {
  const started: string[] = [];
  const pending = new Map<string, (value: string) => void>();
  const adapter = createMacSystemAdapter((file) => {
    started.push(file);
    return new Promise<string>((resolve) => pending.set(file, resolve));
  });

  const collecting = adapter.collect();
  await Promise.resolve();
  assertEquals(started, [
    "/usr/bin/top",
    "/usr/sbin/sysctl",
    "/usr/bin/vm_stat",
    "/bin/df",
    "/usr/sbin/netstat",
    "/usr/bin/pmset",
    "/bin/ps",
    "/sbin/ifconfig",
  ]);
  for (const resolve of pending.values()) resolve("");
  assertEquals((await collecting).processes, []);
});
