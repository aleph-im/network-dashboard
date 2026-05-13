import { describe, expect, it } from "vitest";
import { replayVmCountTimeline } from "./node-vm-history";
import type { HistoryRow } from "@/api/types";

function row(
  id: number,
  action: HistoryRow["action"],
  isoTime: string,
): HistoryRow {
  return {
    id,
    vmHash: `vm-${id}`,
    nodeHash: "node-x",
    action,
    reason: null,
    timestamp: isoTime,
  };
}

describe("replayVmCountTimeline", () => {
  it("returns constant count when no events in window", () => {
    const buckets = [1000, 2000, 3000, 4000]; // bucket start times (s)
    const counts = replayVmCountTimeline({
      history: [],
      currentVmCount: 5,
      bucketStarts: buckets,
      windowEndSec: 5000,
    });
    expect(counts).toEqual([5, 5, 5, 5]);
  });

  it("replays a scheduled event mid-window: count rises after the event", () => {
    // Window [1000, 5000]; buckets at 1000, 2000, 3000, 4000.
    // Event: 'scheduled' at 2500 → before 2500 count was 4, after = 5.
    const buckets = [1000, 2000, 3000, 4000];
    const history: HistoryRow[] = [
      row(1, "scheduled", new Date(2500 * 1000).toISOString()),
    ];
    const counts = replayVmCountTimeline({
      history,
      currentVmCount: 5,
      bucketStarts: buckets,
      windowEndSec: 5000,
    });
    // Counts at the START of each bucket:
    //   1000: 4 (before the scheduled)
    //   2000: 4 (still before 2500)
    //   3000: 5 (after the event at 2500)
    //   4000: 5
    expect(counts).toEqual([4, 4, 5, 5]);
  });

  it("replays an unscheduled event mid-window: count falls after the event", () => {
    const buckets = [1000, 2000, 3000, 4000];
    const history: HistoryRow[] = [
      row(1, "unscheduled", new Date(2500 * 1000).toISOString()),
    ];
    const counts = replayVmCountTimeline({
      history,
      currentVmCount: 3,
      bucketStarts: buckets,
      windowEndSec: 5000,
    });
    // Before 2500: count = 4; after: 3.
    expect(counts).toEqual([4, 4, 3, 3]);
  });

  it("treats migrated_from like unscheduled and migrated_to like scheduled", () => {
    const buckets = [1000, 2000];
    const historyFrom: HistoryRow[] = [
      row(1, "migrated_from", new Date(1500 * 1000).toISOString()),
    ];
    expect(
      replayVmCountTimeline({
        history: historyFrom,
        currentVmCount: 2,
        bucketStarts: buckets,
        windowEndSec: 3000,
      }),
    ).toEqual([3, 2]);

    const historyTo: HistoryRow[] = [
      row(1, "migrated_to", new Date(1500 * 1000).toISOString()),
    ];
    expect(
      replayVmCountTimeline({
        history: historyTo,
        currentVmCount: 2,
        bucketStarts: buckets,
        windowEndSec: 3000,
      }),
    ).toEqual([1, 2]);
  });

  it("ignores events outside the window", () => {
    const buckets = [1000, 2000, 3000];
    const history: HistoryRow[] = [
      row(1, "scheduled", new Date(500 * 1000).toISOString()), // before window
      row(2, "scheduled", new Date(5000 * 1000).toISOString()), // after window
    ];
    const counts = replayVmCountTimeline({
      history,
      currentVmCount: 4,
      bucketStarts: buckets,
      windowEndSec: 4000,
    });
    expect(counts).toEqual([4, 4, 4]);
  });

  it("never returns negative counts (defensive clamp)", () => {
    // Inconsistent data: more 'scheduled' events than currentVmCount accounts for.
    const buckets = [1000, 2000];
    const history: HistoryRow[] = [
      row(1, "scheduled", new Date(1500 * 1000).toISOString()),
      row(2, "scheduled", new Date(1600 * 1000).toISOString()),
    ];
    const counts = replayVmCountTimeline({
      history,
      currentVmCount: 1,
      bucketStarts: buckets,
      windowEndSec: 3000,
    });
    // Before 1500: 1 - 2 = -1, clamped to 0.
    // After both: 1.
    expect(counts).toEqual([0, 1]);
  });
});
