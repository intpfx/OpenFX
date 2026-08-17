import { expect } from "@std/expect";

import { createPrivateMeshCatalogRefreshQueue } from "../src/file-library/private-mesh-catalog-sync.ts";

Deno.test("private mesh catalog refresh queue coalesces repeated invalidations", async () => {
  const calls: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstRefresh = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const queue = createPrivateMeshCatalogRefreshQueue(async (nodeId) => {
    calls.push(nodeId);
    if (calls.length === 1) await firstRefresh;
  });

  queue.schedule("ipad");
  await Promise.resolve();
  queue.schedule("ipad");
  queue.schedule("ipad");
  queue.schedule("iphone");
  await Promise.resolve();

  expect(calls).toEqual(["ipad", "iphone"]);
  releaseFirst?.();
  await queue.whenIdle();

  expect(calls).toEqual(["ipad", "iphone", "ipad"]);
});

Deno.test("private mesh catalog refresh queue cancels a trailing refresh", async () => {
  let calls = 0;
  let releaseFirst: (() => void) | undefined;
  const firstRefresh = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const queue = createPrivateMeshCatalogRefreshQueue(async () => {
    calls += 1;
    if (calls === 1) await firstRefresh;
  });

  queue.schedule("ipad");
  await Promise.resolve();
  queue.schedule("ipad");
  queue.cancel("ipad");
  releaseFirst?.();
  await queue.whenIdle();

  expect(calls).toBe(1);
});
