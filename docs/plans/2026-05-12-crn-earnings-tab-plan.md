---
status: in-progress
branch: spec/crn-earnings-tab
date: 2026-05-12
note: All 11 plan tasks complete + CCN-aware NodeDetailView added during verification (Decision #90). 13 commits on branch (not yet pushed when status set). pnpm check clean (218 tests, 0 lint warnings, build succeeds). User previewed both CRN and CCN flows and confirmed working. Awaiting `/dio:ship` to push, PR, and squash-merge — preview gate already passed.
---

# CRN / CCN Earnings Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Earnings tab to `/nodes?view=<hash>` that surfaces per-CRN ALEPH accrual (and per-CCN, with appropriate adaptations) from the existing `aleph_credit_expense` feed, with a dual-line trend chart and per-VM (CRN) / linked-CRN (CCN) breakdown.

**Architecture:** Pure presentation + computation layer on top of existing data. Extend `computeDistributionSummary` with optional bucket-aware output (`perNodeBuckets`, `perVmInWindow`). New `useNodeEarnings(hash, range)` hook composes existing hooks (`useCreditExpenses`, `useNodeState`, `useNode`, `useNodes`) and derives the bucket arrays + a VM-count timeline replayed from `node.history`. Five new components render the tab; one modified component wires it into the detail view.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, React Query, @aleph-front/ds, Tailwind, Vitest, oxlint.

**Spec:** `docs/plans/2026-05-12-crn-earnings-tab-design.md`

**Branch:** `spec/crn-earnings-tab` (plan + spec). Implementation can stay on this branch or fork to `feature/crn-earnings-tab` at execution time.

---

## File Structure

**Create:**
- `src/lib/node-vm-history.ts` — pure replay function for VM-count timeline
- `src/lib/node-vm-history.test.ts`
- `src/hooks/use-node-earnings.ts`
- `src/hooks/use-node-earnings.test.tsx`
- `src/components/node-earnings-chart.tsx`
- `src/components/node-earnings-chart.test.tsx`
- `src/components/node-earnings-kpi-row.tsx`
- `src/components/node-earnings-kpi-row.test.tsx`
- `src/components/node-earnings-tab.tsx`
- `src/components/node-earnings-tab.test.tsx`
- `src/components/node-earnings-tab-ccn.tsx`
- `src/components/node-earnings-tab-ccn.test.tsx`

**Modify:**
- `src/api/credit-types.ts` — add `NodeBucket`, optional `perNodeBuckets`, optional `perVmInWindow` on `DistributionSummary`
- `src/lib/credit-distribution.ts` — add `options` param to `computeDistributionSummary`; emit bucket maps when requested
- `src/lib/credit-distribution.test.ts` — new cases for bucket math
- `src/components/node-detail-view.tsx` — wrap content in DS Tabs (Overview / Earnings); render the appropriate earnings tab component based on role
- `src/app/nodes/page.tsx` — read `?tab=`, thread `initialTab` to `NodeDetailView`

**Note on responsibility split:**
- `credit-distribution.ts` stays the home of ALL credit-math. The new bucket logic lives here, not in a new file — the existing code already understands the share constants and node-state shape. Splitting would force duplicate imports of constants.
- `node-vm-history.ts` is a new file because VM-count replay is a pure node-history concern with no shared state with credit math; isolating it keeps `credit-distribution.ts` from accumulating unrelated logic and makes it independently testable.
- All new components live under `src/components/` (existing convention; no `src/components/earnings/` subdirectory because the project keeps a flat layout there).

---

## Task 1: Add bucket types and extend `computeDistributionSummary`

**Files:**
- Modify: `src/api/credit-types.ts`
- Modify: `src/lib/credit-distribution.ts`
- Test: `src/lib/credit-distribution.test.ts`

- [ ] **Step 1.1: Add types to `credit-types.ts`**

Edit `src/api/credit-types.ts:123-135` — `DistributionSummary` — to add two optional fields and a new `NodeBucket` export. Place the `NodeBucket` export above `DistributionSummary` for proximity.

```ts
// (insert above `export type DistributionSummary`)
export type NodeBucket = {
  /** Bucket start timestamp (seconds since epoch). */
  time: number;
  /** ALEPH attributed to this node in this bucket (post-share-split). */
  aleph: number;
};

export type DistributionSummary = {
  totalAleph: number;
  storageAleph: number;
  executionAleph: number;
  devFundAleph: number;
  distributedAleph: number;
  expenseCount: number;
  recipients: RecipientTotal[];
  expenses: ExpenseDistribution[];
  perVm: Map<string, number>;
  perNode: Map<string, number>;
  // Bucketed per-node ALEPH timeline (CRN + CCN). Only populated when
  // `computeDistributionSummary` is called with `options`. CRN buckets carry
  // execution-share ALEPH attributed by `credit.nodeId`; CCN buckets carry
  // the score-weighted share of the CCN pool per expense.
  perNodeBuckets?: Map<string, NodeBucket[]>;
  // Per-VM ALEPH within the same window (execution credits only). Key is
  // `credit.executionId`. Only populated when `options` is provided.
  perVmInWindow?: Map<string, { aleph: number; nodeId: string }>;
};
```

- [ ] **Step 1.2: Write failing tests for bucket math**

Append to `src/lib/credit-distribution.test.ts` (the file already has `makeNodeState`, `makeExpense` helpers — reuse them). Add a small helper to override the expense time:

```ts
function makeExpenseAt(
  time: number,
  type: "storage" | "execution",
  totalAleph: number,
  nodeId?: string,
  executionId?: string,
): CreditExpense {
  const e = makeExpense(type, totalAleph, nodeId, executionId);
  return { ...e, time };
}

describe("computeDistributionSummary with bucket options", () => {
  const start = 1_700_000_000;
  const end = start + 3600 * 24; // 24h window
  const bucketCount = 24;
  const bucketWidth = (end - start) / bucketCount; // 3600

  it("buckets CRN execution rewards by expense time", () => {
    const state = makeNodeState();
    const expenses = [
      makeExpenseAt(start + 30, "execution", 10, "crn1", "vm1"),
      makeExpenseAt(start + bucketWidth + 30, "execution", 20, "crn1", "vm1"),
      makeExpenseAt(start + bucketWidth * 5 + 30, "execution", 5, "crn1", "vm2"),
    ];

    const summary = computeDistributionSummary(expenses, state, {
      bucketCount,
      startTime: start,
      endTime: end,
    });

    const buckets = summary.perNodeBuckets!.get("crn1")!;
    expect(buckets).toHaveLength(24);
    expect(buckets[0]!.aleph).toBeCloseTo(10 * 0.6); // EXECUTION_CRN_SHARE
    expect(buckets[1]!.aleph).toBeCloseTo(20 * 0.6);
    expect(buckets[5]!.aleph).toBeCloseTo(5 * 0.6);
    expect(buckets[10]!.aleph).toBe(0);
    expect(buckets[0]!.time).toBe(start);
    expect(buckets[1]!.time).toBe(start + bucketWidth);
  });

  it("buckets CCN rewards as score-weighted share of CCN pool", () => {
    const state = makeNodeState({
      ccns: [
        {
          hash: "ccnA",
          name: "A",
          owner: "0xA",
          reward: "0xA",
          score: 0.8,
          status: "active",
          stakers: {},
          totalStaked: 600_000,
          inactiveSince: null,
          resourceNodes: [],
        },
        {
          hash: "ccnB",
          name: "B",
          owner: "0xB",
          reward: "0xB",
          score: 0.5, // weight = (0.5 - 0.2) / 0.6 = 0.5
          status: "active",
          stakers: {},
          totalStaked: 600_000,
          inactiveSince: null,
          resourceNodes: [],
        },
      ],
    });
    const expenses = [
      makeExpenseAt(start + 30, "execution", 100, "crnX", "vmX"),
    ];

    const summary = computeDistributionSummary(expenses, state, {
      bucketCount,
      startTime: start,
      endTime: end,
    });

    // ccnA weight=1, ccnB weight=0.5; total=1.5
    // CCN pool from execution = 100 * 0.15 = 15
    // ccnA share = 15 * 1/1.5 = 10
    // ccnB share = 15 * 0.5/1.5 = 5
    expect(summary.perNodeBuckets!.get("ccnA")![0]!.aleph).toBeCloseTo(10);
    expect(summary.perNodeBuckets!.get("ccnB")![0]!.aleph).toBeCloseTo(5);
  });

  it("storage expenses use storage CCN share (no CRN share)", () => {
    const state = makeNodeState();
    const expenses = [
      makeExpenseAt(start + 30, "storage", 100, "crn1", "obj1"),
    ];

    const summary = computeDistributionSummary(expenses, state, {
      bucketCount,
      startTime: start,
      endTime: end,
    });

    // CRN gets nothing from storage expenses
    expect(summary.perNodeBuckets!.get("crn1")).toBeUndefined();
    // CCN gets storage CCN share = 100 * 0.75 = 75 (single active CCN with weight 1)
    expect(summary.perNodeBuckets!.get("ccn1")![0]!.aleph).toBeCloseTo(75);
  });

  it("populates perVmInWindow with execution credits", () => {
    const state = makeNodeState();
    const expenses = [
      makeExpenseAt(start + 30, "execution", 10, "crn1", "vmA"),
      makeExpenseAt(start + 60, "execution", 7, "crn1", "vmA"),
      makeExpenseAt(start + 90, "execution", 3, "crn1", "vmB"),
    ];

    const summary = computeDistributionSummary(expenses, state, {
      bucketCount,
      startTime: start,
      endTime: end,
    });

    expect(summary.perVmInWindow!.get("vmA")!.aleph).toBeCloseTo(17);
    expect(summary.perVmInWindow!.get("vmA")!.nodeId).toBe("crn1");
    expect(summary.perVmInWindow!.get("vmB")!.aleph).toBeCloseTo(3);
  });

  it("returns undefined bucket maps when options omitted", () => {
    const state = makeNodeState();
    const summary = computeDistributionSummary(
      [makeExpenseAt(start + 30, "execution", 10, "crn1", "vm1")],
      state,
    );
    expect(summary.perNodeBuckets).toBeUndefined();
    expect(summary.perVmInWindow).toBeUndefined();
  });

  it("clamps expense times outside the window to edge buckets", () => {
    const state = makeNodeState();
    const expenses = [
      makeExpenseAt(start - 100, "execution", 5, "crn1", "vm1"), // before window
      makeExpenseAt(end + 100, "execution", 7, "crn1", "vm1"), // after window
    ];

    const summary = computeDistributionSummary(expenses, state, {
      bucketCount,
      startTime: start,
      endTime: end,
    });

    const buckets = summary.perNodeBuckets!.get("crn1")!;
    // First and last buckets carry the clamped contributions
    expect(buckets[0]!.aleph).toBeCloseTo(5 * 0.6);
    expect(buckets[23]!.aleph).toBeCloseTo(7 * 0.6);
  });
});
```

- [ ] **Step 1.3: Run tests — verify they fail**

```bash
pnpm vitest run src/lib/credit-distribution.test.ts
```

Expected: all six new cases fail (`perNodeBuckets is undefined` for cases that expect it; the signature with options is a TypeScript error if the implementation doesn't accept it yet).

- [ ] **Step 1.4: Implement the bucket math**

Edit `src/lib/credit-distribution.ts`. Add a `SummaryOptions` type near the top (after the share constants) and extend `computeDistributionSummary` to accept and honour it. The minimum changes:

```ts
// (insert near top, under share constants)
export type SummaryOptions = {
  bucketCount: number;
  startTime: number;
  endTime: number;
};

function bucketIndexFor(
  time: number,
  startTime: number,
  bucketWidth: number,
  bucketCount: number,
): number {
  const raw = Math.floor((time - startTime) / bucketWidth);
  if (raw < 0) return 0;
  if (raw >= bucketCount) return bucketCount - 1;
  return raw;
}

function ensureBucketArray(
  map: Map<string, NodeBucket[]>,
  hash: string,
  startTime: number,
  bucketWidth: number,
  bucketCount: number,
): NodeBucket[] {
  let arr = map.get(hash);
  if (!arr) {
    arr = Array.from({ length: bucketCount }, (_, i) => ({
      time: startTime + i * bucketWidth,
      aleph: 0,
    }));
    map.set(hash, arr);
  }
  return arr;
}
```

Then modify the `computeDistributionSummary` signature and body. Find the existing function (around `src/lib/credit-distribution.ts:119`) and add the optional `options` parameter and bucketing logic alongside the existing per-expense loop:

```ts
export function computeDistributionSummary(
  expenses: CreditExpense[],
  nodeState: NodeState,
  options?: SummaryOptions,
): DistributionSummary {
  const distributions: ExpenseDistribution[] = [];
  const allCrn = new Map<string, number>();
  const allCcn = new Map<string, number>();
  const allStaker = new Map<string, number>();
  let storageAleph = 0;
  let executionAleph = 0;
  let devFundAleph = 0;

  const perVm = new Map<string, number>();
  const perNode = new Map<string, number>();

  // Bucket bookkeeping (only if options provided)
  const perNodeBuckets = options ? new Map<string, NodeBucket[]>() : undefined;
  const perVmInWindow = options
    ? new Map<string, { aleph: number; nodeId: string }>()
    : undefined;
  const bucketWidth = options
    ? (options.endTime - options.startTime) / options.bucketCount
    : 0;

  // Precompute CCN weights (stable across the window) — same source of truth
  // as the per-expense pool calculation below, lifted out so the bucket pass
  // can reuse it without a second walk.
  const ccnWeights = buildCcnWeights(nodeState.ccns);
  const totalCcnWeight = ccnWeights.reduce((s, w) => s + w.weight, 0);

  for (const expense of expenses) {
    const dist = distributeExpense(expense, nodeState);
    distributions.push(dist);

    if (expense.type === "storage") storageAleph += expense.totalAleph;
    else executionAleph += expense.totalAleph;
    devFundAleph += dist.devFund;

    for (const [addr, amt] of dist.crnRewards) addToMap(allCrn, addr, amt);
    for (const [addr, amt] of dist.ccnRewards) addToMap(allCcn, addr, amt);
    for (const [addr, amt] of dist.stakerRewards)
      addToMap(allStaker, addr, amt);

    for (const credit of expense.credits) {
      if (credit.executionId) {
        addToMap(perVm, credit.executionId, credit.alephCost);
      }
      if (credit.nodeId) {
        addToMap(perNode, credit.nodeId, credit.alephCost * EXECUTION_CRN_SHARE);
      }
    }

    // Bucket pass — only if options provided
    if (options && perNodeBuckets && perVmInWindow) {
      const idx = bucketIndexFor(
        expense.time,
        options.startTime,
        bucketWidth,
        options.bucketCount,
      );
      const isStorage = expense.type === "storage";

      // CRN: per-credit, per-node
      if (!isStorage) {
        for (const credit of expense.credits) {
          if (!credit.nodeId) continue;
          if (!nodeState.crns.has(credit.nodeId)) continue;
          const arr = ensureBucketArray(
            perNodeBuckets,
            credit.nodeId,
            options.startTime,
            bucketWidth,
            options.bucketCount,
          );
          arr[idx]!.aleph += credit.alephCost * EXECUTION_CRN_SHARE;

          // Per-VM aggregate
          if (credit.executionId) {
            const existing = perVmInWindow.get(credit.executionId);
            const aleph = (existing?.aleph ?? 0) + credit.alephCost;
            perVmInWindow.set(credit.executionId, {
              aleph,
              nodeId: credit.nodeId,
            });
          }
        }
      }

      // CCN: score-weighted share of pool, indexed by CCN hash (not reward
      // address — multiple CCNs can share one reward address, but the chart
      // is per-node, so we accumulate into the hash-keyed bucket map).
      if (totalCcnWeight > 0) {
        const ccnShare = isStorage ? STORAGE_CCN_SHARE : EXECUTION_CCN_SHARE;
        const pool = expense.totalAleph * ccnShare;
        for (const ccn of nodeState.ccns.values()) {
          if (ccn.status !== "active") continue;
          const w = computeScoreMultiplier(ccn.score);
          if (w <= 0) continue;
          const share = (pool * w) / totalCcnWeight;
          const arr = ensureBucketArray(
            perNodeBuckets,
            ccn.hash,
            options.startTime,
            bucketWidth,
            options.bucketCount,
          );
          arr[idx]!.aleph += share;
        }
      }
    }
  }

  // ...rest of the function unchanged (recipients build, sort, return)
}
```

**Note on the existing `ccnWeights` precomputation:** the existing per-expense path in `distributeExpense` rebuilds weights per call by reward address. The bucket pass needs CCN-by-hash indexing (because chart axis is per-node), so we walk `nodeState.ccns.values()` directly inside the bucket loop — `totalCcnWeight` is still the same denominator since we sum scoring weights, not addresses. Skip rebuilding weights inside the inner loop; the precomputed `totalCcnWeight` is hoisted out of the expense iteration.

Update the return statement at the bottom of the function to include the new fields when `options` is provided:

```ts
  return {
    totalAleph,
    storageAleph,
    executionAleph,
    devFundAleph,
    distributedAleph,
    expenseCount: expenses.length,
    recipients,
    expenses: distributions,
    perVm,
    perNode,
    ...(perNodeBuckets ? { perNodeBuckets } : {}),
    ...(perVmInWindow ? { perVmInWindow } : {}),
  };
```

(The spread pattern matches the project's `exactOptionalPropertyTypes: true` convention — see memory note about TypeScript gotchas.)

Don't forget to import `NodeBucket` at the top of `credit-distribution.ts`:

```ts
import type {
  CCNInfo,
  CreditExpense,
  DistributionSummary,
  ExpenseDistribution,
  NodeBucket,  // NEW
  NodeState,
  RecipientRole,
  RecipientTotal,
  WalletNodeReward,
  WalletRewards,
} from "@/api/credit-types";
```

- [ ] **Step 1.5: Run tests — verify they pass**

```bash
pnpm vitest run src/lib/credit-distribution.test.ts
```

Expected: all tests pass (existing + 6 new).

- [ ] **Step 1.6: Commit**

```bash
git add src/api/credit-types.ts src/lib/credit-distribution.ts src/lib/credit-distribution.test.ts
git commit -m "feat(credits): per-node bucket math in computeDistributionSummary

Adds optional bucket-aware output (perNodeBuckets, perVmInWindow) when
the function is called with a SummaryOptions argument. Existing callers
(credits page, wallet rewards) are unchanged: when options is undefined,
the summary returns its original shape."
```

---

## Task 2: VM-count timeline replay

**Files:**
- Create: `src/lib/node-vm-history.ts`
- Test: `src/lib/node-vm-history.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `src/lib/node-vm-history.test.ts`:

```ts
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
```

- [ ] **Step 2.2: Run test — verify failure**

```bash
pnpm vitest run src/lib/node-vm-history.test.ts
```

Expected: `replayVmCountTimeline is not a function` (module doesn't exist).

- [ ] **Step 2.3: Implement the replay function**

Create `src/lib/node-vm-history.ts`:

```ts
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

  // Walk buckets from last → first; at each, apply all events whose time is
  // >= bucket start (and we haven't applied yet, working backward).
  const counts = new Array<number>(bucketStarts.length).fill(0);
  for (let i = bucketStarts.length - 1; i >= 0; i--) {
    const bucketStart = bucketStarts[i]!;
    while (eventIdx < events.length && events[eventIdx]!.sec >= bucketStart) {
      // Reverse-apply this event
      const sign = SIGN[events[eventIdx]!.action];
      count -= sign;
      eventIdx++;
    }
    counts[i] = Math.max(0, count);
  }

  return counts;
}
```

- [ ] **Step 2.4: Run test — verify pass**

```bash
pnpm vitest run src/lib/node-vm-history.test.ts
```

Expected: all 6 cases pass.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/node-vm-history.ts src/lib/node-vm-history.test.ts
git commit -m "feat(history): VM-count timeline replay from node history events

Pure function that takes a node's history, current VM count, and a set
of bucket boundaries; returns the VM count at the start of each bucket
by reverse-applying scheduled/unscheduled/migrated events backward from
the window end."
```

---

## Task 3: `useNodeEarnings` hook

**Files:**
- Create: `src/hooks/use-node-earnings.ts`
- Test: `src/hooks/use-node-earnings.test.tsx`

- [ ] **Step 3.1: Write the failing tests**

Create `src/hooks/use-node-earnings.test.tsx`. The project already uses React Query test utilities; mirror the patterns from `src/hooks/use-issues.test.tsx` or `src/hooks/use-pagination.test.ts` for the wrapper.

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useNodeEarnings } from "./use-node-earnings";
import type { ReactNode } from "react";
import type {
  CreditExpense,
  NodeState,
  CCNInfo,
  CRNInfo,
} from "@/api/credit-types";
import type { Node } from "@/api/types";

// Hoisted mocks — vi.mock factories run before imports
vi.mock("@/hooks/use-credit-expenses", () => ({
  useCreditExpenses: vi.fn(),
  RANGE_SECONDS: { "24h": 86400, "7d": 604800, "30d": 2592000 },
  getStableExpenseRange: (sec: number) => {
    const end = 1_700_000_000;
    return { start: end - sec, end };
  },
}));
vi.mock("@/hooks/use-node-state", () => ({ useNodeState: vi.fn() }));
vi.mock("@/hooks/use-nodes", () => ({
  useNode: vi.fn(),
  useNodes: vi.fn(),
}));

import { useCreditExpenses } from "@/hooks/use-credit-expenses";
import { useNodeState } from "@/hooks/use-node-state";
import { useNode, useNodes } from "@/hooks/use-nodes";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeCrn(overrides?: Partial<CRNInfo>): CRNInfo {
  return {
    hash: "crn1",
    name: "CRN-1",
    owner: "0xCRN",
    reward: "0xCRN",
    score: 0.9,
    status: "linked",
    inactiveSince: null,
    parent: "ccn1",
    ...overrides,
  };
}

function makeCcn(overrides?: Partial<CCNInfo>): CCNInfo {
  return {
    hash: "ccn1",
    name: "CCN-1",
    owner: "0xCCN",
    reward: "0xCCN",
    score: 0.8,
    status: "active",
    stakers: {},
    totalStaked: 600_000,
    inactiveSince: null,
    resourceNodes: [],
    ...overrides,
  };
}

function makeState(crns: CRNInfo[], ccns: CCNInfo[]): NodeState {
  return {
    crns: new Map(crns.map((c) => [c.hash, c])),
    ccns: new Map(ccns.map((c) => [c.hash, c])),
  };
}

function makeExpense(
  time: number,
  totalAleph: number,
  nodeId?: string,
  executionId?: string,
): CreditExpense {
  return {
    hash: `exp-${time}`,
    time,
    type: "execution",
    totalAleph,
    creditCount: 1,
    creditPriceAleph: 0.00005,
    credits: [
      {
        address: "0xCustomer",
        amount: 1,
        alephCost: totalAleph,
        ref: "p1",
        timeSec: time,
        nodeId: nodeId ?? null,
        executionId: executionId ?? null,
      },
    ],
  };
}

const NOW = 1_700_000_000;

describe("useNodeEarnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns CRN role with per-VM breakdown when hash is a CRN", async () => {
    const expenses = [
      makeExpense(NOW - 100, 10, "crn1", "vmA"),
      makeExpense(NOW - 200, 5, "crn1", "vmB"),
    ];
    (useCreditExpenses as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ data: expenses, isLoading: false, isPlaceholderData: false }) // current
      .mockReturnValueOnce({ data: [], isLoading: false, isPlaceholderData: false }); // previous
    (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeState([makeCrn()], [makeCcn()]),
    });
    (useNode as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { hash: "crn1", vms: [], history: [] } as unknown as Node,
    });
    (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });

    const { result } = renderHook(
      () => useNodeEarnings("crn1", "24h"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data!.role).toBe("crn");
    expect(result.current.data!.totalAleph).toBeCloseTo((10 + 5) * 0.6);
    expect(result.current.data!.perVm).toHaveLength(2);
    expect(result.current.data!.linkedCrns).toBeUndefined();
  });

  it("returns CCN role with linkedCrns when hash is a CCN", async () => {
    (useCreditExpenses as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data: [], isLoading: false, isPlaceholderData: false });
    (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeState(
        [
          makeCrn({ hash: "crn1", parent: "ccn1" }),
          makeCrn({ hash: "crn2", parent: "ccn1" }),
        ],
        [makeCcn()],
      ),
    });
    (useNode as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { hash: "ccn1", vms: [], history: [] } as unknown as Node,
    });
    (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        { hash: "crn1", status: "healthy", vms: [{}, {}] },
        { hash: "crn2", status: "unreachable", vms: [] },
      ],
    });

    const { result } = renderHook(
      () => useNodeEarnings("ccn1", "24h"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data!.role).toBe("ccn");
    expect(result.current.data!.perVm).toBeUndefined();
    expect(result.current.data!.linkedCrns).toEqual([
      { hash: "crn1", name: "CRN-1", status: "healthy", vmCount: 2 },
      { hash: "crn2", name: "CRN-1", status: "unreachable", vmCount: 0 },
    ]);
  });

  it("computes delta = current - previous", async () => {
    const currentExpenses = [makeExpense(NOW - 100, 20, "crn1", "vmA")];
    const previousExpenses = [makeExpense(NOW - 86500, 10, "crn1", "vmA")];

    (useCreditExpenses as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ data: currentExpenses, isLoading: false, isPlaceholderData: false })
      .mockReturnValueOnce({ data: previousExpenses, isLoading: false, isPlaceholderData: false });
    (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeState([makeCrn()], [makeCcn()]),
    });
    (useNode as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { hash: "crn1", vms: [], history: [] } as unknown as Node,
    });
    (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });

    const { result } = renderHook(
      () => useNodeEarnings("crn1", "24h"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data!.totalAleph).toBeCloseTo(20 * 0.6);
    expect(result.current.data!.delta.aleph).toBeCloseTo((20 - 10) * 0.6);
  });

  it("isLoading reflects underlying queries", () => {
    (useCreditExpenses as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data: undefined, isLoading: true, isPlaceholderData: false });
    (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
    });
    (useNode as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined });
    (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined });

    const { result } = renderHook(
      () => useNodeEarnings("crn1", "24h"),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
```

- [ ] **Step 3.2: Run tests — verify failure**

```bash
pnpm vitest run src/hooks/use-node-earnings.test.tsx
```

Expected: `useNodeEarnings is not a function`.

- [ ] **Step 3.3: Implement the hook**

Create `src/hooks/use-node-earnings.ts`:

```ts
"use client";

import { useMemo } from "react";
import {
  useCreditExpenses,
  RANGE_SECONDS,
  getStableExpenseRange,
  type CreditRange,
} from "@/hooks/use-credit-expenses";
import { useNodeState } from "@/hooks/use-node-state";
import { useNode, useNodes } from "@/hooks/use-nodes";
import { computeDistributionSummary } from "@/lib/credit-distribution";
import { replayVmCountTimeline } from "@/lib/node-vm-history";

export type NodeEarningsBucket = {
  time: number;
  aleph: number;
  secondaryCount: number;
};

export type NodeEarningsPerVm = {
  vmHash: string;
  aleph: number;
};

export type NodeEarningsLinkedCrn = {
  hash: string;
  name: string;
  status: string;
  vmCount: number;
};

export type NodeEarnings = {
  role: "crn" | "ccn";
  totalAleph: number;
  delta: { aleph: number; secondaryCount: number };
  buckets: NodeEarningsBucket[];
  perVm?: NodeEarningsPerVm[];
  linkedCrns?: NodeEarningsLinkedCrn[];
};

const BUCKET_COUNT: Record<CreditRange, number> = {
  "24h": 24,
  "7d": 7,
  "30d": 30,
};

export function useNodeEarnings(
  hash: string,
  range: CreditRange,
): {
  data: NodeEarnings | undefined;
  isLoading: boolean;
  isPlaceholderData: boolean;
} {
  const rangeSec = RANGE_SECONDS[range];

  const current = useMemo(
    () => getStableExpenseRange(rangeSec),
    [rangeSec],
  );
  const previous = useMemo(
    () => ({
      start: current.start - rangeSec,
      end: current.start,
    }),
    [current.start, rangeSec],
  );

  const expensesQuery = useCreditExpenses(current.start, current.end);
  const prevExpensesQuery = useCreditExpenses(previous.start, previous.end);
  const { data: nodeState } = useNodeState();
  const { data: node } = useNode(hash);
  const { data: allNodes } = useNodes();

  const data = useMemo<NodeEarnings | undefined>(() => {
    if (!expensesQuery.data || !nodeState) return undefined;

    const isCcn = nodeState.ccns.has(hash);
    const isCrn = nodeState.crns.has(hash);
    if (!isCcn && !isCrn) return undefined;

    const role: "crn" | "ccn" = isCcn ? "ccn" : "crn";
    const bucketCount = BUCKET_COUNT[range];

    const currentSummary = computeDistributionSummary(
      expensesQuery.data,
      nodeState,
      {
        bucketCount,
        startTime: current.start,
        endTime: current.end,
      },
    );

    const prevSummary = prevExpensesQuery.data
      ? computeDistributionSummary(prevExpensesQuery.data, nodeState, {
          bucketCount,
          startTime: previous.start,
          endTime: previous.end,
        })
      : undefined;

    const buckets = currentSummary.perNodeBuckets?.get(hash) ?? [];
    const totalAleph = buckets.reduce((s, b) => s + b.aleph, 0);
    const prevTotal =
      prevSummary?.perNodeBuckets?.get(hash)?.reduce((s, b) => s + b.aleph, 0) ?? 0;

    // Secondary count timeline
    let secondaryCurrent: number[];
    let secondaryPrev: number[];
    if (role === "crn") {
      const currentVms = node?.vms.length ?? 0;
      const history = node?.history ?? [];
      const bucketStarts = buckets.map((b) => b.time);
      secondaryCurrent = bucketStarts.length
        ? replayVmCountTimeline({
            history,
            currentVmCount: currentVms,
            bucketStarts,
            windowEndSec: current.end,
          })
        : [];
      // For the previous window we don't have history accurate to that range
      // (the API returns recent history only); fall back to flat current count.
      secondaryPrev = secondaryCurrent.map(() => currentVms);
    } else {
      // CCN: linked-CRN count flat-lined (v1).
      const linked = Array.from(nodeState.crns.values()).filter(
        (c) => c.parent === hash,
      ).length;
      secondaryCurrent = buckets.map(() => linked);
      secondaryPrev = secondaryCurrent;
    }

    const bucketsOut: NodeEarningsBucket[] = buckets.map((b, i) => ({
      time: b.time,
      aleph: b.aleph,
      secondaryCount: secondaryCurrent[i] ?? 0,
    }));

    const avgCurr =
      secondaryCurrent.length === 0
        ? 0
        : secondaryCurrent.reduce((s, n) => s + n, 0) / secondaryCurrent.length;
    const avgPrev =
      secondaryPrev.length === 0
        ? 0
        : secondaryPrev.reduce((s, n) => s + n, 0) / secondaryPrev.length;

    const delta = {
      aleph: totalAleph - prevTotal,
      secondaryCount: avgCurr - avgPrev,
    };

    if (role === "crn") {
      const perVmMap = currentSummary.perVmInWindow ?? new Map();
      const perVm: NodeEarningsPerVm[] = [];
      for (const [vmHash, entry] of perVmMap) {
        if (entry.nodeId === hash) {
          perVm.push({ vmHash, aleph: entry.aleph * 0.6 });
        }
      }
      perVm.sort((a, b) => b.aleph - a.aleph);
      return { role, totalAleph, delta, buckets: bucketsOut, perVm };
    }

    // CCN
    const linkedCrns: NodeEarningsLinkedCrn[] = [];
    for (const crn of nodeState.crns.values()) {
      if (crn.parent !== hash) continue;
      const live = allNodes?.find((n) => n.hash === crn.hash);
      linkedCrns.push({
        hash: crn.hash,
        name: crn.name,
        status: live?.status ?? crn.status,
        vmCount: live?.vms.length ?? 0,
      });
    }
    return { role, totalAleph, delta, buckets: bucketsOut, linkedCrns };
  }, [
    hash,
    range,
    expensesQuery.data,
    prevExpensesQuery.data,
    nodeState,
    node,
    allNodes,
    current.start,
    current.end,
    previous.start,
    previous.end,
  ]);

  return {
    data,
    isLoading:
      expensesQuery.isLoading || (prevExpensesQuery.isLoading && !prevExpensesQuery.data),
    isPlaceholderData: !!expensesQuery.isPlaceholderData,
  };
}
```

**Note on the `perVm.aleph * 0.6` line:** `perVmInWindow` stores RAW credit ALEPH cost; the displayed per-VM number is the CRN's share of that (60%). This matches the CRN bucket math. If you'd rather store the post-split value in `perVmInWindow` directly to avoid the magic number here, refactor in Task 1 — but the raw value is useful for future per-VM cost-vs-earnings analyses.

- [ ] **Step 3.4: Run tests — verify pass**

```bash
pnpm vitest run src/hooks/use-node-earnings.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/hooks/use-node-earnings.ts src/hooks/use-node-earnings.test.tsx
git commit -m "feat(earnings): useNodeEarnings hook

Composes useCreditExpenses (current + previous window), useNodeState,
useNode (for history), and useNodes (for linked CRN status) to produce
the data shape the Earnings tab needs — totalAleph, delta vs previous
window, bucketed timeline with VM-count overlay (CRN) or linked-CRN
overlay (CCN), and the appropriate breakdown rows."
```

---

## Task 4: `NodeEarningsChart` component

**Files:**
- Create: `src/components/node-earnings-chart.tsx`
- Test: `src/components/node-earnings-chart.test.tsx`

- [ ] **Step 4.1: Write the failing test**

Create `src/components/node-earnings-chart.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeEarningsChart } from "./node-earnings-chart";

describe("NodeEarningsChart", () => {
  it("renders an SVG with two polylines when given non-empty buckets", () => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      time: i * 3600,
      aleph: i % 3 === 0 ? 1 : 0.5,
      secondaryCount: i + 1,
    }));
    const { container } = render(
      <NodeEarningsChart
        buckets={buckets}
        primaryLabel="ALEPH"
        secondaryLabel="VMs"
      />,
    );
    const polylines = container.querySelectorAll("polyline");
    expect(polylines).toHaveLength(2);
    expect(screen.getByText("ALEPH")).toBeInTheDocument();
    expect(screen.getByText("VMs")).toBeInTheDocument();
  });

  it("renders empty state when all buckets are zero", () => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      time: i * 3600,
      aleph: 0,
      secondaryCount: 0,
    }));
    render(
      <NodeEarningsChart
        buckets={buckets}
        primaryLabel="ALEPH"
        secondaryLabel="VMs"
      />,
    );
    expect(screen.getByText(/no accrued earnings/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.2: Run test — verify failure**

```bash
pnpm vitest run src/components/node-earnings-chart.test.tsx
```

Expected: `Cannot find module './node-earnings-chart'`.

- [ ] **Step 4.3: Implement the chart**

Create `src/components/node-earnings-chart.tsx`:

```tsx
"use client";

import type { NodeEarningsBucket } from "@/hooks/use-node-earnings";

type Props = {
  buckets: NodeEarningsBucket[];
  primaryLabel: string;
  secondaryLabel: string;
  height?: number;
  /** Optional role-specific hint shown below the empty-state heading. */
  emptyHint?: string;
};

export function NodeEarningsChart({
  buckets,
  primaryLabel,
  secondaryLabel,
  height = 120,
  emptyHint,
}: Props) {
  const hasData = buckets.some((b) => b.aleph > 0 || b.secondaryCount > 0);
  if (!hasData || buckets.length < 2) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground"
        style={{ height }}
      >
        <span>No accrued earnings in this window</span>
        {emptyHint && (
          <span className="text-xs italic">{emptyHint}</span>
        )}
      </div>
    );
  }

  const width = 600;
  const maxAleph = Math.max(...buckets.map((b) => b.aleph), 0.0001);
  const maxSecondary = Math.max(...buckets.map((b) => b.secondaryCount), 0.0001);

  const n = buckets.length;
  const xFor = (i: number) => (i / (n - 1)) * width;
  const yForAleph = (v: number) => height - (v / maxAleph) * height;
  const yForSecondary = (v: number) => height - (v / maxSecondary) * height;

  const alephPoints = buckets
    .map((b, i) => `${xFor(i).toFixed(1)},${yForAleph(b.aleph).toFixed(1)}`)
    .join(" ");
  const secondaryPoints = buckets
    .map(
      (b, i) =>
        `${xFor(i).toFixed(1)},${yForSecondary(b.secondaryCount).toFixed(1)}`,
    )
    .join(" ");

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-3 bg-success-500"
          />
          {primaryLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-3 bg-primary-500"
          />
          {secondaryLabel}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="block"
        aria-hidden="true"
      >
        <polyline
          points={secondaryPoints}
          fill="none"
          stroke="var(--color-primary-500)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.7}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={alephPoints}
          fill="none"
          stroke="var(--color-success-500)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
```

- [ ] **Step 4.4: Run test — verify pass**

```bash
pnpm vitest run src/components/node-earnings-chart.test.tsx
```

Expected: both tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/components/node-earnings-chart.tsx src/components/node-earnings-chart.test.tsx
git commit -m "feat(earnings): NodeEarningsChart dual-line SVG"
```

---

## Task 5: `NodeEarningsKpiRow` component

**Files:**
- Create: `src/components/node-earnings-kpi-row.tsx`
- Test: `src/components/node-earnings-kpi-row.test.tsx`

- [ ] **Step 5.1: Write the failing test**

Create `src/components/node-earnings-kpi-row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeEarningsKpiRow, type KpiCard } from "./node-earnings-kpi-row";

describe("NodeEarningsKpiRow", () => {
  it("renders one card per entry, with primary and secondary values", () => {
    const cards: KpiCard[] = [
      { label: "ALEPH", primary: "12.84", secondary: "▲ 1.2" },
      { label: "VMs", primary: "18", secondary: "▼ 2" },
      { label: "Score", primary: "0.92", secondary: "vs 0.8" },
      { label: "Status", primary: "healthy", secondary: "last 5m" },
    ];
    render(<NodeEarningsKpiRow cards={cards} />);
    for (const c of cards) {
      expect(screen.getByText(c.label)).toBeInTheDocument();
      expect(screen.getByText(c.primary)).toBeInTheDocument();
      expect(screen.getByText(c.secondary)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 5.2: Run test — verify failure**

```bash
pnpm vitest run src/components/node-earnings-kpi-row.test.tsx
```

Expected: module not found.

- [ ] **Step 5.3: Implement the component**

Create `src/components/node-earnings-kpi-row.tsx`:

```tsx
"use client";

import { Card } from "@aleph-front/ds/card";

export type KpiCard = {
  label: string;
  primary: string;
  secondary: string;
  /** Optional tone for the secondary text (controls colour). */
  tone?: "default" | "up" | "down" | "warning";
};

const TONE_CLASS: Record<NonNullable<KpiCard["tone"]>, string> = {
  default: "text-muted-foreground",
  up: "text-success-500",
  down: "text-warning-500",
  warning: "text-warning-500",
};

export function NodeEarningsKpiRow({ cards }: { cards: KpiCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, i) => (
        <Card key={`${c.label}-${i}`} padding="md">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {c.label}
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {c.primary}
          </div>
          <div className={`mt-0.5 text-xs ${TONE_CLASS[c.tone ?? "default"]}`}>
            {c.secondary}
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 5.4: Run test — verify pass**

```bash
pnpm vitest run src/components/node-earnings-kpi-row.test.tsx
```

Expected: pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/components/node-earnings-kpi-row.tsx src/components/node-earnings-kpi-row.test.tsx
git commit -m "feat(earnings): NodeEarningsKpiRow 4-card grid"
```

---

## Task 6: `NodeEarningsTab` (CRN composition)

**Files:**
- Create: `src/components/node-earnings-tab.tsx`
- Test: `src/components/node-earnings-tab.test.tsx`

- [ ] **Step 6.1: Write the failing test**

Create `src/components/node-earnings-tab.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NodeEarningsTab } from "./node-earnings-tab";

vi.mock("@/hooks/use-node-earnings", () => ({
  useNodeEarnings: vi.fn(),
}));
vi.mock("@/hooks/use-node-state", () => ({
  useNodeState: vi.fn(() => ({
    data: {
      crns: new Map([
        [
          "crn1",
          {
            hash: "crn1",
            name: "CRN-1",
            owner: "0x",
            reward: "0x",
            score: 0.9,
            status: "linked",
            inactiveSince: null,
            parent: "ccn1",
          },
        ],
      ]),
      ccns: new Map(),
    },
  })),
}));
vi.mock("@/hooks/use-nodes", () => ({
  useNode: vi.fn(() => ({
    data: { hash: "crn1", status: "healthy", updatedAt: "2026-05-12T00:00:00Z" },
  })),
}));

import { useNodeEarnings } from "@/hooks/use-node-earnings";

describe("NodeEarningsTab (CRN)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders KPI row, chart, per-VM table", () => {
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        role: "crn",
        totalAleph: 12.84,
        delta: { aleph: 1.2, secondaryCount: -2 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.5,
          secondaryCount: 18,
        })),
        perVm: [
          { vmHash: "vmA", aleph: 4.21 },
          { vmHash: "vmB", aleph: 3.86 },
        ],
      },
      isLoading: false,
      isPlaceholderData: false,
    });

    render(<NodeEarningsTab hash="crn1" />);

    // KPI primary numbers visible
    expect(screen.getByText("12.84")).toBeInTheDocument();
    // Per-VM rows
    expect(screen.getByText("vmA")).toBeInTheDocument();
    expect(screen.getByText("vmB")).toBeInTheDocument();
    // Footnote
    expect(screen.getByText(/accrued.*not yet paid on-chain/i)).toBeInTheDocument();
  });

  it("renders loading skeleton when data is undefined", () => {
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isPlaceholderData: false,
    });
    const { container } = render(<NodeEarningsTab hash="crn1" />);
    // DS Skeleton renders divs with `animate-pulse` (or similar)
    expect(container.querySelector("[data-slot='skeleton'], .animate-pulse")).toBeTruthy();
  });
});
```

- [ ] **Step 6.2: Run test — verify failure**

```bash
pnpm vitest run src/components/node-earnings-tab.test.tsx
```

Expected: module not found.

- [ ] **Step 6.3: Implement the component**

Create `src/components/node-earnings-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card } from "@aleph-front/ds/card";
import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";
import { Badge } from "@aleph-front/ds/badge";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import {
  useNodeEarnings,
  type NodeEarnings,
} from "@/hooks/use-node-earnings";
import { useNodeState } from "@/hooks/use-node-state";
import { useNode } from "@/hooks/use-nodes";
import { NodeEarningsKpiRow, type KpiCard } from "@/components/node-earnings-kpi-row";
import { NodeEarningsChart } from "@/components/node-earnings-chart";
import { formatAleph, relativeTime } from "@/lib/format";
import { nodeStatusToDot } from "@/lib/status-map";
import type { CreditRange } from "@/hooks/use-credit-expenses";

const RANGE_VALUES: CreditRange[] = ["24h", "7d", "30d"];

function deltaArrow(delta: number): string {
  if (delta > 0.0001) return "▲";
  if (delta < -0.0001) return "▼";
  return "·";
}

function buildCrnCards(
  data: NodeEarnings,
  range: CreditRange,
  score: number,
  status: string,
  updatedAt: string | undefined,
): KpiCard[] {
  const dAleph = data.delta.aleph;
  const dCount = data.delta.secondaryCount;
  const avgVms =
    data.buckets.length === 0
      ? 0
      : data.buckets.reduce((s, b) => s + b.secondaryCount, 0) /
        data.buckets.length;

  return [
    {
      label: `ALEPH accrued (${range})`,
      primary: formatAleph(data.totalAleph),
      secondary: `${deltaArrow(dAleph)} ${formatAleph(Math.abs(dAleph))} vs prev ${range}`,
      tone: dAleph > 0 ? "up" : dAleph < 0 ? "down" : "default",
    },
    {
      label: "VMs hosted (avg)",
      primary: avgVms.toFixed(1),
      secondary: `${deltaArrow(dCount)} ${Math.abs(dCount).toFixed(1)} vs prev ${range}`,
      tone: dCount > 0 ? "up" : dCount < 0 ? "down" : "default",
    },
    {
      label: "Score",
      primary: score.toFixed(2),
      secondary: "vs 0.8 threshold",
      tone: score < 0.8 ? "warning" : "default",
    },
    {
      label: "Status",
      primary: status,
      secondary: updatedAt ? `updated ${relativeTime(updatedAt)}` : "—",
    },
  ];
}

export function NodeEarningsTab({ hash }: { hash: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rangeParam = searchParams.get("earningsRange") as CreditRange | null;
  const [range, setRange] = useState<CreditRange>(
    rangeParam && RANGE_VALUES.includes(rangeParam) ? rangeParam : "24h",
  );

  const handleRangeChange = (next: string) => {
    if (!RANGE_VALUES.includes(next as CreditRange)) return;
    setRange(next as CreditRange);
    const params = new URLSearchParams(searchParams.toString());
    params.set("earningsRange", next);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const { data, isLoading } = useNodeEarnings(hash, range);
  const { data: nodeState } = useNodeState();
  const { data: node } = useNode(hash);

  const crn = nodeState?.crns.get(hash);

  if (isLoading || !data || !crn) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const cards = buildCrnCards(
    data,
    range,
    crn.score,
    node?.status ?? crn.status,
    node?.updatedAt,
  );

  const perVm = data.perVm ?? [];
  const top = perVm.slice(0, 5);
  const rest = perVm.slice(5);
  const restAleph = rest.reduce((s, v) => s + v.aleph, 0);

  return (
    <div className="space-y-4">
      <Tabs value={range} onValueChange={handleRangeChange}>
        <TabsList variant="pill" size="sm">
          {RANGE_VALUES.map((r) => (
            <TabsTrigger key={r} value={r}>
              {r}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <NodeEarningsKpiRow cards={cards} />

      <Card padding="md">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ALEPH accrual over time
        </div>
        <NodeEarningsChart
          buckets={data.buckets}
          primaryLabel="ALEPH"
          secondaryLabel="VMs hosted"
          {...(crn.parent === null
            ? { emptyHint: "Pending CCN attachment — earnings start once linked." }
            : {})}
        />
      </Card>

      {perVm.length > 0 && (
        <Card padding="md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hosted VMs — earnings breakdown
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">VM</th>
                <th className="pb-2 font-medium text-right">ALEPH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {top.map((v) => (
                <tr key={v.vmHash}>
                  <td className="py-1.5 pr-4">
                    <CopyableText
                      text={v.vmHash}
                      startChars={8}
                      endChars={8}
                      size="sm"
                      href={`/vms?view=${v.vmHash}`}
                    />
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatAleph(v.aleph)}
                  </td>
                </tr>
              ))}
              {rest.length > 0 && (
                <tr>
                  <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                    + {rest.length} more
                  </td>
                  <td className="py-1.5 text-right text-xs text-muted-foreground tabular-nums">
                    {formatAleph(restAleph)}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-edge font-medium">
                <td className="pt-2 text-xs text-muted-foreground">Total</td>
                <td className="pt-2 text-right tabular-nums">
                  {formatAleph(data.totalAleph)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      <p className="text-xs italic text-muted-foreground">
        Accrued earnings from the credit-expense feed using the protocol&apos;s
        distribution split. Numbers reflect what this node earned, not yet paid
        on-chain.
      </p>
    </div>
  );
}
```

**Tip on `nodeStatusToDot`:** import it if you decide to use `StatusDot` in a future iteration — the v1 KPI Status card just prints the status string, no dot. If you want the dot, change the Status card's `primary` to a JSX node and update the `NodeEarningsKpiRow` type accordingly (lift `primary` from `string` to `ReactNode`).

- [ ] **Step 6.4: Run test — verify pass**

```bash
pnpm vitest run src/components/node-earnings-tab.test.tsx
```

Expected: both tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add src/components/node-earnings-tab.tsx src/components/node-earnings-tab.test.tsx
git commit -m "feat(earnings): NodeEarningsTab CRN composition"
```

---

## Task 7: `NodeEarningsTabCcn` (CCN composition)

**Files:**
- Create: `src/components/node-earnings-tab-ccn.tsx`
- Test: `src/components/node-earnings-tab-ccn.test.tsx`

- [ ] **Step 7.1: Write the failing test**

Create `src/components/node-earnings-tab-ccn.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NodeEarningsTabCcn } from "./node-earnings-tab-ccn";

vi.mock("@/hooks/use-node-earnings", () => ({
  useNodeEarnings: vi.fn(),
}));
vi.mock("@/hooks/use-node-state", () => ({
  useNodeState: vi.fn(() => ({
    data: {
      crns: new Map(),
      ccns: new Map([
        [
          "ccn1",
          {
            hash: "ccn1",
            name: "CCN-1",
            owner: "0x",
            reward: "0x",
            score: 0.8,
            status: "active",
            stakers: {},
            totalStaked: 600000,
            inactiveSince: null,
            resourceNodes: ["crn1", "crn2"],
          },
        ],
      ]),
    },
  })),
}));
vi.mock("@/hooks/use-nodes", () => ({
  useNode: vi.fn(() => ({
    data: { hash: "ccn1", status: "active", updatedAt: "2026-05-12T00:00:00Z" },
  })),
}));

import { useNodeEarnings } from "@/hooks/use-node-earnings";

describe("NodeEarningsTabCcn", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders KPI row, chart, linked CRN list (no per-VM table)", () => {
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        role: "ccn",
        totalAleph: 7.42,
        delta: { aleph: 0.5, secondaryCount: 0 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.3,
          secondaryCount: 2,
        })),
        linkedCrns: [
          { hash: "crn1", name: "CRN-1", status: "healthy", vmCount: 5 },
          { hash: "crn2", name: "CRN-2", status: "unreachable", vmCount: 0 },
        ],
      },
      isLoading: false,
      isPlaceholderData: false,
    });
    render(<NodeEarningsTabCcn hash="ccn1" />);

    expect(screen.getByText("7.42 ALEPH")).toBeInTheDocument(); // formatAleph
    expect(screen.getByText("CRN-1")).toBeInTheDocument();
    expect(screen.getByText("CRN-2")).toBeInTheDocument();
    expect(screen.queryByText(/hosted vms/i)).not.toBeInTheDocument();
  });
});
```

> **Note on `formatAleph`:** the helper formats as `"X.XX ALEPH"` (verify in `src/lib/format.ts`). If the formatter omits the suffix, adjust the test assertion accordingly.

- [ ] **Step 7.2: Run test — verify failure**

```bash
pnpm vitest run src/components/node-earnings-tab-ccn.test.tsx
```

Expected: module not found.

- [ ] **Step 7.3: Implement the component**

Create `src/components/node-earnings-tab-ccn.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card } from "@aleph-front/ds/card";
import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";
import { Badge } from "@aleph-front/ds/badge";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import {
  useNodeEarnings,
  type NodeEarnings,
} from "@/hooks/use-node-earnings";
import { useNodeState } from "@/hooks/use-node-state";
import { useNode } from "@/hooks/use-nodes";
import { NodeEarningsKpiRow, type KpiCard } from "@/components/node-earnings-kpi-row";
import { NodeEarningsChart } from "@/components/node-earnings-chart";
import { formatAleph, relativeTime } from "@/lib/format";
import { nodeStatusToDot } from "@/lib/status-map";
import type { CreditRange } from "@/hooks/use-credit-expenses";

const RANGE_VALUES: CreditRange[] = ["24h", "7d", "30d"];

function deltaArrow(delta: number): string {
  if (delta > 0.0001) return "▲";
  if (delta < -0.0001) return "▼";
  return "·";
}

// Mirrors linkedCRNPenalty from credit-distribution.ts logic for CCNs.
function linkedCrnPenaltyPct(linkedCount: number): number {
  // 0 → 70%, 1 → 80%, 2 → 90%, 3+ → 100%
  if (linkedCount >= 3) return 100;
  return 70 + linkedCount * 10;
}

function buildCcnCards(
  data: NodeEarnings,
  range: CreditRange,
  score: number,
  status: string,
  updatedAt: string | undefined,
  linkedCount: number,
): KpiCard[] {
  const dAleph = data.delta.aleph;
  return [
    {
      label: `ALEPH accrued (${range})`,
      primary: formatAleph(data.totalAleph),
      secondary: `${deltaArrow(dAleph)} ${formatAleph(Math.abs(dAleph))} vs prev ${range}`,
      tone: dAleph > 0 ? "up" : dAleph < 0 ? "down" : "default",
    },
    {
      label: "Score",
      primary: score.toFixed(2),
      secondary: "vs 0.8 threshold",
      tone: score < 0.8 ? "warning" : "default",
    },
    {
      label: "Linked CRNs",
      primary: String(linkedCount),
      secondary: `linkedCRNPenalty: ${linkedCrnPenaltyPct(linkedCount)}%`,
      tone: linkedCount < 3 ? "warning" : "default",
    },
    {
      label: "Status",
      primary: status,
      secondary: updatedAt ? `updated ${relativeTime(updatedAt)}` : "—",
    },
  ];
}

export function NodeEarningsTabCcn({ hash }: { hash: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rangeParam = searchParams.get("earningsRange") as CreditRange | null;
  const [range, setRange] = useState<CreditRange>(
    rangeParam && RANGE_VALUES.includes(rangeParam) ? rangeParam : "24h",
  );

  const handleRangeChange = (next: string) => {
    if (!RANGE_VALUES.includes(next as CreditRange)) return;
    setRange(next as CreditRange);
    const params = new URLSearchParams(searchParams.toString());
    params.set("earningsRange", next);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const { data, isLoading } = useNodeEarnings(hash, range);
  const { data: nodeState } = useNodeState();
  const { data: node } = useNode(hash);

  const ccn = nodeState?.ccns.get(hash);

  if (isLoading || !data || !ccn) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const linkedCount = data.linkedCrns?.length ?? 0;
  const cards = buildCcnCards(
    data,
    range,
    ccn.score,
    node?.status ?? ccn.status,
    node?.updatedAt,
    linkedCount,
  );

  return (
    <div className="space-y-4">
      <Tabs value={range} onValueChange={handleRangeChange}>
        <TabsList variant="pill" size="sm">
          {RANGE_VALUES.map((r) => (
            <TabsTrigger key={r} value={r}>
              {r}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <NodeEarningsKpiRow cards={cards} />

      <Card padding="md">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ALEPH accrual over time
        </div>
        <NodeEarningsChart
          buckets={data.buckets}
          primaryLabel="ALEPH"
          secondaryLabel="Linked CRNs"
          {...(ccn.status !== "active"
            ? { emptyHint: "Earnings start once the node activates (score ≥ 0.2 and stake ≥ 500k ALEPH)." }
            : linkedCount === 0
            ? { emptyHint: "Registered but has no attached CRNs yet." }
            : {})}
        />
      </Card>

      {data.linkedCrns && data.linkedCrns.length > 0 && (
        <Card padding="md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Linked CRNs
          </div>
          <p className="mb-3 text-xs italic text-muted-foreground">
            Linked CRNs contribute to your linkedCRNPenalty factor but their VM
            earnings accrue to themselves, not to this CCN.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">CRN</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">VMs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {data.linkedCrns.map((c) => (
                <tr key={c.hash}>
                  <td className="py-1.5 pr-4">
                    <CopyableText
                      text={c.hash}
                      startChars={8}
                      endChars={8}
                      size="sm"
                      href={`/nodes?view=${c.hash}`}
                    />
                    {c.name && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.name}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4">
                    <Badge fill="outline" size="sm">
                      {c.status}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {c.vmCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs italic text-muted-foreground">
        Accrued earnings from the credit-expense feed using the protocol&apos;s
        distribution split. Numbers reflect what this node earned, not yet paid
        on-chain.
      </p>
    </div>
  );
}
```

- [ ] **Step 7.4: Run test — verify pass**

```bash
pnpm vitest run src/components/node-earnings-tab-ccn.test.tsx
```

Expected: pass.

- [ ] **Step 7.5: Commit**

```bash
git add src/components/node-earnings-tab-ccn.tsx src/components/node-earnings-tab-ccn.test.tsx
git commit -m "feat(earnings): NodeEarningsTabCcn CCN composition"
```

---

## Task 8: Wire tabs into `NodeDetailView`

**Files:**
- Modify: `src/components/node-detail-view.tsx`

- [ ] **Step 8.1: Wrap content in DS Tabs**

Edit `src/components/node-detail-view.tsx`. Add imports at the top:

```ts
import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";
import { useNodeState } from "@/hooks/use-node-state";
import { NodeEarningsTab } from "@/components/node-earnings-tab";
import { NodeEarningsTabCcn } from "@/components/node-earnings-tab-ccn";
```

Extend the props type:

```ts
type NodeDetailViewProps = {
  hash: string;
  initialTab?: "overview" | "earnings";
};
```

Inside the component, add state + URL sync just below `const router = useRouter();` (line ~49):

```ts
const pathname = usePathname();
const searchParams = useSearchParams();
const [tab, setTab] = useState<"overview" | "earnings">(
  props.initialTab ?? "overview",
);
const handleTabChange = (next: string) => {
  if (next !== "overview" && next !== "earnings") return;
  setTab(next);
  const params = new URLSearchParams(searchParams.toString());
  if (next === "overview") params.delete("tab");
  else params.set("tab", next);
  router.replace(
    params.toString() ? `${pathname}?${params.toString()}` : pathname,
  );
};
const { data: nodeState } = useNodeState();
const isCcn = nodeState?.ccns.has(hash) ?? false;
```

Update the function signature to destructure props:

```ts
export function NodeDetailView({ hash, initialTab }: NodeDetailViewProps) {
```

Inside the `return (…)` of the loaded state (currently wrapping the cards in a single `<div className="space-y-6">`), insert the Tabs control immediately after the header block (around line 113, just before the `Details` Card):

```tsx
<Tabs value={tab} onValueChange={handleTabChange}>
  <TabsList variant="underline" size="sm">
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="earnings">Earnings</TabsTrigger>
  </TabsList>
</Tabs>
```

Then wrap the existing cards (Details / Resources / GPUs / VMs / History) in a conditional block:

```tsx
{tab === "overview" ? (
  <>
    {/* Existing Details / Resources / GPUs / VMs / History cards (unchanged) */}
  </>
) : isCcn ? (
  <NodeEarningsTabCcn hash={hash} />
) : (
  <NodeEarningsTab hash={hash} />
)}
```

Make sure the `{` and `}` are placed so that the existing card sequence falls inside the `Overview` branch and indentation stays clean.

- [ ] **Step 8.2: Run existing detail-view tests (if any) + check the build**

```bash
pnpm vitest run src/components/node-detail-view.test.tsx 2>/dev/null || echo "no existing tests for this file"
pnpm typecheck
```

Expected: no type errors. (If there's no test file for `node-detail-view.tsx`, that's fine — coverage is via the tab tests we already wrote.)

- [ ] **Step 8.3: Commit**

```bash
git add src/components/node-detail-view.tsx
git commit -m "feat(earnings): tabs control on NodeDetailView for Overview/Earnings"
```

---

## Task 9: URL plumbing on `/nodes`

**Files:**
- Modify: `src/app/nodes/page.tsx`

- [ ] **Step 9.1: Thread `?tab=` to NodeDetailView**

Edit `src/app/nodes/page.tsx`. Inside `NodesContent()` (around line 18), add:

```ts
const tabParam = searchParams.get("tab");
const initialTab: "overview" | "earnings" =
  tabParam === "earnings" ? "earnings" : "overview";
```

Then update the early-return when `viewHash` is set (line ~53):

```tsx
if (viewHash) {
  return <NodeDetailView hash={viewHash} initialTab={initialTab} />;
}
```

- [ ] **Step 9.2: Typecheck + smoke build**

```bash
pnpm typecheck
pnpm build
```

Expected: no errors. The static export must succeed for IPFS deployment.

- [ ] **Step 9.3: Commit**

```bash
git add src/app/nodes/page.tsx
git commit -m "feat(earnings): read ?tab= query param on /nodes"
```

---

## Task 10: Verify and refine

- [ ] Run full project checks (`pnpm check`)
- [ ] Manual testing — smoke flow:
  1. `pnpm dev`
  2. Open `/nodes`, click a CRN row → detail view opens
  3. Click the "Earnings" tab → KPI row shows 24h ALEPH/VMs/Score/Status
  4. Verify ALEPH number is non-zero for an active CRN (e.g. one with many VMs)
  5. Switch to 7d, then 30d — chart redraws; previous data stays during refetch (placeholder behaviour)
  6. URL reflects `?tab=earnings&earningsRange=7d`
  7. Reload the page on that URL → opens directly on Earnings 7d
  8. Switch back to Overview → other cards (Details, Resources, etc.) render as before
  9. Repeat for a CCN: navigate to `/nodes?view=<ccn-hash>&tab=earnings` → linked-CRN list renders
  10. Inactive node: pick a CRN with no VMs / no recent expenses → empty state renders cleanly (no JS errors, no NaN cards)
- [ ] Fix any issues found
- [ ] Re-run checks until clean

---

## Task 11: Update docs and version

- [ ] **ARCHITECTURE.md** — Add a "Recipes / Node detail view tabs" entry (or wherever component-architecture recipes live) noting:
  - DS Tabs (`variant="underline"`) wraps the detail-view content
  - Earnings tab dispatches to CRN or CCN variant based on `nodeState.crns.has(hash)` vs `nodeState.ccns.has(hash)`
  - `useNodeEarnings` composes existing hooks (`useCreditExpenses`, `useNodeState`, `useNode`, `useNodes`) plus the new `replayVmCountTimeline` pure helper
  - `computeDistributionSummary` now has an optional bucket-aware mode; existing callers unaffected

- [ ] **DECISIONS.md** — Add the `Decision #89` entry drafted in the spec's "Decision log additions" section. Date 2026-05-12.

- [ ] **BACKLOG.md** — Move "Top VMs by Cost card on credits page" / similar items if any get unblocked by the new bucket math. Add follow-ups under **Needs planning**:
  - Chart tooltip on hover showing exact bucket time + values
  - Distribution reconciliation view
  - Per-CRN sparkline on the network graph CRN detail panel
  - Score-over-time line (requires `/stats/history` backend)
  - Compare-to-network-median delta as an alternative to previous-window delta
  - Persistent localStorage cache for `useNodeEarnings`

- [ ] **CLAUDE.md** — Append under "Current Features":
  - `Node detail view (/nodes?view=<hash>) has an Earnings tab (CRN + CCN) showing trailing 24h/7d/30d ALEPH accrued with previous-window deltas, a dual-line trend chart (ALEPH × VM-count for CRN, ALEPH × linked-CRN-count for CCN), and a per-VM (CRN) or linked-CRN (CCN) breakdown. Computed from existing aleph_credit_expense data via an optional bucket-aware mode on computeDistributionSummary; no new API calls. URL params: ?tab=earnings, ?earningsRange=24h|7d|30d.`

- [ ] **src/changelog.ts** — Bump CURRENT_VERSION (minor: this is a feature). Add a `VersionEntry` with category `"Feature"` summarising:
  - Per-CRN / per-CCN Earnings tab on node detail view
  - Dual-line trend chart with VM-count overlay
  - Per-VM breakdown table (CRN) / linked-CRN list (CCN)

- [ ] Commit doc updates separately so the diff is reviewable:

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md CLAUDE.md src/changelog.ts
git commit -m "docs: ARCHITECTURE/DECISIONS/BACKLOG/CLAUDE for CRN/CCN earnings tab"
```
