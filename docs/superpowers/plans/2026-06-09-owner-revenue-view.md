---
status: done
branch: feature/node-owner-revenue-view
date: 2026-06-11
note: |
  Shipped 2026-06-11 after the happy-path preview passed (credit.aleph.im restored).
  Preview-driven refinements in the final session: count-up accrual line replaces the
  10-day-cadence countdown + progress bar, stale on-chain status dropped from Last payment
  (Decision #113); sparse rewards-API payload normalized to dense zeros (NaN fix for
  zero-credit addresses) + float-residue clamp on unattributedAleph; section spacing,
  wage-decay caption removed, footnote dimmed; status dots next to status badges removed
  on Nodes / Issues / Wallet tables. Follow-ups in BACKLOG: Plan B (② Node Earnings tab
  re-source — its per-bucket weights hit the same 750MB trap, fetch bounded/execution-only/
  timeout-protected), Phase 2 (credits + network panels; /credits 30d range is a latent
  multi-GB hang), deferred quality lows.
---

# Owner Revenue View (Phase 1A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Wallet page's client-reconstructed "Credit Rewards (24h)" section with a payout-cycle revenue view sourced from the protocol's authoritative feeds — including the wage subsidy — backed by a shared data layer that Plan B (Node Earnings tab) will reuse.

**Architecture:** A new rewards data layer reads per-address authoritative totals from the `credit.aleph.im /rewards/time-series` API (by-source + per-role) and the current payout cycle from FOUNDATION `credit-rewards-distribution` Aleph messages. A pure apportionment module anchors those authoritative totals and splits them per owned node using api2 execution `node_id` weights (CRN, exact) and score weights (CCN, proxy). The Wallet owner view composes these into a cycle hero (owed-this-cycle + countdown), by-source bar, by-node list, and a last-payment panel.

**Tech Stack:** React 19, TypeScript (strict + `exactOptionalPropertyTypes`), React Query 5, Next.js 16 (static export), Tailwind 4, `@aleph-front/ds`, Vitest, Phosphor Icons.

**Spec:** [`docs/superpowers/specs/2026-06-09-node-owner-revenue-view-design.md`](../specs/2026-06-09-node-owner-revenue-view-design.md)

**Scope note:** This plan is Phase 1A. The Node Earnings tab re-source is **Plan B** (separate, depends on this layer). Credits page + network panels are **Phase 2** (BACKLOG). Multi-address time-series queries are out of scope here — every consumer in this plan is single-address.

---

## File Structure

**Create:**
- `src/api/rewards-types.ts` — wire + app types for the time-series API and distribution messages.
- `src/api/rewards-client.ts` — `getRewardsTimeSeries(address, from, to)` and `getDistributions()`.
- `src/lib/reward-apportionment.ts` — pure: anchor authoritative role totals + split per node.
- `src/lib/payout-cycle.ts` — pure: next-payment estimate + cycle progress.
- `src/hooks/use-rewards.ts` — `useRewards(address, window)`.
- `src/hooks/use-distributions.ts` — `useDistributions()`.
- `src/hooks/use-owner-rewards.ts` — composes the above into `OwnerRewards`.
- `src/components/wallet-revenue-card.tsx` — the owner view card.
- Colocated `*.test.ts(x)` for each module above.

**Modify:**
- `src/api/client.ts` — add `getCreditApiBaseUrl()` (near `getAlephBaseUrl`, ~line 291) and `FOUNDATION_DISTRIBUTION_SENDER` const.
- `src/app/wallet/page.tsx` — swap `RewardsSection` for `WalletRevenueCard`; drop `useWalletRewards` import.

**Remove (dead after this plan):**
- `src/hooks/use-wallet-rewards.ts` + test, and `computeWalletRewards` + `WalletRewards`/`WalletNodeReward` types — only the Wallet `RewardsSection` consumed them (verified: `rg -l "computeWalletRewards|useWalletRewards"` → only wallet page + their own files).

**Reused unchanged:** `getRewardAddress`, `computeScoreMultiplier` (from `credit-distribution.ts`), `useCreditExpenses`, `useNodeState`, `formatAleph`/`relativeTime` (`@/lib/format`).

---

## Task 1: Rewards domain types

**Files:**
- Create: `src/api/rewards-types.ts`

- [ ] **Step 1: Write the types**

```typescript
// --- Rewards time-series API (credit.aleph.im) ---

export type RewardSource = "credit_revenue" | "holder_tier" | "wage_subsidy";

export type BySource = Record<RewardSource, number>;

/** Per-role split from `detail=2` `full`. credit_revenue & holder_tier use the
 *  execution_*/storage_* keys; wage_subsidy uses crn/ccn/staker. */
export type CreditRoleFull = {
  execution_crn: number;
  execution_ccn: number;
  execution_staker: number;
  storage_ccn: number;
  storage_staker: number;
};
export type WageRoleFull = { crn: number; ccn: number; staker: number };

export type RewardsFull = {
  credit_revenue: CreditRoleFull;
  holder_tier: CreditRoleFull;
  wage_subsidy: WageRoleFull;
};

/** The `total` block for a single address over a window. */
export type AddressRewards = {
  address: string;
  totalAleph: number;
  bySource: BySource;
  full: RewardsFull;
};

// --- FOUNDATION distribution messages (api2) ---

export type DistributionTargetStatus = "pending" | "confirmed" | "failed";

/** Last on-chain payout for one address, joined from `rewards` + `targets`. */
export type AddressLastPaid = {
  aleph: number;
  /** Cycle end (payout) time, seconds since epoch. */
  timeSec: number;
  txHash: string | null;
  status: DistributionTargetStatus;
};

/** The latest distribution cycle. */
export type DistributionCycle = {
  startSec: number;
  endSec: number;
  /** address (lowercased) → paid ALEPH for the cycle. */
  rewards: Map<string, number>;
  /** address (lowercased) → { txHash, status }. */
  onChain: Map<string, { txHash: string | null; status: DistributionTargetStatus }>;
};

// --- Owner view app type ---

export type OwnerNodeReward = {
  hash: string;
  name: string;
  role: "crn" | "ccn";
  totalAleph: number;
  bySource: BySource;
};

export type OwnerRewards = {
  address: string;
  cycleStartSec: number;
  cycleEndSec: number | null; // null until first distribution is known
  totalAleph: number;
  bySource: BySource;
  byNode: OwnerNodeReward[];
  stakingAleph: number;
  lastPaid: AddressLastPaid | null;
};
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/api/rewards-types.ts
git commit -m "feat(rewards): add rewards-domain types for time-series + distributions"
```

---

## Task 2: Credit API base URL + sender constants

**Files:**
- Modify: `src/api/client.ts` (near `getAlephBaseUrl`, ~line 291; near `CREDIT_EXPENSE_SENDER`, ~line 412)

- [ ] **Step 1: Add the base-URL getter and sender constant**

In `src/api/client.ts`, immediately after `getAlephBaseUrl()`:

```typescript
function getCreditApiBaseUrl(): string {
  return (
    process.env["NEXT_PUBLIC_CREDIT_API_URL"] ??
    "https://credit.aleph.im"
  );
}
```

And next to `CREDIT_EXPENSE_SENDER`:

```typescript
// FOUNDATION account that publishes credit-rewards-distribution messages.
const FOUNDATION_DISTRIBUTION_SENDER =
  "0x3a5CC6aBd06B601f4654035d125F9DD2FC992C25";
const DISTRIBUTION_POST_TYPE = "credit-rewards-distribution";
```

Export both helpers/consts so `rewards-client.ts` can import them:

```typescript
export { getCreditApiBaseUrl, getAlephBaseUrl };
export { FOUNDATION_DISTRIBUTION_SENDER, DISTRIBUTION_POST_TYPE };
```

(If `getAlephBaseUrl` is already used internally only, add it to the export list; do not change its body.)

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/api/client.ts
git commit -m "feat(rewards): credit API base URL + FOUNDATION distribution constants"
```

---

## Task 3: `getRewardsTimeSeries` client function

**Files:**
- Create: `src/api/rewards-client.ts`
- Test: `src/api/rewards-client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { getRewardsTimeSeries } from "@/api/rewards-client";

const SAMPLE = {
  request: { addresses: ["0xabc"], detail: 2 },
  algoVersion: "v2",
  total: {
    totals: { aleph: 254680.79 },
    bySource: { credit_revenue: 194246.77, holder_tier: 15635.22, wage_subsidy: 44798.79 },
    full: {
      credit_revenue: { execution_ccn: 60722.2, execution_crn: 128083.3, execution_staker: 5433.0, storage_ccn: 7.8, storage_staker: 0.35 },
      holder_tier: { execution_ccn: 6627.7, execution_crn: 8460.6, execution_staker: 546.7, storage_ccn: 0.13, storage_staker: 0.006 },
      wage_subsidy: { ccn: 23693.2, crn: 18020.0, staker: 3085.5 },
    },
  },
  buckets: [],
};

afterEach(() => vi.restoreAllMocks());

describe("getRewardsTimeSeries", () => {
  it("maps the total block to AddressRewards", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(SAMPLE), { status: 200 }));

    const r = await getRewardsTimeSeries("0xABC", 1777593611, 1780306643);

    expect(r.address).toBe("0xabc");
    expect(r.totalAleph).toBeCloseTo(254680.79);
    expect(r.bySource.wage_subsidy).toBeCloseTo(44798.79);
    expect(r.full.credit_revenue.execution_crn).toBeCloseTo(128083.3);

    const url = (fetchSpy.mock.calls[0]![0] as string);
    expect(url).toContain("/api/v0/rewards/time-series");
    expect(url).toContain("address=0xabc"); // lowercased
    expect(url).toContain("detail=2");
  });

  it("throws on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    await expect(getRewardsTimeSeries("0xabc", 1, 2)).rejects.toThrow(/Rewards API error: 500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/api/rewards-client.test.ts`
Expected: FAIL ("getRewardsTimeSeries is not a function" / module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
import { getCreditApiBaseUrl, FOUNDATION_DISTRIBUTION_SENDER, DISTRIBUTION_POST_TYPE, getAlephBaseUrl } from "@/api/client";
import type { AddressRewards, DistributionCycle } from "@/api/rewards-types";

type TimeSeriesResponse = {
  total: {
    totals: { aleph: number };
    bySource: AddressRewards["bySource"];
    full: AddressRewards["full"];
  };
};

/** Authoritative per-address rewards over [fromSec, toSec]. Single address only. */
export async function getRewardsTimeSeries(
  address: string,
  fromSec: number,
  toSec: number,
): Promise<AddressRewards> {
  const addr = address.toLowerCase();
  const params = new URLSearchParams({
    from: String(Math.floor(fromSec)),
    to: String(Math.floor(toSec)),
    address: addr,
    detail: "2",
    bucketSize: "1y", // single aggregate bucket; we read `total`
  });
  const url = `${getCreditApiBaseUrl()}/api/v0/rewards/time-series?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Rewards API error: ${res.status}`);
  const data = (await res.json()) as TimeSeriesResponse;
  const t = data.total;
  return {
    address: addr,
    totalAleph: t.totals.aleph,
    bySource: t.bySource,
    full: t.full,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/api/rewards-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/rewards-client.ts src/api/rewards-client.test.ts
git commit -m "feat(rewards): getRewardsTimeSeries client fn"
```

---

## Task 4: `getDistributions` client function

**Files:**
- Modify: `src/api/rewards-client.ts`
- Modify: `src/api/rewards-client.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `rewards-client.test.ts`:

```typescript
import { getDistributions } from "@/api/rewards-client";

const DIST_MSG = {
  messages: [
    {
      item_hash: "h1",
      time: 1780312916,
      channel: "FOUNDATION",
      content: {
        type: "credit-rewards-distribution",
        content: {
          status: "distribution",
          start_time: 1777593611,
          end_time: 1780306643,
          rewards: { "0x0062D7a318E64B4DF6563490F8DB2177bDADfc5F": 82.28 },
          targets: [
            {
              chain: "ETH",
              status: "pending",
              success: true,
              tx: "0xtx",
              targets: { "0x0062D7a318E64B4DF6563490F8DB2177bDADfc5F": 82.28 },
            },
          ],
        },
      },
    },
    {
      item_hash: "h0",
      time: 1779000000,
      channel: "FOUNDATION",
      content: { type: "staking-rewards-distribution", content: { status: "distribution" } },
    },
  ],
};

describe("getDistributions", () => {
  it("returns the latest credit-rewards-distribution cycle, ignoring legacy type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(DIST_MSG), { status: 200 }),
    );
    const cycle = await getDistributions();
    expect(cycle).not.toBeNull();
    expect(cycle!.startSec).toBe(1777593611);
    expect(cycle!.endSec).toBe(1780306643);
    expect(cycle!.rewards.get("0x0062d7a318e64b4df6563490f8db2177bdadfc5f")).toBeCloseTo(82.28);
    const oc = cycle!.onChain.get("0x0062d7a318e64b4df6563490f8db2177bdadfc5f");
    expect(oc!.txHash).toBe("0xtx");
    expect(oc!.status).toBe("pending");
  });

  it("returns null when no credit-rewards-distribution exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [DIST_MSG.messages[1]] }), { status: 200 }),
    );
    expect(await getDistributions()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/api/rewards-client.test.ts`
Expected: FAIL ("getDistributions is not a function").

- [ ] **Step 3: Write minimal implementation**

Append to `rewards-client.ts`:

```typescript
type DistMessage = {
  time: number;
  content: {
    type: string;
    content: {
      status?: string;
      start_time: number;
      end_time: number;
      rewards: Record<string, number>;
      targets?: {
        status?: string;
        tx?: string | null;
        targets: Record<string, number>;
      }[];
    };
  };
};

function normalizeStatus(s: string | undefined): "pending" | "confirmed" | "failed" {
  if (s === "confirmed" || s === "success") return "confirmed";
  if (s === "failed") return "failed";
  return "pending";
}

/** Latest credit-rewards-distribution cycle, or null if none published yet. */
export async function getDistributions(): Promise<DistributionCycle | null> {
  const params = new URLSearchParams({
    msgType: "POST",
    addresses: FOUNDATION_DISTRIBUTION_SENDER,
    pagination: "20",
    sort_order: "-1",
  });
  const url = `${getAlephBaseUrl()}/api/v0/messages.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Aleph API error: ${res.status}`);
  const data = (await res.json()) as { messages: DistMessage[] };

  const latest = data.messages.find(
    (m) =>
      m.content?.type === DISTRIBUTION_POST_TYPE &&
      m.content?.content?.status === "distribution",
  );
  if (!latest) return null;

  const inner = latest.content.content;
  const rewards = new Map<string, number>();
  for (const [addr, aleph] of Object.entries(inner.rewards ?? {})) {
    rewards.set(addr.toLowerCase(), aleph);
  }
  const onChain = new Map<string, { txHash: string | null; status: "pending" | "confirmed" | "failed" }>();
  for (const batch of inner.targets ?? []) {
    const status = normalizeStatus(batch.status);
    const txHash = batch.tx ?? null;
    for (const addr of Object.keys(batch.targets ?? {})) {
      onChain.set(addr.toLowerCase(), { txHash, status });
    }
  }
  return {
    startSec: inner.start_time,
    endSec: inner.end_time,
    rewards,
    onChain,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/api/rewards-client.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/rewards-client.ts src/api/rewards-client.test.ts
git commit -m "feat(rewards): getDistributions client fn (latest credit cycle)"
```

---

## Task 5: Apportionment library

**Files:**
- Create: `src/lib/reward-apportionment.ts`
- Test: `src/lib/reward-apportionment.test.ts`

This module anchors the authoritative per-address role totals (`AddressRewards.full`) and splits them across the address's owned nodes. CRN execution uses api2 `node_id` weights (exact); CCN uses score weights; wage uses the same per-role weights (proxy). Output `byNode` + `stakingAleph` sum to the address total minus dev fund — i.e. to `AddressRewards.totalAleph`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { apportionOwnerRewards } from "@/lib/reward-apportionment";
import type { AddressRewards } from "@/api/rewards-types";
import type { CreditExpense, NodeState } from "@/api/credit-types";

function nodeState(): NodeState {
  return {
    crns: new Map([
      ["crnA", { hash: "crnA", name: "A", owner: "0xowner", reward: "0xowner", score: 1, status: "linked", inactiveSince: null, parent: "ccnX" }],
      ["crnB", { hash: "crnB", name: "B", owner: "0xowner", reward: "0xowner", score: 1, status: "linked", inactiveSince: null, parent: "ccnX" }],
    ]),
    ccns: new Map([
      ["ccnX", { hash: "ccnX", name: "X", owner: "0xowner", reward: "0xowner", score: 0.8, status: "active", stakers: {}, totalStaked: 0, inactiveSince: null, resourceNodes: [] }],
    ]),
  };
}

function execExpense(entries: { nodeId: string; alephCost: number }[]): CreditExpense {
  return {
    hash: "e1", time: 1779000000, type: "execution", totalAleph: 0, creditCount: entries.length, creditPriceAleph: 1,
    credits: entries.map((e, i) => ({ address: "0xpayer", amount: e.alephCost, alephCost: e.alephCost, ref: `r${i}`, timeSec: 1779000000, nodeId: e.nodeId, executionId: `vm${i}`, source: "credits" as const })),
  };
}

const FULL = (over: Partial<AddressRewards["full"]> = {}): AddressRewards["full"] => ({
  credit_revenue: { execution_crn: 100, execution_ccn: 40, execution_staker: 20, storage_ccn: 0, storage_staker: 0 },
  holder_tier: { execution_crn: 0, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 },
  wage_subsidy: { crn: 30, ccn: 30, staker: 30 },
  ...over,
});

const rewards = (full: AddressRewards["full"]): AddressRewards => {
  const sum =
    full.credit_revenue.execution_crn + full.credit_revenue.execution_ccn + full.credit_revenue.execution_staker + full.credit_revenue.storage_ccn + full.credit_revenue.storage_staker +
    full.holder_tier.execution_crn + full.holder_tier.execution_ccn + full.holder_tier.execution_staker + full.holder_tier.storage_ccn + full.holder_tier.storage_staker +
    full.wage_subsidy.crn + full.wage_subsidy.ccn + full.wage_subsidy.staker;
  return {
    address: "0xowner",
    totalAleph: sum,
    bySource: {
      credit_revenue: 160, holder_tier: 0, wage_subsidy: 90,
    },
    full,
  };
};

describe("apportionOwnerRewards", () => {
  it("splits CRN execution by node_id weight and CCN by score; sums to total", () => {
    const full = FULL();
    const r = apportionOwnerRewards({
      address: "0xowner",
      rewards: rewards(full),
      expenses: [execExpense([{ nodeId: "crnA", alephCost: 75 }, { nodeId: "crnB", alephCost: 25 }])],
      nodeState: nodeState(),
    });

    const a = r.byNode.find((n) => n.hash === "crnA")!;
    const b = r.byNode.find((n) => n.hash === "crnB")!;
    const x = r.byNode.find((n) => n.hash === "ccnX")!;

    // CRN exec credit_revenue (100) split 75/25; wage.crn (30) split 75/25
    expect(a.bySource.credit_revenue).toBeCloseTo(75);
    expect(b.bySource.credit_revenue).toBeCloseTo(25);
    expect(a.bySource.wage_subsidy).toBeCloseTo(22.5);
    expect(b.bySource.wage_subsidy).toBeCloseTo(7.5);
    // CCN gets all execution_ccn (40) + storage_ccn (0) + wage.ccn (30)
    expect(x.bySource.credit_revenue).toBeCloseTo(40);
    expect(x.bySource.wage_subsidy).toBeCloseTo(30);
    // staking = execution_staker (20) + wage.staker (30)
    expect(r.stakingAleph).toBeCloseTo(50);
    // byNode totals + staking == address total
    const nodeSum = r.byNode.reduce((s, n) => s + n.totalAleph, 0);
    expect(nodeSum + r.stakingAleph).toBeCloseTo(rewards(full).totalAleph);
  });

  it("single CRN gets the whole CRN slice exactly", () => {
    const full = FULL({ credit_revenue: { execution_crn: 100, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 }, wage_subsidy: { crn: 0, ccn: 0, staker: 0 } });
    const ns: NodeState = { crns: new Map([["only", { hash: "only", name: "O", owner: "0xo", reward: "0xo", score: 1, status: "linked", inactiveSince: null, parent: null }]]), ccns: new Map() };
    const r = apportionOwnerRewards({ address: "0xo", rewards: rewards(full), expenses: [execExpense([{ nodeId: "only", alephCost: 5 }])], nodeState: ns });
    expect(r.byNode).toHaveLength(1);
    expect(r.byNode[0]!.totalAleph).toBeCloseTo(100);
  });

  it("handles an address with no owned nodes (staking-only)", () => {
    const full = FULL({ credit_revenue: { execution_crn: 0, execution_ccn: 0, execution_staker: 50, storage_ccn: 0, storage_staker: 0 }, wage_subsidy: { crn: 0, ccn: 0, staker: 10 } });
    const r = apportionOwnerRewards({ address: "0xnobody", rewards: rewards(full), expenses: [], nodeState: { crns: new Map(), ccns: new Map() } });
    expect(r.byNode).toHaveLength(0);
    expect(r.stakingAleph).toBeCloseTo(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/reward-apportionment.test.ts`
Expected: FAIL ("apportionOwnerRewards is not a function").

- [ ] **Step 3: Write the implementation**

```typescript
import type { AddressRewards, BySource, OwnerNodeReward, RewardSource } from "@/api/rewards-types";
import type { CreditExpense, NodeState } from "@/api/credit-types";
import { getRewardAddress, computeScoreMultiplier } from "@/lib/credit-distribution";

const ZERO_SOURCE: BySource = { credit_revenue: 0, holder_tier: 0, wage_subsidy: 0 };

type Args = {
  address: string;
  rewards: AddressRewards;
  expenses: CreditExpense[];
  nodeState: NodeState;
};

type Apportioned = {
  byNode: OwnerNodeReward[];
  stakingAleph: number;
};

/** Per-CRN execution weight from api2 node_id ALEPH over the window, scoped to
 *  this address's CRNs. Exact attribution (node_id present on every exec entry). */
function crnExecWeights(ownedCrnHashes: Set<string>, expenses: CreditExpense[]): Map<string, number> {
  const w = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.type !== "execution") continue;
    for (const c of expense.credits) {
      if (!c.nodeId || !ownedCrnHashes.has(c.nodeId)) continue;
      w.set(c.nodeId, (w.get(c.nodeId) ?? 0) + c.alephCost);
    }
  }
  return w;
}

function distribute(total: number, weights: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  let sum = 0;
  for (const v of weights.values()) sum += v;
  if (sum <= 0) {
    // Even split when no weight signal (e.g. wage on a CRN with no exec credits yet).
    const n = weights.size;
    if (n === 0) return out;
    for (const k of weights.keys()) out.set(k, total / n);
    return out;
  }
  for (const [k, v] of weights) out.set(k, (total * v) / sum);
  return out;
}

export function apportionOwnerRewards({ address, rewards, expenses, nodeState }: Args): Apportioned {
  const lower = address.toLowerCase();
  const owns = (n: { owner: string; reward: string }) =>
    getRewardAddress(n).toLowerCase() === lower || n.owner.toLowerCase() === lower;

  const ownedCrns = [...nodeState.crns.values()].filter(owns);
  const ownedCcns = [...nodeState.ccns.values()].filter(owns);
  const ownedCrnHashes = new Set(ownedCrns.map((c) => c.hash));

  const cr = rewards.full.credit_revenue;
  const ht = rewards.full.holder_tier;
  const wage = rewards.full.wage_subsidy;

  // Authoritative role totals split by source.
  const crnTotals: Record<RewardSource, number> = {
    credit_revenue: cr.execution_crn,
    holder_tier: ht.execution_crn,
    wage_subsidy: wage.crn,
  };
  const ccnTotals: Record<RewardSource, number> = {
    credit_revenue: cr.execution_ccn + cr.storage_ccn,
    holder_tier: ht.execution_ccn + ht.storage_ccn,
    wage_subsidy: wage.ccn,
  };

  // Weights: CRN by exec node_id ALEPH (fallback even); CCN by score.
  const crnW = crnExecWeights(ownedCrnHashes, expenses);
  for (const h of ownedCrnHashes) if (!crnW.has(h)) crnW.set(h, 0);
  const ccnW = new Map<string, number>();
  for (const c of ownedCcns) ccnW.set(c.hash, computeScoreMultiplier(c.score));

  const node = new Map<string, OwnerNodeReward>();
  const ensure = (hash: string, name: string, role: "crn" | "ccn") => {
    let n = node.get(hash);
    if (!n) { n = { hash, name, role, totalAleph: 0, bySource: { ...ZERO_SOURCE } }; node.set(hash, n); }
    return n;
  };
  for (const c of ownedCrns) ensure(c.hash, c.name, "crn");
  for (const c of ownedCcns) ensure(c.hash, c.name, "ccn");

  for (const src of ["credit_revenue", "holder_tier", "wage_subsidy"] as RewardSource[]) {
    for (const [hash, amt] of distribute(crnTotals[src], crnW)) {
      const n = node.get(hash)!; n.bySource[src] += amt; n.totalAleph += amt;
    }
    for (const [hash, amt] of distribute(ccnTotals[src], ccnW)) {
      const n = node.get(hash)!; n.bySource[src] += amt; n.totalAleph += amt;
    }
  }

  const stakingAleph =
    cr.execution_staker + cr.storage_staker +
    ht.execution_staker + ht.storage_staker +
    wage.staker;

  const byNode = [...node.values()].sort((a, b) => b.totalAleph - a.totalAleph);
  return { byNode, stakingAleph };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/reward-apportionment.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reward-apportionment.ts src/lib/reward-apportionment.test.ts
git commit -m "feat(rewards): pure apportionment lib (anchor totals, split per node)"
```

---

## Task 6: Payout-cycle helper

**Files:**
- Create: `src/lib/payout-cycle.ts`
- Test: `src/lib/payout-cycle.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { CYCLE_LENGTH_SEC, nextPaymentEstimate, cycleProgress } from "@/lib/payout-cycle";

describe("payout-cycle", () => {
  it("estimates next payment ~10 days after cycle end", () => {
    const end = 1_000_000;
    expect(nextPaymentEstimate(end)).toBe(end + CYCLE_LENGTH_SEC);
  });

  it("clamps progress to [0,1]", () => {
    const start = 0;
    const next = CYCLE_LENGTH_SEC;
    expect(cycleProgress(start, next, -10)).toBe(0);
    expect(cycleProgress(start, next, CYCLE_LENGTH_SEC / 2)).toBeCloseTo(0.5);
    expect(cycleProgress(start, next, CYCLE_LENGTH_SEC * 2)).toBe(1);
  });

  it("handles a zero-length window without NaN", () => {
    expect(cycleProgress(5, 5, 5)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/payout-cycle.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
/** Working payout cadence: distributions land ~every 10 days. The real cycle
 *  boundary always comes from the distribution message; this only powers the
 *  "next payment ~in N days" estimate and the progress bar. */
export const CYCLE_LENGTH_SEC = 10 * 24 * 60 * 60;

/** Estimated next payout = last cycle end + one cadence. */
export function nextPaymentEstimate(cycleEndSec: number): number {
  return cycleEndSec + CYCLE_LENGTH_SEC;
}

/** Fraction of the current cycle elapsed, clamped to [0,1]. */
export function cycleProgress(startSec: number, nextSec: number, nowSec: number): number {
  const span = nextSec - startSec;
  if (span <= 0) return 1;
  const p = (nowSec - startSec) / span;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/payout-cycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payout-cycle.ts src/lib/payout-cycle.test.ts
git commit -m "feat(rewards): payout-cycle estimate + progress helpers"
```

---

## Task 7: `useRewards` and `useDistributions` hooks

**Files:**
- Create: `src/hooks/use-rewards.ts`, `src/hooks/use-distributions.ts`
- Test: `src/hooks/use-distributions.test.tsx`

- [ ] **Step 1: Write `useDistributions`**

`src/hooks/use-distributions.ts`:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { getDistributions } from "@/api/rewards-client";

/** Latest credit-rewards-distribution cycle. Polled — re-fetch resets the
 *  owner view's accrual window when a new distribution publishes. */
export function useDistributions() {
  return useQuery({
    queryKey: ["distributions"],
    queryFn: getDistributions,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
```

- [ ] **Step 2: Write `useRewards`**

`src/hooks/use-rewards.ts`:

```typescript
"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getRewardsTimeSeries } from "@/api/rewards-client";

/** Authoritative per-address rewards over [fromSec, toSec]. */
export function useRewards(address: string, fromSec: number, toSec: number) {
  return useQuery({
    queryKey: ["rewards", address.toLowerCase(), fromSec, toSec],
    queryFn: () => getRewardsTimeSeries(address, fromSec, toSec),
    enabled: !!address && toSec > fromSec,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 3: Write a test for `useDistributions`**

`src/hooks/use-distributions.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDistributions } from "@/hooks/use-distributions";
import * as client from "@/api/rewards-client";

afterEach(() => vi.restoreAllMocks());

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useDistributions", () => {
  it("returns the latest cycle", async () => {
    vi.spyOn(client, "getDistributions").mockResolvedValue({
      startSec: 1, endSec: 2, rewards: new Map([["0xa", 5]]), onChain: new Map(),
    });
    const { result } = renderHook(() => useDistributions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.endSec).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/hooks/use-distributions.test.tsx`
Expected: PASS. Then `pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-rewards.ts src/hooks/use-distributions.ts src/hooks/use-distributions.test.tsx
git commit -m "feat(rewards): useRewards + useDistributions hooks"
```

---

## Task 8: `useOwnerRewards` composing hook

**Files:**
- Create: `src/hooks/use-owner-rewards.ts`
- Test: `src/hooks/use-owner-rewards.test.tsx`

Composes `useDistributions` (cycle window + lastPaid) + `useRewards` (authoritative totals over `[cycleEnd, now]`) + `useCreditExpenses` (api2 weights) + `useNodeState`, then `apportionOwnerRewards`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useOwnerRewards } from "@/hooks/use-owner-rewards";
import * as rc from "@/api/rewards-client";
import * as ce from "@/hooks/use-credit-expenses";
import * as ns from "@/hooks/use-node-state";

afterEach(() => vi.restoreAllMocks());
const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe("useOwnerRewards", () => {
  it("assembles cycle + totals + lastPaid for an address", async () => {
    vi.spyOn(rc, "getDistributions").mockResolvedValue({
      startSec: 1000, endSec: 2000,
      rewards: new Map([["0xowner", 82.28]]),
      onChain: new Map([["0xowner", { txHash: "0xtx", status: "pending" }]]),
    });
    vi.spyOn(rc, "getRewardsTimeSeries").mockResolvedValue({
      address: "0xowner", totalAleph: 60,
      bySource: { credit_revenue: 50, holder_tier: 0, wage_subsidy: 10 },
      full: { credit_revenue: { execution_crn: 0, execution_ccn: 0, execution_staker: 50, storage_ccn: 0, storage_staker: 0 }, holder_tier: { execution_crn: 0, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 }, wage_subsidy: { crn: 0, ccn: 0, staker: 10 } },
    });
    vi.spyOn(ce, "useCreditExpenses").mockReturnValue({ data: [], isLoading: false, isPlaceholderData: false } as never);
    vi.spyOn(ns, "useNodeState").mockReturnValue({ data: { crns: new Map(), ccns: new Map() }, isLoading: false } as never);

    const { result } = renderHook(() => useOwnerRewards("0xOWNER"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const d = result.current.data!;
    expect(d.cycleEndSec).toBe(2000);
    expect(d.totalAleph).toBeCloseTo(60);
    expect(d.stakingAleph).toBeCloseTo(60);
    expect(d.lastPaid!.aleph).toBeCloseTo(82.28);
    expect(d.lastPaid!.txHash).toBe("0xtx");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/hooks/use-owner-rewards.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
"use client";

import { useMemo } from "react";
import { useRewards } from "@/hooks/use-rewards";
import { useDistributions } from "@/hooks/use-distributions";
import { useCreditExpenses } from "@/hooks/use-credit-expenses";
import { useNodeState } from "@/hooks/use-node-state";
import { apportionOwnerRewards } from "@/lib/reward-apportionment";
import type { OwnerRewards } from "@/api/rewards-types";

/** Data-start floor for the rewards API. */
const DATA_START_SEC = Math.floor(Date.UTC(2026, 4, 1) / 1000); // 2026-05-01

export function useOwnerRewards(address: string): {
  data: OwnerRewards | undefined;
  isLoading: boolean;
} {
  const { data: cycle, isLoading: cycleLoading } = useDistributions();

  const fromSec = cycle?.endSec ?? DATA_START_SEC;
  const nowSec = useMemo(() => Math.floor(Date.now() / 300_000) * 300, []); // 5-min rounded

  const { data: rewards, isLoading: rewardsLoading } = useRewards(address, fromSec, nowSec);
  const { data: expenses, isLoading: expLoading } = useCreditExpenses(fromSec, nowSec);
  const { data: nodeState, isLoading: nsLoading } = useNodeState();

  const data = useMemo<OwnerRewards | undefined>(() => {
    if (!rewards || !nodeState) return undefined;
    const lower = address.toLowerCase();
    const { byNode, stakingAleph } = apportionOwnerRewards({
      address, rewards, expenses: expenses ?? [], nodeState,
    });
    const paidAleph = cycle?.rewards.get(lower);
    const oc = cycle?.onChain.get(lower);
    return {
      address: lower,
      cycleStartSec: fromSec,
      cycleEndSec: cycle?.endSec ?? null,
      totalAleph: rewards.totalAleph,
      bySource: rewards.bySource,
      byNode,
      stakingAleph,
      lastPaid:
        cycle && paidAleph !== undefined
          ? { aleph: paidAleph, timeSec: cycle.endSec, txHash: oc?.txHash ?? null, status: oc?.status ?? "pending" }
          : null,
    };
  }, [address, rewards, expenses, nodeState, cycle, fromSec]);

  return {
    data,
    isLoading: cycleLoading || rewardsLoading || expLoading || nsLoading,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/hooks/use-owner-rewards.test.tsx`
Expected: PASS. Then `pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-owner-rewards.ts src/hooks/use-owner-rewards.test.tsx
git commit -m "feat(rewards): useOwnerRewards composing hook"
```

---

## Task 9: `WalletRevenueCard` component

**Files:**
- Create: `src/components/wallet-revenue-card.tsx`
- Test: `src/components/wallet-revenue-card.test.tsx`

Renders the approved hero: owed-this-cycle + countdown/progress, last-payment panel, by-source bar, by-node list (+ staking line). Uses `formatAleph` and the cycle helpers. Source colors match the mockups: credits `success-500`, holder `primary-500`, wage `warning-500`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletRevenueCard } from "@/components/wallet-revenue-card";
import type { OwnerRewards } from "@/api/rewards-types";

const OWNER: OwnerRewards = {
  address: "0xowner",
  cycleStartSec: Math.floor(Date.UTC(2026, 5, 1) / 1000),
  cycleEndSec: Math.floor(Date.UTC(2026, 5, 1) / 1000),
  totalAleph: 1284,
  bySource: { credit_revenue: 796, holder_tier: 103, wage_subsidy: 385 },
  byNode: [
    { hash: "crnA", name: "node-alpha", role: "crn", totalAleph: 612, bySource: { credit_revenue: 480, holder_tier: 0, wage_subsidy: 132 } },
    { hash: "ccnX", name: "node-bravo", role: "ccn", totalAleph: 418, bySource: { credit_revenue: 300, holder_tier: 30, wage_subsidy: 88 } },
  ],
  stakingAleph: 254,
  lastPaid: { aleph: 82.28, timeSec: Math.floor(Date.UTC(2026, 5, 1) / 1000), txHash: "0xtx", status: "pending" },
};

describe("WalletRevenueCard", () => {
  it("shows owed-this-cycle total, sources, nodes, and last payment", () => {
    render(<WalletRevenueCard rewards={OWNER} />);
    expect(screen.getByText(/Owed this cycle/i)).toBeInTheDocument();
    expect(screen.getByText("node-alpha")).toBeInTheDocument();
    expect(screen.getByText(/Min\. wage/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it("renders nothing when there is no revenue and no payout", () => {
    const { container } = render(
      <WalletRevenueCard rewards={{ ...OWNER, totalAleph: 0, byNode: [], stakingAleph: 0, lastPaid: null }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/wallet-revenue-card.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
"use client";

import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { formatAleph } from "@/lib/format";
import { nextPaymentEstimate, cycleProgress } from "@/lib/payout-cycle";
import type { BySource, OwnerRewards, RewardSource } from "@/api/rewards-types";

const SOURCE_META: { key: RewardSource; label: string; bar: string; dot: string }[] = [
  { key: "credit_revenue", label: "Credits", bar: "bg-success-500", dot: "🟢" },
  { key: "holder_tier", label: "Holder", bar: "bg-primary-500", dot: "🟣" },
  { key: "wage_subsidy", label: "Min. wage", bar: "bg-warning-500", dot: "🟡" },
];

function SourceBar({ bySource }: { bySource: BySource }) {
  const total = SOURCE_META.reduce((s, m) => s + bySource[m.key], 0);
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
          <span key={m.key}>
            {i > 0 ? " · " : ""}
            {m.dot} {m.label} {formatAleph(bySource[m.key])}
          </span>
        ))}
        {total > 0 && bySource.wage_subsidy > 0 && (
          <span className="opacity-60"> (wage decaying → 0)</span>
        )}
      </div>
    </>
  );
}

function daysUntil(targetSec: number, nowSec: number): number {
  return Math.max(0, Math.round((targetSec - nowSec) / 86400));
}

const STATUS_LABEL = { pending: "⏳ on-chain pending", confirmed: "✓ on-chain confirmed", failed: "⚠ transfer failed" } as const;

export function WalletRevenueCard({ rewards }: { rewards: OwnerRewards }) {
  if (rewards.totalAleph === 0 && !rewards.lastPaid) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const nextSec = rewards.cycleEndSec ? nextPaymentEstimate(rewards.cycleEndSec) : null;
  const progress = nextSec ? cycleProgress(rewards.cycleStartSec, nextSec, nowSec) : 0;

  return (
    <Card padding="md">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Node revenue
      </h3>

      <div className="flex flex-wrap gap-5">
        <div className="min-w-[240px] flex-[2]">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Owed this cycle <span className="text-success-500">● live</span>
          </div>
          <div className="font-mono text-3xl font-semibold tabular-nums">
            {formatAleph(rewards.totalAleph)} <span className="text-base text-muted-foreground">ALEPH</span>
          </div>
          <div className="my-2 h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-gradient-to-r from-primary-500 to-success-500" style={{ width: `${progress * 100}%` }} />
          </div>
          {nextSec && (
            <div className="text-sm text-muted-foreground">
              ⏱ Next payment in ~{daysUntil(nextSec, nowSec)} days
            </div>
          )}
          <div className="text-[11px] text-muted-foreground opacity-60">
            Resets to 0 when the next distribution publishes.
          </div>
        </div>

        {rewards.lastPaid && (
          <div className="min-w-[180px] flex-1 border-l border-edge pl-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Last payment
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums">
              {formatAleph(rewards.lastPaid.aleph)} <span className="text-xs text-muted-foreground">ALEPH</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(rewards.lastPaid.timeSec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            <div className="mt-1 text-warning-500">{STATUS_LABEL[rewards.lastPaid.status]}</div>
          </div>
        )}
      </div>

      <hr className="my-3 border-edge" />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">By source · this cycle</div>
      <SourceBar bySource={rewards.bySource} />

      {(rewards.byNode.length > 0 || rewards.stakingAleph > 0) && (
        <>
          <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">By node · this cycle</div>
          <table className="mt-1 w-full text-sm">
            <tbody className="divide-y divide-edge">
              {rewards.byNode.map((n) => (
                <tr key={`${n.hash}-${n.role}`}>
                  <td className="py-1.5 pr-4">
                    <div className="flex items-center gap-2">
                      <CopyableText text={n.hash} startChars={8} endChars={8} size="sm" href={`/nodes?view=${n.hash}`} />
                      {n.name && <span className="text-xs text-muted-foreground">{n.name}</span>}
                      <Badge fill="outline" variant={n.role === "crn" ? "info" : "default"} size="sm">{n.role.toUpperCase()}</Badge>
                    </div>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{formatAleph(n.totalAleph)}</td>
                </tr>
              ))}
              {rewards.stakingAleph > 0 && (
                <tr>
                  <td className="py-1.5 pr-4">
                    <Badge fill="outline" variant="warning" size="sm">STAKING</Badge>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{formatAleph(rewards.stakingAleph)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <p className="mt-3 text-[11px] italic text-muted-foreground">
        Owed amounts accrued from the protocol&apos;s authoritative rewards feed (algoVersion v2),
        including the wage subsidy (which decays over time). Per-node figures for addresses with
        multiple nodes are apportioned. Last payment reflects the on-chain distribution status.
      </p>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/wallet-revenue-card.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/wallet-revenue-card.tsx src/components/wallet-revenue-card.test.tsx
git commit -m "feat(rewards): WalletRevenueCard owner view"
```

---

## Task 10: Wire into the Wallet page; remove dead reconstruction

**Files:**
- Modify: `src/app/wallet/page.tsx`
- Remove: `src/hooks/use-wallet-rewards.ts` (+ test if present)
- Modify: `src/lib/credit-distribution.ts` (remove `computeWalletRewards`), `src/api/credit-types.ts` (remove `WalletRewards`, `WalletNodeReward`)

- [ ] **Step 1: Confirm `useWalletRewards`/`computeWalletRewards` have no other consumers**

Run: `rg -n "useWalletRewards|computeWalletRewards|WalletRewards|WalletNodeReward" src/`
Expected: matches only in `wallet/page.tsx`, `use-wallet-rewards.ts`, `credit-distribution.ts`, `credit-types.ts`, and their tests. If anything else appears, STOP and reassess.

- [ ] **Step 2: Swap the section in the Wallet page**

In `src/app/wallet/page.tsx`:
- Replace the import `import { useWalletRewards } from "@/hooks/use-wallet-rewards";` and `import type { WalletRewards } from "@/api/credit-types";` with:

```typescript
import { useOwnerRewards } from "@/hooks/use-owner-rewards";
import { WalletRevenueCard } from "@/components/wallet-revenue-card";
```

- In `WalletContent`, replace the `useWalletRewards(address)` call with:

```typescript
const { data: ownerRewards } = useOwnerRewards(address);
```

- Replace the `<RewardsSection rewards={rewards} />` render site with:

```tsx
{ownerRewards && <WalletRevenueCard rewards={ownerRewards} />}
```

- Delete the `RewardsSection` function (lines ~532–622) and the now-unused `ROLE_VARIANT` const if it's not referenced elsewhere (verify with `rg "ROLE_VARIANT" src/app/wallet/page.tsx`).

- [ ] **Step 3: Remove the dead reconstruction**

- Delete `src/hooks/use-wallet-rewards.ts` (and `src/hooks/use-wallet-rewards.test.tsx` if it exists): `git rm`.
- In `src/lib/credit-distribution.ts`: delete `computeWalletRewards` (and any helper used only by it — check `rg` references first). Keep `getRewardAddress`, `computeScoreMultiplier`, `distributeExpense`, `computeDistributionSummary` (still used by Phase-2 surfaces).
- In `src/api/credit-types.ts`: delete the `WalletNodeReward` and `WalletRewards` types.

- [ ] **Step 4: Verify build + types + tests**

Run: `pnpm typecheck`
Expected: PASS (no dangling references).
Run: `pnpm test`
Expected: PASS (deleted tests gone; no failures).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(rewards): wallet owner revenue view; remove client-side reward reconstruction"
```

---

## Task 11: Verify and refine

- [ ] Run full project checks: `pnpm check` (lint + typecheck + check:tokens + test)
- [ ] Manual smoke: `pnpm dev`, open `/wallet?address=0xf379b2f8c29eedc1fc7d189240d0ad7c9164af64` — confirm: owed-this-cycle total, by-source bar with a non-zero **Min. wage** segment, by-node rows, staking line, and a "Last payment … pending/confirmed" panel. Cross-check the total roughly tracks the live `/rewards/time-series` for that address.
- [ ] Verify any `var(--…)` used resolves (`success-500`/`primary-500`/`warning-500`/`muted`/`edge` are existing tokens) — `pnpm check:tokens`.
- [ ] Fix any issues found; re-run `pnpm check` until clean.

---

## Task 12: Update docs and version

- [ ] **ARCHITECTURE.md** — add the rewards data layer (rewards-client, apportionment, payout-cycle, the three hooks) and note the per-address-truth + api2-per-node-split pattern; note `computeWalletRewards` removed.
- [ ] **DECISIONS.md** — log: rewards re-sourced from `credit.aleph.im /rewards/time-series` + FOUNDATION `credit-rewards-distribution` messages (source of truth, algoVersion v2); wage subsidy now modeled; per-node apportionment (CRN exact via node_id, CCN/wage proxy-weighted); cycle-centric owner view; hardcoded split retired for the wallet path.
- [ ] **BACKLOG.md** — add Phase 2 (③ Credits page migration with ≤100-address batching, ④ Network panel sparklines) and the Plan B follow-up (Node Earnings tab re-source); move nothing to Completed yet (Plan B + Phase 2 outstanding).
- [ ] **CLAUDE.md** — update the Wallet page entry in Current Features: "credit rewards (24h)" → cycle-centric owner revenue view (owed-this-cycle + countdown + by-source incl. wage + by-node + last-payment on-chain status).
- [ ] **src/changelog.ts** — bump `CURRENT_VERSION` (minor — new user-facing feature) and add a `VersionEntry` describing the owner revenue view + source-of-truth rewards.
- [ ] Commit:

```bash
git add -A
git commit -m "docs(rewards): owner revenue view — architecture, decisions, backlog, changelog"
```

---

## Notes for the implementer

- **Single-address only:** `getRewardsTimeSeries` queries one address. Multi-address (credits recipient table) is Phase 2 — do not add `byAddress`/batching here.
- **Address casing:** distribution `rewards`/`targets` keys are checksummed; always lowercase before map lookups (the client already does). `getRewardAddress` comparisons are lowercased in the apportionment lib.
- **No buckets in Plan A:** the owner view shows a total + a *time-progress* bar, not a value chart. The time-series request uses `bucketSize=1y` and reads only `total`. Per-bucket series is Plan B's concern.
- **`cycleEndSec` null case:** before the first credit distribution is observed (or if api2 is unreachable), `useDistributions` returns null → the window floors at `DATA_START` and the countdown/last-payment panels hide. The owed total + by-source still render.
- **Don't remove** `computeDistributionSummary`/`distributeExpense` — Phase-2 surfaces (credits page, network panels) still use them until migrated.
