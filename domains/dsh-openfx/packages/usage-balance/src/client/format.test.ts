/**
 * Unit tests for the browser formatting helpers and widget pure functions.
 * @module dsh-usage-balance/client/format.test
 */

import { describe, expect, it } from "vitest";
import { aggregateRows, buildCostMap, heatColor } from "./UsageBalanceWidget.tsx";
import { formatBalance, formatMoney, formatTokens } from "./format.ts";

describe("formatTokens", () => {
  it("renders compact magnitudes", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(517)).toBe("517");
    expect(formatTokens(12_200)).toBe("12.2K");
    expect(formatTokens(517_000)).toBe("517K");
    expect(formatTokens(1_234_567)).toBe("1.2M");
    expect(formatTokens(1_234_567_890)).toBe("1.2B");
  });

  it("handles non-finite input", () => {
    expect(formatTokens(Number.NaN)).toBe("0");
    expect(formatTokens(-5)).toBe("0");
  });
});

describe("formatMoney", () => {
  it("scales decimals by magnitude", () => {
    expect(formatMoney(1234.5)).toBe("¥1,235");
    expect(formatMoney(12.345)).toBe("¥12.35");
    expect(formatMoney(0.0123)).toBe("¥0.012");
    expect(formatMoney(0)).toBe("¥0.000");
    expect(formatMoney(Number.NaN)).toBe("—");
  });
});

describe("formatBalance", () => {
  it("keeps two fixed decimals", () => {
    expect(formatBalance(4.16)).toBe("¥4.16");
    expect(formatBalance(1234.5)).toBe("¥1,234.50");
    expect(formatBalance(undefined)).toBe("—");
  });
});

describe("heatColor", () => {
  it("clamps the share and scales alpha", () => {
    expect(heatColor(0)).toMatch(/^hsla\(210, 70%, 50%, 0\.120\)$/);
    expect(heatColor(1)).toMatch(/^hsla\(210, 70%, 50%, 1\.000\)$/);
    expect(heatColor(-1)).toBe(heatColor(0));
    expect(heatColor(2)).toBe(heatColor(1));
  });
});

describe("buildCostMap", () => {
  const session = (id: string, usage: object | undefined, blank = false) => ({
    id,
    blank,
    projectionValues: usage === undefined ? undefined : { tokenUsage: usage },
  });

  it("prefers host-priced costs", () => {
    const sessions = [
      session("s1", {
        uncachedInputTokens: 100,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ];
    const map = buildCostMap(sessions, {
      balance: { fetchedAt: 0, available: true, balances: [] },
      costs: {
        sessions: { s1: { cost: 0.75, currency: "CNY" } as never },
        pricedAt: 0,
      },
    });
    expect(map.get("s1")).toBe(0.75);
  });

  it("falls back to flash pricing over projection tokens", () => {
    const sessions = [
      session("s1", {
        uncachedInputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ];
    const map = buildCostMap(sessions, undefined);
    expect(map.get("s1")).toBeCloseTo(1, 10);
  });

  it("skips blank sessions and sessions without usage", () => {
    const sessions = [session("s1", undefined), session("s2", undefined, true)];
    const map = buildCostMap(sessions, undefined);
    expect(map.size).toBe(0);
  });
});

describe("aggregateRows", () => {
  it("aggregates workspace rows from session projections and the cost map", () => {
    const sessions = {
      ids: ["s1", "s2", "s3"],
      byId: {
        s1: {
          id: "s1",
          blank: false,
          projectionValues: {
            tokenUsage: {
              uncachedInputTokens: 1000,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
          },
        },
        s2: {
          id: "s2",
          blank: false,
          projectionValues: {
            tokenUsage: {
              uncachedInputTokens: 2000,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
          },
        },
        s3: {
          id: "s3",
          blank: false,
          projectionValues: {
            tokenUsage: {
              uncachedInputTokens: 500,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
          },
        },
      },
    } as never;
    const workspaces = {
      items: [{ workspaceId: "w1", title: "Alpha", sessionIds: ["s1", "s2"] }],
      archivedSessionIds: [],
    };
    const rows = aggregateRows(
      sessions,
      workspaces,
      new Map([["s1", 0.25], ["s3", 0.5]]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.workspaceId).toBe("w1");
    expect(rows[0]!.totalTokens).toBe(3000);
    expect(rows[0]!.cost).toBe(0.25);
    expect(rows[1]!.workspaceId).toBeUndefined();
    expect(rows[1]!.totalTokens).toBe(500);
    expect(rows[1]!.cost).toBe(0.5);
  });
});
