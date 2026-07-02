import { describe, it, expect } from "vitest";
import { buildRevenueSeries } from "@/lib/revenue-series";
import type { BuyflowMonth } from "@/api/buyflow-types";

function month(m: string, usd: number): BuyflowMonth {
  return { month: m, usd, credits: 0, purchases: 0 };
}

describe("buildRevenueSeries", () => {
  it("returns an empty series for no months", () => {
    expect(buildRevenueSeries([])).toEqual([]);
  });

  it("accumulates USD across months in chronological order", () => {
    const series = buildRevenueSeries([
      month("2026-02", 10),
      month("2026-01", 5),
      month("2026-03", 20),
    ]);
    expect(series.map((p) => p.value)).toEqual([5, 15, 35]);
  });

  it("sorts unordered input and keeps timestamps ascending", () => {
    const series = buildRevenueSeries([
      month("2026-03", 1),
      month("2025-12", 1),
    ]);
    expect(series[0]!.t).toBeLessThan(series[1]!.t);
  });

  it("maps a month label to the UTC start-of-month timestamp", () => {
    const [point] = buildRevenueSeries([month("2026-06", 100)]);
    expect(point!.t).toBe(Math.floor(Date.UTC(2026, 5, 1) / 1000));
  });

  it("prefers processed on-chain revenue when the aggregate carries it", () => {
    const series = buildRevenueSeries([
      { ...month("2026-05", 10), processedUsd: 0 },
      { ...month("2026-06", 20), processedUsd: 500 },
    ]);
    // Purchase USD is ignored once any month has processedUsd > 0, so the
    // sparkline matches the Total Revenue headline.
    expect(series.map((p) => p.value)).toEqual([0, 500]);
  });
});
