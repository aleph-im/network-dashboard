# Node Earnings Tab — Rewards Layer Re-source (Plan B) — Design

**Date:** 2026-06-11
**Status:** Approved (brainstorm complete) — ready for implementation plan
**Author:** Claudio + Claude (brainstorming session)
**Parent spec:** `2026-06-09-node-owner-revenue-view-design.md` § ② Node Earnings tab

---

## Goal

Re-source the Node Earnings tab (`/nodes?view=<hash>&tab=earnings`) and the panel
sparklines from the client-side credit-expense reconstruction onto the
authoritative rewards layer shipped in Phase 1A (Decision #111). After this
migration:

1. **KPI, chart, and reconciliation include the wage subsidy** (~18–22% of
   node-owner revenue, invisible today) and can't drift from the protocol's real
   algorithm (`algoVersion v3`).
2. **No surface outside `/credits` touches the whole-network expense feed.**
   Today the tab fetches the full feed for current + previous windows
   (24h ≈ 112MB each), and opening any network-graph CRN/CCN panel or the
   `/nodes` quick-peek panel triggers the same fetch via `NodeEarningsSpark` →
   `useNodeEarnings(hash, "24h")`.
3. The hardcoded `CRN_SHARE = 0.6` per-VM scaling is replaced by the realized
   share derived from the authoritative feed.

Re-sourcing `useNodeEarnings` automatically re-sources the sparks, **absorbing
Phase 2's ④ "network detail panel sparklines" item**.

## Verified API facts (probed live, 2026-06-11)

- **api2 `tags=` filtering works** on `messages.json`: `tags=type_execution`
  returns only execution-tagged expense messages (2,671 total vs 2,503 storage
  since May 1; tags consistent across samples).
- **Byte split is storage-dominated:** 24h execution-only ≈ **10MB**, storage ≈
  104MB. Execution-only ≈ 70MB at 7d, ≈ 300MB at 30d (still too heavy — hence
  the tiered strategy below).
- **`/rewards/time-series` per-bucket `detail=2` works:** each bucket carries
  `totals` + `bySource` + `full` per-role splits, sparse-keyed exactly like the
  totals path (missing keys when a source is zero — must go through the same
  dense normalization).
- **The credit API has no per-node endpoint** (checked swagger: `/payment`,
  `/provider`, `/estimation/*`, `/rewards/time-series` only) — per-node
  attribution must be derived client-side.

## Key insight — who needs weights at all

Per-bucket apportionment for a CRN = address bucket `execution_crn`
(credit_revenue + holder_tier) + `wage.crn`, × this CRN's share of the address's
execution. For an address with **one CRN, the share is 1** — the chart is exact
from the rewards API alone, no expense data needed. Weights only matter for
multi-node reward addresses. The **per-VM table** is the only surface that
inherently needs execution entries (VM-grain data the rewards API doesn't have).

## Decisions

1. **Tiered accuracy by range.** 24h/7d fetch execution-only expenses → exact
   per-bucket weights + full-range per-VM table. 30d skips the full-window
   expense fetch: weights fall back to the live `vmCount` proxy (same as the
   owner view, Decision #112) and the per-VM table covers the trailing 7d with a
   caption. KPI/chart totals are exact at every range (rewards API).
2. **Render early, refine.** The chart renders as soon as rewards buckets arrive
   (proxy weights for multi-node addresses) and re-shapes when exact weights
   land. Single-node addresses — the common case — never see the reshape.
3. **Approach: re-source inside `useNodeEarnings`, keep its contract.** The hook
   keeps its name and `NodeEarnings` return shape (plus additive fields);
   components and the spark migrate in one place. Rejected: a new parallel hook +
   new components (duplicates working presentation), and reusing
   `useOwnerRewards` (cycle-centric, unbucketed — wrong shape for a
   range-selected tab).

## Architecture

### Client functions

- **`getRewardsTimeSeries(address, fromSec, toSec, bucketSize?)`**
  (`src/api/rewards-client.ts`): optional `bucketSize` param; when provided,
  parse the response `buckets[]` through the same sparse→dense normalization as
  the totals path and return `buckets: RewardsBucket[]` (`{ startSec, endSec,
  aleph, bySource, full }`) alongside the existing totals. Wallet callers pass
  nothing — untouched. Bucket sizes: `1h` for 24h, `1d` for 7d/30d
  (UTC-calendar-aligned; first/last buckets may be `partial` — the chart renders
  what the API returns). Window bounds stay hour-truncated (`toHourBound`) for
  the API's hour-cache.
- **`getExecutionExpenses(startSec, endSec)`** (`src/api/client.ts`): same
  `messages.json` query as `getCreditExpenses` + `tags=type_execution` +
  `AbortSignal.timeout(60_000)`. Reuses `parseCreditMessage`.

### Hooks

- **`useRewards`** gains a bucketed variant (bucketSize in the query key). The
  previous-window delta needs only a total → stays a cheap `bucketSize: "1y"`
  query.
- **New `useExecutionExpenses(startSec, endSec, { enabled })`**: in-memory React
  Query only — **excluded from the persisted localStorage cache** (tens of MB
  don't belong there). Stable hour-aligned window timestamps so keys dedupe.
- **`useNodeEarnings(hash, range, opts?)`** rewritten internally:
  - Resolve role + reward address from `nodeState` (as today).
  - **CRN:** bucketed `useRewards` (current window) + total-only `useRewards`
    (previous window) + `useNodes` (vmCount proxy) + `useNode(hash)` (VM-count
    secondary line via `replayVmCountTimeline`, unchanged) +
    `useExecutionExpenses` — enabled only at 24h/7d (full window) or 30d
    (trailing-7d window, per-VM table only).
  - **CCN:** bucketed `useRewards` + score weights from `nodeState`. No
    execution fetch at all. Linked-CRNs table unchanged.
  - **`opts.weights: "proxy"`** disables the execution fetch entirely — used by
    `NodeEarningsSpark`, so panels never trigger a heavy fetch and the sparks
    now include wage.
  - Additive return fields: `bySource` (node-level, for the KPI bar),
    `weightsExact: boolean` (drives the refine hint).

### Apportionment (pure, `src/lib/reward-apportionment.ts`)

- **`computeBucketWeights(entries, ownedCrnHashes, bucketBounds)`** — per-bucket
  execution ALEPH per owned CRN from `node_id` attribution.
- **`apportionNodeBuckets(...)`** — per bucket: node share of
  `(credit_revenue + holder_tier).execution_crn + wage.crn` by that bucket's
  exec weight (CRN), or of `execution_ccn + storage_ccn` (both sources)
  `+ wage.ccn` by score weight (CCN). Reuses the existing `distribute()`
  zero-weight even-split fallback. Single-node addresses get share = 1
  mathematically.
- **KPI total = sum of apportioned buckets** — chart and KPI reconcile by
  construction. By-source = per-bucket per-source sums.
- **Previous-window delta:** prev total apportioned with the current window's
  aggregate weights (prev-window exec data isn't fetched — doubling the payload
  for a delta isn't worth it; exact for single-node addresses regardless).
- **Per-VM table:** execution entries filtered to `nodeId === hash`, scaled so
  the table sums to the node's API-sourced execution earnings
  (`factor = nodeExecEarned / rawExecSum`) — replaces `CRN_SHARE = 0.6` with the
  realized share. At 30d, one extra cheap total-only rewards query over the
  trailing-7d sub-window supplies that factor.
- **Reconciliation card** re-fed entirely from the address's `full` role totals
  (CRN bucket = exec_crn both sources + wage.crn; CCN bucket = exec_ccn +
  storage_ccn both sources + wage.ccn; staking = staker keys + wage.staker;
  this-node from apportionment; counts from `nodeState` owned lists). The
  network-wide `recipients` scan is gone.

## UI

- **KPI "ALEPH accrued" + inline by-source bar (treatment A):** 3-segment bar
  (🟢 credits · 🟣 holder · 🟡 wage) + caption directly beneath the KPI value, on
  both CRN and CCN tabs. Extract the wallet's existing source bar into a shared
  local composition `src/components/reward-source-bar.tsx` (dashboard-local like
  `MobileTableCardRow`, not DS — domain-colored reward semantics) so wallet and
  tab can't drift.
- **Chart refine hint:** a quiet one-liner under the chart ("Refining node
  split…") only while `role === "crn"` ∧ multi-node address ∧ weights still
  proxy.
- **Per-VM table:** skeletons until the execution fetch lands; Payment column
  and inline VM names unchanged. At 30d, caption: "Per-VM detail covers the last
  7 days."
- **Footnote copy:** figures are **owed** (accrued from the protocol's
  authoritative rewards feed), wage subsidy included (decays over time),
  per-node figures apportioned for multi-node addresses.
- Range-switch scoped skeletons (Decision #92, `isPlaceholderData`) keep
  working, threaded from the rewards queries.
- Role-aware empty states unchanged.

## Error handling

- **Rewards API down:** explicit tab-level error state ("Rewards feed
  unreachable") instead of indefinite skeletons — it's the primary source now.
- **Execution fetch timeout/failure:** graceful degrade — chart stays on proxy
  weights, per-VM table shows "Per-VM detail unavailable (expense feed timed
  out)". Headline numbers are never blocked by the heavy fetch.

## Cleanup (Replace, don't deprecate)

- `use-node-earnings.ts`: drop `useCreditExpenses`, `computeDistributionSummary`
  usage, `CRN_SHARE`.
- `credit-distribution.ts`: remove `SummaryOptions` / `perNodeBuckets` /
  `perVmInWindow` + their types (verified: no consumer besides this hook). The
  rest stays for the credits page until Phase 2.
- After this, only `/credits` fetches the whole-network expense feed.

## Testing

- **Pure lib:** bucket parsing (sparse → dense), `computeBucketWeights`,
  `apportionNodeBuckets` (single-node exact, multi-CRN weighted, zero-weight
  even-split fallback, CCN score-weighted, wage inclusion), per-VM scaling
  factor.
- **Hook:** tiered behavior (30d → no full-window exec fetch, trailing-7d table
  window; proxy mode → no exec fetch at all), `weightsExact` transitions, delta
  from the prev-window query.
- **Components:** by-source bar render, 30d caption, refine hint gating, error
  states. Mock at the client boundary, as today.

## Out of scope

- **③ Credits page migration** (recipient table batching, flow diagram, summary
  cards) — Phase 2. `/credits` keeps the old reconstruction and its 30d latent
  hang risk until then.
- api2 WebSocket subscription to distribution messages (Phase 2, additive).
- A server-side execution aggregate (would obsolete the bounded fetch; ask
  backend if 30d-exact ever becomes a real need).
