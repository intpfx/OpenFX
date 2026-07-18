import { assertEquals } from "@std/assert";

import { createMacSystemAdapter } from "../src/native/mac-system.ts";

Deno.test("macOS adapter uses fixed executables and argument arrays for monitoring/effects", async () => {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const adapter = createMacSystemAdapter((file, args) => {
    calls.push({ file, args: [...args] });
    if (file === "/usr/sbin/sysctl") return "100";
    return "";
  });

  await adapter.collect();
  await adapter.kill(42);
  await adapter.openApplication("Safari");
  assertEquals(await adapter.openApplication("../../Calculator"), {
    ok: false,
    error: "application_not_allowed",
  });

  assertEquals(calls, [
    { file: "/usr/bin/top", args: ["-l", "1", "-n", "0"] },
    { file: "/usr/sbin/sysctl", args: ["-n", "hw.memsize"] },
    { file: "/usr/bin/vm_stat", args: [] },
    { file: "/bin/df", args: ["-k", "/"] },
    { file: "/usr/sbin/netstat", args: ["-ibn"] },
    { file: "/usr/bin/pmset", args: ["-g", "batt"] },
    { file: "/bin/ps", args: ["-Ao", "pid=,pcpu=,pmem=,comm="] },
    { file: "/sbin/ifconfig", args: [] },
    { file: "/bin/kill", args: ["-TERM", "42"] },
    { file: "/usr/bin/open", args: ["-a", "Safari"] },
  ]);
});
