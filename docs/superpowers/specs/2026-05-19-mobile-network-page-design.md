# Mobile network page — portrait summary

## Background

The `/network` page renders a force-directed graph of the Aleph network on desktop (`≥ md`). Below `md`, the existing code renders a portrait fallback that lists the first 50 CCN labels with no detail, no CRNs, no geo, no reward addresses, and broken click-through — each row links to `/network?focus=<id>` but the graph isn't rendered below `md`, so the focus state is invisible and the user is stranded.

The mobile audit spec (`2026-05-18-mobile-audit-design.md`) treated the portrait `/network` page as out of scope. This spec fills that gap.

## Goal

Make the portrait `/network` page a useful **network overview** — not a graph stand-in. Tell the network story (who's on it, where they are, who runs the most nodes) through three stacked sections, with click-through to working detail pages where they exist, and a quiet hint nudging users to rotate the device for the full relational graph.

## Scope

**In scope (`< md`):**
- Replace the current 50-CCN list with three sections: CCNs / Top countries / Top reward addresses
- Persistent "↻ Rotate device for full network graph" hint at the top of the scrollable area
- Click targets:
  - CCN row → `/nodes?view=<hash>`
  - Reward address row → `/wallet?address=<addr>`
  - Country row → not clickable (no detail page exists for countries)
- Per-section "See all N →" expand-in-place toggle (no pagination, no route change)
- Drop the redundant local `<h1>Network</h1>` + subtitle — `PageHeader` already shows "Network Graph"

**Out of scope:**
- Search on the portrait page (the surface is now "overview", not "operations triage")
- A dedicated country detail page or panel
- Top stakers and top CRNs sections (CRNs are implicitly covered by the CCN section's CRN-count subline)
- Orientation lock, forced rotation, dismissable banners, or animated rotate icons
- Honoring graph URL state (`?selected`, `?focus`, `?address`, `?layers`) on portrait — silent on this view; landscape picks up the state via the existing media query
- Desktop graph code — untouched

## Layout

```
┌──────────────────────────────┐  PageHeader  (existing)
│  Network Graph            ☰  │
├──────────────────────────────┤
│  ↻ Rotate device for full   │  rotate hint
│    network graph             │
├──────────────────────────────┤
│  CCNs · 42                   │  section header
│  aleph-cloud-eu-01           │
│  🇫🇷 · 4 CRNs · 1.20M ALEPH ●│  row (StatusDot right)
│  …                           │
│  See all 42 →                │  expand toggle (visible if total > 10)
├──────────────────────────────┤
│  TOP COUNTRIES · 12          │
│  🇫🇷 France                  │
│  18 nodes · 4 CCNs · 14 CRNs │
│  …                           │
│  See all 12 →                │
├──────────────────────────────┤
│  TOP REWARD ADDRESSES · 28   │
│  0xA12f…9b3e               → │
│  CRN: 5 · CCN: 1             │
│  …                           │
│  See all 28 →                │
└──────────────────────────────┘
```

## Component architecture

The desktop graph code stays untouched. All changes scoped to the portrait block.

### New file: `src/components/network/network-mobile-summary.tsx`

Props:

```ts
type Props = {
  fullGraph: Graph;
  nodeState: NodeState | undefined;
  isLoading: boolean;
};
```

Owns:
- The rotate hint (one line, `text-muted-foreground` with the `ArrowsClockwise` Phosphor icon)
- Three subcomponents — `<CcnSection>`, `<CountrySection>`, `<RewardSection>` — defined inline in the same file, not exported
- Per-section "See all" expand state: one local `useState<{ ccns: boolean; countries: boolean; rewards: boolean }>` flag

### `src/app/network/page.tsx` change

The existing portrait block (lines 142–169 in the current file) is replaced with:

```tsx
<div className="md:hidden">
  <NetworkMobileSummary
    fullGraph={fullGraph}
    nodeState={nodeState}
    isLoading={isLoading}
  />
</div>
```

The desktop block, the floating detail panel, the address panel, and all callbacks remain unchanged.

### Helper file: `src/lib/network-mobile-aggregates.ts`

Two pure functions, easy to unit-test:

```ts
type CountryAggregate = {
  iso: string;
  name: string;        // from country-centroids.json
  total: number;       // CCN + CRN
  ccns: number;
  crns: number;
};

export function aggregateCountries(graph: Graph): CountryAggregate[];

type RewardAggregate = {
  address: string;     // lowercased
  total: number;       // CCN + CRN
  ccns: number;
  crns: number;
  totalStaked: number; // in ALEPH, for tiebreaker only — sum of totalStaked across each CCN reward-credited to this address
};

export function aggregateRewards(
  graph: Graph,
  nodeState: NodeState | undefined,
): RewardAggregate[];
```

Both return arrays sorted by node count desc, with secondary sorts as described in Data flow.

## Data flow

All data sources from the same `useNetworkGraph()` call the desktop view already makes. **No new API calls, no new React Query keys, no new hooks.**

### CCN section

- Source: `fullGraph.nodes.filter(n => n.kind === "ccn")`
- Per row:
  - Name: `n.label`
  - Flag: `n.country` → `countryFlag(iso)` from `src/lib/country-flag.ts` (existing util; falls back to no flag if `n.country == null`)
  - CRN count: `nodeState?.ccns.get(n.id)?.resourceNodes?.length ?? 0`
  - Staked total: `nodeState?.ccns.get(n.id)?.totalStaked ?? 0`, rendered as `${formatAleph(staked)} ALEPH` (from `src/lib/format.ts` — `formatAleph(1_200_000)` → `"1.20M"`)
  - `nodeState` is `NodeState | undefined` (still loading) — when undefined, the section shows the loading state described below
  - Status dot: `dotStatusFor(n)` (returns `"healthy" | "degraded" | "error" | "offline" | "unknown"`). **Note:** this helper is currently a private function inside `src/components/network/network-detail-panel.tsx`. As part of this work, export it from `network-detail-panel.tsx` (or relocate it to `src/lib/network-graph-model.ts` alongside the related types) so the mobile summary can reuse it. The implementation plan picks the location.
- Sort: score desc (from `nodeState.ccns.get(n.id)?.score ?? 0`), then CRN-count desc
- Click: `<Link href={\`/nodes?view=${n.id}\`}>` (existing CCN detail route)
- Visible limit: 10. "See all 42 →" expands inline.

### Top countries section

- Source: `aggregateCountries(fullGraph)`
- Per row:
  - Flag: `countryFlag(iso)`
  - Name: from `country-centroids.json` (existing import path used by the geo layer)
  - Subline: `${total} nodes · ${ccns} CCNs · ${crns} CRNs`
- Sort: total desc, name asc tiebreaker
- Not clickable — renders as a plain `<div>`
- Visible limit: 10.

### Top reward addresses section

- Source: `aggregateRewards(fullGraph, nodeState)`
- Per row:
  - Address: `truncateHash(addr)` from `src/lib/format.ts` — `0xA12f…9b3e` format (the existing util is hash-agnostic; it works on addresses)
  - Subline: role chips (`CRN: N`, `CCN: M`) rendered as DS `Badge fill="outline" size="sm"`
  - Right-side arrow: `→` chevron muted
- Sort: total desc, totalStaked desc tiebreaker
- Click: `<Link href={\`/wallet?address=${addr}\`}>` (existing wallet route, works on mobile per the mobile audit)
- Visible limit: 10.

## States

| State | Render |
|-------|--------|
| `isLoading === true` | Section headers + 3 row-skeletons each (existing `<Skeleton>`) |
| Loaded, has data | Section headers with counts + top 10 rows + "See all N" if total > 10 |
| Loaded, section is empty (e.g. no country attribution yet) | Section header + muted "No data yet" line |
| Loaded, "See all" expanded | Full list + "Show less" toggle |

## URL state on portrait

The desktop view uses `?selected`, `?focus`, `?address`, `?layers` to control the graph. On portrait, these params are **silent** — the summary renders the same regardless. If the user rotates to landscape (viewport ≥ `md`), the desktop block picks up that state instantly via the existing media query.

Rationale: any "smart" portrait behavior (auto-redirect `?selected=` to `/nodes?view=`, scroll-to-match for `?address=`, etc.) adds surprise without much value at this fidelity. The rotate hint covers the gap.

## Accessibility

- CCN and reward rows render as DS `<Link>` → keyboard tab order and focus rings work for free
- Country rows are plain `<div>` (not interactive) — no role override needed
- No animation in this view, so no `prefers-reduced-motion` branch
- Section headers use `<h2>` for proper document outline; the rotate hint is a `<p>` with the icon inside

## Testing

- Unit tests for `aggregateCountries` and `aggregateRewards` in `src/lib/network-mobile-aggregates.test.ts`:
  - Empty graph → empty arrays
  - Single CCN + CRN with the same country → 1 country with `total: 2, ccns: 1, crns: 1`
  - Two addresses tying on node count → tiebreaker by staked total
- Manual smoke test below `md`: data loads → 3 sections render → row taps land on the expected detail pages → "See all" expands → rotating to landscape shows the graph

## Out-of-scope follow-ups (not in this spec)

- Search/filter on the portrait page
- Country detail page or panel
- Top stakers / top CRNs sections
- Top owners (distinct from reward addresses) section
- Hash-search input that mirrors the desktop search behavior
