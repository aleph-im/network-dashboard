# Network graph node panel — redesign

## Background

`/network` shows a force-directed graph of CCNs, CRNs, stakers, and reward addresses. Clicking a node opens a side panel via `?selected=<hash>`. Today's panel has five problems:

1. The 400px right-edge overlay covers a large slice of the map.
2. It extends to `top: 0`, so it visually clashes with the search bar / layer toggles in the top-left chrome.
3. The Focus and Close buttons sit in their own header above `<NodeDetailPanel>`, so they read as separate from the node card.
4. CCN nodes show no content. `NodeDetailPanel` calls `useNode(hash)`, which is the scheduler API — CCNs aren't in that dataset.
5. CRN content is a copy of the full `/nodes?view=…` detail card. Most of it (GPU list, VMs list, history table, CPU features) isn't graph-relevant.

## Goal

A smaller, self-contained panel that:

- Doesn't overlap the toolbar or cover most of the map.
- Renders meaningful content for **all four** node kinds (CCN, CRN, staker, reward).
- Shows only graph-relevant facts; sends users to the full detail page for everything else.
- Visually integrates the close + focus actions with the node card.

## Placement

| Property | Value |
| --- | --- |
| Position | `absolute right-4 top-20 bottom-4` (≈ 16px of margin around the card; top-20 clears the header + toolbar row) |
| Width | `280px` (was 400px) |
| Layering | `z-20`, above the graph and legend, **below** the toolbar's `z-10` chrome (toolbar still wins clicks on overlap, though there shouldn't be any with the new top offset) |
| Background | `bg-background` opaque card with `border border-foreground/[0.06] rounded-xl shadow-md` |
| Overflow | `overflow-y-auto` inside the card body — content scrolls; the card itself doesn't grow |
| Animation | Fade + 8px translate-x on mount/unmount via Tailwind transitions; respects `prefers-reduced-motion` |
| Mobile (`<md`) | Hidden, same as today. The mobile fallback list is unchanged. |

The panel becomes a **floating card over the recessed content panel**, not a slide-in rail. Toolbar, layer toggles, search, focus banner, and reset-view all stay reachable. ~62% of the map width remains uncovered (vs. ~50% today on a 1440px screen).

## Card structure (shared shell)

```
┌───────────────────────────────────────┐
│ ●  <name or short hash>     Focus  ×  │   ← header (sticky inside scroll)
├───────────────────────────────────────┤
│ <kind-specific body>                  │
│                                       │
│                                       │
├───────────────────────────────────────┤
│ View full details →                   │   ← footer (only for CCN/CRN)
└───────────────────────────────────────┘
```

- `●` = `StatusDot` mapped from the node's `status` + `inactive` fields, sized `sm`.
- Title: prefer `node.label` (the human-readable name from `CCNInfo` / `CRNInfo`); for stakers and reward addresses, use `CopyableText` truncating the address.
- Right side of header: `Focus` text-variant button + a `×` icon-only button. Both `size="xs"`. Spaced as a tight pair so they read as belonging to this card, not as page chrome.
- Header has a subtle bottom border (`border-b border-foreground/[0.06]`) so the action pair groups visually with the title.
- Footer "View full details →" link goes to `/nodes?view=<hash>` and is **only present for CCN/CRN** (no equivalent for stakers/reward).

### Focus button behavior

The current `onFocus` removes `?selected` and pushes `?focus=<hash>`, which closes the panel. We change it to set **both** so the panel stays open on the focused node:

```ts
const params = new URLSearchParams(searchParams.toString());
params.set("focus", id);
params.set("selected", id);
router.push(`/network?${params.toString()}`, { scroll: false });
```

This makes "Focus" a non-disruptive action — the user keeps the same panel context while the graph zooms to the ego subgraph.

## Per-kind content

### CCN

Source data: `state.ccns.get(hash)` from the `NodeState` already loaded by `useNetworkGraph`. **No new API calls.**

```
●  aleph-prod-01                     Focus  ×
─────────────────────────────────────────────
Type            CCN
Status          [active chip]
Score           0.94
─────────────────────────────────────────────
┌──────────┐  ┌──────────┐
│   14     │  │   23     │
│  CRNs    │  │ Stakers  │
└──────────┘  └──────────┘
─────────────────────────────────────────────
TOTAL STAKED
1,243,500 ALEPH
─────────────────────────────────────────────
OWNER
0xab12…34cd  (CopyableText, links to /wallet?address=)
─────────────────────────────────────────────
REWARD
0xee99…87ff  (CopyableText, links to /wallet?address=)
─────────────────────────────────────────────
View full details →   (links to /nodes?view=<hash>)
```

- "CRNs" stat = `c.resourceNodes.length`.
- "Stakers" stat = `Object.keys(c.stakers).length`.
- "Total staked" = `c.totalStaked`, formatted with `Intl.NumberFormat` and ` ALEPH` suffix.
- Status chip uses a generic mapping: `inactive` → `default` variant; `active` → `success`; anything else → `warning`. (CCN status strings come from corechannel and don't fit the scheduler `NODE_STATUS_VARIANT` map cleanly.)

### CRN

Source data: `state.crns.get(hash)` (graph-side) **+** `useNode(hash)` (scheduler-side, kept from today's implementation) for resource bars and VM count. Resource bars and VMs gracefully render skeletons while loading and disappear if `useNode` returns null (e.g. CRN registered in corechannel but not yet in scheduler).

```
●  crn-eu-west-04                     Focus  ×
─────────────────────────────────────────────
Type            CRN
Status          [active chip]
VMs             7
─────────────────────────────────────────────
PARENT CCN
aleph-prod-01                          → Focus
─────────────────────────────────────────────
RESOURCES
CPU · 32 vCPUs                            62%
[████████████░░░░░░░░]
Memory · 128 GB                           48%
[█████████░░░░░░░░░░░]
─────────────────────────────────────────────
OWNER
0xab12…34cd  (CopyableText, links to /wallet)
─────────────────────────────────────────────
View full details →   (links to /nodes?view=<hash>)
```

- "Parent CCN" name comes from `state.ccns.get(crn.parent)?.name` (falls back to truncated hash if not found, which would mean an orphaned CRN). The link triggers the same `onFocus` flow on the parent's id, so it focuses the graph on the parent CCN and re-targets the panel to it.
- "VMs" count = `useNode(hash)?.vms.length`. Skeleton while loading.
- Resource bars use the existing `<ResourceBar>` component for visual consistency with `/nodes?view=…`.
- Disk and CPU architecture/vendor/features are dropped — graph context doesn't need them.
- GPU section, VM list, and history table are **dropped** — all reachable from `View full details →`.

### Staker / reward address

Source data: just `node.id` (the address). Optionally enrich with degree count from the visible graph for a sense of scope.

```
●  Staker                             Focus  ×
─────────────────────────────────────────────
0xab12…34cd      [copy]
─────────────────────────────────────────────
Connected to 4 CCNs in the visible graph.
─────────────────────────────────────────────
Open wallet view →
```

- Title row uses the kind label (`Staker` or `Reward address`) and a neutral dot (no status).
- Body: `<CopyableText>` of the full address with `href={/wallet?address=}`.
- Below the address: a single line summarizing how many edges this node has in the *currently visible* graph (counted from `visibleGraph.edges`). Helps the user understand whether this address holds stake in 1 vs 12 CCNs.
- No "View full details" — the wallet view link is the equivalent.

## Component structure

Replace today's `network-detail-panel.tsx` (which delegates to `<NodeDetailPanel>`) with a new self-contained component:

```
src/components/network/
├── network-detail-panel.tsx       # rewritten — shell + dispatcher
├── network-detail-panel.ccn.tsx   # CCN body
├── network-detail-panel.crn.tsx   # CRN body
└── network-detail-panel.address.tsx   # staker / reward body
```

The shell owns:
- Outer card chrome, header (title + Focus + ×), footer.
- Slot for the body (one of the three above).
- Receives `node: GraphNode`, `nodeState: NodeState`, `onClose`, `onFocus`, `visibleGraph`.

Bodies are pure presentational components that take their already-resolved data:
- `CCNBody` takes `CCNInfo`.
- `CRNBody` takes `CRNInfo` + the parent `CCNInfo | null` + the result of `useNode(hash)`.
- `AddressBody` takes the address + a degree count.

The shell looks up the right info from `nodeState` and renders the right body. This keeps each body small and easy to test.

## Hooks / data plumbing

`useNetworkGraph` currently exposes `fullGraph`, `visibleGraph`, etc. Extend it to also expose `nodeState: NodeState | undefined` (the raw maps it already loads internally) so the panel can read CCN/CRN info without a second query.

`useNode(hash)` keeps doing what it does today; the CRN body is the only place that calls it.

## Edge cases

- **Hash with no `nodeState` entry** (raced load, or staker/reward selected before data is ready): show the kind label + the truncated id only. No empty body.
- **CRN whose `useNode` query returns null**: render header + parent CCN + owner + "View full details →"; skip the resources section. CRN can exist in corechannel but not in the scheduler temporarily.
- **CRN with `parent: null`** (orphaned): "Parent CCN" section shows "—" with no link.
- **Inactive CCN/CRN** (`inactiveSince != null`): status chip uses the `default` variant; status dot uses the `inactive` color from existing `nodeStatusToDot` mapping.
- **Address node selected with the relevant overlay layer turned off**: degree count would be 0; degrade gracefully — drop the "Connected to N…" line if the staker/reward layer isn't active.

## Out of scope

- Mobile redesign (today's mobile fallback list is fine).
- Animating the panel between selections (e.g. cross-fade between two CCNs). A simple unmount + remount fade is enough.
- Showing a mini-map of the focused subgraph inside the panel. Tempting, but adds complexity for marginal value.
- Editing or refreshing data from inside the panel.

## Testing strategy

- Unit tests for the body components: snapshot of "active CCN", "inactive CCN", "CRN with full resources", "CRN missing scheduler data", "Staker", "Reward".
- Visual smoke test: open the page, click a CCN node, click a CRN node, click a staker, click a reward, verify the panel renders the right body and never blocks the toolbar.
- Click "Focus" on a CRN, verify the panel re-targets (URL contains both `focus` and `selected`).
- Click "View full details" on CCN/CRN, verify navigation to `/nodes?view=<hash>`.

## Files touched

- `src/components/network/network-detail-panel.tsx` — rewritten.
- `src/components/network/network-detail-panel.ccn.tsx` — new.
- `src/components/network/network-detail-panel.crn.tsx` — new.
- `src/components/network/network-detail-panel.address.tsx` — new.
- `src/hooks/use-network-graph.ts` — expose `nodeState` on the returned object.
- `src/app/network/page.tsx` — pass `nodeState` and `visibleGraph` to the panel; adjust the panel wrapper from `aside.absolute right-0 top-0 bottom-0 w-[400px]` to the new floating-card layout (`right-4 top-20 bottom-4 w-[280px]`).

## Risks

- **`useNode` performance regression**: today's panel calls `useNode` for every CCN selection too (and gets nothing back). The new design only calls it for CRNs, so this is a net win.
- **Status-chip mapping for CCN**: corechannel statuses (`active`, `waiting`, etc.) don't all map to the scheduler `NodeStatus` enum. We use a small dedicated mapping in the CCN body instead of forcing them through `NODE_STATUS_VARIANT`.
- **Visible-graph degree count for stakers/rewards**: `visibleGraph.edges` is large for a fully-loaded graph. Counting once on render is O(E) (~ a few thousand edges), which is fine; no memo needed.

## Decisions captured

- Placement: option B (inset right rail) over A/C/D — user picked B for the room to show more content.
- Density: option 2 (Rich) over Medium — user picked Rich.
- Address-node treatment: match the new shell with simpler content, rather than keep today's minimal card or hide the panel entirely.
