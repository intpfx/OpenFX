import { expect } from "@std/expect";

import {
  findDuplicateGroups,
  hammingDistanceHex,
  type SimilarityCandidate,
} from "../src/file-library/similarity-core.ts";
import {
  filterLibraryItems,
  type LibraryItem,
  parseLibraryIndex,
} from "../src/file-library/model.ts";
import { sha256Blob } from "../src/file-library/similarity-analysis.ts";
import { buildVideoFingerprintTimestamps } from "../src/file-library/video-thumbnail.ts";

Deno.test("PDQ hash distance counts different bits", () => {
  expect(hammingDistanceHex("00".repeat(32), "00".repeat(32))).toBe(0);
  expect(hammingDistanceHex("00".repeat(32), "ff".repeat(32))).toBe(256);
  expect(hammingDistanceHex("00".repeat(31) + "0f", "00".repeat(32))).toBe(4);
});

Deno.test("exact fingerprint hashes original bytes with SHA-256", async () => {
  expect(await sha256Blob(new Blob(["hello"]))).toBe(
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});

Deno.test("video fingerprint samples eight relative positions away from end frames", () => {
  expect(buildVideoFingerprintTimestamps(100)).toEqual([
    8,
    20,
    32,
    44,
    56,
    68,
    80,
    92,
  ]);
  expect(buildVideoFingerprintTimestamps(0)).toEqual([]);
});

Deno.test("exact duplicate groups require every stored component to match", () => {
  const candidates: SimilarityCandidate[] = [
    {
      id: "text-a",
      kind: "text",
      fingerprint: {
        version: 1,
        status: "completed",
        exact: { source: "source-a" },
      },
    },
    {
      id: "text-b",
      kind: "text",
      fingerprint: {
        version: 1,
        status: "completed",
        exact: { source: "source-a" },
      },
    },
    {
      id: "live-a",
      kind: "live-photo",
      fingerprint: {
        version: 1,
        status: "completed",
        exact: { source: "still-a", motion: "motion-a" },
      },
    },
    {
      id: "live-b",
      kind: "live-photo",
      fingerprint: {
        version: 1,
        status: "completed",
        exact: { source: "still-a", motion: "motion-b" },
      },
    },
  ];

  expect(findDuplicateGroups(candidates)).toEqual([
    {
      id: "exact:source-a",
      type: "exact",
      itemIds: ["text-a", "text-b"],
      similarity: 1,
    },
  ]);
});

Deno.test("visual duplicate groups respect image, video, and Live Photo semantics", () => {
  const black = "00".repeat(32);
  const nearBlack = "00".repeat(31) + "0f";
  const white = "ff".repeat(32);
  const completed = (
    overrides: Omit<
      NonNullable<SimilarityCandidate["fingerprint"]>,
      "version" | "status"
    >,
  ) => ({
    version: 1 as const,
    status: "completed" as const,
    ...overrides,
  });
  const video = (hashes: string[], durationSec = 100) => ({
    durationSec,
    timestampsSec: hashes.map((_, index) => index * 10),
    hashes,
  });
  const candidates: SimilarityCandidate[] = [
    {
      id: "image-a",
      kind: "image",
      fingerprint: completed({ exact: { source: "a" }, still: { hash: black } }),
    },
    {
      id: "image-b",
      kind: "image",
      fingerprint: completed({
        exact: { source: "b" },
        still: { hash: nearBlack },
      }),
    },
    {
      id: "image-c",
      kind: "image",
      fingerprint: completed({ exact: { source: "c" }, still: { hash: white } }),
    },
    {
      id: "video-a",
      kind: "video",
      fingerprint: completed({
        exact: { source: "v-a" },
        video: video([black, nearBlack, black, nearBlack]),
      }),
    },
    {
      id: "video-b",
      kind: "video",
      fingerprint: completed({
        exact: { source: "v-b" },
        video: video([black, black, nearBlack, nearBlack], 103),
      }),
    },
    {
      id: "live-a",
      kind: "live-photo",
      fingerprint: completed({
        exact: { source: "l-a", motion: "lm-a" },
        still: { hash: black },
        video: video([black, black, black, black]),
      }),
    },
    {
      id: "live-b",
      kind: "live-photo",
      fingerprint: completed({
        exact: { source: "l-b", motion: "lm-b" },
        still: { hash: nearBlack },
        video: video([white, white, white, white]),
      }),
    },
  ];

  expect(findDuplicateGroups(candidates)).toEqual([
    {
      id: "similar:image-a:image-b",
      type: "similar",
      itemIds: ["image-a", "image-b"],
      similarity: 0.984375,
    },
    {
      id: "similar:video-a:video-b",
      type: "similar",
      itemIds: ["video-a", "video-b"],
      similarity: 0.9921875,
    },
  ]);
});

Deno.test("older indexes queue fingerprinting and duplicate view exposes match members", () => {
  const storedItem = (id: string) => ({
    id,
    name: `${id}.txt`,
    kind: "text" as const,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    size: 8,
    source: {
      path: `/items/${id}/source`,
      name: `${id}.txt`,
      type: "text/plain",
      size: 8,
      lastModified: 0,
    },
  });
  const migrated = parseLibraryIndex({
    version: 3,
    items: [storedItem("one"), storedItem("two")],
  });
  expect(migrated.version).toBe(4);
  expect(migrated.items.map((item) => item.fingerprint?.status)).toEqual([
    "pending",
    "pending",
  ]);

  const completed = migrated.items.map((item) => ({
    ...item,
    fingerprint: {
      version: 1 as const,
      status: "completed" as const,
      exact: { source: "same" },
    },
  })) satisfies LibraryItem[];
  expect(filterLibraryItems(completed, "duplicates")).toEqual(completed);
});
