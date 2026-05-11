# Network Map — Geographical Layout Design

## Context

`/network` is a force-directed view of the Aleph network (shipped in #100, PR `feat(network)`). It surfaces relational structure — CCN↔CRN parent links, owner cliques, staker pools, reward clusters — but says nothing about where nodes physically live.

The worldmap card on the Overview hero already plots active nodes on a Vemaps Mercator world map using a build-time `node-locations.json` snapshot (hash → ISO country) and `country-centroids.json` (ISO → lat/lng). That data is already loaded, indexed, and refreshed on every build.

This design layers geography onto `/network` as an optional view dimension, using the same data and the same projection math. The mental model stays "this is a relational graph"; geography is one more way to read it.

The backlog entry that triggered this work (2026-05-11, "Group nodes by geographical location on the network map") asked four open questions:

1. Optional layer toggle vs. dedicated mode?
2. How to handle nodes with no resolved location?
3. Force simulation vs. fixed geo positions?
4. Interaction with existing focus/spotlight features?

All four are answered below.

## Goals

- Pull located CCN/CRN nodes toward their country's projected centroid while still respecting structural / owner / staker / reward forces.
- Show country labels at projected centroids — always visible regardless of zoom — so the geography is legible at a glance.
- Make countries first-class clickable, searchable, focusable entities in the graph.
- Stay consistent with the existing layer-toggle model. No new view mode, no new route, no new top-level toggle.

## Non-goals

- No world-map backdrop. The worldmap card on Overview already serves that visual. Adding a backdrop here would dilute the relational reading.
- No city/region granularity. Country-level only in v1. (Backlog: city granularity, blocked on a larger geo DB.)
- No `/country/<iso>` deep-link page. Country focus + detail panel is sufficient for v1.
- No runtime geolocation. The build-time snapshot is authoritative.
- No animation when toggling Geo on/off mid-session. The live simulation settles naturally.

## Decisions answered upfront

| Open question | Decision |
|---|---|
| Mode | Layer toggle named **Geo**, fifth alongside structural/owner/staker/reward |
| Default state | Off (existing defaults — structural + staker — unchanged) |
| Positioning model | **Soft force**: country nodes pinned at projected centroid, located CCN/CRN attached via a `forceLink`. Composes with other layer forces. |
| Stakers / rewards | No geo target → float (existing forces place them) |
| Unlocated CCN/CRN | No geo target → float |
| Country interaction | Country is a `kind: "country"` node — clickable (opens detail panel), searchable (Enter focuses the country's ego subgraph) |
| Map background | None |

## Data model

```ts
// src/lib/network-graph-model.ts

export type GraphLayer =
  | "structural" | "owner" | "staker" | "reward" | "geo";  // + geo

export type GraphNodeKind =
  | "ccn" | "crn" | "staker" | "reward" | "country";       // + country

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  status: string;
  owner: string | null;
  reward: string | null;
  inactive: boolean;
  country?: string;                           // alpha-2 — only on located CCN/CRN
  geo?: { lat: number; lng: number };         // only on country nodes
};
```

**Country node id namespace.** `country:FR`, `country:US`, etc. The `country:` prefix guarantees no collision with hash-based CCN/CRN ids and makes URL params (`?selected=country:FR`) self-documenting.

**`buildGraph(state, layers)` when `layers.has("geo")`:**

1. Walk `state.ccns` + `state.crns`. For each node, look up `node-locations.json[hash]`. If the country has a centroid in `country-centroids.json`, set `node.country = code`.
2. Collect the set of countries actually represented in step 1 → push one country node per country, with `id = "country:" + code`, `label = centroid.name`, `geo = { lat, lng }`, `kind: "country"`, `status = ""`, `inactive = false`, `owner = null`, `reward = null`.
3. Push one `type: "geo"` edge from each located CCN/CRN to its country node.

`node-locations.json` and `country-centroids.json` are already exported from `src/data/`. No new build-time work; they were generated for the worldmap card and are reused as-is.

## Projection

The worldmap card projects from lat/lng to its own SVG viewBox (`Vemaps Mercator`, `centerX 400.8`, `equatorY 395.7`, `R 117.27`, `lngOffset 11`). The network graph uses a symmetric world coordinate system centered at `(0, 0)` and scaled into `[-w/2, h/2]` for SVG rendering.

A new projection function in `src/lib/world-map-projection.ts`:

```ts
const NETWORK_MERCATOR: MercatorParams = {
  centerX: 0,        // symmetric viewBox
  equatorY: 0,
  R: 320,            // tuned so world span ≈ default graph extent
  lngOffset: 0,      // no global east shift; full longitude range used
};

export const networkMercator = mercator(NETWORK_MERCATOR);
```

`R` is the only knob with judgment in it — tuned empirically against the existing graph extent so a "geo on" view fits the same camera with the same `MIN_FIT_ZOOM = 0.3` floor. If a small adjustment proves better in practice we move it in one place.

## Layout & forces

**Pinning country nodes.** In `network-graph.tsx`'s `simNodes` useMemo, after computing the seed position:

```ts
if (node.kind === "country" && node.geo) {
  const { x, y } = networkMercator(node.geo.lat, node.geo.lng);
  simNode.fx = x;
  simNode.fy = y;
}
```

`fx`/`fy` pin a node — the simulation cannot move it. Pre-warm (300 throwaway ticks) and the live sim both respect pins, so the layout converges with geography in place from frame 0.

**Per-edge force tuning.** The existing simulation has `forceLink(distance=60)`. Geo edges piggyback with a per-link override:

```ts
forceLink<SimNode, SimLink>(simLinks)
  .id((d) => d.id)
  .distance((l) => l.type === "geo" ? 40 : 60)
  .strength((l) => l.type === "geo" ? 0.6 : undefined);  // d3 default for others
```

Strength `0.6` is firm enough to keep a node near its country but soft enough that an owner / structural tie still tugs nodes between countries when both layers are on. Single constant; tune if needed.

**Reset-view fit.** The existing `fitTransform` walks the full node set including pinned countries, so the initial fit naturally frames the world span. No code change.

**Toggle off.** `buildGraph` skips step 2/3 when `!layers.has("geo")` → country nodes and geo edges vanish → the simulation has only the existing forces. Live sim settles back to relational layout in a few hundred ms.

## Rendering

**Country node visual** (`network-node.tsx`):

- Small dot, `r = 4` base (smaller than CRN's 11, much smaller than CCN's 16), scaled by `nodeScale` like other kinds.
- Fill: `var(--color-muted-foreground)` at 60% opacity. Neutral grey to read as anchor / structure, not data.
- No outer ring, no halo when selected (only the spotlight halo from existing selection logic).
- Label rendering: `Badge fill="outline" variant="info" size="sm"` — same component as CCN/CRN labels, distinct variant.

**Always-visible country labels.** The existing label layer in `network-graph.tsx` gates on `transform.k >= LABEL_ZOOM_THRESHOLD`. Country labels bypass this gate:

```tsx
{graph.nodes.map((n) => {
  if (n.kind === "staker" || n.kind === "reward") return null;
  if (n.kind !== "country" && !showLabels) return null;  // CCN/CRN gated as today
  // ... render Badge ...
})}
```

Other label rules (kind variant, dim opacity when not in `relevantIds`) apply unchanged.

**Geo edges are invisible** — the edge map in `network-graph.tsx` filters them out:

```tsx
{graph.edges.map((e) => {
  if (e.type === "geo") return null;  // force only, not drawn
  // ... existing rendering ...
})}
```

They're force constraints, not relational data. Drawing them would clutter the view with O(located nodes) extra lines that say "this node is in this country" — already conveyed by proximity.

## Interaction

**Click country node** → `onNodeClick(countryNode)` → selects it like any other node. URL becomes `?selected=country:FR`. The detail panel opens.

**Detail panel — `NetworkDetailPanelCountry`** (new component, mirrors CCN/CRN/Address bodies):

- Header: flag emoji (derived from ISO code via `String.fromCodePoint`) + country name.
- Stat tiles: total nodes (located CCN + CRN), CCN count, CRN count.
- Owner diversity: count of unique owner addresses across this country's located nodes.
- Inactive count (faint footnote, only shown if > 0).
- Footer actions: `Focus` (existing focus action via `onFocus(node.id)`) and `× close`. No "View full details →" link — no country page in v1.

`network-detail-panel.tsx` adds a branch:

```tsx
if (node.kind === "country") {
  return <NetworkDetailPanelCountry ... />;
}
```

**Search** (`network-search.tsx`). The component is a single Input with a submit-on-Enter handler that runs `find` over `fullGraph.nodes` by `id.includes` / `label.includes`. Country nodes drop into the same pool — typing "France" matches `label`; typing "FR" matches the alpha-2 fragment in `id` (`country:FR`). One change to the submit handler: when the matched node's `kind === "country"`, set both `?focus=<id>` and `?selected=<id>` (focus action, ego subgraph + open panel). Other kinds keep the current select-only behavior. No dropdown / result rows in v1.

**Ego subgraph + focus.** `egoSubgraph` (in `src/lib/network-focus.ts`) walks the edges of the visible graph. With the geo layer on, `country:FR`'s geo edges connect to every located CCN/CRN in France; their structural/owner/staker neighbors are pulled in by the existing ego logic. No code change needed.

**Spotlight on selection** (existing). When a country is selected, the existing `relevantIds` logic (`{selected} ∪ direct-neighbors-via-any-visible-edge`) puts the country + its geo-edge neighbors in the spotlight; everything else dims to 0.18 opacity. Reads as "this country and its nodes" at a glance.

## Files

| File | Change |
|---|---|
| `src/lib/network-graph-model.ts` | Extend `GraphNodeKind`, `GraphLayer`, `GraphNode`. Extend `buildGraph` (country nodes + geo edges when layer active). |
| `src/lib/world-map-projection.ts` | Add `NETWORK_MERCATOR` params + `networkMercator` projection. |
| `src/lib/network-focus.ts` | Unchanged. |
| `src/hooks/use-network-graph.ts` | `ALL_LAYERS` includes `"geo"`. |
| `src/components/network/network-layer-toggles.tsx` | Add Geo entry to `ALL` list. |
| `src/components/network/network-graph.tsx` | Pin country nodes (`fx/fy`), per-edge `distance`/`strength` for geo, skip rendering geo edges, country label not gated by zoom threshold. |
| `src/components/network/network-node.tsx` | Country branch — small grey dot, no outer ring, sizeScale applied. |
| `src/components/network/network-search.tsx` | When matched node is `kind: "country"`, fire focus action (`?focus + ?selected`) instead of select-only. |
| `src/components/network/network-detail-panel.tsx` | Country branch in body selector. |
| `src/components/network/network-detail-panel-country.tsx` | **New** — country body. |
| `src/components/network/network-detail-panel-country.test.tsx` | **New**. |
| `src/components/network/network-legend.tsx` | Add country legend item conditional on geo layer. |

## Testing

- **`buildGraph` unit test**: with the geo layer, expected country nodes and geo edges appear; without the layer, neither do; unlocated CCN/CRN do not produce edges.
- **`network-detail-panel-country.test.tsx`**: renders flag, name, stat tiles; focus + close handlers wire correctly; inactive count hidden when zero.
- **`egoSubgraph` test**: focusing `country:FR` returns the country, its located nodes (via geo edges), and their structural neighbors.
- **Manual smoke**: toggle Geo on/off; search "France"/"FR"; click a country dot; focus from panel; combine Geo + Owner and verify cluster stretching; zoom in past `LABEL_ZOOM_THRESHOLD` and confirm country labels stay visible while CCN/CRN labels appear; reset view; reduced-motion preference still respected.

## Edge cases

- **Country with only inactive nodes** — still rendered. Matches existing convention.
- **Centroid missing for an ISO code** — node's `country` stays unset; node floats. Backlog item if it becomes common.
- **Geo on, all other layers off** — graph reduces to country nodes plus isolated CCN/CRN dots clustered around them. Valid view.
- **Two countries with nearly-identical centroids** (e.g. Monaco + France) — labels may overlap. v1 accepts.
- **Country search collision with a CCN/CRN named after a country** — `id` namespace `country:FR` keeps them distinct; result ranking prefers exact ISO/name matches.

## Out of scope (BACKLOG)

- `/country/<iso>` deep-link page with full breakdown
- Province/city-level granularity (needs larger geo DB)
- Search dropdown with result rows + per-kind chips (today's search is a submit-on-Enter input; promoting to a dropdown is a separate UX change)
- Animation when toggling Geo on/off mid-session
- Region grouping (continents) as a coarser layer above country
