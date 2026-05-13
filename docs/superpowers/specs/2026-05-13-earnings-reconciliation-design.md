# Earnings tab — reward address reconciliation

**Status:** Spec
**Date:** 2026-05-13
**Source:** Backlog item *Earnings tab: distribution reconciliation view* (Decision #90 follow-up).

## Problem

Node owners typically use one reward address across multiple nodes, and some also stake with that same address to compound rewards. The current Earnings tab (`/nodes?view=<hash>&tab=earnings`) shows what one specific node earned in a trailing window — but the operator has no in-context view of how that slice fits into what the reward address actually received in total during the same window.

The reconciliation panel answers: *"This node earned X.XX ALEPH. Your reward address (which also funds other nodes / stakes) earned Y.YY ALEPH in total. Here is the split."*

## Goal

Add a "Reward address breakdown" Card to the Earnings tab on both CRN and CCN node detail views that decomposes the reward address's window earnings into four buckets, anchored on "this node."

## Non-goals

- Per-node drilldown beyond the four buckets — `/wallet?address=` already provides the full per-node, per-role view.
- Cross-window comparison (current vs previous window) on the reconciliation buckets — the KPI row already does this for the node's own ALEPH; bucket-level deltas add complexity for marginal value. Punted to backlog.
- Historical reconciliation — same window as the Earnings tab's `?earningsRange=`.
- Per-VM source attribution — out of scope; this is a wallet-context view, not a revenue-source view.

## Feature

A `Card` sits between `NodeEarningsChart` and the per-VM / linked-CRN breakdown table on both `node-earnings-tab.tsx` and `node-earnings-tab-ccn.tsx`. It contains:

1. **Header row** — title "Reward address breakdown" + reward address as `CopyableText` + total ALEPH earned by that address in the window + range label echoing `?earningsRange=`. "View full wallet →" link aligned right, target `/wallet?address=<rewardAddr>`.
2. **Stacked horizontal bar** — `h-7`, `rounded-md`, four segments sized proportionally by ALEPH.
3. **Label row** — four stat blocks below the bar, each with a colored swatch, label, ALEPH amount (2 decimals), and percentage.

### Bucket model

Always four buckets, identical structure across CRN and CCN views:

| Bucket | CRN view | CCN view |
|---|---|---|
| This node | Execution rewards on this CRN's VMs in the window | This CCN's score-weighted share in the window |
| Other same-kind | Sum of all other CRNs paying this reward address | Sum of all other CCNs paying this reward address |
| Cross-kind | CCN-pool earnings on this reward address | CRN-pool earnings on this reward address |
| Staking | `stakerRewards.get(rewardAddr)` for the window | Same |

The "Other same-kind" label also includes the count of distinct nodes (e.g. `Other CRNs (3)`) so the operator knows the breadth of their portfolio.

### Visual

```
┌─ Reward address breakdown ─────────────────────── View full wallet → ┐
│  0xABC…1234 · 14.28 ALEPH earned in 24h                              │
│                                                                      │
│  [█████████████████ │ ██████ │ ████ │ ██]                            │
│   ● This node     ● Other CRNs (3)   ● CCN ops      ● Staking        │
│     7.42 (52%)        3.18 (22%)       2.40 (17%)     1.28 (9%)      │
└──────────────────────────────────────────────────────────────────────┘
```

**Segment colors:**
- *This node*: kind color at full saturation (`--color-success-500` for CRN, `--color-primary-500` for CCN). Matches the chart's primary line so the visual link is obvious.
- *Other same-kind*: kind color at `fillOpacity=0.45`.
- *Cross-kind*: the *other* kind's color at full saturation.
- *Staking*: `--color-warning-500` (amber), matching the network-graph staker overlay convention.

**Bar mechanics:** `flex` row, segments `flex-grow` proportional to ALEPH, minimum width 4px per non-zero segment so slivers stay visible. Hover on any segment dims the others to 0.5 opacity (matches credits page flow diagram interaction). No tooltips on the segments — the label row carries the numbers.

### No-overlap state

When `otherSameKind.aleph + crossKind.aleph + staker === 0`, the panel collapses to a one-liner caption:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Reward address breakdown                                            │
│  0xABC…1234 earned only from this node in the last 24h.              │
│                                        View full wallet →            │
└──────────────────────────────────────────────────────────────────────┘
```

This confirms the no-overlap state explicitly rather than hiding the panel (which could read as a load failure).

### Empty / null state

When the reward address has zero earnings across all four buckets (e.g. the node earned nothing this window and isn't part of any pool), `reconciliation` is `null` and the panel does not render. The Earnings tab's own zero-state already covers the empty-window case.

## Architecture

### Data layer

`computeDistributionSummary` (in `src/lib/credit-distribution.ts`) already emits `summary.recipients: RecipientTotal[]`, where each entry has:

```ts
type RecipientTotal = {
  address: string;
  roles: RecipientRole[];
  totalAleph: number;
  crnAleph: number;
  ccnAleph: number;
  stakerAleph: number;
  crnCount: number;   // CRNs registered to this reward address
  ccnCount: number;   // CCNs registered to this reward address
};
```

The reconciliation reads the recipient entry matching this node's reward address. **No changes to the distribution math are required.**

`getRewardAddress(node)` is currently a non-exported function in `credit-distribution.ts` and resolves `node.reward || node.owner`. It needs to be exported so the hook can use it.

### Hook

Extend `useNodeEarnings(hash, range)` to return an additional `reconciliation` field:

```ts
type Reconciliation = {
  rewardAddr: string;
  windowAleph: number;             // sum of all four buckets
  thisNode: number;
  otherSameKind: { aleph: number; count: number };
  crossKind: { aleph: number; role: "crn" | "ccn" };
  staker: number;
} | null;
```

Compute steps (inside the existing `useMemo` that derives the rest of the earnings):

1. Resolve `rewardAddr` via `getRewardAddress(node)` where `node` is the loaded CRN or CCN.
2. Find the matching recipient: `recipient = summary.recipients.find(r => r.address === rewardAddr)`. If absent, return `null` — the reward address earned nothing in the window.
3. For a **CRN view**:
   - `thisNode = summary.perNode.get(hash) ?? 0`
   - `otherSameKind = { aleph: recipient.crnAleph − thisNode, count: Math.max(0, recipient.crnCount − 1) }`
   - `crossKind = { aleph: recipient.ccnAleph, role: "ccn" }`
4. For a **CCN view**:
   - `thisNode` = the score-weighted share for this CCN in the window (already computed in `useNodeEarnings` from `perNodeBuckets`)
   - `otherSameKind = { aleph: recipient.ccnAleph − thisNode, count: Math.max(0, recipient.ccnCount − 1) }`
   - `crossKind = { aleph: recipient.crnAleph, role: "crn" }`
5. `staker = recipient.stakerAleph`
6. `windowAleph = thisNode + otherSameKind.aleph + crossKind.aleph + staker`. Return the populated object.

Counts come straight from `recipient.crnCount` / `recipient.ccnCount` — these tally all nodes registered to the reward address (regardless of whether each earned in the window). That's the right semantic for the "Other CRNs (3)" label: it answers "how many of your nodes contribute to this address" rather than "how many earned this window."

The existing `useNodeEarnings` already calls `computeDistributionSummary` for the current window. No additional API or summary call required.

### Components

**New:** `src/components/node-earnings-reconciliation.tsx` (presentational)

- Props: `{ reconciliation: Reconciliation; range: EarningsRange; kind: "crn" | "ccn" }`.
- Renders Card with header, bar, label row, and link. Handles no-overlap caption when `otherSameKind.aleph + crossKind.aleph + staker === 0` and returns `null` when `reconciliation === null`.
- Pure component — all data shaping happens in the hook.

**Modify:** `src/components/node-earnings-tab.tsx` — insert `<NodeEarningsReconciliation>` between `<NodeEarningsChart>` and the per-VM table.

**Modify:** `src/components/node-earnings-tab-ccn.tsx` — insert at the same slot, between chart and linked-CRN table.

**Modify:** `src/hooks/use-node-earnings.ts` — compute and return the `reconciliation` field.

**Modify:** `src/lib/credit-distribution.ts` — export `getRewardAddress`.

## Loading state

Skeleton bar (single grey `h-7 rounded-md` strip) + four skeleton stat blocks. Matches the loading pattern used by the KPI row above it. Driven by `useNodeEarnings`'s existing `isLoading` flag — no separate loading state.

## Testing

`use-node-earnings.test.tsx` (extend):
- Reward address has overlap → returns populated `reconciliation` with non-zero buckets.
- Reward address has no overlap (only this node earns) → `reconciliation` populated, `otherSameKind.aleph === 0 && crossKind.aleph === 0 && staker === 0`.
- Reward address has zero earnings in the window → `reconciliation === null`.
- CRN view with cross-kind earnings → `crossKind.role === "ccn"` and aleph populated.
- CCN view with cross-kind earnings → `crossKind.role === "crn"` and aleph populated.
- `otherSameKind.count === max(0, recipient.crnCount − 1)` on a CRN view (equivalent on CCN); equals 0 when the reward address only operates the current node.

`node-earnings-reconciliation.test.tsx` (new):
- Renders bar segments with widths proportional to bucket values.
- Renders no-overlap caption when only `thisNode > 0`.
- Returns `null` (no DOM) when `reconciliation === null`.
- Wallet link `href` is `/wallet?address=<rewardAddr>`.
- Reward address renders inside `CopyableText`.
- Label row shows correct labels for CRN view (`Other CRNs`, `CCN ops`) and CCN view (`Other CCNs`, `CRN ops`).

## Edge cases

1. **Reward address differs across operator's nodes.** Reconciliation is *per reward address*. If an operator splits rewards across multiple addresses, each Earnings tab reconciles against its own address. The happy path described in the problem statement is the common case; the split-reward case still produces correct (just narrower) numbers.
2. **This node earned 0 in the window but the reward address earned elsewhere.** `thisNode = 0`; other buckets populated. Bar renders without a "This node" segment; the label row still shows it as `0.00 ALEPH (0%)`. Operator sees this node contributed nothing while the wallet earned from other sources — useful diagnostic.
3. **All-zero window for the reward address.** `reconciliation === null`; panel not rendered. Earnings tab's own empty state handles the messaging.
4. **No explicit `reward` field on the node.** `getRewardAddress` falls back to `owner`. The reconciliation works against the owner address — no special handling needed.

## Out of scope (filed in backlog)

- **Bucket-level previous-window deltas** (e.g. "This node ▲ +2% vs prev, Other CRNs ▼ −5%"). Requires a second `computeDistributionSummary` over the previous window with role-map output. Defer.
- **Per-node drilldown inside the bar.** The "View full wallet →" link is the drilldown surface; `/wallet?address=` already lists all rewards per role.
- **Server-side reward-address index.** Currently we iterate `nodeState` to count other same-kind nodes — fine at current scale (~2000 nodes), would only matter if scale grows by an order of magnitude.

## Files touched

- `src/lib/credit-distribution.ts` — export `getRewardAddress`.
- `src/hooks/use-node-earnings.ts` — compute `reconciliation`.
- `src/hooks/use-node-earnings.test.tsx` — extend tests.
- `src/components/node-earnings-reconciliation.tsx` — new presentational component.
- `src/components/node-earnings-reconciliation.test.tsx` — new test file.
- `src/components/node-earnings-tab.tsx` — slot reconciliation between chart and per-VM table.
- `src/components/node-earnings-tab-ccn.tsx` — slot reconciliation between chart and linked-CRN table.
- `docs/ARCHITECTURE.md` — note the new component and its data flow.
- `docs/DECISIONS.md` — log the design choices (bucket model, placement, no-overlap caption).
- `docs/BACKLOG.md` — move item to Completed, add deferred items (bucket-level deltas).
- `CLAUDE.md` — update Current Features description of the Earnings tab.
- `src/changelog.ts` — bump minor version + add entry.
