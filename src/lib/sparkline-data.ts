import type { CreditExpense } from "@/api/credit-types";

export type SparklinePoint = {
  /** Bucket start timestamp (seconds) */
  t: number;
  /** Cumulative ALEPH total up to this bucket */
  value: number;
};

/**
 * Bucket sorted expenses into time intervals and return a cumulative series.
 * @param expenses — CreditExpense[] sorted ascending by `time`
 * @param bucketSec — bucket width in seconds (3600 = hourly, 86400 = daily)
 */
export function buildCumulativeSeries(
  expenses: CreditExpense[],
  bucketSec: number,
): SparklinePoint[] {
  if (expenses.length === 0) return [];

  const firstTime = expenses[0]!.time;
  const lastTime = expenses[expenses.length - 1]!.time;

  const firstBucket = Math.floor(firstTime / bucketSec);
  const lastBucket = Math.floor(lastTime / bucketSec);

  // Sum each bucket
  const buckets = new Map<number, number>();
  for (const e of expenses) {
    const b = Math.floor(e.time / bucketSec);
    buckets.set(b, (buckets.get(b) ?? 0) + e.totalAleph);
  }

  // Build cumulative series, filling gaps
  const points: SparklinePoint[] = [];
  let cumulative = 0;
  for (let b = firstBucket; b <= lastBucket; b++) {
    cumulative += buckets.get(b) ?? 0;
    points.push({ t: b * bucketSec, value: cumulative });
  }

  return points;
}
