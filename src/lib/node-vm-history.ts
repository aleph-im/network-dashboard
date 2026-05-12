import type { HistoryRow } from "@/api/types";

type ReplayInput = {
  history: HistoryRow[];
  currentVmCount: number;
  /** Bucket-start timestamps in seconds since epoch, ascending. */
  bucketStarts: number[];
  /** End of the time window in seconds since epoch. */
  windowEndSec: number;
};

const SIGN: Record<HistoryRow["action"], 1 | -1> = {
  scheduled: 1,
  migrated_to: 1,
  unscheduled: -1,
  migrated_from: -1,
};

/**
 * Replay node history to compute VM count at the start of each bucket.
 *
 * Algorithm: starting from `currentVmCount` (count at `windowEndSec`), walk
 * events backward in time. For each event in the window, reverse-apply:
 *   - scheduled / migrated_to → decrement (before the event, count was lower)
 *   - unscheduled / migrated_from → increment
 *
 * At each bucket-start boundary we sample `count` — that's the count at the
 * START of that bucket.
 *
 * Result is in the same order as `bucketStarts`.
 */
export function replayVmCountTimeline(input: ReplayInput): number[] {
  const { history, currentVmCount, bucketStarts, windowEndSec } = input;
  if (bucketStarts.length === 0) return [];

  // Filter to in-window events, parse timestamps once, sort descending.
  const windowStartSec = bucketStarts[0]!;
  const events = history
    .map((h) => ({
      sec: Math.floor(new Date(h.timestamp).getTime() / 1000),
      action: h.action,
    }))
    .filter((e) => e.sec >= windowStartSec && e.sec < windowEndSec)
    .sort((a, b) => b.sec - a.sec); // descending

  let count = currentVmCount;
  let eventIdx = 0;

  const counts = new Array<number>(bucketStarts.length).fill(0);
  for (let i = bucketStarts.length - 1; i >= 0; i--) {
    const bucketStart = bucketStarts[i]!;
    while (eventIdx < events.length && events[eventIdx]!.sec >= bucketStart) {
      const sign = SIGN[events[eventIdx]!.action];
      count -= sign;
      eventIdx++;
    }
    counts[i] = Math.max(0, count);
  }

  return counts;
}
