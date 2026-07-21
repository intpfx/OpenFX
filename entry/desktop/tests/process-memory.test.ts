import { assertEquals } from "@std/assert";

import {
  parseVmmapSummary,
  runProcessMemorySampling,
} from "../src/core/process-memory.ts";

Deno.test("vmmap summary parses physical and IOAccelerator values", () => {
  const fixture = `
Process:         OpenFX Node [12345]
Physical footprint:         34.7G

REGION TYPE                      SIZE    COUNT (non-coalesced)
===========                   =======  =======
IOAccelerator                   37.8G      381
`;

  assertEquals(parseVmmapSummary(fixture), {
    physicalFootprintBytes: 34.7 * 1024 ** 3,
    ioAcceleratorVirtualBytes: 37.8 * 1024 ** 3,
    ioAcceleratorRegionCount: 381,
  });
});

Deno.test("vmmap summary parses the real multi-column IOAccelerator row", () => {
  const fixture = `
Physical footprint:         128.5M
IOAccelerator (graphics)      9G    9G    9G    9G    9G    9G    9G  999
IOAccelerator                64K   64K   64K    0K    0K    0K    0K    2
`;

  assertEquals(parseVmmapSummary(fixture), {
    physicalFootprintBytes: 128.5 * 1024 ** 2,
    ioAcceleratorVirtualBytes: 64 * 1024,
    ioAcceleratorRegionCount: 2,
  });
});

Deno.test("vmmap summary converts binary K, M, and G units", () => {
  assertEquals(
    parseVmmapSummary("Physical footprint: 512K").physicalFootprintBytes,
    512 * 1024,
  );
  assertEquals(
    parseVmmapSummary("Physical footprint: 512M").physicalFootprintBytes,
    512 * 1024 ** 2,
  );
  assertEquals(
    parseVmmapSummary("Physical footprint: 1.5G").physicalFootprintBytes,
    1.5 * 1024 ** 3,
  );
});

Deno.test("vmmap summary accepts flexible row whitespace", () => {
  const snapshot = parseVmmapSummary(
    "  Physical footprint:\t768.25M  \n\tIOAccelerator\t64K\t  7  ",
  );

  assertEquals(snapshot, {
    physicalFootprintBytes: 768.25 * 1024 ** 2,
    ioAcceleratorVirtualBytes: 64 * 1024,
    ioAcceleratorRegionCount: 7,
  });
});

Deno.test("vmmap summary reports absent and malformed fields as null", () => {
  assertEquals(parseVmmapSummary("Physical footprint: 512M"), {
    physicalFootprintBytes: 512 * 1024 ** 2,
    ioAcceleratorVirtualBytes: null,
    ioAcceleratorRegionCount: null,
  });
  assertEquals(
    parseVmmapSummary(
      "Physical footprint: unknown\nIOAccelerator 64T 8\nOther 64M 99",
    ),
    {
      physicalFootprintBytes: null,
      ioAcceleratorVirtualBytes: null,
      ioAcceleratorRegionCount: null,
    },
  );
  assertEquals(
    parseVmmapSummary("Physical footprint:\n512M\nIOAccelerator\n64M\n8"),
    {
      physicalFootprintBytes: null,
      ioAcceleratorVirtualBytes: null,
      ioAcceleratorRegionCount: null,
    },
  );
});

Deno.test("memory sampling preserves diagnostics when a later sample throws", async () => {
  const baseline = {
    physicalFootprintBytes: 100 * 1024 ** 2,
    ioAcceleratorVirtualBytes: 64 * 1024 ** 2,
    ioAcceleratorRegionCount: 2,
  };
  const second = {
    physicalFootprintBytes: 120 * 1024 ** 2,
    ioAcceleratorVirtualBytes: 72 * 1024 ** 2,
    ioAcceleratorRegionCount: 2,
  };
  const sampledIndexes: number[] = [];
  const delays: number[] = [];

  const result = await runProcessMemorySampling({
    sampleCount: 3,
    sampleIntervalMs: 30_000,
    ioAcceleratorRegionGrowthLimit: 0,
    ioAcceleratorVirtualGrowthLimitBytes: 64 * 1024 ** 2,
    physicalFootprintGrowthLimitBytes: 96 * 1024 ** 2,
    delay(milliseconds: number) {
      delays.push(milliseconds);
      return Promise.resolve();
    },
    sample(index: number) {
      sampledIndexes.push(index);
      if (index === 2) {
        return Promise.reject(new Error("verified PID changed before vmmap"));
      }
      return Promise.resolve(index === 0 ? baseline : second);
    },
  });

  assertEquals(sampledIndexes, [0, 1, 2]);
  assertEquals(delays, [30_000, 30_000]);
  assertEquals(result, {
    passed: false,
    reason: "memory sample 2 failed: verified PID changed before vmmap",
    baseline: { index: 0, snapshot: baseline },
    peak: second,
    final: { index: 1, snapshot: second },
    failure: null,
  });
});
