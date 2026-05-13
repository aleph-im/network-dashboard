# Earnings Chart Hover + Graph/Panel Sparkline — Design

**Date:** 2026-05-13
**Status:** Draft — pending review
**Branch:** TBD (implementation)
**Closes backlog items:** "Earnings tab: hover tooltip on dual-line chart" + "Per-CRN sparkline on network graph CRN detail panel" (both from Decision #90).

---

## Why

Decision #90 shipped the Earnings tab with a deliberately static dual-line
chart: the trend reads at a glance, but the operator can't pinpoint a specific
bucket's value without eyeballing the y-axis. Two backlog items captured that:

1. **Hover tooltip on the Earnings chart** — let operators read exact bucket
   values (time, ALEPH, secondary count) instead of estimating from the line.
2. **Per-CRN sparkline on the network graph CRN panel** — give graph users an
   at-a-glance "is this node earning?" signal without leaving `/network`.

Both items share infrastructure (the same dual-line rendering), so doing them
together avoids drift between two surfaces that should speak the same visual
language.

During brainstorming we also confirmed a scope-expansion: the `/nodes` side
panel (`node-detail-panel.tsx`) currently shows a truncated `VMs (N) · first
6 + "+N more"` list that gets cramped on busy nodes. Adding the same
sparkline lets us drop that block — the spark conveys "earnings + VM count
over 24h" and the panel's existing "View full details →" footer link gets the
user to the full VM list on the node detail page.

## What

1. A shared `DualLineChart` primitive that owns the SVG dual-line rendering
   plus an optional crosshair highlight.
2. The Earnings tab chart (`NodeEarningsChart`) refactored onto the primitive,
   with a bucket-anchored hover tooltip on top.
3. A new `NodeEarningsSpark` wrapper rendering the primitive at panel scale
   (no hover, fixed 24h range, with a caption underneath).
4. The spark embedded in three places:
   - Network graph CRN panel (`network/network-detail-panel-crn.tsx`)
   - Network graph CCN panel (`network/network-detail-panel-ccn.tsx`)
   - `/nodes` CRN side panel (`node-detail-panel.tsx`)
5. The `/nodes` side panel drops its truncated VMs list block in exchange.

**Out of scope for this spec** (already in backlog as separate items):

- Range selector on the spark (24h/7d/30d picker in the panel) — kept fixed at
  24h.
- Hover/tooltip on the spark itself — explicitly chose static.
- Distribution reconciliation panel ("where did this CRN's ALEPH come from?").
- Network-median delta on KPI cards.
- Score-over-time overlay line (blocked on backend).
- Persistent localStorage cache for `useNodeEarnings`.

## UX

### Earnings tab — hover tooltip

Bucket-anchored crosshair + floating card. Cursor over the chart snaps to the
nearest bucket; a faint vertical guide line + emphasis dots on both polylines
mark the snapped bucket; a small card near the top of the chart shows:

```
May 12 · 14:00
ALEPH       0.52
VMs            3
```

- Time format is derived from bucket duration. Hourly buckets (24h range) show
  `MMM D · HH:MM` (unambiguous across midnight). Daily buckets (7d / 30d) show
  `MMM D`.
- Secondary label tracks the chart's existing `secondaryLabel` prop (`"VMs"`
  for CRN, `"CRNs linked"` for CCN).
- Card width ~140px. Horizontal position tracks the snapped bucket's x;
  `transform` clamps the anchor at chart edges so the card never overflows
  (`xPct < 0.1` → left-anchored; `xPct > 0.9` → right-anchored; otherwise
  centered on the bucket).
- Card disappears on `onPointerLeave`. Touch users get tap-to-show /
  tap-away-to-dismiss for free via Pointer Events; not a primary use case but
  doesn't hurt.

### Network graph + `/nodes` side panel — static spark

A new section is added to each host panel, using the existing chrome
(top-border separator + uppercase section heading):

```
─────────────
EARNINGS · 24H
[dual-line spark, height ~56px]
12.40 ALEPH · 3.2 VMs avg
─────────────
```

Caption format:
- **CRN:** `12.40 ALEPH · 3.2 VMs avg` (ALEPH total + 24h-avg of `secondaryCount`
  to one decimal — same vocabulary as the Earnings tab's KPI card).
- **CCN:** `12.40 ALEPH · 2 CRNs linked` (ALEPH total + current linked-CRN
  count, since the secondary is flat-lined per Decision #90).

Placement in each panel:

| Panel | New Earnings section sits between |
|-------|-----------------------------------|
| `network/network-detail-panel-crn.tsx` | Resources block ↔ Owner block |
| `network/network-detail-panel-ccn.tsx` | Stakers section ↔ Owner block |
| `node-detail-panel.tsx` | Resources/GPU blocks ↔ History list |

In `node-detail-panel.tsx`, the existing `VMs (N) · first 6 + +N more` block
(currently lines ~197–227) is removed. The `VMs` count row at the top of the
panel stays. The History section keeps its position and "+N more" truncation
— that signal is distinct from earnings and rarely overflows.

CCN has no `/nodes` side panel equivalent (CCN routes go straight to
`NodeDetailViewCcn`), so the `/nodes`-side change is CRN-only.

### Loading / empty states

- **Spark loading** — `Skeleton` at the spark's height, no caption.
- **Spark empty** (`buckets.every(b => b.aleph === 0)`) — one muted italic
  line: `No earnings · last 24h`. No chart rendered.
- **Spark unknown hash** (`data === undefined` after load) — render nothing
  (the host panel's other rows still display).
- **Chart loading / empty** — unchanged from today's behavior.

## Architecture

### Component split

```
src/components/
├── dual-line-chart.tsx               NEW  shared SVG primitive
├── node-earnings-chart.tsx           CHG  wraps primitive + hover + tooltip
├── node-earnings-spark.tsx           NEW  wraps primitive (no hover) + caption
└── network/
    ├── network-detail-panel-crn.tsx  CHG  embed spark
    └── network-detail-panel-ccn.tsx  CHG  embed spark
src/components/node-detail-panel.tsx  CHG  embed spark, remove VMs list block
```

### `DualLineChart` primitive

```ts
// src/components/dual-line-chart.tsx
type Props = {
  buckets: NodeEarningsBucket[];
  width?: number;       // default 600
  height?: number;      // default 120
  highlightedIndex?: number | null;
  onHoverIndex?: (index: number) => void;
  onHoverEnd?: () => void;
};

export function DualLineChart(props: Props): JSX.Element;
```

**Owns:** the outer SVG element with `viewBox`, the polyline math (currently
in `node-earnings-chart.tsx` lines 34–54), the two `<polyline>` elements, the
optional crosshair (`<line>` + emphasis `<circle>`s) when `highlightedIndex
!= null`, and a transparent pointer-capture `<rect>` rendered **only** when
`onHoverIndex` is provided. The pointer-capture rect computes the snapped
bucket index from the pointer's SVG-relative x and calls `onHoverIndex(i)` /
`onHoverEnd()`. `aria-hidden="true"`.

**Does NOT own:** legend, caption, tooltip card, empty/loading state,
container chrome. Those are wrapper concerns because the tab chart and the
spark have different sizing, captions, and empty-state vocabulary.

**Empty input** — renders an empty SVG when `buckets.length < 2`. Wrappers
gate display before delegating, so this is a defensive default rather than a
user-facing state.

**Why the callback API over an exported helper:** keeping pointer events
inside the same component that owns the polyline geometry means one place
defines the i→x mapping. Wrappers only deal with React state and tooltip
positioning, which they do with `xPct = hoverIndex / (buckets.length - 1)`
— a single-line calculation that doesn't need a shared helper.

### Hover layer on `NodeEarningsChart`

```tsx
const [hoverIndex, setHoverIndex] = useState<number | null>(null);

// Outer wrapper is position: relative so the tooltip card can absolute-position
// to the snapped bucket's x percentage.
<div className="relative">
  <DualLineChart
    buckets={buckets}
    highlightedIndex={hoverIndex}
    onHoverIndex={setHoverIndex}
    onHoverEnd={() => setHoverIndex(null)}
  />
  {hoverIndex != null && (
    <DualLineChartHoverCard
      bucket={buckets[hoverIndex]}
      primaryLabel={primaryLabel}
      secondaryLabel={secondaryLabel}
      bucketDurationSec={buckets.length >= 2 ? buckets[1].time - buckets[0].time : 3600}
      xPct={hoverIndex / (buckets.length - 1)}
    />
  )}
</div>
```

The hover card component is local to `node-earnings-chart.tsx` (not a
separate file) — it's presentational, < 30 lines, and tightly coupled to the
parent's state. The card is rendered as a sibling DOM element (not inside
the SVG) so it can use ordinary CSS for the card chrome (background, border,
shadow) and `transform` for the edge-clamping anchor logic.

### `NodeEarningsSpark` wrapper

```tsx
type Props = {
  hash: string;
  height?: number;  // default 56
};

// Internally:
const { data, isLoading } = useNodeEarnings(hash, "24h");
// Branches: loading → Skeleton; empty → italic line; happy → primitive + caption.
```

Caption pseudocode:

```tsx
const secondaryLabel = data.role === "crn" ? "VMs avg" : "CRNs linked";
const secondaryValue =
  data.role === "crn"
    ? avg(data.buckets.map((b) => b.secondaryCount)).toFixed(1)
    : String(data.buckets.at(-1)?.secondaryCount ?? 0);

`${data.totalAleph.toFixed(2)} ALEPH · ${secondaryValue} ${secondaryLabel}`
```

### Data flow

```
useCreditExpenses(start, end)   ─┐
useCreditExpenses(prev, prev_end)─┤
useNodeState()                   ─┼─→ useNodeEarnings(hash, range)
useNode(hash)                    ─┤        │
useNodes()                       ─┘        ▼
                                    NodeEarningsBucket[]
                                           │
                ┌──────────────────────────┼──────────────────────┐
                ▼                          ▼                      ▼
       NodeEarningsChart        NodeEarningsSpark      NodeEarningsSpark
       (tab, full + hover)    (graph CRN/CCN panels)  (/nodes side panel)
                │                          │                      │
                └──────── DualLineChart (shared primitive) ────────┘
```

All four call sites for `useNodeEarnings(hash, "24h")` share the same React
Query cache key, and the underlying `useCreditExpenses` window is already
shared with the credits page and the open Earnings tab. Opening a panel after
visiting credits is an instant render.

### Performance

- Hover: 24–30 buckets × one `setState` per `onPointerMove` event. No
  throttling needed.
- Re-render scope: the entire `NodeEarningsChart` re-renders on hover state
  change. Acceptable — the chart's render is dominated by ~25 SVG points and
  one card.
- Spark: zero state, no event handlers, pure render off the hook's data.

### Accessibility

- The chart SVG already has `aria-hidden="true"`; that stays. The spark SVG
  follows the same pattern.
- Keyboard / screen-reader access to the same data: the per-VM (CRN) and
  linked-CRN (CCN) table below the chart already lists the same values. We
  add no new ARIA — the tooltip is a sighted-cursor refinement, not a new
  data source.
- Tooltip motion respects `prefers-reduced-motion` by being instantaneous
  (no animated entrance / exit) — no CSS transitions are added.

## Files touched

| File | Change | Approx LoC |
|------|--------|-----------|
| `src/components/dual-line-chart.tsx` | NEW | ~90 |
| `src/components/dual-line-chart.test.tsx` | NEW | ~80 |
| `src/components/node-earnings-chart.tsx` | Refactor onto primitive + hover state + tooltip card | ~+60 / −40 |
| `src/components/node-earnings-chart.test.tsx` | Extend with hover assertions | ~+40 |
| `src/components/node-earnings-spark.tsx` | NEW | ~50 |
| `src/components/node-earnings-spark.test.tsx` | NEW | ~80 |
| `src/components/network/network-detail-panel-crn.tsx` | Add Earnings section | ~+10 |
| `src/components/network/network-detail-panel-crn.test.tsx` | Add heading assertion | ~+10 |
| `src/components/network/network-detail-panel-ccn.tsx` | Add Earnings section | ~+10 |
| `src/components/network/network-detail-panel-ccn.test.tsx` | Add heading assertion | ~+10 |
| `src/components/node-detail-panel.tsx` | Add Earnings section, remove VMs list block | ~+10 / −30 |
| `src/components/node-detail-panel.test.tsx` | Add heading assertion, assert VMs list gone | ~+15 |

Plus docs (updated at the end of the implementation, after manual
verification):

- `docs/ARCHITECTURE.md` — note the shared `DualLineChart` primitive pattern
  and the spark-in-panel placement.
- `docs/DECISIONS.md` — one entry covering the chart hover + spark surfaces
  + `/nodes` panel VMs-list removal.
- `docs/BACKLOG.md` — move "Earnings tab: hover tooltip" and "Per-CRN
  sparkline on network graph CRN detail panel" to Completed.
- `CLAUDE.md` — update the Current Features list:
  - Earnings tab feature description gains hover tooltip wording.
  - Network graph CRN/CCN detail panels gain spark mention.
  - `/nodes` side panel: spark added, VMs list removed.
- `src/changelog.ts` — minor version bump (new user-facing feature).

## Testing

| Suite | What it verifies |
|-------|------------------|
| `dual-line-chart.test.tsx` | Two polylines render given >2 buckets; no crosshair when `highlightedIndex=null`; crosshair + emphasis dots present when set; pointer events on the capture rect call `onHoverIndex` with the snapped bucket index (verify snap-to-nearest at midpoints, clamp at edges); `onHoverEnd` fires on pointer-leave; capture rect is absent when `onHoverIndex` is omitted; empty SVG when `buckets.length < 2`. |
| `node-earnings-chart.test.tsx` | Existing assertions stay; pointer-move over the overlay sets the hover card visible with the snapped bucket's time + ALEPH + secondary; pointer-leave hides it; time format flips between hourly and daily by bucket duration. |
| `node-earnings-spark.test.tsx` | Renders chart + caption with `totalAleph.toFixed(2)` and role-specific secondary; loading shows Skeleton; empty (`buckets.every(b => b.aleph === 0)`) shows the muted italic line; unknown hash renders nothing. |
| `network-detail-panel-crn.test.tsx`, `network-detail-panel-ccn.test.tsx` | "Earnings · 24h" heading is rendered. |
| `node-detail-panel.test.tsx` | "Earnings · 24h" heading is rendered. VMs list block is gone (`vm.hash` `CopyableText` no longer renders). VMs *count* row at the top stays. History list stays. |

Manual verification, post-implementation:

- Open Earnings tab on a CRN with > 24h of earnings; hover across the chart;
  verify the tooltip card tracks the cursor, snaps to buckets, shows the
  correct time + ALEPH + VM-count.
- Repeat on a CCN: secondary label reads "CRNs linked", value is the
  flat-lined current count.
- Switch range to 7d and 30d; verify time format flips to `MMM D`.
- Open `/network`, select a CRN and a CCN; verify the spark + caption render
  in each panel.
- Open `/nodes`, select a CRN; verify the spark + caption render in the side
  panel and that the VMs list block is gone. Confirm "View full details →"
  still navigates to the full detail page.
- Verify the spark caption matches the Earnings tab's KPI card numbers for
  the same node + 24h range.
- Theme toggle: spark + tooltip render correctly in both light and dark
  themes (use existing `--color-success-500` / `--color-primary-500` / muted
  tokens; no new tokens).
- `prefers-reduced-motion`: tooltip appears/disappears without transition
  (already the case).

## Acceptance criteria

- [ ] Hovering anywhere over the Earnings tab chart shows a tooltip card with
      bucket time, ALEPH, and secondary value; pointer-leave hides it.
- [ ] Tooltip card stays inside the chart bounds at both edges (anchor clamp).
- [ ] Time format derives from bucket duration: `MMM D · HH:MM` for 24h,
      `MMM D` for 7d / 30d.
- [ ] Dual-line spark + caption renders inside the network graph CRN panel,
      network graph CCN panel, and `/nodes` CRN side panel.
- [ ] `/nodes` side panel no longer shows the truncated VMs list block; the
      VMs count row at the top remains.
- [ ] Spark caption format matches the spec (CRN: `X.XX ALEPH · Y.Y VMs avg`;
      CCN: `X.XX ALEPH · N CRNs linked`).
- [ ] Loading and empty states render correctly in all surfaces.
- [ ] `pnpm check` passes (oxlint + tsc + vitest).
- [ ] Docs updated per the "Files touched" table.
- [ ] `src/changelog.ts` bumped (minor) with a `VersionEntry`.

## Open questions

None that block implementation. Possible follow-ups already in BACKLOG:

- Hover tooltip on the spark itself — explicitly chose static; revisit only
  if users ask.
- Range selector on the spark — kept fixed 24h; revisit only if 7d/30d at a
  glance becomes desirable.
- Distribution reconciliation panel; network-median delta; score-over-time
  line — all separate backlog items.
