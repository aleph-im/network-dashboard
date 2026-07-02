# Wallet Revenue History (by-source, month-over-month) — Design

**Date:** 2026-07-02
**Status:** Approved (brainstorm complete) — ready for implementation plan
**Author:** Claudio + Claude (brainstorming session)

---

## Goal

Give node owners a **month-over-month, by-source** view of their reward accrual so
"why did my number change?" answers itself.

Motivating incident (2026-07-01): a confidential-node operator saw his owed rewards
jump ~38% (USD-normalized) May→June while his VM counts stayed flat, and couldn't
explain it. Pulling the authoritative feed showed the entire increase was the
**holder-tier** stream (protocol subsidy for hosting legacy holder-tier VMs), which
switched on ~May 11–14 and ramped through June — `credit_revenue` and `wage_subsidy`
were flat. The current wallet view only shows **"owed this cycle"** (a single live
window that resets on distribution), so there is no in-product way to see that a jump
came from a source shift rather than the operator's own workload. This view closes
that gap.

The existing `WalletRevenueCard` answers *"what am I owed right now, and from where."*
This view answers *"how has that composition moved across months."*

## Scope

**v1 (this effort):**
- A new **"Node revenue history"** card on the Wallet page (`/wallet?address=0x…`),
  directly below `WalletRevenueCard`, same per-address aggregate scope.
- **Stacked monthly bars** of reward accrual split by source
  (Credits / Holder / Wage subsidy), one bar per calendar month since data start,
  in **ALEPH**.
- Hover a month → exact per-source ALEPH + month total.

**Explicit non-goals for v1** (see Phase 2):
- No per-node-over-time breakdown (the current-cycle card already does per-node for
  "now"; per-bucket per-node apportionment is the expensive path and unnecessary for
  the diagnostic).
- No range selector / daily granularity — monthly is the deliberate grain that makes
  the month-over-month story legible.
- No USD denomination (needs a historical ALEPH price source we don't have).
- Not added to the Node Earnings tab (it has its own range selector + chart).

## Data source (verified live 2026-07-02)

Reuses the existing `getRewardsTimeSeries` client (`src/api/rewards-client.ts`) — the
same authoritative feed the rest of the rewards layer reads
(`GET https://credit.aleph.im/api/v0/rewards/time-series`, documented in
`docs/superpowers/specs/2026-06-09-node-owner-revenue-view-design.md`).

**Single query** covers the whole history:
`getRewardsTimeSeries(address, DATA_START_SEC, nowSec, "1mo")`.

- The API's **`1mo` bucketSize** returns UTC-calendar-aligned monthly buckets in one
  response. Verified live: for `0x795d…` it returns three buckets — May (full), June
  (full), July (`2026-07-01 → now`, partial) — each with `totals.aleph` and
  `bySource: { credit_revenue, holder_tier, wage_subsidy }`.
- **`DATA_START` = 2026-05-01T00:00:00Z.** The feed has no data before this (credits
  launched then), so the history simply *is* "every month since May 2026" — today
  that is 3 bars, growing one bar per month. No sliding window needed.
  - `DATA_START_SEC` currently lives privately in `src/hooks/use-owner-rewards.ts:12`.
    **Extract it** to a shared module (alongside the rewards client or a small
    `src/api/rewards-constants.ts`) so both hooks reference one source of truth.
- The hook reads **only each bucket's `bySource`** — the history is a per-address
  aggregate, so no per-role `full` split, no api2 expense fetch, no per-node
  apportionment. `getRewardsTimeSeries` already returns `bySource` on every bucket
  (it sends `detail=2` internally); the hook simply ignores `full`. No client change.
- The current (partial) month bucket ends at "now", not month-end. The hook flags it
  `partial: true` for distinct rendering (below).

Past months are immutable; only the current month's bucket changes. `staleTime` can be
long (e.g. 1h) — no need to poll aggressively.

## Architecture

Three small, independently-testable units.

### 1. Hook — `useOwnerRewardsHistory(address)`

`src/hooks/use-owner-rewards-history.ts`. Fires the single monthly-bucketed query and
maps the response to a typed month list.

```
type MonthlyReward = {
  startSec: number;     // bucket start (UTC month boundary)
  label: string;        // e.g. "May", "Jun", "Jul" (year appended when it rolls over)
  bySource: BySource;   // { credit_revenue, holder_tier, wage_subsidy }
  total: number;        // ALEPH
  partial: boolean;     // true for the in-progress current month
};
```

Returns `{ months: MonthlyReward[], isLoading, isError }`. Query key
`["owner-rewards-history", address]`. Disabled when `address` is empty/invalid.
Excluded from the scheduler-WS invalidation set (sources from credit.aleph.im, like
the other rewards hooks).

### 2. Presentational chart — `RewardHistoryChart`

`src/components/reward-history-chart.tsx`. A bespoke SVG stacked-bar chart, matching
how this codebase already builds charts (`Sparkline`, `DualLineChart`,
`node-earnings-chart`). Props: `months: MonthlyReward[]`, plus hover state.

- One vertical **stacked bar per month**, segments ordered Credits → Holder → Wage
  subsidy (bottom→top), colored with the **exact `RewardSourceBar` vocabulary**:
  `credit_revenue`→`success-500`, `holder_tier`→`primary-500`,
  `wage_subsidy`→`warning-500`. Bars share a common y-scale (max month total).
- The **partial current month** is visually distinguished (reduced fill opacity +
  an "MTD" tick/label) so a 2-day bar is never misread as a collapse.
- Hover a bar → crosshair/emphasis + a floating tooltip card (reusing the
  `node-earnings-chart` tooltip idiom): month label, per-source ALEPH, month total.
- Respects `prefers-reduced-motion`; SVG-only, no chart lib dependency.

### 3. Card composition — `WalletRevenueHistoryCard`

`src/components/wallet-revenue-history-card.tsx`. Owns title, the chart, a legend
(reuse the `RewardSourceBar` swatch/label vocabulary — the two components must speak
the same language), and the loading/empty/error states. Rendered on the wallet page
directly beneath `WalletRevenueCard`, gated on the same `address`.

## Visual design

```
Node revenue history · ALEPH

  600k ┤                   ▓▓▓
       │                   ▓▓▓
  400k ┤          ███      ▓▓▓
       │          ███      ███
  200k ┤   ▓▓▓    ███      ███   ░░
       │   ███    ███      ███   ░░  ← MTD (partial, dimmed)
    0k ┼──────────────────────────────
        May      Jun       Jul
  ● Credits   ● Holder   ● Wage subsidy
```

Bars stacked bottom→top Credits/Holder/Wage. Latest full month reads the composition
shift at a glance; hover gives exact numbers. Legend uses the shared source vocabulary.

## Denomination

**ALEPH for v1.** App-native, no new dependency, and the by-source split alone answers
"why did the number change." A **USD lens** (which is what let the operator separate
real change from price noise) is the natural Phase-2 toggle but needs a per-month
historical ALEPH→USD price source the app doesn't currently carry — deferred, not
designed out.

## States

- **Loading:** skeleton in the chart area (single query, so one skeleton).
- **Empty:** address has zero rewards across all months → "No reward history yet."
  (Distinct from the wallet having no rewards at all, in which case
  `WalletRevenueCard` already renders nothing and this card also returns `null`.)
- **Single month:** a brand-new address with only one data-month still renders its one
  bar; the month-over-month narrative simply isn't there yet — acceptable, no special
  case.
- **Error:** feed unreachable → the existing "Rewards feed unreachable" degrade copy,
  matching the other rewards surfaces (never render `0`s as if real).

## Testing

- **`useOwnerRewardsHistory`:** window derivation (`DATA_START_SEC` → now), maps
  `1mo` buckets → `MonthlyReward[]`, flags the current month `partial`, year-rollover
  labels, empty/disabled address. Mock the client boundary; add a `1mo` fixture from
  the live sample captured this session.
- **`RewardHistoryChart`:** renders N bars with correct per-segment proportions;
  partial-month styling applied to the last bar only; tooltip content on hover;
  reduced-motion path.
- **`WalletRevenueHistoryCard`:** loading / empty / error / single-month states;
  legend matches `RewardSourceBar` vocabulary.
- Reuse existing rewards-client test patterns.

## Out of scope (Phase 2 — log to BACKLOG on ship)

- **USD lens** toggle (historical price source).
- **Per-node-over-time** history (per-bucket apportionment).
- **Month-over-month delta caption** (e.g. "+188% vs May") — small additive follow-up
  once the base chart lands, if operators want the number called out explicitly.
- History on the **Node Earnings tab**.
- Capping/scrolling when the bar count grows large (revisit past ~18 months; a non-
  issue for a year-plus).

## Relationship to prior work

- Builds directly on the rewards data layer from
  `2026-06-09-node-owner-revenue-view-design.md` (feed, `getRewardsTimeSeries`,
  `DATA_START`, `BySource`). No new API surface.
- Vocabulary aligned with the **"Min. wage" → "Wage subsidy"** relabel + decay tooltip
  (branch `fix/wage-subsidy-label`): this view uses **"Wage subsidy"** throughout and
  reuses the `RewardSourceBar` colors/labels so the two never drift.

## Open questions (non-blocking)

1. **Legend/label placement** — inline caption under the chart (like `RewardSourceBar`)
   vs. a small side legend. Resolve during implementation from the actual layout.
2. **Bar count over time** — fine for the foreseeable future (monthly); revisit only
   if it ever exceeds ~18 bars.
