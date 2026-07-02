import type { BuyflowMonth } from "@/api/buyflow-types";
import type { SparklinePoint } from "@/lib/sparkline-data";

/**
 * Build a cumulative-USD sparkline series from the buyflow `monthly`
 * breakdown. Months are sorted ascending and summed into a running total so
 * the line always climbs — the same cumulative-revenue feel as the spend-side
 * Credits page.
 *
 * Uses `processedUsd` (all payments processed on-chain) when the aggregate
 * carries it, so the sparkline matches the Total Revenue headline; falls
 * back to credit-purchase USD for older aggregates.
 *
 * @param monthly — buyflow monthly rollups (any order)
 */
export function buildRevenueSeries(monthly: BuyflowMonth[]): SparklinePoint[] {
  if (monthly.length === 0) return [];

  const sorted = [...monthly].sort((a, b) => a.month.localeCompare(b.month));
  const hasProcessed = sorted.some((m) => (m.processedUsd ?? 0) > 0);

  const points: SparklinePoint[] = [];
  let cumulative = 0;
  for (const m of sorted) {
    cumulative += hasProcessed ? (m.processedUsd ?? 0) : m.usd;
    points.push({ t: monthStartSeconds(m.month), value: cumulative });
  }
  return points;
}

/** Convert a "YYYY-MM" label to the epoch-seconds start of that month (UTC). */
function monthStartSeconds(month: string): number {
  const [year, mon] = month.split("-").map((n) => Number(n));
  return Math.floor(Date.UTC(year ?? 1970, (mon ?? 1) - 1, 1) / 1000);
}
