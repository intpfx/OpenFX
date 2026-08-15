/**
 * Unit tests for the workspace aggregation math.
 * @module dsh-balance-sidebar/aggregate.test
 */

import { describe, expect, it } from "vitest";
import {
  type AggregateOptions,
  aggregateWorkspaces,
  sumTokens,
  totalOf,
  ungroupedSessionIds,
  ZERO_TOKENS,
} from "./aggregate.ts";

const usage = (
  uncachedInputTokens: number,
  outputTokens = 0,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
) => ({
  uncachedInputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
});

const opts = (costs: Record<string, number> = {}): AggregateOptions => ({
  usageOf: (id) => (id.startsWith("s") ? usage(1000) : undefined),
  costOf: (id) => costs[id],
});

describe("sumTokens / totalOf", () => {
  it("sums buckets and totals them", () => {
    const a = usage(1, 2, 3, 4);
    const b = usage(10, 20, 30, 40);
    const sum = sumTokens(a, b);
    expect(sum).toEqual(usage(11, 22, 33, 44));
    expect(totalOf(sum)).toBe(110);
    expect(totalOf(ZERO_TOKENS)).toBe(0);
  });
});

describe("ungroupedSessionIds", () => {
  it("keeps sessions not assigned to a workspace and not archived", () => {
    const workspaces = [{ sessionIds: ["s1", "s2"] }, { sessionIds: ["s3"] }];
    expect(
      ungroupedSessionIds(["s1", "s2", "s3", "s4", "s5"], workspaces, ["s5"]),
    ).toEqual(["s4"]);
  });

  it("returns everything when no workspaces exist", () => {
    expect(ungroupedSessionIds(["s1", "s2"], [], [])).toEqual(["s1", "s2"]);
  });
});

describe("aggregateWorkspaces", () => {
  it("folds per-workspace tokens and costs in input order", () => {
    const workspaces = [
      { id: "w1", title: "Alpha", sessionIds: ["s1", "s2"] },
      { id: "w2", title: "Beta", sessionIds: ["s3"] },
    ];
    const rows = aggregateWorkspaces(
      workspaces,
      [],
      opts({ s1: 0.5, s2: 1.5, s3: 2 }),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.workspaceId).toBe("w1");
    expect(rows[0]!.totalTokens).toBe(2000);
    expect(rows[0]!.cost).toBe(2);
    expect(rows[0]!.pricedSessions).toBe(2);
    expect(rows[1]!.cost).toBe(2);
    expect(rows[1]!.pricedSessions).toBe(1);
  });

  it("appends the ungrouped bucket when loose sessions exist", () => {
    const rows = aggregateWorkspaces([], ["s9"], opts({ s9: 3 }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.workspaceId).toBeUndefined();
    expect(rows[0]!.totalTokens).toBe(1000);
    expect(rows[0]!.cost).toBe(3);
  });

  it("skips the ungrouped bucket when there are no loose sessions", () => {
    expect(
      aggregateWorkspaces(
        [{ id: "w1", title: "A", sessionIds: ["s1"] }],
        [],
        opts(),
      ),
    ).toHaveLength(1);
  });

  it("prices unpriced sessions as zero with no priced count", () => {
    const rows = aggregateWorkspaces(
      [{ id: "w1", title: "A", sessionIds: ["s1"] }],
      [],
      opts(),
    );
    expect(rows[0]!.cost).toBe(0);
    expect(rows[0]!.pricedSessions).toBe(0);
  });
});
