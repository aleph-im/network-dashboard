# Node Earnings Tab — Rewards Layer Re-source (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-source the Node Earnings tab (`/nodes?view=<hash>&tab=earnings`) and the panel sparklines from the client-side credit-expense reconstruction onto the authoritative rewards layer (credit.aleph.im `/rewards/time-series`), adding the wage subsidy and removing every heavy whole-network fetch outside `/credits`.

**Architecture:** `useNodeEarnings` keeps its name and return contract but internally swaps `useCreditExpenses` + `computeDistributionSummary` for bucketed `useRewards` queries plus pure apportionment helpers. Multi-node splits use exact per-bucket execution weights from a new bounded `tags=type_execution` api2 fetch at 24h/7d, and fall back to the live vmCount proxy at 30d and in the panel sparks (`weights: "proxy"`). Chart renders early from rewards buckets and refines when exact weights land.

**Tech Stack:** Next.js 16 static export, TypeScript strict (`exactOptionalPropertyTypes`), React Query v5, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-11-node-earnings-rewards-resource-design.md`

**Branch:** `feature/node-earnings-rewards-resource` (create from main before any file edit)

**Verified live-API facts the code relies on:**
- `messages.json` honors `tags=type_execution` (execution-only ≈ 10MB/24h, ≈ 70MB/7d; unfiltered is storage-dominated ≈ 112MB/24h).
- `/rewards/time-series` `detail=2` returns per-bucket `totals` + `bySource` + `full`, **sparse-keyed** (zero sources omit keys) — every bucket must go through the same dense normalization as the totals path.
- Credit-expense entry `time` is an execution *duration*, not a timestamp — bucket by the parent `expense.time` (message time), exactly like the old `computeDistributionSummary` did.
- The persistence allowlist in `src/app/providers.tsx` (`PERSISTED_QUERY_PREFIXES = ["credit-expenses"]`) means the new `execution-expenses` query key is **already excluded** from localStorage — no providers change needed.

---

## File structure

| File | Change |
|---|---|
| `src/api/rewards-types.ts` | Add `RewardsBucket`; `AddressRewards` gains optional `buckets` |
| `src/api/rewards-client.ts` | `getRewardsTimeSeries` gains optional `bucketSize` + bucket parsing |
| `src/api/client.ts` | New `getExecutionExpenses` (tags filter + 60s timeout) |
| `src/hooks/use-rewards.ts` | `bucketSize` param in key/fn; new `getStableHourRange` helper |
| `src/hooks/use-execution-expenses.ts` | **New** — React Query wrapper, in-memory only |
| `src/lib/reward-apportionment.ts` | Add `roleTotals`, `computeExecutionBucketWeights`, `apportionNodeBuckets`, `computePerVmEarnings` |
| `src/hooks/use-node-earnings.ts` | Rewritten internals; contract kept + additive fields (`bySource`, `weightsExact`) and flags (`isError`, `isPerVmLoading`, `isPerVmError`) |
| `src/components/reward-source-bar.tsx` | **New** — `RewardSourceBar` extracted from wallet card |
| `src/components/wallet-revenue-card.tsx` | Use shared `RewardSourceBar` |
| `src/components/node-earnings-kpi-row.tsx` | `KpiCard` gains optional `extra: ReactNode` |
| `src/components/node-earnings-tab.tsx` | By-source bar, refine hint, per-VM loading/error/caption states, footnote, error state |
| `src/components/node-earnings-tab-ccn.tsx` | By-source bar, footnote, error state |
| `src/components/node-earnings-spark.tsx` | `{ weights: "proxy" }` |
| `src/lib/credit-distribution.ts` + `src/api/credit-types.ts` | Remove `SummaryOptions` / `perNodeBuckets` / `perVmInWindow` machinery |
| Tests | `rewards-client.test.ts`, `client.url.test.ts`, `reward-apportionment.test.ts`, `use-node-earnings.test.tsx` (rewrite), `credit-distribution.test.ts` (trim) |

---

### Task 1: Bucketed rewards time-series (types + client)

**Files:**
- Modify: `src/api/rewards-types.ts`
- Modify: `src/api/rewards-client.ts`
- Test: `src/api/rewards-client.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `src/api/rewards-client.test.ts` inside `describe("getRewardsTimeSeries", ...)`:

```ts
  it("parses buckets when bucketSize is provided (sparse-keyed, like totals)", async () => {
    const withBuckets = {
      total: SAMPLE.total,
      buckets: [
        {
          start: "2026-06-09T00:00:00.000Z",
          end: "2026-06-09T23:59:59.999Z",
          partial: false,
          totals: { aleph: 2.87 },
          bySource: { credit_revenue: 1.3, wage_subsidy: 1.22 },
          full: {
            credit_revenue: { execution_crn: 1.3 },
            wage_subsidy: { crn: 1.22 },
          },
        },
        // Zero bucket: API omits everything but the bounds.
        { start: "2026-06-10T00:00:00.000Z", end: "2026-06-10T23:59:59.999Z", partial: false },
      ],
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(withBuckets), { status: 200 }));

    const r = await getRewardsTimeSeries("0xabc", 1780617600, 1780790400, "1d");

    expect((fetchSpy.mock.calls[0]![0] as string)).toContain("bucketSize=1d");
    expect(r.buckets).toHaveLength(2);
    expect(r.buckets![0]!.startSec).toBe(Math.floor(Date.parse("2026-06-09T00:00:00.000Z") / 1000));
    expect(r.buckets![0]!.aleph).toBeCloseTo(2.87);
    expect(r.buckets![0]!.full.credit_revenue.execution_crn).toBeCloseTo(1.3);
    expect(r.buckets![0]!.full.credit_revenue.execution_ccn).toBe(0); // densified
    expect(r.buckets![0]!.bySource.holder_tier).toBe(0); // densified
    expect(r.buckets![1]!.aleph).toBe(0);
    expect(r.buckets![1]!.full.wage_subsidy.crn).toBe(0);
  });

  it("omits buckets and collapses to a single aggregate when no bucketSize", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(SAMPLE), { status: 200 }),
    );
    const r = await getRewardsTimeSeries("0xabc", 1777593611, 1780306643);
    expect(r.buckets).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/api/rewards-client.test.ts`
Expected: FAIL — `r.buckets` undefined / `bucketSize=1d` not in URL.

- [ ] **Step 3: Implement.** In `src/api/rewards-types.ts`, after `AddressRewards`:

```ts
/** One time-series bucket (detail=2). Same sparse-wire→dense rules as totals. */
export type RewardsBucket = {
  startSec: number;
  endSec: number;
  aleph: number;
  bySource: BySource;
  full: RewardsFull;
};
```

and extend `AddressRewards`:

```ts
export type AddressRewards = {
  address: string;
  totalAleph: number;
  bySource: BySource;
  full: RewardsFull;
  /** Present only when the query asked for a bucketed series. */
  buckets?: RewardsBucket[];
};
```

In `src/api/rewards-client.ts`: import `RewardsBucket`, add a `WireBucket` type and extend `TimeSeriesResponse`:

```ts
type WireBucket = {
  start: string;
  end: string;
  totals?: { aleph?: number };
  bySource?: Partial<BySource>;
  full?: {
    credit_revenue?: Partial<CreditRoleFull>;
    holder_tier?: Partial<CreditRoleFull>;
    wage_subsidy?: Partial<WageRoleFull>;
  };
};
```

(`TimeSeriesResponse` gains `buckets?: WireBucket[];`.) Change the signature and tail of `getRewardsTimeSeries`:

```ts
export async function getRewardsTimeSeries(
  address: string,
  fromSec: number,
  toSec: number,
  bucketSize?: string,
): Promise<AddressRewards> {
  const addr = address.toLowerCase();
  const params = new URLSearchParams({
    from: toHourBound(fromSec),
    to: toHourBound(toSec),
    address: addr,
    detail: "2",
    // No caller bucketSize → one aggregate bucket; we read only `total`.
    bucketSize: bucketSize ?? "1y",
  });
  // ... fetch + error handling unchanged ...
  const t = data.total;
  const base: AddressRewards = {
    address: addr,
    totalAleph: t.totals?.aleph ?? 0,
    bySource: {
      credit_revenue: t.bySource?.credit_revenue ?? 0,
      holder_tier: t.bySource?.holder_tier ?? 0,
      wage_subsidy: t.bySource?.wage_subsidy ?? 0,
    },
    full: {
      credit_revenue: denseCreditRole(t.full?.credit_revenue),
      holder_tier: denseCreditRole(t.full?.holder_tier),
      wage_subsidy: denseWageRole(t.full?.wage_subsidy),
    },
  };
  if (!bucketSize) return base;
  const buckets: RewardsBucket[] = (data.buckets ?? []).map((b) => ({
    startSec: Math.floor(Date.parse(b.start) / 1000),
    endSec: Math.floor(Date.parse(b.end) / 1000),
    aleph: b.totals?.aleph ?? 0,
    bySource: {
      credit_revenue: b.bySource?.credit_revenue ?? 0,
      holder_tier: b.bySource?.holder_tier ?? 0,
      wage_subsidy: b.bySource?.wage_subsidy ?? 0,
    },
    full: {
      credit_revenue: denseCreditRole(b.full?.credit_revenue),
      holder_tier: denseCreditRole(b.full?.holder_tier),
      wage_subsidy: denseWageRole(b.full?.wage_subsidy),
    },
  }));
  return { ...base, buckets };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/api/rewards-client.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/api/rewards-types.ts src/api/rewards-client.ts src/api/rewards-client.test.ts
git commit -m "feat(rewards): bucketed time-series parsing with sparse→dense normalization"
```

---

### Task 2: `useRewards` bucketSize + `getStableHourRange`

**Files:**
- Modify: `src/hooks/use-rewards.ts`
- Test: `src/hooks/use-rewards.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `src/hooks/use-rewards.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { getStableHourRange } from "@/hooks/use-rewards";

afterEach(() => vi.useRealTimers());

describe("getStableHourRange", () => {
  it("truncates the end to the start of the current hour", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T14:37:23Z"));
    const { start, end } = getStableHourRange(86400);
    expect(end).toBe(Math.floor(Date.parse("2026-06-11T14:00:00Z") / 1000));
    expect(end - start).toBe(86400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/hooks/use-rewards.test.ts`
Expected: FAIL — `getStableHourRange` is not exported.

- [ ] **Step 3: Implement.** `src/hooks/use-rewards.ts` becomes:

```ts
"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getRewardsTimeSeries } from "@/api/rewards-client";

/**
 * Hour-stable window ending at the start of the current hour. The rewards API
 * truncates bounds to whole hours anyway (hour-cache); deriving the window
 * hour-aligned keeps the query key stable for a full hour and the execution
 * -expense window byte-identical to the rewards window.
 */
export function getStableHourRange(seconds: number): {
  start: number;
  end: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const end = Math.floor(now / 3600) * 3600;
  return { start: end - seconds, end };
}

/** Authoritative per-address rewards over [fromSec, toSec]. Optional bucketSize
 *  (`"1h"`/`"1d"`) returns the bucketed series alongside the totals. */
export function useRewards(
  address: string,
  fromSec: number,
  toSec: number,
  bucketSize?: string,
) {
  return useQuery({
    queryKey: ["rewards", address.toLowerCase(), fromSec, toSec, bucketSize ?? "total"],
    queryFn: () => getRewardsTimeSeries(address, fromSec, toSec, bucketSize),
    enabled: !!address && toSec > fromSec,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/hooks/use-rewards.test.ts src/hooks/use-owner-rewards.test.tsx`
Expected: PASS (owner-rewards untouched behaviorally — old call sites pass no bucketSize).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-rewards.ts src/hooks/use-rewards.test.ts
git commit -m "feat(rewards): useRewards bucketSize param + hour-stable window helper"
```

---

### Task 3: `getExecutionExpenses` client function

**Files:**
- Modify: `src/api/client.ts` (next to `getCreditExpenses`)
- Test: `src/api/client.url.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/api/client.url.test.ts` (follow the file's existing fetch-spy pattern; if the file mocks fetch differently, match it):

```ts
describe("getExecutionExpenses", () => {
  it("requests only execution-tagged expense messages with a bounded window", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );
    await getExecutionExpenses(1781000000, 1781086400);
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("tags=type_execution");
    expect(url).toContain("contentTypes=aleph_credit_expense");
    expect(url).toContain("startDate=1781000000");
    expect(url).toContain("endDate=1781086400");
  });
});
```

(Import `getExecutionExpenses` from `@/api/client` at the top.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/api/client.url.test.ts`
Expected: FAIL — `getExecutionExpenses` not exported.

- [ ] **Step 3: Implement** — in `src/api/client.ts`, directly below `getCreditExpenses`:

```ts
const EXECUTION_EXPENSE_TIMEOUT_MS = 60_000;

/**
 * Execution-only slice of the credit-expense feed (`tags=type_execution`).
 * The unfiltered feed is storage-dominated (~112MB/24h); execution-only is
 * ~10MB/24h, ~70MB/7d — callers must keep windows ≤ 7d. Timeout-protected:
 * a missing timeout on the unfiltered fetch is what hung the wallet
 * breakdown (Decision #112).
 */
export async function getExecutionExpenses(
  startDate: number,
  endDate: number,
): Promise<CreditExpense[]> {
  const params = new URLSearchParams({
    msgType: "POST",
    contentTypes: "aleph_credit_expense",
    tags: "type_execution",
    addresses: CREDIT_EXPENSE_SENDER,
    startDate: String(Math.floor(startDate)),
    endDate: String(Math.floor(endDate)),
    pagination: "10000",
    sort_order: "1",
    sort_by: "tx-time",
  });

  const url = `${getAlephBaseUrl()}/api/v0/messages.json?${params}`;
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(EXECUTION_EXPENSE_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Aleph API (execution expenses) unreachable (timeout)");
  }
  if (!res.ok) {
    throw new Error(`Aleph API error: ${res.status}`);
  }
  const data = (await res.json()) as { messages: ApiCreditExpenseMessage[] };

  const all: CreditExpense[] = [];
  for (const msg of data.messages) {
    const parsed = parseCreditMessage(msg);
    if (parsed) all.push(parsed);
  }
  return all;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/api/client.url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/api/client.url.test.ts
git commit -m "feat(api): bounded execution-only expense fetch with timeout"
```

---

### Task 4: `useExecutionExpenses` hook

**Files:**
- Create: `src/hooks/use-execution-expenses.ts`

No dedicated test file — the enabled-gating and key shape are covered by the hook tests in Task 6 (which assert `getExecutionExpenses` is/isn't called).

- [ ] **Step 1: Implement** — create `src/hooks/use-execution-expenses.ts`:

```ts
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getExecutionExpenses } from "@/api/client";

/**
 * Execution-only expense slice for per-bucket weights + the per-VM table.
 * In-memory React Query only — the "execution-expenses" key is deliberately
 * NOT in providers.tsx's PERSISTED_QUERY_PREFIXES (tens of MB don't belong in
 * localStorage). Callers pass hour-stable windows so keys dedupe.
 */
export function useExecutionExpenses(
  startSec: number,
  endSec: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["execution-expenses", startSec, endSec],
    queryFn: () => getExecutionExpenses(startSec, endSec),
    staleTime: 5 * 60_000,
    refetchInterval: false,
    enabled: enabled && startSec > 0 && endSec > startSec,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-execution-expenses.ts
git commit -m "feat(hooks): useExecutionExpenses (in-memory, gated)"
```

---

### Task 5: Apportionment helpers (pure lib)

**Files:**
- Modify: `src/lib/reward-apportionment.ts`
- Test: `src/lib/reward-apportionment.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `src/lib/reward-apportionment.test.ts`:

```ts
import {
  roleTotals,
  computeExecutionBucketWeights,
  apportionNodeBuckets,
  computePerVmEarnings,
} from "@/lib/reward-apportionment";
import type { RewardsBucket, RewardsFull } from "@/api/rewards-types";
import type { CreditExpense } from "@/api/credit-types";

const FULL: RewardsFull = {
  credit_revenue: { execution_crn: 60, execution_ccn: 10, execution_staker: 20, storage_ccn: 5, storage_staker: 5 },
  holder_tier: { execution_crn: 30, execution_ccn: 4, execution_staker: 6, storage_ccn: 2, storage_staker: 1 },
  wage_subsidy: { crn: 12, ccn: 9, staker: 3 },
};

function bucket(startSec: number, full: RewardsFull): RewardsBucket {
  const aleph =
    full.credit_revenue.execution_crn + full.credit_revenue.execution_ccn +
    full.credit_revenue.execution_staker + full.credit_revenue.storage_ccn +
    full.credit_revenue.storage_staker + full.holder_tier.execution_crn +
    full.holder_tier.execution_ccn + full.holder_tier.execution_staker +
    full.holder_tier.storage_ccn + full.holder_tier.storage_staker +
    full.wage_subsidy.crn + full.wage_subsidy.ccn + full.wage_subsidy.staker;
  return {
    startSec,
    endSec: startSec + 3600,
    aleph,
    bySource: {
      credit_revenue: 100, // not used by apportionment; full is the source
      holder_tier: 43,
      wage_subsidy: 24,
    },
    full,
  };
}

function execExpense(time: number, entries: { nodeId: string; vm: string; aleph: number; source?: "credits" | "hold" }[]): CreditExpense {
  return {
    hash: `e${time}`,
    time,
    type: "execution",
    totalAleph: entries.reduce((s, e) => s + e.aleph, 0),
    creditCount: entries.length,
    creditPriceAleph: 1,
    credits: entries.map((e, i) => ({
      address: "0xpayer",
      amount: e.aleph,
      alephCost: e.aleph,
      ref: `r${i}`,
      timeSec: 0,
      nodeId: e.nodeId,
      executionId: e.vm,
      source: e.source ?? "credits",
    })),
  };
}

describe("roleTotals", () => {
  it("sums per-role node-owner totals including wage", () => {
    const r = roleTotals(FULL);
    expect(r.crn).toBeCloseTo(60 + 30 + 12);
    expect(r.ccn).toBeCloseTo(10 + 5 + 4 + 2 + 9);
    expect(r.staker).toBeCloseTo(20 + 5 + 6 + 1 + 3);
  });
});

describe("computeExecutionBucketWeights", () => {
  const bounds = [
    { startSec: 0, endSec: 3600 },
    { startSec: 3600, endSec: 7200 },
  ];

  it("buckets by expense message time and filters to owned CRNs", () => {
    const w = computeExecutionBucketWeights(
      [
        execExpense(100, [
          { nodeId: "crnA", vm: "vm1", aleph: 30 },
          { nodeId: "crnB", vm: "vm2", aleph: 10 },
          { nodeId: "other", vm: "vm3", aleph: 99 },
        ]),
        execExpense(4000, [{ nodeId: "crnA", vm: "vm1", aleph: 5 }]),
      ],
      new Set(["crnA", "crnB"]),
      bounds,
    );
    expect(w[0]!.get("crnA")).toBeCloseTo(30);
    expect(w[0]!.get("crnB")).toBeCloseTo(10);
    expect(w[0]!.has("other")).toBe(false);
    expect(w[1]!.get("crnA")).toBeCloseTo(5);
    // Seeded: idle owned CRN is present at 0, so distribute() never drops it.
    expect(w[1]!.get("crnB")).toBe(0);
  });

  it("skips expenses outside every bucket", () => {
    const w = computeExecutionBucketWeights(
      [execExpense(99999, [{ nodeId: "crnA", vm: "vm1", aleph: 5 }])],
      new Set(["crnA"]),
      bounds,
    );
    expect(w[0]!.get("crnA")).toBe(0);
    expect(w[1]!.get("crnA")).toBe(0);
  });
});

describe("apportionNodeBuckets", () => {
  it("single-node address gets the full role pool (exact, no weights needed)", () => {
    const r = apportionNodeBuckets({
      nodeHash: "crnA",
      role: "crn",
      buckets: [bucket(0, FULL)],
      perBucketWeights: null,
      staticWeights: new Map([["crnA", 0]]), // zero weight → even split of 1 node
    });
    expect(r.totalAleph).toBeCloseTo(60 + 30 + 12);
    expect(r.bySource.credit_revenue).toBeCloseTo(60);
    expect(r.bySource.holder_tier).toBeCloseTo(30);
    expect(r.bySource.wage_subsidy).toBeCloseTo(12);
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0]!.time).toBe(0);
    expect(r.buckets[0]!.aleph).toBeCloseTo(102);
  });

  it("splits multi-CRN by per-bucket weights, wage included by the same weights", () => {
    const weights = [
      new Map([["crnA", 75], ["crnB", 25]]),
      new Map([["crnA", 0], ["crnB", 100]]),
    ];
    const r = apportionNodeBuckets({
      nodeHash: "crnA",
      role: "crn",
      buckets: [bucket(0, FULL), bucket(3600, FULL)],
      perBucketWeights: weights,
      staticWeights: new Map(),
    });
    // bucket 0: 102 * 0.75; bucket 1: 102 * 0
    expect(r.buckets[0]!.aleph).toBeCloseTo(102 * 0.75);
    expect(r.buckets[1]!.aleph).toBeCloseTo(0);
    expect(r.totalAleph).toBeCloseTo(102 * 0.75);
    expect(r.bySource.wage_subsidy).toBeCloseTo(12 * 0.75);
  });

  it("falls back to even split when a bucket's weights are all zero", () => {
    const r = apportionNodeBuckets({
      nodeHash: "crnA",
      role: "crn",
      buckets: [bucket(0, FULL)],
      perBucketWeights: [new Map([["crnA", 0], ["crnB", 0]])],
      staticWeights: new Map(),
    });
    expect(r.totalAleph).toBeCloseTo(102 / 2);
  });

  it("CCN role pools execution_ccn + storage_ccn + wage.ccn by static score weights", () => {
    const r = apportionNodeBuckets({
      nodeHash: "ccnX",
      role: "ccn",
      buckets: [bucket(0, FULL)],
      perBucketWeights: null,
      staticWeights: new Map([["ccnX", 1], ["ccnY", 1]]),
    });
    // (10+5+4+2+9) / 2
    expect(r.totalAleph).toBeCloseTo(30 / 2);
  });
});

describe("computePerVmEarnings", () => {
  it("scales raw per-VM ALEPH so the owned-set total matches the authoritative exec earnings", () => {
    const perVm = computePerVmEarnings({
      nodeHash: "crnA",
      expenses: [
        execExpense(100, [
          { nodeId: "crnA", vm: "vm1", aleph: 60 },
          { nodeId: "crnA", vm: "vm2", aleph: 20, source: "hold" },
          { nodeId: "crnB", vm: "vm3", aleph: 20 },
        ]),
      ],
      addressExecAleph: 50, // authoritative (cr+ht).execution_crn for the window
      ownedCrnHashes: new Set(["crnA", "crnB"]),
    });
    // factor = 50 / 100 raw
    expect(perVm).toHaveLength(2);
    expect(perVm[0]!.vmHash).toBe("vm1");
    expect(perVm[0]!.aleph).toBeCloseTo(30);
    expect(perVm[1]!.aleph).toBeCloseTo(10);
    expect(perVm[1]!.source).toBe("hold");
  });

  it("returns empty for zero raw execution", () => {
    expect(
      computePerVmEarnings({
        nodeHash: "crnA",
        expenses: [],
        addressExecAleph: 50,
        ownedCrnHashes: new Set(["crnA"]),
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/reward-apportionment.test.ts`
Expected: FAIL — new functions not exported.

- [ ] **Step 3: Implement** — append to `src/lib/reward-apportionment.ts` (extend the imports: `RewardsBucket`, `RewardsFull` from `@/api/rewards-types`; `CreditEntrySource`, `CreditExpense` from `@/api/credit-types`):

```ts
/** Per-role node-owner totals from a `full` split, wage included. */
export function roleTotals(full: RewardsFull): {
  crn: number;
  ccn: number;
  staker: number;
} {
  const cr = full.credit_revenue;
  const ht = full.holder_tier;
  const w = full.wage_subsidy;
  return {
    crn: cr.execution_crn + ht.execution_crn + w.crn,
    ccn:
      cr.execution_ccn + cr.storage_ccn +
      ht.execution_ccn + ht.storage_ccn +
      w.ccn,
    staker:
      cr.execution_staker + cr.storage_staker +
      ht.execution_staker + ht.storage_staker +
      w.staker,
  };
}

/**
 * Per-bucket execution ALEPH per owned CRN. Bucketed by the parent expense's
 * message time (entry `timeSec` is an execution duration, not a timestamp).
 * Every owned CRN is seeded at 0 in every bucket so `distribute()` falls back
 * to an even split instead of dropping idle nodes.
 */
export function computeExecutionBucketWeights(
  expenses: CreditExpense[],
  ownedCrnHashes: Set<string>,
  buckets: { startSec: number; endSec: number }[],
): Map<string, number>[] {
  const out = buckets.map(() => {
    const m = new Map<string, number>();
    for (const h of ownedCrnHashes) m.set(h, 0);
    return m;
  });
  for (const e of expenses) {
    if (e.type !== "execution") continue;
    const idx = buckets.findIndex(
      (b) => e.time >= b.startSec && e.time < b.endSec,
    );
    if (idx < 0) continue;
    const w = out[idx]!;
    for (const c of e.credits) {
      if (!c.nodeId || !ownedCrnHashes.has(c.nodeId)) continue;
      w.set(c.nodeId, (w.get(c.nodeId) ?? 0) + c.alephCost);
    }
  }
  return out;
}

export type ApportionedNode = {
  buckets: { time: number; aleph: number }[];
  totalAleph: number;
  bySource: BySource;
};

const SOURCES: RewardSource[] = ["credit_revenue", "holder_tier", "wage_subsidy"];

function bucketRolePools(
  b: RewardsBucket,
  role: "crn" | "ccn",
): Record<RewardSource, number> {
  const cr = b.full.credit_revenue;
  const ht = b.full.holder_tier;
  const w = b.full.wage_subsidy;
  if (role === "crn") {
    return {
      credit_revenue: cr.execution_crn,
      holder_tier: ht.execution_crn,
      wage_subsidy: w.crn,
    };
  }
  return {
    credit_revenue: cr.execution_ccn + cr.storage_ccn,
    holder_tier: ht.execution_ccn + ht.storage_ccn,
    wage_subsidy: w.ccn,
  };
}

function shareFraction(weights: Map<string, number>, hash: string): number {
  let sum = 0;
  for (const v of weights.values()) sum += v;
  if (sum > 0) return (weights.get(hash) ?? 0) / sum;
  if (weights.size > 0 && weights.has(hash)) return 1 / weights.size;
  return 0;
}

/**
 * Apportion an address's per-bucket role pools to one node. With
 * `perBucketWeights` (aligned with `buckets`) the split is exact per bucket;
 * otherwise `staticWeights` (vmCount proxy / score) applies to every bucket.
 * Wage is apportioned by the same weights as the role (no per-node grain
 * exists for wage). A single-node address gets share = 1 either way.
 */
export function apportionNodeBuckets(args: {
  nodeHash: string;
  role: "crn" | "ccn";
  buckets: RewardsBucket[];
  perBucketWeights: Map<string, number>[] | null;
  staticWeights: Map<string, number>;
}): ApportionedNode {
  const { nodeHash, role, buckets, perBucketWeights, staticWeights } = args;
  const bySource: BySource = { ...ZERO_SOURCE };
  const out: { time: number; aleph: number }[] = [];
  let totalAleph = 0;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    const weights = perBucketWeights?.[i] ?? staticWeights;
    const frac = shareFraction(weights, nodeHash);
    const pools = bucketRolePools(b, role);
    let aleph = 0;
    for (const src of SOURCES) {
      const amt = pools[src] * frac;
      bySource[src] += amt;
      aleph += amt;
    }
    totalAleph += aleph;
    out.push({ time: b.startSec, aleph });
  }
  return { buckets: out, totalAleph, bySource };
}

export type PerVmEarning = {
  vmHash: string;
  aleph: number;
  source: CreditEntrySource;
};

/**
 * Per-VM earnings for one CRN: raw execution ALEPH per VM, scaled so the
 * owned-set total matches the address's authoritative execution earnings
 * (replaces the old hardcoded CRN_SHARE = 0.6 with the realized share).
 */
export function computePerVmEarnings(args: {
  nodeHash: string;
  expenses: CreditExpense[];
  /** (credit_revenue + holder_tier).execution_crn over the same window. */
  addressExecAleph: number;
  ownedCrnHashes: Set<string>;
}): PerVmEarning[] {
  const { nodeHash, expenses, addressExecAleph, ownedCrnHashes } = args;
  const perVm = new Map<string, { aleph: number; source: CreditEntrySource }>();
  let ownedRawTotal = 0;
  for (const e of expenses) {
    if (e.type !== "execution") continue;
    for (const c of e.credits) {
      if (!c.nodeId || !ownedCrnHashes.has(c.nodeId)) continue;
      ownedRawTotal += c.alephCost;
      if (c.nodeId !== nodeHash || !c.executionId) continue;
      const prev = perVm.get(c.executionId);
      perVm.set(c.executionId, {
        aleph: (prev?.aleph ?? 0) + c.alephCost,
        source: c.source,
      });
    }
  }
  const factor = ownedRawTotal > 0 ? addressExecAleph / ownedRawTotal : 0;
  return [...perVm.entries()]
    .map(([vmHash, v]) => ({ vmHash, aleph: v.aleph * factor, source: v.source }))
    .sort((a, b) => b.aleph - a.aleph);
}
```

(Also add `RewardSource` to the existing type import from `@/api/rewards-types` if not present — it is already imported there.)

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/reward-apportionment.test.ts`
Expected: PASS (new + pre-existing `apportionOwnerRewards` suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reward-apportionment.ts src/lib/reward-apportionment.test.ts
git commit -m "feat(rewards): per-bucket node apportionment + per-VM realized-share scaling"
```

---

### Task 6: Rewrite `useNodeEarnings`

**Files:**
- Modify: `src/hooks/use-node-earnings.ts` (full rewrite below)
- Test: `src/hooks/use-node-earnings.test.tsx` (full rewrite)

- [ ] **Step 1: Replace `src/hooks/use-node-earnings.ts`** with:

```ts
"use client";

import { useMemo } from "react";
import { useRewards, getStableHourRange } from "@/hooks/use-rewards";
import { useExecutionExpenses } from "@/hooks/use-execution-expenses";
import { useNodeState } from "@/hooks/use-node-state";
import { useNode, useNodes } from "@/hooks/use-nodes";
import {
  getRewardAddress,
  computeScoreMultiplier,
} from "@/lib/credit-distribution";
import {
  roleTotals,
  computeExecutionBucketWeights,
  apportionNodeBuckets,
  computePerVmEarnings,
} from "@/lib/reward-apportionment";
import { replayVmCountTimeline } from "@/lib/node-vm-history";
import { RANGE_SECONDS, type CreditRange } from "@/hooks/use-credit-expenses";
import type { BySource } from "@/api/rewards-types";
import type { CreditEntrySource } from "@/api/credit-types";

/** Execution-expense windows are capped at 7d — a 30d execution-only fetch is
 *  ~300MB (Decision #112 territory). At 30d the per-VM table covers the
 *  trailing 7d and chart weights fall back to the vmCount proxy. */
const EXEC_WINDOW_CAP_SEC = 7 * 86400;

const BUCKET_SIZE: Record<CreditRange, string> = {
  "24h": "1h",
  "7d": "1d",
  "30d": "1d",
};

export type NodeEarningsBucket = {
  time: number;
  aleph: number;
  secondaryCount: number;
};

export type NodeEarningsPerVm = {
  vmHash: string;
  aleph: number;
  source: CreditEntrySource;
};

export type NodeEarningsLinkedCrn = {
  hash: string;
  name: string;
  status: string;
  vmCount: number;
};

export type Reconciliation = {
  rewardAddr: string;
  windowAleph: number;
  thisNode: number;
  otherSameKind: { aleph: number; count: number };
  crossKind: { aleph: number; role: "crn" | "ccn" };
  staker: number;
};

export type NodeEarnings = {
  role: "crn" | "ccn";
  totalAleph: number;
  bySource: BySource;
  delta: { aleph: number; secondaryCount: number };
  buckets: NodeEarningsBucket[];
  /** True when the multi-node split uses exact per-bucket execution weights
   *  (or the address has a single node of this role, where no weights are
   *  needed). False while proxy weights apply. */
  weightsExact: boolean;
  perVm?: NodeEarningsPerVm[];
  linkedCrns?: NodeEarningsLinkedCrn[];
  reconciliation: Reconciliation | null;
};

export type UseNodeEarningsOptions = {
  /** "proxy" skips the execution-expense fetch entirely (panel sparks);
   *  multi-node splits use live vmCount / score weights. Default "exact". */
  weights?: "exact" | "proxy";
};

export function useNodeEarnings(
  hash: string,
  range: CreditRange,
  options: UseNodeEarningsOptions = {},
): {
  data: NodeEarnings | undefined;
  isLoading: boolean;
  isPlaceholderData: boolean;
  isError: boolean;
  isPerVmLoading: boolean;
  isPerVmError: boolean;
} {
  const wantExact = options.weights !== "proxy";
  const rangeSec = RANGE_SECONDS[range];

  const current = useMemo(() => getStableHourRange(rangeSec), [rangeSec]);
  const previous = useMemo(
    () => ({ start: current.start - rangeSec, end: current.start }),
    [current.start, rangeSec],
  );

  const { data: nodeState } = useNodeState();
  const { data: node } = useNode(hash);
  const { data: allNodes } = useNodes();

  const isCcn = !!nodeState?.ccns.has(hash);
  const isCrn = !isCcn && !!nodeState?.crns.has(hash);
  const selfNode = isCcn
    ? nodeState?.ccns.get(hash)
    : nodeState?.crns.get(hash);
  const rewardAddr = selfNode ? getRewardAddress(selfNode) : "";

  const rewardsQuery = useRewards(
    rewardAddr,
    current.start,
    current.end,
    BUCKET_SIZE[range],
  );
  const prevQuery = useRewards(rewardAddr, previous.start, previous.end);

  const execWindow = useMemo(
    () => ({
      start: Math.max(current.start, current.end - EXEC_WINDOW_CAP_SEC),
      end: current.end,
    }),
    [current.start, current.end],
  );
  const execEnabled = isCrn && wantExact;
  const execQuery = useExecutionExpenses(
    execWindow.start,
    execWindow.end,
    execEnabled,
  );

  // 30d only: the per-VM scaling factor needs the address's exec totals over
  // the trailing-7d table window — one extra cheap total-only rewards query.
  // Degenerate window (from === to) keeps it disabled on other ranges.
  const tableWindowDiffers = execEnabled && execWindow.start !== current.start;
  const tableRewardsQuery = useRewards(
    rewardAddr,
    tableWindowDiffers ? execWindow.start : current.end,
    current.end,
  );

  const data = useMemo<NodeEarnings | undefined>(() => {
    if (!nodeState || !selfNode || !rewardsQuery.data) return undefined;
    if (!isCcn && !isCrn) return undefined;

    const role: "crn" | "ccn" = isCcn ? "ccn" : "crn";
    const rewards = rewardsQuery.data;
    const buckets = rewards.buckets ?? [];
    const lower = rewardAddr.toLowerCase();

    // Same-role siblings sharing this reward address.
    const ownedCrns = [...nodeState.crns.values()].filter(
      (c) => getRewardAddress(c).toLowerCase() === lower,
    );
    const ownedCcns = [...nodeState.ccns.values()].filter(
      (c) => getRewardAddress(c).toLowerCase() === lower,
    );
    const ownedCrnHashes = new Set(ownedCrns.map((c) => c.hash));

    // Window-constant weights: vmCount proxy (CRN) / score (CCN).
    const staticWeights = new Map<string, number>();
    if (role === "crn") {
      const vmCounts = new Map((allNodes ?? []).map((n) => [n.hash, n.vmCount]));
      for (const c of ownedCrns) staticWeights.set(c.hash, vmCounts.get(c.hash) ?? 0);
    } else {
      for (const c of ownedCcns) staticWeights.set(c.hash, computeScoreMultiplier(c.score));
    }

    // Exact per-bucket weights only when execution data covers the full window.
    const exactWeightsUsable =
      role === "crn" &&
      wantExact &&
      !!execQuery.data &&
      execWindow.start === current.start;
    const perBucketWeights = exactWeightsUsable
      ? computeExecutionBucketWeights(execQuery.data!, ownedCrnHashes, buckets)
      : null;

    const apportioned = apportionNodeBuckets({
      nodeHash: hash,
      role,
      buckets,
      perBucketWeights,
      staticWeights,
    });

    const sameRoleCount = role === "crn" ? ownedCrns.length : ownedCcns.length;
    const curRoles = roleTotals(rewards.full);
    const curRoleTotal = role === "crn" ? curRoles.crn : curRoles.ccn;

    // Previous-window delta: apportion the prev address totals with the current
    // window's realized share (prev-window execution data isn't fetched —
    // doubling the payload for a delta isn't worth it; exact for single-node
    // addresses regardless).
    const frac =
      curRoleTotal > 0
        ? apportioned.totalAleph / curRoleTotal
        : sameRoleCount > 0
          ? 1 / sameRoleCount
          : 0;
    const prevRoles = prevQuery.data ? roleTotals(prevQuery.data.full) : null;
    const prevNodeAleph = prevRoles
      ? (role === "crn" ? prevRoles.crn : prevRoles.ccn) * frac
      : 0;

    // Secondary line: VM-count replay (CRN) / linked-CRN flat line (CCN).
    const bucketStarts = apportioned.buckets.map((b) => b.time);
    const currentVms = node?.vms.length ?? 0;
    let secondaryCurrent: number[];
    if (role === "crn") {
      secondaryCurrent = bucketStarts.length
        ? replayVmCountTimeline({
            history: node?.history ?? [],
            currentVmCount: currentVms,
            bucketStarts,
            windowEndSec: current.end,
          })
        : [];
    } else {
      const linked = [...nodeState.crns.values()].filter(
        (c) => c.parent === hash,
      ).length;
      secondaryCurrent = bucketStarts.map(() => linked);
    }

    const bucketsOut: NodeEarningsBucket[] = apportioned.buckets.map((b, i) => ({
      time: b.time,
      aleph: b.aleph,
      secondaryCount: secondaryCurrent[i] ?? 0,
    }));

    const avgCurr =
      secondaryCurrent.length === 0
        ? 0
        : secondaryCurrent.reduce((s, n) => s + n, 0) / secondaryCurrent.length;
    // History only covers recent events; previous-window counts flat-line to
    // the current count (same approximation as before the re-source).
    const delta = {
      aleph: apportioned.totalAleph - prevNodeAleph,
      secondaryCount: role === "crn" ? avgCurr - currentVms : 0,
    };

    const reconciliation: Reconciliation = {
      rewardAddr,
      windowAleph: rewards.totalAleph,
      thisNode: apportioned.totalAleph,
      otherSameKind: {
        aleph: Math.max(0, curRoleTotal - apportioned.totalAleph),
        count: Math.max(0, sameRoleCount - 1),
      },
      crossKind: {
        aleph: role === "crn" ? curRoles.ccn : curRoles.crn,
        role: role === "crn" ? "ccn" : "crn",
      },
      staker: curRoles.staker,
    };

    const weightsExact =
      role === "ccn" || sameRoleCount <= 1 || exactWeightsUsable;

    if (role === "crn") {
      let perVm: NodeEarningsPerVm[] | undefined;
      const tableRewards = tableWindowDiffers
        ? tableRewardsQuery.data
        : rewards;
      if (execQuery.data && tableRewards) {
        const tf = tableRewards.full;
        perVm = computePerVmEarnings({
          nodeHash: hash,
          expenses: execQuery.data,
          addressExecAleph:
            tf.credit_revenue.execution_crn + tf.holder_tier.execution_crn,
          ownedCrnHashes,
        });
      }
      return {
        role,
        totalAleph: apportioned.totalAleph,
        bySource: apportioned.bySource,
        delta,
        buckets: bucketsOut,
        weightsExact,
        ...(perVm ? { perVm } : {}),
        reconciliation,
      };
    }

    const linkedCrns: NodeEarningsLinkedCrn[] = [];
    for (const crn of nodeState.crns.values()) {
      if (crn.parent !== hash) continue;
      const live = allNodes?.find((n) => n.hash === crn.hash);
      linkedCrns.push({
        hash: crn.hash,
        name: crn.name,
        status: live?.status ?? crn.status,
        vmCount: live?.vmCount ?? 0,
      });
    }
    return {
      role,
      totalAleph: apportioned.totalAleph,
      bySource: apportioned.bySource,
      delta,
      buckets: bucketsOut,
      weightsExact,
      linkedCrns,
      reconciliation,
    };
  }, [
    hash,
    nodeState,
    selfNode,
    isCcn,
    isCrn,
    rewardAddr,
    rewardsQuery.data,
    prevQuery.data,
    execQuery.data,
    tableRewardsQuery.data,
    tableWindowDiffers,
    allNodes,
    node,
    wantExact,
    execWindow.start,
    current.start,
    current.end,
  ]);

  return {
    data,
    isLoading: rewardsQuery.isLoading,
    isPlaceholderData: !!rewardsQuery.isPlaceholderData,
    isError: rewardsQuery.isError,
    isPerVmLoading:
      execEnabled &&
      (execQuery.isLoading || (tableWindowDiffers && tableRewardsQuery.isLoading)),
    isPerVmError: execEnabled && execQuery.isError,
  };
}
```

- [ ] **Step 2: Rewrite `src/hooks/use-node-earnings.test.tsx`** (full replacement — mocks at the client boundary like `use-owner-rewards.test.tsx`):

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNodeEarnings } from "@/hooks/use-node-earnings";
import * as rc from "@/api/rewards-client";
import * as api from "@/api/client";
import * as un from "@/hooks/use-nodes";
import * as ns from "@/hooks/use-node-state";
import type { AddressRewards, RewardsFull } from "@/api/rewards-types";
import type { CRNInfo, NodeState } from "@/api/credit-types";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const FULL: RewardsFull = {
  credit_revenue: { execution_crn: 60, execution_ccn: 10, execution_staker: 20, storage_ccn: 5, storage_staker: 5 },
  holder_tier: { execution_crn: 30, execution_ccn: 4, execution_staker: 6, storage_ccn: 2, storage_staker: 1 },
  wage_subsidy: { crn: 12, ccn: 9, staker: 3 },
};

function rewardsFor(addr: string, fromSec: number, toSec: number): AddressRewards {
  const r: AddressRewards = {
    address: addr,
    totalAleph: 167,
    bySource: { credit_revenue: 100, holder_tier: 43, wage_subsidy: 24 },
    full: FULL,
  };
  // Bucketed query (1h/1d) gets a single-bucket series spanning the window.
  return toSec - fromSec > 0
    ? { ...r, buckets: [{ startSec: fromSec, endSec: toSec, aleph: 167, bySource: r.bySource, full: FULL }] }
    : r;
}

function crn(hash: string, reward: string): CRNInfo {
  return { hash, name: hash, owner: "0xown", reward, score: 0.9, status: "linked", inactiveSince: null, parent: "ccn1" };
}

function mockNodeState(crns: CRNInfo[]): NodeState {
  return { ccns: new Map(), crns: new Map(crns.map((c) => [c.hash, c])) };
}

function setupMocks(args: { crns: CRNInfo[]; exec?: ReturnType<typeof execExpense>[] }) {
  vi.spyOn(rc, "getRewardsTimeSeries").mockImplementation(
    async (addr, from, to) => rewardsFor(addr, from, to),
  );
  const execSpy = vi
    .spyOn(api, "getExecutionExpenses")
    .mockResolvedValue(args.exec ?? []);
  vi.spyOn(ns, "useNodeState").mockReturnValue({ data: mockNodeState(args.crns) } as never);
  vi.spyOn(un, "useNodes").mockReturnValue({ data: args.crns.map((c) => ({ hash: c.hash, vmCount: 2 })) } as never);
  vi.spyOn(un, "useNode").mockReturnValue({ data: { vms: [], history: [] } } as never);
  return { execSpy };
}

function execExpense(time: number, nodeId: string, vm: string, aleph: number) {
  return {
    hash: `e${time}`, time, type: "execution" as const, totalAleph: aleph,
    creditCount: 1, creditPriceAleph: 1,
    credits: [{ address: "0xp", amount: aleph, alephCost: aleph, ref: "r", timeSec: 0, nodeId, executionId: vm, source: "credits" as const }],
  };
}

describe("useNodeEarnings (rewards-layer)", () => {
  it("single-CRN address: exact totals incl. wage, KPI reconciles with buckets", async () => {
    setupMocks({ crns: [crn("crnA", "0xreward")] });
    const { result } = renderHook(() => useNodeEarnings("crnA", "24h"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const d = result.current.data!;
    expect(d.role).toBe("crn");
    expect(d.totalAleph).toBeCloseTo(60 + 30 + 12); // exec_crn both sources + wage.crn
    expect(d.bySource.wage_subsidy).toBeCloseTo(12);
    expect(d.buckets.reduce((s, b) => s + b.aleph, 0)).toBeCloseTo(d.totalAleph);
    expect(d.weightsExact).toBe(true);
    expect(d.reconciliation!.staker).toBeCloseTo(20 + 5 + 6 + 1 + 3);
    expect(d.reconciliation!.crossKind.aleph).toBeCloseTo(10 + 5 + 4 + 2 + 9);
  });

  it("proxy mode (sparks) never fetches execution expenses", async () => {
    const { execSpy } = setupMocks({ crns: [crn("crnA", "0xreward")] });
    const { result } = renderHook(
      () => useNodeEarnings("crnA", "24h", { weights: "proxy" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(execSpy).not.toHaveBeenCalled();
    expect(result.current.isPerVmLoading).toBe(false);
  });

  it("30d caps the execution window at the trailing 7d (per-VM table only)", async () => {
    const { execSpy } = setupMocks({ crns: [crn("crnA", "0xreward")] });
    const { result } = renderHook(() => useNodeEarnings("crnA", "30d"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    await waitFor(() => expect(execSpy).toHaveBeenCalled());
    const [start, end] = execSpy.mock.calls[0]! as [number, number];
    expect(end - start).toBe(7 * 86400);
  });

  it("multi-CRN address splits per-VM by realized share and flags proxy weights at 30d", async () => {
    setupMocks({
      crns: [crn("crnA", "0xreward"), crn("crnB", "0xreward")],
      exec: [execExpense(1, "crnA", "vm1", 75), execExpense(1, "crnB", "vm2", 25)],
    });
    const { result } = renderHook(() => useNodeEarnings("crnA", "30d"), { wrapper });
    await waitFor(() => expect(result.current.data?.perVm).toBeDefined());
    const d = result.current.data!;
    expect(d.weightsExact).toBe(false); // 30d → proxy weights for the chart
    // perVm factor = addressExec (60+30) / raw owned 100 → vm1 = 75 * 0.9
    expect(d.perVm![0]!.aleph).toBeCloseTo(75 * 0.9);
  });

  it("surfaces rewards-feed errors", async () => {
    vi.spyOn(rc, "getRewardsTimeSeries").mockRejectedValue(new Error("down"));
    vi.spyOn(api, "getExecutionExpenses").mockResolvedValue([]);
    vi.spyOn(ns, "useNodeState").mockReturnValue({ data: mockNodeState([crn("crnA", "0xreward")]) } as never);
    vi.spyOn(un, "useNodes").mockReturnValue({ data: [] } as never);
    vi.spyOn(un, "useNode").mockReturnValue({ data: undefined } as never);
    const { result } = renderHook(() => useNodeEarnings("crnA", "24h"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
```

Note: the 30d test asserting `weightsExact === false` requires `sameRoleCount > 1` — that's why it uses the two-CRN fixture. The exec mock's expense `time: 1` falls outside the trailing-7d window, which is fine: per-VM aggregation in `computePerVmEarnings` doesn't re-filter by time (the fetch window already bounds it) — if implementation differs, set `time` inside the window instead.

- [ ] **Step 3: Run the hook tests**

Run: `pnpm vitest run src/hooks/use-node-earnings.test.tsx`
Expected: PASS. If the `time: 1` fixture trips the bucket-bounds check, adjust per the note above.

- [ ] **Step 4: Typecheck** — components still compile against the kept contract:

Run: `pnpm typecheck`
Expected: clean (additive fields only; `delta`, `buckets`, `perVm`, `linkedCrns`, `reconciliation` shapes unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-node-earnings.ts src/hooks/use-node-earnings.test.tsx
git commit -m "feat(earnings): re-source useNodeEarnings onto the authoritative rewards layer"
```

---

### Task 7: Shared `RewardSourceBar` + wallet swap

**Files:**
- Create: `src/components/reward-source-bar.tsx`
- Modify: `src/components/wallet-revenue-card.tsx`

- [ ] **Step 1: Create `src/components/reward-source-bar.tsx`** — move `SOURCE_META` + `SourceBar` out of `wallet-revenue-card.tsx` verbatim, renamed:

```tsx
"use client";

import { formatAleph } from "@/lib/format";
import type { BySource, RewardSource } from "@/api/rewards-types";

const SOURCE_META: { key: RewardSource; label: string; bar: string }[] = [
  { key: "credit_revenue", label: "Credits", bar: "bg-success-500" },
  { key: "holder_tier", label: "Holder", bar: "bg-primary-500" },
  { key: "wage_subsidy", label: "Min. wage", bar: "bg-warning-500" },
];

/** Three-segment reward-source bar + caption. Shared by the wallet revenue
 *  card and the Node Earnings KPI so the source vocabulary can't drift. */
export function RewardSourceBar({ bySource }: { bySource: BySource }) {
  return (
    <>
      <div className="my-2 flex h-2 overflow-hidden rounded">
        {SOURCE_META.map((m) =>
          bySource[m.key] > 0 ? (
            <div key={m.key} className={m.bar} style={{ flex: bySource[m.key] }} />
          ) : null,
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {SOURCE_META.map((m, i) => (
          <span key={m.key} className="inline-flex items-center gap-1">
            {i > 0 ? <span> · </span> : null}
            <span className={`inline-block h-2 w-2 rounded-full ${m.bar}`} />
            {m.label} {formatAleph(bySource[m.key])}
          </span>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Update `src/components/wallet-revenue-card.tsx`** — delete its local `SOURCE_META` + `SourceBar`, add `import { RewardSourceBar } from "@/components/reward-source-bar";`, replace the single `<SourceBar bySource={rewards.bySource} />` usage with `<RewardSourceBar bySource={rewards.bySource} />`. Drop the now-unused `RewardSource` type import (keep `BySource` only if still referenced — after the extraction it is not; remove it too).

- [ ] **Step 3: Run wallet tests**

Run: `pnpm vitest run src/components/wallet-revenue-card.test.tsx`
Expected: PASS unchanged (markup identical).

- [ ] **Step 4: Commit**

```bash
git add src/components/reward-source-bar.tsx src/components/wallet-revenue-card.tsx
git commit -m "refactor(wallet): extract shared RewardSourceBar"
```

---

### Task 8: CRN tab UI — by-source bar, refine hint, per-VM states, footnote

**Files:**
- Modify: `src/components/node-earnings-kpi-row.tsx`
- Modify: `src/components/node-earnings-tab.tsx`

- [ ] **Step 1: `KpiCard` gains an `extra` slot.** In `node-earnings-kpi-row.tsx` add to the type:

```ts
  /** Optional content rendered under the secondary line (e.g. source bar). */
  extra?: ReactNode;
```

(import `type { ReactNode } from "react"`). In the render, inside the non-loading branch after the secondary `<div>`, add `{c.extra}`.

- [ ] **Step 2: Update `node-earnings-tab.tsx`:**

1. Imports: add `RewardSourceBar`; destructure the new hook flags:

```ts
const { data, isLoading, isPlaceholderData, isError, isPerVmLoading, isPerVmError } =
  useNodeEarnings(hash, range);
```

2. `buildCrnCards` — give the ALEPH card the bar. Change the signature to accept the whole `data` (it already does) and on the first card add:

```ts
      extra: <RewardSourceBar bySource={data.bySource} />,
```

(`KpiCard.extra` accepts ReactNode; `buildCrnCards` must therefore return JSX — it already lives in a `.tsx` file.)

3. Error state before the skeleton guard:

```tsx
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Rewards feed unreachable — earnings can&apos;t be shown right now.
      </p>
    );
  }
```

4. Refine hint directly after `<NodeEarningsChart …/>` inside the chart Card:

```tsx
        {!data.weightsExact && isPerVmLoading && (
          <p className="mt-1 text-[11px] italic text-muted-foreground">
            Refining node split from execution data…
          </p>
        )}
```

5. Per-VM card states. Replace the current `{perVm.length > 0 && (<Card …>…</Card>)}` block's outer condition with a three-state render:

```tsx
      {isPerVmLoading ? (
        <Card padding="md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hosted VMs — earnings breakdown
          </div>
          <div className="space-y-2">
            <Skeleton className="h-5 w-full bg-edge" />
            <Skeleton className="h-5 w-full bg-edge" />
            <Skeleton className="h-5 w-2/3 bg-edge" />
          </div>
        </Card>
      ) : isPerVmError ? (
        <Card padding="md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hosted VMs — earnings breakdown
          </div>
          <p className="text-xs italic text-muted-foreground">
            Per-VM detail unavailable — the execution-expense feed timed out.
            The headline numbers above are unaffected.
          </p>
        </Card>
      ) : perVm.length > 0 ? (
        <Card padding="md">
          {/* existing card content */}
        </Card>
      ) : null}
```

6. Inside the per-VM card, under the header div, add the 30d caption:

```tsx
          {range === "30d" && (
            <p className="mb-2 text-xs italic text-muted-foreground">
              Per-VM detail covers the last 7 days.
            </p>
          )}
```

7. The table is execution-only while `data.totalAleph` now includes wage — the Total rows must sum the table, not the KPI. Above the JSX add:

```ts
  const perVmTotal = perVm.reduce((s, v) => s + v.aleph, 0);
```

and replace `formatAleph(data.totalAleph)` with `formatAleph(perVmTotal)` in **both** the mobile Total row and the `<tfoot>` cell.

8. Footnote — replace the closing `<p>` with:

```tsx
      <p className="text-xs italic text-muted-foreground">
        Owed amounts accrued from the protocol&apos;s authoritative rewards
        feed, including the wage subsidy (which decays over time). Per-node
        figures for reward addresses with multiple nodes are apportioned.
      </p>
```

- [ ] **Step 3: Typecheck + lint + tests**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/components`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/node-earnings-kpi-row.tsx src/components/node-earnings-tab.tsx
git commit -m "feat(earnings): by-source bar, refine hint, per-VM table states on CRN tab"
```

---

### Task 9: CCN tab + spark

**Files:**
- Modify: `src/components/node-earnings-tab-ccn.tsx`
- Modify: `src/components/node-earnings-spark.tsx`

- [ ] **Step 1: `node-earnings-tab-ccn.tsx`:** mirror the CRN tab's non-per-VM changes:

1. Import `RewardSourceBar`; destructure `isError` from the hook.
2. In `buildCcnCards`, first card gains `extra: <RewardSourceBar bySource={data.bySource} />`.
3. Same `isError` early return as Task 8 step 2.3.
4. Same footnote replacement as Task 8 step 2.8.

(No refine hint, no per-VM card — CCN never fetches execution data.)

- [ ] **Step 2: `node-earnings-spark.tsx`:** change the hook call to proxy mode:

```ts
  const { data, isLoading } = useNodeEarnings(hash, "24h", { weights: "proxy" });
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/node-earnings-tab-ccn.tsx src/components/node-earnings-spark.tsx
git commit -m "feat(earnings): CCN tab by-source bar; sparks use proxy weights (no heavy fetch)"
```

---

### Task 10: Remove the dead bucket machinery (Replace, don't deprecate)

**Files:**
- Modify: `src/lib/credit-distribution.ts`
- Modify: `src/api/credit-types.ts`
- Modify: `src/lib/credit-distribution.test.ts`

- [ ] **Step 1: Verify nothing else consumes the removed surface**

Run: `rg -n "perNodeBuckets|perVmInWindow|SummaryOptions|NodeBucket" src -g '!*.test.*'`
Expected: hits only in `credit-distribution.ts` and `credit-types.ts` (the hook no longer imports them after Task 6). If anything else hits, STOP and re-check.

- [ ] **Step 2: `credit-distribution.ts`** — remove: the `SummaryOptions` type, `bucketIndexFor`, `ensureBucketArray`, the `options?` third parameter of `computeDistributionSummary`, the `perNodeBuckets`/`perVmInWindow`/`bucketWidth` locals, the `totalCcnWeight` precompute block, the entire `// Bucket pass — only if options provided` block inside the expense loop, and the `...(perNodeBuckets ? … : {})` / `...(perVmInWindow ? … : {})` spreads in the return. Drop the now-unused `NodeBucket` and `CreditEntrySource` names from the type import.

- [ ] **Step 3: `credit-types.ts`** — remove the `NodeBucket` type and the `perNodeBuckets?` / `perVmInWindow?` fields (with their comments) from `DistributionSummary`.

- [ ] **Step 4: `credit-distribution.test.ts`** — delete the entire `describe("computeDistributionSummary with bucket options", …)` block and any `SummaryOptions` import.

- [ ] **Step 5: Full check**

Run: `pnpm check`
Expected: lint + typecheck + tokens + all tests green. The credits page (`useCreditExpenses` / `computeDistributionSummary` without options) is untouched.

- [ ] **Step 6: Commit**

```bash
git add src/lib/credit-distribution.ts src/api/credit-types.ts src/lib/credit-distribution.test.ts
git commit -m "refactor(credits): drop dead SummaryOptions bucket machinery"
```

---

### Task 11: Verify and refine

- [ ] Run full project checks (`pnpm check`)
- [ ] Manual testing / smoke test the feature:
  - `pnpm dev`, open `/nodes?view=<crn-hash>&tab=earnings` for a single-CRN reward address: KPI shows by-source bar; chart totals = KPI; per-VM table loads; no refine hint.
  - A multi-CRN reward address (find one via `/credits` recipients with `CRN: 2+`): refine hint appears briefly at 24h/7d, never at proxy stages after load.
  - 30d range: chart renders without a full-window exec fetch (network tab: `tags=type_execution` request spans 7d); per-VM caption "covers the last 7 days".
  - CCN tab (`/nodes?view=<ccn-hash>&tab=earnings`): by-source bar, no exec fetch in the network tab.
  - Network graph CRN/CCN panels + `/nodes` quick-peek panel: sparks render, **no** `aleph_credit_expense` request fires.
  - Wallet page: revenue card unchanged (shared bar renders identically).
  - Range switching 24h → 7d → 30d: scoped skeletons per Decision #92, no stale numbers.
- [ ] Fix any issues found
- [ ] Re-run checks until clean

### Task 12: Update docs and version

- [ ] ARCHITECTURE.md — new patterns, new files, or changed structure
- [ ] DECISIONS.md — design decisions made during this feature (tiered accuracy by range; render-early-refine; per-VM realized-share scaling replacing CRN_SHARE; sparks proxy mode absorbing Phase-2 ④; execution-only `tags=` fetch — cite the live measurements)
- [ ] BACKLOG.md — completed items moved (Plan B + "② bounded execution-only per-bucket weights"), deferred ideas added; update the Phase 2 item to note ④ sparklines are done
- [ ] CLAUDE.md — Current Features list if user-facing behavior changed
- [ ] src/changelog.ts — if user-facing behavior changed: bump CURRENT_VERSION (semver: major=breaking, minor=feature, patch=fix), add VersionEntry with changes
