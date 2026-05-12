# CRN / CCN Earnings Tab — Design

**Date:** 2026-05-12
**Status:** Draft — pending review
**Branch:** `spec/crn-earnings-tab` (implementation branch TBD)

---

## Why

A node owner asked:

> "Rather than a simulator, can we not just see how much each CRN is currently
> earning? The 24h numbers, are they accurate? Is that what they are earning
> every 24 hours? And when distribution happens, is there some way to tell
> precisely how much is coming from each CRN if we are using one reward address
> for multiple nodes? The simulator won't help if something is wrong with the
> CRN."

The simulator at `simulation.aleph.cloud` projects forward emissions from
user-input parameters; it can't diagnose a CRN that's underperforming today.
The account page at `front-aleph-cloud-page` shows *projected* per-node rewards
from a static formula (`StakeManager.CRNRewardsPerDay(node) × 365/12`), not
actual accrued earnings.

This dashboard already has the data the operator wants — `aleph_credit_expense`
messages carry `node_id` per credit entry, the distribution math runs in
`src/lib/credit-distribution.ts`, and the wallet view at `/wallet?address=`
already renders per-node 24h ALEPH. **What's missing is a path that starts from
the node hash instead of the wallet address**, plus the diagnostic context
("earnings dropped — why?") needed when something's wrong on the CRN.

## What

A new **Earnings** tab on the node detail view (`/nodes?view=<hash>`),
applicable to both CRN and CCN nodes, showing:

1. Trailing **24h / 7d / 30d** ALEPH accrued for the node (deltas vs the
   previous identical window)
2. A time-series chart pairing earnings with the most diagnostic secondary
   signal for that role:
   - **CRN:** ALEPH-per-bucket × VM-count-per-bucket (correlates earnings drops
     with VM count drops — the most common failure mode)
   - **CCN:** ALEPH-per-bucket × linked-CRN-count-per-bucket
3. **CRN only:** per-VM earnings breakdown table (top 5 + "+N more" expander)
4. **CCN only:** linked CRNs list (name, status, current VM count)
5. A footnote distinguishing **accrued** from on-chain **distributed** ALEPH,
   so operators don't expect these numbers to match wallet-balance deltas
   directly

Out of scope for v1, captured as follow-ups: on-chain distribution
reconciliation view; per-CRN sparkline on the network graph CRN panel;
score-over-time line (needs `/stats/history` backend, separate backlog item);
wallet view scheduler-vs-api2 divergence detection.

## UX

### Tab control

DS Tabs (underline variant, `size="sm"`) added at the top of `NodeDetailView`,
below the header row. Two tabs: **Overview** (current content), **Earnings**
(new). URL-persisted via `?tab=earnings`. Default tab is `overview` when `tab`
is absent or unrecognized. The tab control sits above all existing detail
cards so it reads as a top-level mode switch, not a section selector.

### Earnings tab — common scaffold

Top-down:

1. **Time-range pill tabs** (DS Tabs, pill variant, `size="sm"`) — `24h` /
   `7d` / `30d`. URL-persisted via `?earningsRange=`. Default `24h`. Named
   `earningsRange` (not `range`) to avoid colliding with the credits page's
   `?range=` if the user navigates between them with a shared param.
2. **KPI row** — 4 stat cards in a flat `grid-cols-4` (collapses to
   `grid-cols-2` below `md`, `grid-cols-1` below `sm`).
3. **Earnings chart** — single Card containing the dual-line SVG chart and an
   inline legend.
4. **Breakdown table** (CRN: per-VM; CCN: linked CRNs).
5. **Footnote** — small muted text:
   > Accrued earnings from the credit-expense feed using the protocol's
   > distribution split (60% execution / 75% storage / 15% / 20% / 5%). Numbers
   > reflect what this node earned, not yet paid on-chain. On-chain payouts
   > happen periodically and reconcile to the same totals.

### KPI row — CRN

| Card | Primary value | Secondary | Notes |
|------|---------------|-----------|-------|
| ALEPH accrued | `formatAleph(totalAleph)` | `▲/▼ Δ vs prev <window>` | Coloured up/down vs previous identical window. No change indicator when delta is < 1% of total. |
| Avg VMs hosted | `Math.round(avgVms)` | `▲/▼ Δ vs prev <window>` | Average over buckets, not snapshot. |
| Score | `score.toFixed(2)` | `"vs 0.8 threshold"` | Snapshot from `nodeState.crns.get(hash).score`. No history. Coloured warning if `< 0.8`. |
| Status | `<StatusDot> + status string` | `"last updated <relative>"` | Snapshot dot + `relativeTime(node.updatedAt)`. Window-uptime is **not** shown — `node.history` carries VM-action events, not node-status transitions, so an honest in-window uptime ratio isn't derivable from existing data. |

### KPI row — CCN

| Card | Primary value | Secondary | Notes |
|------|---------------|-----------|-------|
| ALEPH accrued | `formatAleph(totalAleph)` | `▲/▼ Δ vs prev <window>` | Same as CRN. |
| Score | `score.toFixed(2)` | `"vs 0.8 threshold"` | Snapshot. |
| Linked CRNs | count of CRNs with `parent === hash` | `"linkedCRNPenalty: X%"` | From `nodeState`. Penalty factor exported from `credit-distribution.ts`. |
| Status | `<StatusDot> + status string` | `"last updated <relative>"` | Same as CRN. |

### Chart

A single SVG in its own Card (`node-earnings-chart.tsx`). Two `<polyline>`
lines on a shared time axis. The two lines are normalized to the same
visual extent (different y-scales rendered without axis labels — this is a
trend chart, not a precision chart). Legend row above the chart shows the two
colours.

- **CRN secondary signal:** VM-count per bucket (purple, `--color-primary-500`
  in dark theme).
- **CCN secondary signal:** linked-CRN-count per bucket (purple, same colour).

Bucketing:

- `24h` → **1-hour buckets** (24 points)
- `7d` → **1-day buckets** (7 points)
- `30d` → **1-day buckets** (30 points)

The chart has no x-axis labels; bucket time is shown on hover (tooltip
deferred to a follow-up — first ship without it, the chart's trend reads
without tooltips). Empty buckets render as zero.

### Breakdown — CRN per-VM table

Columns: VM hash (`CopyableText` linking to `/vms?view=<hash>`), type, status,
ALEPH (right-aligned, tabular-nums). Top 5 rows sorted descending by ALEPH;
remaining rows roll into a `+ N more…` row with their summed ALEPH.
`<tfoot>` shows the total.

Source: `summary.perNodeBuckets` aggregates per-VM elsewhere — for this
table we instead use a new per-VM per-window map derived in the same pass.
See § Data layer.

### Breakdown — CCN linked CRNs list

Columns: CRN name (or hash via `CopyableText`), status (StatusDot + badge),
current VM count (right-aligned). No ALEPH column — CCN earnings do not
attribute to specific linked CRNs (the CCN pool is network-wide, not derived
from this CCN's connected CRNs). A short inline note above the table makes
this explicit:

> Linked CRNs contribute to your `linkedCRNPenalty` factor but their VM
> earnings accrue to themselves, not to this CCN.

Source: `nodeState.crns` filtered by `parent === hash`.

### Empty / edge states

| Condition | Render |
|-----------|--------|
| No credit-expense data in window | Chart empty state ("No accrued earnings in this window"); KPI cards show `0` with no delta arrow; breakdown table hidden. |
| Window crosses `discoveredAt` | Normal render; pre-discovery buckets show 0 (legitimate). |
| CCN inactive (score < 0.2) | Hint in chart empty state: "Earnings start once the node activates (score ≥ 0.2)". |
| CCN pending (no attached CRNs / understaked / owner-locked) | Hint specific to the gating reason, reusing wording from the network graph's pending vocabulary. |
| `node.history` unavailable / empty | VM-count / linked-CRN-count overlay falls back to current count flat-lined across buckets; small italic note: "Count history unavailable — showing current value." |
| Loading | Skeleton placeholders (existing DS `Skeleton` pattern). |
| Range change | `placeholderData: keepPreviousData` keeps prior chart visible during refetch (same pattern as credits page). |

## Architecture

### Data layer — extend `computeDistributionSummary`

`src/lib/credit-distribution.ts:119` (`computeDistributionSummary`) gains an
optional bucketing parameter:

```ts
type NodeBucket = { time: number; aleph: number };

type SummaryOptions = {
  bucketCount: number;
  startTime: number;  // window start in seconds
  endTime: number;    // window end in seconds
};

type DistributionSummary = {
  // ...existing fields
  perNodeBuckets?: Map<string, NodeBucket[]>;
};

function computeDistributionSummary(
  expenses: CreditExpense[],
  nodeState: NodeState,
  options?: SummaryOptions,
): DistributionSummary;
```

When `options` is undefined, the summary keeps its current shape — credits page
is unchanged. When `options` is provided:

- The function pre-allocates a zero-filled `NodeBucket[]` per node hash it
  encounters, with `time` set to each bucket's start (computed from
  `startTime + i × bucketWidth`).
- For each expense, it computes `bucketIndex = floor((expense.time - startTime) / bucketWidth)`,
  clamped to `[0, bucketCount - 1]`. Expenses with `time < startTime` or `time > endTime`
  are skipped (caller is expected to pass an `expenses` array already filtered
  to the window, but we defensively clamp anyway).
- **CRN bucket contribution:** for each `credit` in the expense where
  `credit.nodeId` matches a CRN, add `credit.alephCost × EXECUTION_CRN_SHARE`
  to that bucket entry.
- **CCN bucket contribution:** for each CCN with a positive score weight,
  add `(expense.totalAleph × ccnShare × weight / totalWeight)` to that
  bucket entry. `ccnShare` is `STORAGE_CCN_SHARE` for storage expenses,
  `EXECUTION_CCN_SHARE` otherwise (matches existing per-expense math).

`perNodeBuckets` lives on `DistributionSummary` so callers that don't pass
`options` continue to receive `undefined` for it — type-safe and
backwards-compatible. The existing `perNode` map remains (it's a
window-aggregate; the bucket version is denser).

**Per-VM per-window map (new field):**

```ts
type DistributionSummary = {
  // ...
  perVmInWindow?: Map<string, { aleph: number; nodeId: string }>;
};
```

Populated alongside `perNodeBuckets` (when `options` is provided), only for
CRN-attributable execution credits. The key is `credit.executionId` (the VM
hash); the value carries the ALEPH attributed to that VM in the window and
the CRN hash that hosted it (for fast filter-by-CRN in the per-VM table).
Status/type are not stored here — `aleph_credit_expense` doesn't carry them,
and the component joins to `useVMs()` data when rendering the row.

### Data layer — `useNodeEarnings(hash, range)`

New hook in `src/hooks/use-node-earnings.ts`:

```ts
type NodeEarnings = {
  role: "crn" | "ccn";
  totalAleph: number;
  delta: { aleph: number; secondaryCount: number };
  buckets: { time: number; aleph: number; secondaryCount: number }[];
  perVm?: { vmHash: string; aleph: number }[];        // CRN only, sorted desc
  linkedCrns?: { hash: string; name: string; status: string; vmCount: number }[];  // CCN only
};

function useNodeEarnings(
  hash: string,
  range: "24h" | "7d" | "30d",
): {
  data: NodeEarnings | undefined;
  isLoading: boolean;
  isPlaceholderData: boolean;
};
```

Internals (composition):

1. Compute window `{ start, end }` via `getStableExpenseRange(RANGE_SECONDS[range])`
   (existing helper). Bucket count derived from range:
   - `24h` → 24 buckets (1 hour)
   - `7d` → 7 buckets (1 day)
   - `30d` → 30 buckets (1 day)
2. Compute the previous window `{ prevStart, prevEnd } = { start - rangeSec, start }`
   for delta. Reuse the same bucket count.
3. Fire **two** `useCreditExpenses` queries: one for the current window, one
   for the previous window. Both share the same React Query cache namespace.
4. Fire `useNodeState()` (existing). Resolves `role` via `nodeState.crns.has(hash)`
   vs `nodeState.ccns.has(hash)`.
5. Fire `useNode(hash)` for `history` events (used for VM-count timeline).
6. Fire `useNodes()` (CCN role only) to resolve linked CRN statuses for the
   linked-CRN table.
7. Memoize: pass `expenses` and bucketing options into `computeDistributionSummary`.
   Extract `perNodeBuckets.get(hash)` and `perVmInWindow` (filtered to credits
   whose CRN's reward address matches this CRN — actually filtered to credits
   where `nodeId === hash`; per-VM lookup is `credit.executionId → aleph`).
8. Derive `secondaryCount` timeline:
   - **CRN:** replay `node.history` events backward from `end` to construct
     VM count at each bucket boundary. Algorithm: start from `currentVms.length`
     (which is `vms.length` from the node detail data); walk backward,
     reverse-apply each `scheduled` (decrement) or `removed`/`migrated`
     (increment) event whose timestamp is within the window. Snapshot the
     count at each bucket boundary.
   - **CCN:** replay history of `parent` reassignments across the linked CRN
     set. Simpler: count `Object.values(nodeState.crns).filter(c => c.parent === hash).length`
     and flat-line it across buckets for v1 (since most CCN-CRN links are stable
     within a 30-day window). If `useNode(hash)` returns history events that
     capture parent-change events, prefer that.
9. Compute `delta`:
    - `delta.aleph = currentTotal - prevTotal`
    - `delta.secondaryCount = avgCurrent - avgPrev`

### Routing

`src/app/nodes/page.tsx` reads `tab` from search params and threads it into
`NodeDetailView` as a prop (`initialTab`). The component owns its tab state,
syncing back to URL via `router.replace` (history-clean, mirrors the
network-graph search pattern).

```ts
type NodeDetailViewProps = {
  hash: string;
  initialTab?: "overview" | "earnings";
};
```

`earningsRange` follows the same pattern, scoped to `NodeEarningsTab` /
`NodeEarningsTabCcn` so the URL only carries it when the Earnings tab is
active.

### Components

| File | Purpose | Approx LOC |
|------|---------|------------|
| `src/components/node-detail-view.tsx` | Modified: wrap content in DS Tabs (`Overview`, `Earnings`), read `nodeState.crns.has(hash)` / `nodeState.ccns.has(hash)` to pick CRN vs CCN earnings component | +30 |
| `src/components/node-earnings-tab.tsx` | CRN earnings tab content (KPI row + chart + per-VM table) | ~120 |
| `src/components/node-earnings-tab-ccn.tsx` | CCN earnings tab content (KPI row + chart + linked-CRN list) | ~100 |
| `src/components/node-earnings-kpi-row.tsx` | The 4-card row, generic over a `cards: KpiCard[]` prop so both roles use the same primitive | ~70 |
| `src/components/node-earnings-chart.tsx` | Dual-line SVG chart, accepts `buckets: { time, primary, secondary }[]` + legend strings | ~80 |
| `src/hooks/use-node-earnings.ts` | The data hook (above) | ~120 |
| `src/lib/credit-distribution.ts` | Modified: optional `options` param on `computeDistributionSummary`, emit `perNodeBuckets` + `perVmInWindow` | +60 |
| `src/api/credit-types.ts` | Modified: add `NodeBucket`, `perNodeBuckets?`, `perVmInWindow?` to `DistributionSummary` | +10 |
| `src/app/nodes/page.tsx` | Modified: read `?tab=`, thread to `NodeDetailView` | +5 |

### Reuse of existing primitives

- **DS Tabs** (underline + pill variants) — already used on Issues, Network
  search, Credits.
- **DS Card / Badge / StatusDot / CopyableText / Tooltip / Skeleton** — all
  already imported across detail views.
- **`useCreditExpenses`**, **`useNodeState`**, **`useNode`**, **`useNodes`** —
  existing hooks; the new hook composes them. No new API calls.
- **`Sparkline` component** at `src/components/sparkline.tsx` is single-line —
  the new dual-line chart is a small new component, but inspired by Sparkline's
  shape.
- **`formatAleph`** helper — existing.

## Data flow summary

```
URL → /nodes?view=<hash>&tab=earnings&earningsRange=7d
        │
        ▼
src/app/nodes/page.tsx (read query params)
        │
        ▼
NodeDetailView { hash, initialTab="earnings" }
        │
        ├─ (overview tab) → existing cards (unchanged)
        │
        └─ (earnings tab) →
              ┌─→ NodeEarningsTab (CRN) ─┐
              │                          │
              └─→ NodeEarningsTabCcn ────┤
                    │                    │
                    ▼                    ▼
              useNodeEarnings(hash, range)
                    │
       ┌────────────┼─────────────┐
       ▼            ▼             ▼
useCreditExpenses  useNodeState  useNode(hash) / useNodes()
   (cur+prev)     (registries)    (history events / linked CRNs)
       │
       ▼
computeDistributionSummary(expenses, nodeState, { bucketCount, startTime, endTime })
   returns DistributionSummary { ..., perNodeBuckets, perVmInWindow }
```

## Edge cases

- **Inactive node (CRN with `status !== "linked"` or CCN with `status !== "active"`):**
  Numbers are real (we still compute), but they'll typically be 0. Empty state
  is rendered with a role-specific hint.
- **CCN below `CCN_ACTIVATION_THRESHOLD` (500k staked) or owner below
  `CCN_OWNER_BALANCE_THRESHOLD` (200k):** `computeScoreMultiplier` returns 0
  for CCNs with `status !== "active"`; numbers are 0; empty state hint reuses
  the network-graph pending vocabulary ("Earnings start once the node
  activates").
- **CRN with `parent === null`:** No earnings from execution share because
  unlinked CRNs are skipped by the scheduler. Empty state hint: "Pending CCN
  attachment — earnings start once linked".
- **Node not found** (hash typo): existing `NodeDetailView` "Node not found"
  card stays; tabs control is not rendered.
- **Window with no buckets** (impossible by construction since `bucketCount`
  is fixed per range, but defensive `Math.max(1, …)` in the bucket builder).
- **History event with `timestamp` outside the window:** clamped to window
  edges for the timeline replay (used only for VM-count overlay; uptime is
  not computed).

## Performance

- **Single `computeDistributionSummary` pass** per window (no per-bucket sub-passes).
- **Two `useCreditExpenses` queries** (current + previous window). At 24h that's
  ~48 expenses × ~30 credits each = ~1440 entries × 2 = ~2880 entries cold.
  At 7d that's ~10k × 2 = ~20k. At 30d that's ~43k × 2 = ~86k entries — roughly
  **2× the credits page's 30d fetch cost** on a cold cache. Hot-cache cost is
  negligible because the previous-window data is mostly stable (it shifts by
  one 5-min bucket per cache refresh). Trade-off accepted because the delta
  number is load-bearing for the diagnostic case ("trending up or down?"); if
  cold-load on 30d feels slow in practice, mitigate by lazily firing the
  previous-window query after the current-window query resolves (cheap follow-up).
- **VM-count timeline replay** is O(events_in_window), bounded by node's history
  length (typically <100 events per 30 days).
- **Memoization:** `useMemo` on the derived `NodeEarnings`, keyed by
  `[hash, range, expensesQueryStatus, prevExpensesQueryStatus, nodeStateUpdated]`.
- **No new network requests** — every fetch is an existing hook with a
  cache-shared query key.

## Testing

| File | New tests |
|------|-----------|
| `src/lib/credit-distribution.test.ts` (new or extend) | CRN bucket math: synthetic expenses → assert `perNodeBuckets[hash][i].aleph` sums match aggregate `perNode[hash]`. CCN bucket math: assert per-bucket sum equals expense.totalAleph × ccnShare × weight/total. Empty window: no buckets, `perNodeBuckets` empty. Per-VM window aggregation: assert `perVmInWindow[executionId]` matches sum of credits for that execution. |
| `src/hooks/use-node-earnings.test.tsx` (new) | Renders with mocked React Query data. CRN role: returns `perVm` non-empty, `linkedCrns` undefined. CCN role: inverse. Delta computation: positive delta when current > prev; zero delta when both windows identical. VM-count timeline: 3 scheduled, 1 removed → resulting count matches replay. |
| `src/components/node-earnings-tab.test.tsx` (new) | Renders KPI cards with formatted ALEPH; chart `<svg>` present with 2 `<polyline>` elements; per-VM table shows top 5 + "+N more" row when > 5 VMs; total row matches sum. |
| `src/components/node-earnings-tab-ccn.test.tsx` (new) | Same as above but for CCN: linked-CRN list rows match `nodeState.crns` filtered by parent; no per-VM table. |

No E2E tests (project has none today; tracked as separate backlog item).

## Migration / rollout

- No DB, no API, no breaking changes. The `?tab=` query param defaults to
  `overview`, so existing deep links keep working.
- `DistributionSummary.perNodeBuckets` and `perVmInWindow` are optional and
  unused by the credits page; no existing consumers break.
- Static export build (`pnpm build`) must succeed — no SSR-incompatible
  primitives used (no `CSS.escape`, no `useId()` colon issues — see existing
  Sparkline component for the pattern).
- Manual preview gate (per `CLAUDE.md`): `preview start spec/crn-earnings-tab`
  (or implementation branch name) before opening the PR.

## Open follow-ups (not in v1, captured in BACKLOG.md after merge)

1. **Chart tooltip on hover** showing exact bucket time + values
2. **Distribution reconciliation view** (`/distributions` or tab on credits)
   pairing on-chain `staking-rewards-distribution` POSTs with per-CRN
   accrual reconstruction over the distribution window
3. **Per-CRN sparkline on the network graph CRN detail panel** (reuse
   `node-earnings-chart.tsx` at a smaller size)
4. **Score-over-time line** if a `/stats/history` backend ever ships
5. **Compare-to-network-median delta** as an alternative to previous-window
   delta (operator preference)
6. **Persistent localStorage cache** for `useNodeEarnings` à la credits page,
   if hit rates suggest it's worthwhile

## Decision log additions (post-merge)

Will add a `Decision #89` entry when this lands:

> **Context:** A node owner asked for per-CRN actual earnings, not simulator
> projections. Our credit-distribution math already attributes execution
> rewards per `credit.nodeId`, but the data is only surfaced from the wallet
> view. **Decision:** Add an Earnings tab on the node detail view for both
> CRN and CCN, computed from credit-expense buckets with previous-window
> deltas and a VM-count overlay (CRN) / linked-CRN-count overlay (CCN).
> **Rationale:** All data exists; this is purely a presentation layer. The
> diagnostic angle (earnings dropped → VM count dropped) is the operator's
> primary failure mode. **Alternatives:** dedicated `/earnings` cross-cutting
> page (rejected — wallet view already does cross-cutting per address);
> on-chain distribution display instead of accrual (rejected — sparse and
> per-address, defeats the per-CRN purpose).
