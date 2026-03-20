import { describe, expect, it } from "vitest";
import { buildCumulativeSeries } from "./sparkline-data";
import type { CreditExpense } from "@/api/credit-types";

function expense(time: number, totalAleph: number): CreditExpense {
  return {
    hash: `h-${time}`,
    time,
    type: "execution",
    totalAleph,
    creditCount: 1,
    creditPriceAleph: 0.00005,
    credits: [],
  };
}

describe("buildCumulativeSeries", () => {
  it("returns empty array for empty input", () => {
    expect(buildCumulativeSeries([], 3600)).toEqual([]);
  });

  it("buckets expenses into hourly intervals with cumulative sum", () => {
    const base = 1_000_000;
    const expenses = [
      expense(base + 100, 10), // hour 0
      expense(base + 200, 5), // hour 0
      expense(base + 3700, 20), // hour 1
    ];
    const series = buildCumulativeSeries(expenses, 3600);

    // Two buckets: hour 0 cumulative = 15, hour 1 cumulative = 35
    expect(series).toHaveLength(2);
    expect(series[0]!.value).toBeCloseTo(15);
    expect(series[1]!.value).toBeCloseTo(35);
  });

  it("fills gaps between buckets with the last cumulative value", () => {
    const base = 1_000_000;
    const expenses = [
      expense(base + 100, 10), // hour 0
      expense(base + 7300, 5), // hour 2 (gap at hour 1)
    ];
    const series = buildCumulativeSeries(expenses, 3600);

    // 3 buckets: hour 0 = 10, hour 1 (fill) = 10, hour 2 = 15
    expect(series).toHaveLength(3);
    expect(series[0]!.value).toBeCloseTo(10);
    expect(series[1]!.value).toBeCloseTo(10);
    expect(series[2]!.value).toBeCloseTo(15);
  });

  it("handles single expense", () => {
    const series = buildCumulativeSeries([expense(1_000_000, 42)], 3600);
    expect(series).toHaveLength(1);
    expect(series[0]!.value).toBeCloseTo(42);
  });

  it("uses daily buckets correctly", () => {
    const base = 1_000_000;
    const DAY = 86400;
    const expenses = [
      expense(base + 100, 10),
      expense(base + DAY + 100, 20),
      expense(base + 2 * DAY + 100, 30),
    ];
    const series = buildCumulativeSeries(expenses, DAY);

    expect(series).toHaveLength(3);
    expect(series[0]!.value).toBeCloseTo(10);
    expect(series[1]!.value).toBeCloseTo(30);
    expect(series[2]!.value).toBeCloseTo(60);
  });
});
