import { expect } from "@std/expect";

import { summarizeFileLibraryHudProgress } from "../src/file-library/hud-state.ts";
import { createPendingFileFingerprint } from "../src/file-library/similarity-core.ts";

Deno.test("HUD duplicate progress ignores virtual Apps and reports active work", () => {
  const progress = summarizeFileLibraryHudProgress([
    { kind: "app" },
    {
      kind: "image",
      fingerprint: {
        version: 1,
        status: "completed",
        exact: { source: "a".repeat(64) },
      },
    },
    { kind: "video", fingerprint: createPendingFileFingerprint() },
  ]);

  expect(progress).toEqual({
    total: 2,
    processed: 1,
    failed: 0,
    active: true,
    ratio: 0.5,
    label: "查重中",
  });
});

Deno.test("HUD duplicate progress exposes completed, failed and empty states", () => {
  expect(summarizeFileLibraryHudProgress([]).label).toBe("等待导入");

  const completed = summarizeFileLibraryHudProgress([
    {
      kind: "text",
      fingerprint: {
        version: 1,
        status: "unsupported",
      },
    },
  ]);
  expect(completed.label).toBe("查重完成");
  expect(completed.ratio).toBe(1);

  const failed = summarizeFileLibraryHudProgress([
    {
      kind: "video",
      fingerprint: {
        version: 1,
        status: "failed",
        error: "decode failed",
      },
    },
  ]);
  expect(failed.label).toBe("部分失败");
  expect(failed.processed).toBe(1);
});
