/**
 * Unit tests for the pure cost math.
 * @module dsh-usage-balance/cost.test
 */

import { describe, expect, it } from "vitest";
import {
  breakdownOfUsage,
  costOfTokens,
  costOfUsage,
  FLASH_COST_CONFIG,
  PRO_COST_CONFIG,
  resolveCostConfig,
} from "./cost.ts";

describe("costOfTokens", () => {
  it("prices per million tokens", () => {
    expect(costOfTokens(1_000_000, 1)).toBe(1);
    expect(costOfTokens(500_000, 1)).toBe(0.5);
    expect(costOfTokens(50_000, 0.02)).toBe(0.001);
  });

  it("returns zero for non-positive or non-finite counts", () => {
    expect(costOfTokens(0, 1)).toBe(0);
    expect(costOfTokens(-10, 1)).toBe(0);
    expect(costOfTokens(Number.NaN, 1)).toBe(0);
    expect(costOfTokens(Number.POSITIVE_INFINITY, 1)).toBe(0);
  });
});

describe("costOfUsage", () => {
  it("sums the three billed buckets at flash prices", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadTokens: 1_000_000,
    };
    // 1 (input) + 0.02 (cache read) + 1 (output); cacheWrite unpriced
    expect(costOfUsage(usage, FLASH_COST_CONFIG)).toBeCloseTo(2.02, 10);
  });

  it("uses pro prices", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(costOfUsage(usage, PRO_COST_CONFIG)).toBeCloseTo(9, 10);
  });

  it("treats missing buckets as zero", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0 };
    expect(costOfUsage(usage, resolveCostConfig())).toBeCloseTo(1, 10);
  });
});

describe("breakdownOfUsage", () => {
  it("breaks down per bucket and sums to the total", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadTokens: 250_000,
      cacheWriteTokens: 100_000,
    };
    const breakdown = breakdownOfUsage(usage, FLASH_COST_CONFIG);
    expect(breakdown.input).toBeCloseTo(1, 10);
    expect(breakdown.output).toBeCloseTo(1, 10);
    expect(breakdown.cacheRead).toBeCloseTo(0.005, 10);
    expect(breakdown.cacheWrite).toBe(0);
    expect(breakdown.total).toBeCloseTo(2.005, 10);
  });
});
