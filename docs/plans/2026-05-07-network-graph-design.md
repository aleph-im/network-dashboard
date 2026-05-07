# Network Graph Page — Design

## Context

The dashboard exposes Nodes (CCNs + CRNs) and VMs as flat tables and a worldmap, but the structural relationships between them — which CRNs sit under which CCN, which operators run multiple nodes, who stakes to whom — are invisible. Operators want to locate their own fleet and see its position in the network. The "CCN→CRN topology view" idea was already in `BACKLOG.md` (Needs planning, 2026-03-20). This design promotes it to a full page with four toggleable edge layers.

The same data drives Credits, Wallet, Issues, and the worldmap, so this page is a new **lens** on existing data, not new data.

## Goals

- Force-directed graph of the network with toggleable edge layers (default: structural CCN↔CRN only).
- Operator deep-link `/network?address=0x…` highlights all of their nodes; viewport auto-fits.
- Hover any node → tooltip with primary details. Click → side panel (and full-page detail via existing `?view=`).
- Focus mode: click → graph filters to focused node + 1-hop neighbors, simulation re-runs in place. Back button restores the full graph.
- New sidebar nav entry under Resources (Nodes / VMs / **Network** / Credits).

## Non-goals

- Not a graph-analysis platform — no shortest-path UI, no centrality metrics, no community detection.
- Not real-time. Polling cadence stays at `useNodeState`'s 60s.
- Not 3D, not VR, not WebGL. SVG only.
- Not a workflow editor — no drag-to-create, no editing.
- No new auth surface. Address comes from URL or page-local search; no wallet-connect.

## Library decision: D3-force + React SVG rendering

Three libraries were evaluated against the realistic scale (default ~600 nodes; worst case ~2k with all four layers on):

| Option | Bundle (gz) | Verdict |
|---|---|---|
| Sigma.js + graphology + react-sigma | ~120 kB | Best for >5k nodes; layer toggles built-in. Loses pixel-level aesthetic control vs SVG. |
| **d3-force + d3-zoom + d3-drag + d3-quadtree + React SVG** | **~30 kB** | **Composes with worldmap/sparkline SVG patterns. Native hover/click/keyboard on `<circle>`. Full visual control.** |
| react-force-graph-2d | ~150 kB | Canvas painting via callbacks; manual hit-testing; less natural fit. |

D3-force selected. Custom code is the cost — accepted in exchange for control and the smallest bundle. At 2k worst-case, d3-force is comfortably fast; if profiling later shows trouble, the path to a Web Worker simulation is clean (simulation is data-only).

### React 19 + d3-force pattern

D3 owns the **simulation** (computes `x`, `y` per tick). React owns the **DOM** (renders `<circle>`/`<line>` from a positions ref). Decouple via ref + `requestAnimationFrame`:

```ts
const positionsRef = useRef<Map<string, {x: number; y: number}>>(new Map());
const sim = useMemo(() => d3.forceSimulation(nodes).force(...), [nodes]);

useEffect(() => {
  let frame = 0;
  sim.on("tick", () => {
    for (const n of nodes) positionsRef.current.set(n.id, { x: n.x!, y: n.y! });
    if (!frame) frame = requestAnimationFrame(() => {
      setTickKey(k => k + 1); // single re-render per frame, regardless of tick rate
      frame = 0;
    });
  });
  return () => sim.stop();
}, [sim]);
```

This caps re-renders at ~60/sec regardless of how often the simulation ticks.

## Data model changes

`getNodeState()` in `src/api/client.ts:486-532` currently drops `resource_nodes` (CCN→CRN) and `parent` (CRN→CCN). Add them back to the app-level types.

```diff
 export type CCNInfo = {
   hash: string; name: string; owner: string;
   reward: string; score: number; status: string;
   stakers: Record<string, number>;
   totalStaked: number;
   inactiveSince: number | null;
+  resourceNodes: string[];   // CRN child hashes
 };

 export type CRNInfo = {
   hash: string; name: string; owner: string;
   reward: string; score: number; status: string;
   inactiveSince: number | null;
+  parent: string | null;     // CCN parent hash
 };
```

One-line additions in `getNodeState`'s transform. No other consumer reads these fields, so it's purely additive.

`MEMORY.md` flags `Map`/`Set` in *persisted* React Query data as a foot-gun (Decision #61). `useNodeState` is not in the persisted whitelist, so this remains safe.

## Component architecture

```
src/app/network/
  page.tsx                   — Route. Reads ?address ?selected ?focus ?layers from URL.
                               Renders <NetworkGraphPage />.

src/components/network/
  network-graph.tsx          — Main viz. Owns d3 simulation, viewport, hit-testing.
  network-node.tsx           — Single <circle> + label. Memoized.
  network-edge.tsx           — Single <line> per edge. Memoized.
  network-layer-toggles.tsx  — Pill row: Structural | Owner | Stakers | Reward addr.
  network-search.tsx         — Search by hash / name / address (debounced).
  network-legend.tsx         — Color/shape legend.
  network-detail-panel.tsx   — Kind-router that delegates to existing
                               node-detail-panel / vm-detail-panel.
  network-focus-banner.tsx   — "Focused on <name> · 12 connections · Show all"

src/lib/
  network-graph-model.ts     — buildGraph(nodeState, layers) → { nodes, edges }.
                               Pure, testable.
  network-graph-model.test.ts
  network-focus.ts           — egoSubgraph(graph, hash) → 1-hop neighbors.
  network-focus.test.ts

src/hooks/
  use-network-graph.ts       — Memoized graph + layer state from URL.
```

### Why these splits

- `buildGraph` is pure data → graph nodes/edges; tested without DOM. Layer toggles re-call it.
- `network-graph` doesn't know about routing or panels — it emits `onNodeHover` / `onNodeClick` events.
- `network-detail-panel` is a thin router that delegates to existing detail-panel components. Zero duplicated detail content.

## Data flow

```
useNodeState() ─┐
useNodes()    ─┼─► useNetworkGraph(state, layers) ─► buildGraph() ─► { nodes, edges }
useVMs()      ─┘                                                              │
                                                                              ▼
URL params ────────────────────────► NetworkGraphPage ──► <NetworkGraph />
(?layers ?focus ?address ?selected)         │                  │
                                            │      d3.forceSimulation ◄──────┤
                                            │              │                 │
                                            │              ▼ tick            ▼ render
                                            │      positionsRef        <svg>{...}</svg>
                                            │              │                 │
                                            │              └──── hover/click ┘
                                            ▼                       │
                                     <NetworkDetailPanel hash />◄───┘
```

`useNetworkGraph(state, layers)` is `useMemo`-ed on `state` + active layers. Toggling a layer = new graph object; simulation re-uses existing positions for unchanged nodes via `forceSimulation.nodes()`.

## Interaction model

| Action | Effect | URL change |
|---|---|---|
| Hover node | Tooltip with name, hash (8 chars), owner (6+4), status badge | none |
| Click node | Open right-side detail panel; node gets accent ring | `?selected=<hash>` |
| Click "Open detail page" in panel | Full-page node/VM detail view (existing routes) | `/nodes?view=<hash>` |
| Click "Focus" button in panel | Filter graph to ego network; banner appears | `?focus=<hash>` |
| Click "Show all" in focus banner | Restore full graph | drop `?focus` |
| Click background | Close panel | drop `?selected` |
| Toggle layer pill | Add/remove edge type; simulation re-runs | `?layers=structural,owner` |
| Search → enter | Pan/zoom to first match, open its panel | `?selected=<hash>` |
| Visit `/network?address=0x…` | Highlight all nodes owned by address; pan/zoom to fit; pulse animation | `?address=<addr>` |

URL is the source of truth — back/forward buttons work for focus, selection, layers, address-highlight.

## Visual design

- **Node shape & size**: CCNs = 9 px circle with concentric ring (primary). CRNs = 5 px circle. Stakers (when layer on) = 2 px dot. Reward addresses = 3 px square.
- **Node fill**: status from existing `STATUS_VARIANT` (success/warning/error/neutral) → `--color-success-500` etc. Inactive nodes desaturated.
- **Selected node**: 2 px accent ring (`--color-primary-500`), drawn last so it's above neighbors.
- **Address-highlighted nodes**: pulsing 1.5× ring, 2 s loop, respects `prefers-reduced-motion`.
- **Edge styles per type**:
  - Structural: solid `currentColor` at 0.4 opacity, 1 px.
  - Owner: dashed `--color-info-500` at 0.25 opacity.
  - Staker: thin curved bezier, `--color-warning-500` at 0.2 opacity.
  - Reward: dotted `--color-purple-500` at 0.2 opacity.
- **Background**: same recessed `bg-background` panel as other pages, with the worldmap's dot-pattern overlay at low opacity for texture continuity.
- **Theme**: all colors via existing CSS vars; no per-theme JS branching.

## Performance strategy

- **Hit-testing via `d3-quadtree`** (not per-circle event handlers) on hover/click. Quadtree rebuilt on settle, not each tick. Cuts hover from O(n) listeners to O(log n) lookup.
- **rAF batching** of tick → React render (one `setTickKey` per frame, not per tick).
- **Memoize** `network-node` and `network-edge` on `(id, x, y, status, selected, highlighted)` — most renders become no-ops.
- **Settle then idle**: stop simulation when `alpha < alphaMin` (default 0.001). User drag re-heats it. Saves CPU after layout settles.
- **Lazy layer mounting**: stakers/reward layers don't add nodes until toggled on. Default page = ~600 nodes.
- **Worker fallback (deferred)**: If profiling shows >100 ms tick at 2k nodes, move simulation to a Web Worker. Not in v1 — measure first.

## Mobile behavior

Force-directed graphs are touch-hostile at small sizes. v1 strategy:

- **<768 px**: render the graph but with a fallback empty-state ("Tap a node from the list →" with a flat CCN list) when no `?address` is set; auto-enter focus mode on the first match when it is.
- **Pinch-zoom + drag-pan**: native `d3-zoom` touch handlers.
- **Detail panel**: existing slide-in overlay pattern, already proven on Nodes/VMs pages.
- **Layer toggles**: collapse into a single Filters button, consistent with `FilterToolbar` elsewhere.

## Accessibility

- **Keyboard nav**: arrow keys cycle nodes ordered by hash (deterministic); Enter opens panel; Esc closes; F enters/exits focus.
- **Each `<circle>`** gets `role="button"` + `aria-label="<status> <kind>: <name>"`.
- **`prefers-reduced-motion`**: skip the pulse animation, snap viewport instead of tween, raise simulation alpha decay so motion settles quickly.
- **Color is never the only signal** — selected/highlighted use ring + size, not just color.

## Files to create

- `src/app/network/page.tsx`
- `src/components/network/network-graph.tsx`
- `src/components/network/network-node.tsx`
- `src/components/network/network-edge.tsx`
- `src/components/network/network-layer-toggles.tsx`
- `src/components/network/network-search.tsx`
- `src/components/network/network-legend.tsx`
- `src/components/network/network-detail-panel.tsx`
- `src/components/network/network-focus-banner.tsx`
- `src/lib/network-graph-model.ts` + `.test.ts`
- `src/lib/network-focus.ts` + `.test.ts`
- `src/hooks/use-network-graph.ts`

## Files to modify

- `src/api/credit-types.ts` — add `resourceNodes` / `parent` to `CCNInfo` / `CRNInfo`.
- `src/api/client.ts` `getNodeState()` — preserve those two fields.
- `src/components/app-sidebar.tsx` — new "Network" entry under Resources.
- `src/changelog.ts` — bump `CURRENT_VERSION` (minor: feature), add VersionEntry.
- (Polish, optional v1.1) Wallet view + node detail panel: "Open in network →" deep-link buttons.

## Dependencies to add

- `d3-force` (~10 kB)
- `d3-zoom` (~10 kB)
- `d3-drag` (~5 kB)
- `d3-quadtree` (~3 kB)
- `@types/d3-force`, `@types/d3-zoom`, `@types/d3-drag`, `@types/d3-quadtree` (devDeps)

Total bundle add: ~30 kB gzipped.

## Documentation updates

Per CLAUDE.md "Plans Must Include Verification and Doc Updates":

- `docs/ARCHITECTURE.md` — new "Network graph" section: data flow, d3+React decoupling pattern, layer model.
- `docs/DECISIONS.md` — log decision: D3-force + React SVG over Sigma.js (rationale: bundle, aesthetic continuity, no >2k node ceiling needed).
- `docs/BACKLOG.md` — move "CCN→CRN topology view" to Completed; add follow-ups (web-worker simulation, "Top operators" sidebar, edge filtering by score range).
- `CLAUDE.md` — add "Network page" to Current Features.
- `src/changelog.ts` — bump minor, add VersionEntry.

## Verification

End-to-end smoke checklist (manual, via `pnpm dev`):

1. `/network` renders graph with structural edges only, ~600 nodes settle in <500 ms.
2. Toggle each layer pill — graph re-runs, edges fade in.
3. Hover a node — tooltip with correct details on CCN, CRN, staker dot.
4. Click a node — panel opens; address in URL; back button closes panel.
5. Click "Focus" in panel — graph reduces to ego network, banner appears, URL has `?focus=`.
6. Click "Show all" — full graph restored.
7. Visit `/network?address=<owner-with-multiple-nodes>` — operator's nodes pulse, viewport fits them.
8. Search by hash and by node name — pan/select correct match.
9. Resize to mobile — fallback empty-state OR focused subgraph if address present.
10. Toggle dark/light theme — colors swap cleanly via CSS vars.
11. Tab/Enter/Esc/F keyboard nav works.
12. `prefers-reduced-motion: reduce` (DevTools emulation) — animations skipped.
13. `pnpm check` clean — lint, typecheck, vitest (model + focus tests).

## Open questions punted to implementation

- Initial seeding: random vs. radial CCN-cluster layout? Try radial first; fallback to random if visually noisy.
- Edge bundling for owner/reward overlays at high density? Probably YAGNI for v1.
- Search fuzziness: plain `includes` (matches credits page convention) vs. fuzzy. Default to plain.
