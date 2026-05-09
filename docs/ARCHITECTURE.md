# Architecture

Technical patterns and decisions.

---

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, static export) |
| Language | TypeScript 5.x (strict, ESM only) |
| Styling | Tailwind CSS 4 + @aleph-front/ds tokens |
| Data | TanStack React Query (client-side polling) |
| Deployment | Static export (`out/`) for IPFS hosting (`trailingSlash: true`) |

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx         # Root layout (fonts, providers, app shell)
│   ├── page.tsx            # Overview page
│   ├── providers.tsx       # QueryClientProvider
│   ├── globals.css         # Tailwind + DS tokens import
│   ├── changelog/
│   │   └── page.tsx        # Changelog page (version history)
│   ├── credits/
│   │   └── page.tsx        # Credits page (credit flow diagram, recipient table)
│   ├── issues/
│   │   └── page.tsx        # Issues page (scheduling discrepancies, VM/Node perspectives)
│   ├── wallet/
│   │   └── page.tsx        # Wallet view (owned nodes, VMs, activity, permissions)
│   ├── nodes/
│   │   └── page.tsx        # Nodes page
│   ├── status/
│   │   └── page.tsx        # API status page (endpoint health checks)
│   └── vms/
│       └── page.tsx        # VMs page
├── api/
│   ├── types.ts            # Scheduler entity types + Aleph Message API types
│   ├── credit-types.ts     # Credit expense + distribution types (wire + app)
│   └── client.ts           # API client (/api/v1 + api2.aleph.im) with snake→camel transform
├── changelog.ts             # Version history data (CURRENT_VERSION + CHANGELOG array)
├── hooks/
│   ├── use-nodes.ts        # useNodes, useNode (30s/15s polling)
│   ├── use-vms.ts          # useVMs, useVM (30s/15s polling)
│   ├── use-vm-creation-times.ts  # useVMMessageInfo (api2, 5min stale, no polling)
│   ├── use-overview-stats.ts  # useOverviewStats (30s polling)
│   ├── use-health.ts       # useHealth — /health endpoint polling (30s)
│   ├── use-issues.ts       # useIssues — derived discrepancy data from useVMs + useNodes
│   ├── use-wallet.ts       # useWalletNodes, useWalletVMs, useWalletActivity, useAuthorizations
│   ├── use-wallet-rewards.ts # useWalletRewards — 24h credit rewards per node/role for a wallet
│   ├── use-credit-expenses.ts # useCreditExpenses — credit expense messages from api2
│   ├── use-node-state.ts   # useNodeState — corechannel CCN/CRN aggregate
│   ├── use-node-locations.ts  # useNodeLocations — joins live node state with build-time location snapshot
│   ├── use-debounce.ts     # useDebounce hook (generic, configurable delay)
│   └── use-pagination.ts   # usePagination hook (client-side page/pageSize state + slice)
├── components/
│   ├── app-shell.tsx       # Layout: sidebar + header + content
│   ├── app-sidebar.tsx     # Navigation sidebar
│   ├── app-header.tsx      # Hamburger menu + theme toggle
│   ├── theme-toggle.tsx    # Dark/light toggle with localStorage
│   ├── stats-bar.tsx       # Overview stats grid (glass cards, noise texture, semantic colors)
│   ├── node-health-summary.tsx  # Node health bar chart + legend
│   ├── vm-allocation-summary.tsx # VM status breakdown
│   ├── top-nodes-card.tsx   # Top nodes by VM count card
│   ├── latest-vms-card.tsx  # Latest VMs by creation time (progressive loading from api2)
│   ├── card-header.tsx     # Shared card header with title + info tooltip
│   ├── collapsible-section.tsx # CSS grid-template-rows animated expand/collapse
│   ├── filter-toolbar.tsx  # Shared: DS Tabs underline status filter + optional filter toggle + search input
│   ├── filter-panel.tsx    # Shared: collapsible DS Card panel chrome + reset
│   ├── table-pagination.tsx # Shared: DS Pagination + page-size dropdown + "Showing X–Y of Z"
│   ├── node-table.tsx      # Nodes table with search, filters, count badges
│   ├── node-detail-panel.tsx # Node detail side panel (quick-peek)
│   ├── node-detail-view.tsx # Node full-width detail view (?view= param)
│   ├── vm-table.tsx        # VMs table with search, filters, count badges
│   ├── vm-detail-panel.tsx # VM detail side panel (quick-peek)
│   ├── vm-detail-view.tsx  # VM full-width detail view (?view= param)
│   ├── issues-vm-table.tsx # Issues page: VM perspective table + detail panel
│   ├── issues-node-table.tsx # Issues page: Node perspective table + detail panel
│   ├── credit-flow-diagram.tsx  # SVG flow diagram with particle animation + gradient paths
│   ├── credit-recipient-table.tsx # Credit recipient table (DS Table, FilterToolbar, sortable columns)
│   ├── credit-summary-bar.tsx # Credit summary stat cards
│   ├── world-map-card.tsx  # Mercator world map with per-node SVG dots
│   └── resource-bar.tsx    # CPU/memory/disk usage bar
├── lib/
│   ├── filters.ts          # Filter pipeline: textSearch, countByStatus, applyNodeAdvancedFilters, applyVmAdvancedFilters
│   ├── filters.test.ts     # Filter unit tests (32 tests)
│   ├── credit-distribution.ts  # Credit expense distribution logic (computeDistributionSummary, computeWalletRewards)
│   ├── credit-distribution.test.ts # Distribution unit tests
│   ├── format.ts           # relativeTime, relativeTimeFromUnix, truncateHash, formatPercent, formatDateTime, formatCpuLabel, formatGpuLabel, formatAleph, explorerWalletUrl
│   ├── status-map.ts       # Status-to-visual maps: nodeStatusToDot(), NODE_STATUS_VARIANT, VM_STATUS_VARIANT, MESSAGE_TYPE_VARIANT
│   ├── world-map-projection.ts  # Web Mercator + equirectangular projection factories + deterministic per-hash scatter (mulberry32 + FNV-1a)
│   └── world-map-resolution.ts  # Multiaddr/hostname parsing helpers (used by build-time snapshot)
└── data/                   # Build-time JSON snapshots (committed)
    ├── country-centroids.json   # ISO-2 → {lat, lng, name}, generated from world-countries
    └── node-locations.json      # node hash → { country }, generated from corechannel + ip3country
```

```
scripts/
├── build-country-centroids.ts  # One-shot: world-countries → src/data/country-centroids.json
├── build-node-locations.ts     # Pre-build: resolves CCN multiaddr IPs + CRN hostnames to country codes
├── deploy-ipfs.py              # IPFS deployment via aleph-client
├── preview.sh                  # CLI for multi-branch preview (start/stop/list)
└── preview-dashboard.mjs       # Preview dashboard server (port 3000)
```

---

## Preview System

Multi-branch preview via git worktrees + concurrent dev servers.

| Command | Description |
|---------|-------------|
| `pnpm preview start <branch>` | Worktree + dev server on next available port |
| `pnpm preview stop <branch>` | Kill server, remove worktree |
| `pnpm preview stop-all` | Stop everything |
| `pnpm preview list` | Show active previews |

Dashboard on `http://localhost:3000` lists all active previews with links. State tracked in `.previews.json` (gitignored). Worktrees in `/tmp/previews/`, node_modules via hard-link copy.

---

## Patterns

### API Client

**Context:** Dashboard fetches live data from the scheduler API.
**Approach:** Fetches from `NEXT_PUBLIC_API_URL` (default: `http://localhost:8081`). Runtime URL override via `?api=` query parameter. API endpoints are prefixed with `/api/v1`. Wire types (`Api*Row`) use snake_case matching the raw JSON; transform functions convert to camelCase app types. List endpoints return paginated responses (`{items: T[], pagination: {page, page_size, total_items, total_pages}}`). The `fetchAllPages()` helper fetches page 1 to learn `total_pages`, then fetches remaining pages in parallel (max 200 items/page). Public functions (`getNodes`, `getVMs`, `getOverviewStats`) return full arrays — pagination is encapsulated in the client layer. Detail endpoints (`getNode`, `getVM`) use `fetchApi` for the bare object + `fetchAllPages` for related VMs/history.
**Key files:** `src/api/types.ts` (wire + app + pagination types), `src/api/client.ts`
**Notes:** The `getOverviewStats` function fetches `/stats` + `/vms` + `/nodes` in parallel to derive per-status counts not available from `/stats` alone. GPU fields (`gpus` on nodes, `gpu_requirements` on VMs) are transformed via `transformGpu` to the app-level `GpuDevice` type (vendor, model, deviceName). CPU fields (`cpu_architecture`, `cpu_vendor`, `cpu_features`) are mapped to app types (`cpuArchitecture`, `cpuVendor`, `cpuFeatures`). `formatCpuLabel()` in `format.ts` maps CPUID vendor strings (AuthenticAMD→AMD, GenuineIntel→Intel) to display labels. Confidential computing fields (`confidential_computing_enabled` on nodes, `requires_confidential` on VMs) are mapped to app types and surfaced in tables, filters, and detail views.

### Progressive Loading from Multiple APIs

**Context:** VM creation timestamps come from `api2.aleph.im`, not the scheduler API.
**Approach:** The `LatestVMsCard` uses `useVMs()` for immediate scheduler data, then enriches with `useVMCreationTimes(hashes)` which calls `api2.aleph.im/api/v0/messages.json`. Before api2 responds, rows show hash + status badge with inline `Skeleton` for timestamps. Once timestamps arrive, rows re-sort by creation time and show relative dates. The api2 client function (`getMessagesByHashes`) lives alongside scheduler functions in `client.ts` with its own base URL (`NEXT_PUBLIC_ALEPH_API_URL`).
**Key files:** `src/api/client.ts`, `src/hooks/use-vm-creation-times.ts`, `src/components/latest-vms-card.tsx`
**Notes:** `staleTime: 5min` since creation timestamps are immutable. `refetchInterval: false` — no polling needed. Query key includes the hash array so it refetches when the VM list changes. Hash lookups are batched (100 per request) to stay under URL length limits. The card pre-sorts all VMs by `updatedAt` and only sends the top 100 candidates to api2 (avoids sending all 6000+ hashes which caused timeouts). VMs with no matching api2 message show "—" instead of an eternal Skeleton.

### React Query Polling

**Context:** Real-time data without WebSockets.
**Approach:** Each hook uses `refetchInterval` for automatic polling. Detail views poll at 15s, list views and overview stats at 30s.
**Key files:** `src/hooks/`
**Notes:** `staleTime: 10_000` and `retry: 2` configured globally in providers.tsx.

### DS Component Policy

**Context:** Avoid duplicate UI primitives across projects.
**Approach:** All reusable UI components live in `@aleph-front/ds` and are imported via subpath exports. Dashboard-specific compositions that combine DS components with domain logic live in `src/components/`.
**Key files:** `node_modules/@aleph-front/ds/`, `src/components/`
**Notes:** DS is installed from npm (pinned version). The `@ac/*` path alias must be mapped in tsconfig.json (and vitest.config.ts) for DS internal imports to resolve. DS color tokens use `error`/`success`/`warning` naming (not Tailwind's `destructive`). Always verify token vars exist in DS `tokens.css` before use. Hash display uses `CopyableText` from `@aleph-front/ds/copyable-text` (middle-ellipsis, copy button, optional external link) — no local hash display component.

### Status Mapping

**Context:** The DS `StatusDot` component accepts a fixed set of variants (`"healthy" | "degraded" | "error" | "offline" | "unknown"`), but the API returns different node statuses (`"Healthy" | "Unreachable" | "Unknown" | "removed"`). Badge variants also need consistent mapping from API statuses.
**Approach:** `src/lib/status-map.ts` is the single source of truth for all status-to-visual mappings: `nodeStatusToDot()` for StatusDot, `NODE_STATUS_VARIANT` and `VM_STATUS_VARIANT` for Badge variants. All components import from this file — never define status variant maps locally.
**Key files:** `src/lib/status-map.ts`
**Notes:** Badge size should always be `"sm"` across the dashboard for consistency.

**VM status set (10 values):**

| Status | Variant | Meaning |
|--------|---------|---------|
| `dispatched` | `success` (green) | Running on the correct allocated node |
| `scheduled` | `default` (neutral) | Assigned to a node but not yet observed running |
| `duplicated` | `warning` (amber) | Running on the correct node plus extra unintended copies |
| `misplaced` | `warning` (amber) | Running on wrong nodes, not on the allocated node |
| `missing` | `error` (red) | Should be running but not found on any node |
| `orphaned` | `warning` (amber) | Running without any scheduling intent |
| `unscheduled` | `default` (neutral) | Deliberately not scheduled |
| `unschedulable` | `error` (red) | Cannot be placed — no node meets requirements |
| `unknown` | `default` (neutral) | No scheduling decision has been made yet |
| `migrating` | `info` (purple) | In-flight migration (future — not yet implemented) |

**Node counting logic for discrepancy statuses:**
- `duplicated`: excludes `allocatedNode` from the affected-node count (the allocated node is correct; only extra copies are discrepant)
- `misplaced`: counts all `observedNodes` (all observed locations are wrong because the VM is absent from the allocated node)

### Dark Theme Default

**Context:** Operations dashboards are typically used in dark environments.
**Approach:** `theme-dark` class on `<html>` element. ThemeToggle persists preference to localStorage and toggles the class. DS tokens resolve to dark variants via `@custom-variant dark`.
**Key files:** `src/app/layout.tsx`, `src/components/theme-toggle.tsx`

### App Shell Layout

**Context:** Consistent navigation across all pages.
**Approach:** AppShell wraps all pages with sidebar + header + scrollable content area. Three-layer visual hierarchy: sidebar and header use `bg-surface` (dark mode) / `bg-muted/40` (light mode) as app chrome; main content area uses `bg-background` with `rounded-tl-2xl` as a recessed panel; individual cards sit inside with their own borders. A subtle accent-colored radial glow (`main-glow::before`) adds depth to the content area. The header inherits its background from the parent wrapper (no own bg class) to avoid opacity stacking. Scroll position resets to top on route change via `usePathname` + ref. On desktop (`md+`), the sidebar is always visible. On mobile, it collapses to an off-canvas drawer. The sidebar auto-closes on route change. The sidebar header uses `LogoFull` from the DS (icon + "Aleph Cloud" wordmark). The API Status link shows a `StatusDot` with an animated SVG ring (`poll-ring` CSS animation) that draws over 30s matching the health poll interval, color-coded by `/health` endpoint status.
**Key files:** `src/components/app-shell.tsx`, `src/components/app-sidebar.tsx`, `src/components/app-header.tsx`, `src/hooks/use-health.ts`

### Overview Page Redesign

**Context:** The overview page needed more visual impact, spacing, and contextual help for users unfamiliar with Aleph Cloud terminology.
**Approach:** Hero stat cards with `text-4xl` numbers in rigid-square italic font, each in its own glassmorphism card (`bg-foreground/[0.03]`, `border-foreground/[0.06]`) with colored status indicators (green/amber/red), status-tinted backgrounds via CSS custom property `--stat-tint` at 7% opacity, SVG noise texture (`feTurbulence`) at 3% opacity for depth, and explanatory subtitles. Hero is a 2-column grid at `lg` (`lg:gap-12`, matching the `mt-12` gap to the row below): a 2×2 stat grid (Nodes Total/Healthy + VMs Total/Dispatched) on the left, the `WorldMapCard` on the right; below `lg` the grid stacks. Each column has a small uppercase section label above its content (`Nodes` / `Virtual Machines` for the StatsBar, `Network Map` for the worldmap), exported via `SectionLabel` from `stats-bar.tsx`. The StatsBar uses `flex h-full flex-col` with `flex-1` on each inner card row so the cards stretch vertically to match the worldmap card's height. The VMs "Total" counts only currently-active statuses (`dispatched + duplicated + misplaced + missing + unschedulable`) so the headline matches the sum of all active status cards on `/vms` and the donut ring proportions read correctly; long-tail statuses (Unreachable, Removed, Missing, Unschedulable, etc.) are reachable from the per-status pills on `/nodes` and `/vms` rather than dedicated hero cards. Content cards have larger `text-2xl` titles with `?` info tooltips (DS Tooltip component) and `padding="lg"`. Page has a `text-4xl` title with subtitle, and `mt-12` / `gap-8` spacing between sections. A shared `CardHeader` component provides the title + tooltip pattern for all 4 content cards.
**Key files:** `src/app/page.tsx`, `src/components/stats-bar.tsx`, `src/components/world-map-card.tsx`, `src/components/card-header.tsx`, `src/app/globals.css`
**Notes:** Stats grid uses 2 columns. The `.stat-card::before` pseudo-element reads `--stat-tint` from inline styles for dynamic color tinting. The `.stat-card::after` pseudo-element adds an SVG noise grain texture. The `.card-glow` utility adds `shadow-brand` on hover. Status-specific stat cards show a `DonutRing` SVG in the top-right corner (absolutely positioned) displaying the value/total ratio with an animated arc (1.2s CSS transition on `stroke-dashoffset`, triggered by `requestAnimationFrame` after mount). Each ring contains a centered Phosphor-style inline SVG icon matching the status semantics (check).

### Worldmap Card

**Context:** The Overview hero needed a visual signal of geographic spread to convey scale and decentralization at a glance.
**Approach:** `WorldMapCard` renders a Vemaps Web Mercator world map (`public/world-map.svg`, viewBox cropped to `100 140 600 333` for a centered Europe-leaning frame, dark navy `#2B2B44` continents) with one green SVG `<circle>` per sampled active node. Live node state comes from `useNodeState()` (corechannel aggregate); per-node country comes from a build-time JSON snapshot `src/data/node-locations.json` keyed by node hash. The `useNodeLocations(project)` hook joins the two: it filters live nodes where `inactiveSince == null`, drops nodes missing from the snapshot, looks up the country centroid in `src/data/country-centroids.json`, applies a deterministic per-hash elliptical scatter (~2° lat × ~3.2° lng), and projects via the supplied `Projection` function. The card supplies a Mercator projection calibrated empirically to the Vemaps SVG (`centerX: 400.8, equatorY: 395.7, R: 117.27, lngOffset: 11`) — the SVG is centered on lng+11° (Europe/Africa-centered, common for world maps), and the Mercator math was fit against four reference landmarks (Greenland tip, Greenland south, Cape York, Wilsons Promontory) to within ~5–10 px each. The overlay SVG matches the map's viewBox + `preserveAspectRatio="xMidYMid slice"` so the map fills the card edge-to-edge (object-cover behavior) regardless of card aspect. Each dot has a hash-seeded flicker animation (4–6s, 0–5s delay) via the `node-dot-flicker` keyframe; reduced-motion clients see no animation. Card chrome is theme-aware via CSS variables (`--map-dot-color`, `--map-vignette`) so the dot-pattern background and inner soft vignette adapt to light/dark.

**Per-country sampling:** the snapshot has ~500 nodes with heavy clustering (130 in FR, 130 in US). Rendering all of them produces a single bright green blob. The hook passes `sampleEvery: 10` to `computeNodeDots`, which groups nodes by country, sorts each group deterministically by hash, and takes `Math.max(1, Math.ceil(N / 10))` per country. This guarantees every country with active nodes gets at least 1 dot (so RU/IT/CA/SE never disappear) while keeping the total around ~60 dots — readable density. Per-country sampling is pluggable via the `sampleEvery` parameter; tests pass `1` (no sampling).
**Key files:** `src/components/world-map-card.tsx`, `src/hooks/use-node-locations.ts`, `src/lib/world-map-projection.ts`, `src/data/node-locations.json`, `src/data/country-centroids.json`, `public/world-map.svg`, `src/app/globals.css` (`node-dot-flicker` keyframe + `--map-dot-color` / `--map-vignette` theme vars)
**Notes:** No interaction in v1 — the expand button is disabled with a "Coming soon" tooltip. CCNs and CRNs render the same color (the design intent is fleet visibility, not breakdown). Snapshot misses (no resolved IP, foreign country code outside `world-countries`) are silently dropped. The map opacity is `0.2` in light theme and `1.0` in dark — `#2B2B44` continents on a light background read as too heavy at full opacity. Vemaps SVG is licensed under their attribution-required license; the `Map by Vemaps.com` link at the bottom-left is mandatory.

### Network Graph Page

**Context:** Operators need to see the structural shape of the Aleph network — how CRNs cluster under CCNs, who owns what, and where stake/reward flows aggregate — without flipping between table views.

**Approach:** `/network` renders a force-directed graph with `d3-force` driving simulation and React owning the DOM. The split: d3 mutates `SimNode` objects in place every tick; React reads positions from a `positionsRef: Map<id, {x,y}>` (NOT from the mutated simNodes). The tick handler updates `positionsRef`, batches a single re-render per animation frame via `setTickKey`, and rebuilds a `d3-quadtree` for hit-testing (used by the SVG-level click handler). Render iterates `graph.nodes` and reads `positionsRef.current.get(n.id)` per node, with the early-out `if (!p) return null` — so the **`simNodes` useMemo pre-populates `positionsRef`** using d3-force's Fibonacci-spiral seed (`radius = 10 * sqrt(0.5 + i)`, `angle = i * π * (3 − √5)`) for any node without a prior position, ensuring `<g data-id>` elements are in the DOM from the very first commit after data arrives. **Sync warmup on fresh mount:** when `positionsRef` is empty (initial load or after a reset-view `key` bump), the same useMemo also runs a throwaway `forceSimulation` synchronously for 300 ticks before returning, mutating the seed positions into a converged layout and writing them back into `positionsRef`. The first paint therefore shows the spread layout, not the spiral; the live sim is then created with `alpha(0)` so it doesn't re-shake. A `justWarmedUpRef` ref carries that signal from the useMemo (render phase) to the simulation effect (commit phase).

**Layout:** the page wrapper uses `relative h-full md:-m-6 md:h-[calc(100%+3rem)] md:overflow-hidden` to break out of `<main>`'s `p-6` padding and bleed edge-to-edge. A graph layer (`absolute inset-0 hidden md:block`) holds the SVG and the absolute-positioned `<NetworkLegend>`. A chrome overlay (`pointer-events-none relative z-10 hidden md:block`) stacks the `<header>`, `<NetworkLayerToggles>` + reset-view + search row, and `<NetworkFocusBanner>` on top of the graph; each interactive child gets `pointer-events-auto` so blank-area clicks fall through to the graph. Detail panel is `absolute right-0 top-0 bottom-0 z-20 w-[400px] bg-background` so it slides in over the map without squeezing it. Mobile gets a `md:hidden` flex column with the title + a list of CCNs (no graph rendering on phones).

**Interactions:**
- **Click** = select. Handled by an `onClick` on the SVG that hit-tests the quadtree (radius `HIT_RADIUS=12`) and calls `onNodeClick`. Suppressed during/after a drag via `dragInProgressRef` (with a `setTimeout(0)` reset-defer so the synthetic post-mouseup click doesn't fire selection on a long-press release).
- **Long-press 200ms** = drag. The `drag.start` handler sets a `setTimeout` that, on fire, sets `dragInProgressRef`, pins `d.fx/fy = d.x/y`, and computes `dragOffsetRef = nodePos − lastDragPointRef` using the most recent mouse position (`lastDragPointRef` is updated on every `drag` event, including those fired during the press window when the handler returns early). On real drag ticks: `d.fx = event.x + offset.x`. The captured offset preserves the press-time relationship between cursor and node, so the node doesn't jump to the cursor when the timer fires after the user has already moved.
- **Drag attachment** is delegated to `gRef.current` (the parent `<g>` that exists from mount) via d3-drag's `.container(() => gRef.current)` + `.subject(event => lookup.get(event.target.closest("g[data-id]")?.dataset.id))`. One drag behavior bound to the parent resolves the dragged node by walking up from the event target. This is timing-independent: drag works regardless of whether `<g data-id>` children were in the DOM at the moment the effect attached.
- **Hover** = no UI (the hover tooltip card was removed for visual quietness). Cursor stays `default` everywhere.
- **Pan/zoom** via d3-zoom on the SVG. Zoom filter rejects events on `g[data-id]` so drag wins on nodes; everywhere else, mousedown pans.

**Simulation tuning:**
- `alphaDecay = 0.05` for initial layout (slow settle reads as graceful).
- `alphaTarget = 0.05` during drag so neighbors gently settle into new positions instead of bouncing — `0.3` (the d3-force example default) was too lively.
- On `drag.end`: temporarily set `alphaDecay(0.15)` and register a namespaced `sim.on("end.dragCooldown", ...)` that restores `alphaDecay(SIM_DECAY)` and removes itself when the simulation auto-stops. Result: post-drag settles in ~0.4s without affecting the initial layout's pace.
- Charge `-180`, link distance `60` with d3-force's degree-aware default link strength (`1 / min(degree(source), degree(target))`) so dense subgraphs (owner/staker/reward cliques) don't crush together while the structural CCN↔CRN star stays snappy. Center force at `(size.w/2, size.h/2)` updated separately on resize without restarting the simulation (so opening the detail panel — which resizes the viewport — doesn't re-shake the graph).

**Auto-refit semantics:** `userMovedRef` flips to `true` on any drag/zoom/pan and resets to `false` only when `refitKey = "<layers>|<focus>|<address>"` changes — i.e., user-driven URL changes. On `sim.on("end")`, `refitRef.current()` calls `fitTransform` only if `userMovedRef` is `false`. So background polling refetches never disturb the user's viewport, but toggling a layer or focusing a node does fit the result. `fitTransform` pads the bounding box by 2× on each axis, caps zoom at `2`, and floors at `MIN_FIT_ZOOM = 0.3` — chosen so the full-graph reset shows the whole network with breathing room rather than cropping nodes off-screen at a higher minimum zoom. With the sync warmup in place (see Approach), the camera fits the converged extents in a single 450ms transition; the page-level "Updating…" indicator is gated to `SETTLE_MS = 500` to match.

**Layers:** `structural` (CCN↔CRN parent edges, default), `owner` (same-owner dashed), `staker` (stake links), `reward` (reward-cluster dotted). URL-persisted via `?layers=structural,reward`. Edge styling: solid `1px` for structural at `0.6` opacity (was `0.4`), staker at `0.2`; dashed `0.5px` with `strokeLinecap="round"` for `owner` (`1.5 1` dash, `currentColor` neutral gray at `0.2` — was a saturated `--network-edge-owner` blue at `0.25`, which competed with the structural backbone) and `reward` (`0 0.4` round dots). **Arrowheads:** structural edges whose target is a CRN end in a triangle marker via a single `<marker id="arrow-end">` defined in the SVG `<defs>`, sized `markerWidth/Height = 10 * nodeScale` in `userSpaceOnUse`. The marker's `fill="context-stroke"` (SVG2) makes the arrow inherit the line's stroke color, so a highlight or dim on the line carries through to the arrow without a per-marker variant. To keep the arrow tip outside the CRN's opaque background underlay, the line endpoint is shortened by `RADIUS.crn × nodeScale + 1.5` user units (math lives in the edge map in `network-graph.tsx`, not in `NetworkEdge`). When a node is selected, its incident edges are recolored to the node's kind color (`ccn → primary-500`, `crn → success-500`); non-incident edges flip to `faded` (existing path: `OPACITY[type] × 0.2`); see Selection spotlight below.

**Selection spotlight:** when `selectedId != null`, a `relevantIds` Set is built once per `(selectedId, graph)` change containing the selected node plus every direct neighbor reachable via any edge in the **currently visible** graph (so layer toggles change which neighbors count). Nodes outside the set render at group `opacity = 0.18`; their labels do too (the floating Badge layer reads the same `relevantIds`); edges where neither endpoint is the selected node go `faded`. Combined with the existing kind-colored highlight + halo on the focused node and its incident edges, the page reads as a clean spotlight on the 1-hop subgraph. With no selection, all nodes/edges render at full opacity and the dim path short-circuits.

**Focus mode** (`?focus=<id>`) replaces `visibleGraph` with `egoSubgraph(fullGraph, focusId)` — the focused node, its 1-hop neighbors, and the edges between them. The focus banner shows the focused node's label, connection count, and back/show-all buttons.

**Address deep-link** (`?address=0x...`) builds a `highlightedIds` Set of nodes where `n.owner === address`; those nodes get a pulsing primary-color ring (`network-node-pulse` keyframe) and the auto-refit zooms to fit them.

**Detail panel** (`?selected=<id>`): a 280px floating card anchored to `right-4 top-20 bottom-4` over the recessed content panel — opaque `bg-background` with `rounded-xl border shadow-md`, sized to clear the toolbar/search row above and the focus banner. The panel is composed of a shared shell (`network-detail-panel.tsx`) that renders the header (StatusDot + title + Focus + ×) and the optional "View full details →" footer (CCN/CRN only), plus three presentational bodies (`network-detail-panel-ccn.tsx`, `network-detail-panel-crn.tsx`, `network-detail-panel-address.tsx`) selected by `node.kind`. The shell looks up `CCNInfo`/`CRNInfo` from `nodeState` (now exposed by `useNetworkGraph`) and the parent CCN for CRNs; the CRN body keeps `useNode(hash)` for resource bars and VM count. Per-kind content is graph-relevant only — CCN shows score, CRN/Stakers stat tiles, total staked, owner, reward; CRN shows status, VM count, parent CCN (clickable), CPU/Memory bars, owner; staker/reward shows the address with copy + wallet link plus a degree summary against the visible graph. Heavier content (GPU lists, VM lists, history tables) lives only on `/nodes?view=<hash>`. The Focus action sets both `?focus` and `?selected` so the panel stays open after focusing — clicking Focus on a CRN's parent-CCN link rebinds the panel to the parent in one click.

**Node visuals:** base radii are `CCN=16` (with a tight `r+2` outer ring), `CRN=11`, `staker=5`, `reward=6` — bumped from the original `13/8/3/4` so dots read on a dark background at low zoom. All nodes render an opaque `var(--color-background)` underlay before the translucent (`fillOpacity=0.18`) colored fill so edges don't bleed through. Stroke width is `0.75` for clean edges. **Adaptive sizing:** the `nodeScaleForZoom(k)` helper returns a multiplier applied to every radius (and to the `<marker>` arrow size + the label gap calculation): `1` in the comfortable band `[0.6, 1.5]`, boosted up to `~1.9×` at `k=0` so dots stay visible when zoomed out, eased down to `0.7×` above `k=1.5` so dense clusters don't crowd. The result is quantized to `0.1` steps so smooth zoom doesn't thrash 500+ memoized `NetworkNode` re-renders; the scale is threaded through as a `sizeScale` prop on `NetworkNode`. **Selection** renders a translucent halo behind the node body — a single filled circle (rect for reward) at `r + 8`, in the node's own `color` at `fillOpacity=0.25`. No animation; the address-deep-link pulse (`network-node-pulse`) stays its own visual so the two states remain distinguishable when stacked. **Dim** (selection-spotlight): a `dimmed` prop on `NetworkNode` overrides the group `opacity` to `0.18` when set, taking precedence over `inactive`'s `0.6` so unrelated nodes recede uniformly under any prior state. **Labels** (CCN/CRN only) render as DS `Badge` (`fill="outline"`, `size="sm"`) above `LABEL_ZOOM_THRESHOLD=1.5`, with kind/status-mapped variants (`ccn → default` purple, `crn → success` green, `unreachable → error`, `inactive → info`); the `labelVariant()` helper lives in `network-graph.tsx` and the gap from the node is `r * nodeScale * k + 8`. Dimmed nodes' labels also render at `opacity: 0.18`.

**Dependencies** added: `d3-force`, `d3-zoom`, `d3-drag`, `d3-quadtree`, `d3-selection`, `d3-transition` — modular d3 packages, no full d3 bundle.

**Key files:** `src/app/network/page.tsx`, `src/components/network/network-graph.tsx` (d3 integration), `src/components/network/network-node.tsx`, `src/components/network/network-edge.tsx`, `src/components/network/network-detail-panel.tsx` (shell + dispatcher), `src/components/network/network-detail-panel-ccn.tsx`, `src/components/network/network-detail-panel-crn.tsx`, `src/components/network/network-detail-panel-address.tsx`, `src/components/network/network-focus-banner.tsx`, `src/components/network/network-layer-toggles.tsx`, `src/components/network/network-search.tsx`, `src/components/network/network-legend.tsx`, `src/lib/network-graph-model.ts` (pure builder + types), `src/lib/network-focus.ts` (ego subgraph), `src/hooks/use-network-graph.ts` (URL-driven layer/focus state, exposes `nodeState`). Tests: `src/lib/network-graph-model.test.ts`, `src/lib/network-focus.test.ts`, `src/components/network/network-detail-panel*.test.tsx`.

**Notes:** The `getNodeState()` parser in `src/api/client.ts` previously dropped CCN→CRN parent links; this branch reinstates them via a `parent` field on `CrnNode` and a `resourceNodes: string[]` field on `CcnNode`, used by the graph builder. Static export requires the page to wrap `<NetworkContent>` in `<Suspense>` because of `useSearchParams()` (Next.js 16 errors otherwise).

### Build-Time Data Preparation

**Context:** Per-node geolocation requires DNS resolution and an IP-to-country lookup. Doing both at runtime would add latency, network noise, and per-client cost; doing it once per build collapses that to a static JSON read.
**Approach:** `scripts/build-node-locations.ts` runs as a `prebuild` step (chained into `pnpm build` via `package.json`'s `build` script: `tsx scripts/build-node-locations.ts && next build`). It fetches the corechannel aggregate from `api2.aleph.im`, parses CCN `/ip4/.../tcp/...` multiaddrs and resolves CRN HTTPS hostnames via `dns.resolve4()`, runs each IP through the bundled `ip3country` DB, and writes `src/data/node-locations.json` (`hash → { country }`). The script is **never** the source of truth for failure: if api2 is unreachable, the response is non-OK, or the new dataset is < 50% of the previous (`ABORT_FRACTION`), it warns and keeps the existing committed JSON — production builds never silently regress to an empty map. `pnpm build:locations` runs the script standalone for ad-hoc refreshes. `scripts/build-country-centroids.ts` is a one-shot that materializes `src/data/country-centroids.json` from the `world-countries` package — re-run only when the upstream package adds new ISO codes.
**Key files:** `scripts/build-node-locations.ts`, `scripts/build-country-centroids.ts`, `src/lib/world-map-resolution.ts` (pure helpers, unit-tested), `package.json` (`build`, `build:locations`)
**Notes:** Both JSON outputs live under `src/data/` (not `public/`) so they're imported as ES modules — type-aware, bundled with the route, no runtime fetch. Pure parsing helpers (`parseIpv4FromMultiaddr`, `parseHostname`) live in `src/lib/world-map-resolution.ts` and are shared with any future runtime consumer. The `tsx` import of a sibling TS file uses an explicit `.ts` extension, which is how `tsx`'s ESM loader resolves it.

### Cross-Page Navigation via URL Search Params

**Context:** Users need to drill from overview cards to filtered list pages, and between node/VM detail panels.
**Approach:** URL search params (`?status=`, `?selected=`, `?hasVms=`, `?sort=`, `?order=`, `?view=`) are the cross-page communication mechanism. Pages read params on mount via `useSearchParams()` to initialize local state (read-once, no write-back). Overview hero stat cards use `<Link>` to navigate to filtered list pages (e.g. `/nodes?status=healthy`). Overview activity cards (Top Nodes, Latest VMs) link directly to detail views via `?view=hash`. Detail panels use `<Link>` for cross-entity references. Requires `<Suspense>` boundary in static exports since search params aren't known at build time.
**Key files:** `src/app/nodes/page.tsx`, `src/app/vms/page.tsx`, `src/components/node-health-summary.tsx`, `src/components/vm-allocation-summary.tsx`, `src/components/node-detail-panel.tsx`, `src/components/vm-detail-panel.tsx`
**Notes:** Tables accept `initialStatus`, `initialHasVms`, and `initialSort` props to seed filter/sort state from URL params. Validation via `Set.has()` prevents invalid status values from breaking the UI. DS Table `activeKey` prop highlights the selected row with a left border accent (`inset box-shadow`); the same accent appears on hover for all clickable rows. The DS Table has no initial sort API — pre-sort data before passing it to `<Table>`.

### Detail Views (Full-Width)

**Context:** Side panels show truncated data (10 history rows, no owner/IPv6/payment fields). Users need a full view with all metadata and complete history.
**Approach:** Search-param-based view switching. When `?view=hash` is present on `/nodes` or `/vms`, the page renders a `NodeDetailView` or `VMDetailView` instead of the table+panel layout. Side panels remain as quick-peek with a "View full details →" link. The `AppHeader` reads `?view=` to show entity-specific titles (e.g. "Node: abc12..."). Cross-links between detail views use `?view=` (not `?selected=`).
**Key files:** `src/components/node-detail-view.tsx`, `src/components/vm-detail-view.tsx`, `src/app/nodes/page.tsx`, `src/app/vms/page.tsx`, `src/components/app-header.tsx`
**Notes:** Uses search params instead of dynamic route segments (`/nodes/[hash]`) because IPFS static export can't resolve arbitrary dynamic paths. The `AppHeader` wraps `useSearchParams()` in a `<Suspense>` boundary to avoid hydration issues. New API fields surfaced: `owner`, `supportsIpv6`, `discoveredAt` (nodes), `allocatedAt`, `lastObservedAt`, `paymentType` (VMs). VM panels/detail views cross-reference the allocated node via `useNode(hash)` to display the node name alongside the hash link. Both detail views show an error card (with back button and error message) instead of rendering blank when the API call fails. Secondary fetches (history, related VMs) use `.catch(() => [])` so the primary entity still renders even if history endpoints fail. The "← Nodes" / "← Virtual Machines" back navigation uses `router.back()` instead of a hardcoded `<Link>` so it returns to the actual previous page (e.g. Overview, Issues) rather than always navigating to the list page.

### List Page Filter Pipeline

**Context:** Both Nodes and VMs pages need text search, status filters, and advanced filters (checkboxes, range sliders) — all client-side.
**Approach:** Four-stage pipeline applied in `useMemo`: (1) `textSearch` matches query against configurable fields, (2) `applyNodeAdvancedFilters` / `applyVmAdvancedFilters` applies checkbox and range filters, (3) `countByStatus` computes per-status counts on the filtered set (for badge display), (4) status filter selects a single status. Status is applied last so count badges show accurate per-status breakdowns after search+advanced filters. All filters are client-side post-fetch — none go in the React Query key. State setters wrapped in `useTransition` for responsive UI. Search input debounced at 300ms via `useDebounce`. The `CollapsibleSection` component uses CSS `grid-template-rows` animation for smooth expand/collapse. Filter panel uses a 3-column layout (`lg:grid-cols-3`) with glassmorphism card styling.
**Key files:** `src/lib/filters.ts` (pure filter functions + types), `src/lib/filters.test.ts`, `src/hooks/use-debounce.ts`, `src/components/collapsible-section.tsx`, `src/components/filter-toolbar.tsx`, `src/components/filter-panel.tsx`, `src/components/node-table.tsx`, `src/components/vm-table.tsx`
**Notes:** The visual shell (status tabs, optional filter toggle button, search input, DS Card panel chrome with reset) is shared via `FilterToolbar` and `FilterPanel` — both tables compose these with their own status config, filter content, and grid layout. `FilterToolbar` is generic over the status type and accepts an optional `leading` slot (rendered before status tabs, separated by a vertical divider) for page-specific controls like the Issues perspective toggle. The filter toggle button only renders when `onFiltersToggle` is provided — pages without advanced filters (e.g. Issues) omit it. `FilterPanel` wraps content in a DS `Card` component. Status filters use DS `Tabs` with `variant="underline"` and `overflow="collapse"` — tabs that overflow the container automatically collapse into a `⋯` dropdown. A `toTabValue()` helper maps the generic status type (which may be `undefined` for "All") to string values for Radix Tabs. Tooltips use native `title` attribute on `TabsTrigger`. Multi-select filters (VM type, payment status, CPU vendor) treat "all selected" and "none selected" identically as "no filter." Count badges show `filtered/total` format when non-status filters are active. The `VmType` values are lowercase (`"microvm"`, `"persistent_program"`, `"instance"`) matching the API wire format. Boolean checkbox filters: Staked, IPv6, Has GPU, Confidential (nodes); Allocated to a node, Requires GPU, Requires Confidential (VMs). Multi-select: CPU Vendor (AMD, Intel) on nodes. Filter panel uses a 4-column layout on nodes (`lg:grid-cols-4`: Properties, CPU Vendor, Workload, Hardware). Range slider extents (vCPUs, memory, VM count) are computed from the loaded fleet via `computeNodeFilterMaxes` / `computeVmFilterMaxes`, rounded up to the next power of two with a floor (`NODE_FILTER_MAX_FLOOR`, `VM_FILTER_MAX_FLOOR`), so the slider always covers every visible row even as the fleet's largest node grows. The same maxes are passed to `applyNodeAdvancedFilters` / `applyVmAdvancedFilters` so the "is this filter active?" check uses the dynamic extent rather than a hardcoded constant.

**Inactive-VM filter (default on).** The VMs page hides VMs whose `status` is not in `ACTIVE_VM_STATUSES` (`{dispatched, duplicated, misplaced, missing, unschedulable}`) by default — the same active-status definition as the Overview Total VMs card (Decision #65). State lives in `VmAdvancedFilters.showInactive` (default `undefined`/`false` = hidden); toggleable via a checkbox in the FilterPanel's Payment & Allocation column. Two-way URL persistence via `?showInactive=true` (param omitted at default). The pure filter `applyInactiveVmFilter(vms, showInactive)` runs in the pipeline only when no specific status pill is selected — clicking a non-active status pill (e.g. Unknown) bypasses the filter so per-status views always resolve to their true counts. Per-status pill count badges read directly from `filteredCounts` (untouched by the inactive filter); the All-tab badge sums only the active-status counts when `showInactive` is off. `ACTIVE_VM_STATUSES` lives in `src/lib/filters.ts` and is also imported by `src/api/client.ts` for the Overview headline. Count-badge format suppresses the `filtered/total` slash when the only thing culling rows is the default-on inactive-hide (no search, no other advanced filters) — the All-tab reads as a plain count so the default state doesn't shout.

**Tab visibility cap.** The DS `Tabs` component (`@aleph-front/ds@0.14.0+`) supports an optional `maxVisible?: number` prop that caps the visible tab count regardless of available width — used on the VMs page (via `FilterToolbar`'s `maxVisibleStatuses` prop) to lock the visible set to All/Dispatched/Scheduled, with the rest in the existing `⋯` overflow dropdown. When both width-based collapse and `maxVisible` are present, the stricter limit wins. Other list pages (Nodes, Issues) omit the prop and keep pure width-based collapse, so they remain unchanged.

### Issues Page — Derived Data Views

**Context:** DevOps investigating scheduling discrepancies had no dedicated view.
**Approach:** `/issues` page with a VMs|Nodes perspective toggle (`?perspective=vms|nodes`). No new API calls — `useIssues()` hook combines `useVMs()` + `useNodes()` to derive discrepancy sets. VM perspective table: Status, VM Hash, Issue, Scheduled On, Observed On, Last Updated. Node perspective table: Status (StatusDot + Badge), Node Hash, Name, Orphaned, Duplicated, Misplaced, Missing, Total VMs, Last Updated. Status pills and text search, no advanced filters (data set is small). Accessible from the sidebar utility section (alongside API Status) — positioned as a dev/ops diagnostic tool, not primary navigation.
**Key files:** `src/app/issues/page.tsx`, `src/hooks/use-issues.ts`, `src/components/issues-vm-table.tsx`, `src/components/issues-node-table.tsx`
**Notes:** `IssueVM` extends `VM` with `issueDescription`. `IssueNode` bundles a `Node` with discrepancy counts and the list of discrepancy VMs associated with it. The perspective toggle uses DS `Tabs` with `variant="pill"` (`@aleph-front/ds/tabs`), rendered inline with status pills via `FilterToolbar`'s `leading` slot. Five `DiscrepancyStatus` values: `orphaned`, `duplicated`, `misplaced`, `missing`, `unschedulable`. Node perspective filter pills: All / Has Orphaned / Has Duplicated / Has Misplaced / Has Missing. Node detail panel shows individual summary cards for each discrepancy type with the affected VM list below.

### Wallet View — Cross-API Entity Page

**Context:** Ops needs to investigate a specific wallet's resources and activity across the scheduler and Aleph network.
**Approach:** `/wallet?address=0x...` page combines data from three sources: scheduler API (nodes filtered by owner, VMs cross-referenced by hash), api2 messages endpoint (VM ownership via sender, activity timeline), and api2 authorization endpoints (granted/received permissions). `useWalletNodes()` filters existing `useNodes()` cache — no extra API call. `useWalletVMs()` fetches message hashes from api2 then cross-references against `useVMs()` for scheduler status. Activity section has a manual refresh button (invalidates React Query cache) for live troubleshooting. All wallet addresses in the dashboard (node owner, permission addresses) are clickable `<Link>`s to the wallet view, enabling wallet-to-wallet navigation.
**Key files:** `src/app/wallet/page.tsx`, `src/hooks/use-wallet.ts`, `src/api/client.ts`
**Notes:** VMs not found in the scheduler show "not tracked" status. Activity items link to Explorer for deep detail. Permissions show inline scope tags (types, channels, post_types, aggregate_keys). No sidebar entry — wallet view is a utility page reached via address links.

### Credit Distribution — Shared 24h Cache

**Context:** The Credits page and Wallet page both need credit expense data. The Wallet page shows per-node, per-role reward breakdowns for a specific address.
**Approach:** `useCreditExpenses(start, end)` is the shared React Query hook. Both pages compute stable timestamps via the shared `getStableExpenseRange(seconds)` helper (rounds to 5-minute intervals) so the query key stays consistent across mounts, page navigations, and the persisted cache. `RANGE_SECONDS` exports the canonical 24h/7d/30d window lengths. `computeWalletRewards()` takes an address, the raw expenses, and node state, then derives per-node CRN/CCN earnings and total staker earnings by replaying the distribution logic scoped to that address's owned nodes and stake.
**Key files:** `src/hooks/use-credit-expenses.ts` (hook + `getStableExpenseRange` + `RANGE_SECONDS`), `src/hooks/use-wallet-rewards.ts`, `src/lib/credit-distribution.ts` (`computeWalletRewards`), `src/api/credit-types.ts` (`WalletRewards`, `WalletNodeReward`)
**Notes:** CRN rewards are computed per credit entry (each has a `nodeId`). CCN rewards use score-weighted pool shares. Staker rewards use stake-weighted pool shares. Node state weights are precomputed once (stable across expense messages). The wallet page renders a "Credit Rewards (24h)" card with Node/Role/ALEPH columns.

### Persisted Query Cache + Prefetch

**Context:** The credit-expenses query against api2 takes ~20s on a throttled connection — every visit to `/credits` blocked on it. The wallet page hits the same endpoint for 24h windows.
**Approach:** `PersistQueryClientProvider` (from `@tanstack/react-query-persist-client`) wraps the app with a localStorage-backed persister (`@tanstack/query-sync-storage-persister`). `dehydrateOptions.shouldDehydrateQuery` whitelists only the `credit-expenses` query-key prefix — fast-polling queries (nodes, vms, health) and queries containing non-JSON-serializable values stay in-memory only. `maxAge: 24h`, `buster: CURRENT_VERSION` so a version bump invalidates persisted entries. Stable 5-minute-rounded timestamps mean cache keys collide across mounts. `useCreditExpenses` uses `placeholderData: keepPreviousData` so range-tab switches keep the previous range's numbers visible while the new query fetches. The Credits sidebar link calls `queryClient.prefetchQuery` for 24h expenses + node-state on `onMouseEnter`/`onFocus` (once per mount, guarded by a ref) so the in-memory cache is warm by the time the user clicks. The 24h prefetch shares its cache entry with `useWalletRewards` (which is also 24h) and matches the credits page's default range.
**Key files:** `src/app/providers.tsx`, `src/hooks/use-credit-expenses.ts`, `src/components/app-sidebar.tsx`
**Notes:** Persister storage is `undefined` during SSR/static-export build (the package supports this). The localStorage key is `scheduler-dashboard-rq`. The `buster` field on `persistOptions` is the React Query mechanism for cache invalidation across deploys — pinning to `CURRENT_VERSION` from `changelog.ts` ties cache lifetime to released versions.

**Two non-obvious rules for persisted queries (both enforced in `shouldDehydrateQuery`):**

1. **Only persist `status === "success"` queries.** React Query's `dehydrateQuery` includes the `promise` field for pending queries; `JSON.stringify` silently turns Promise objects into `{}`, and on rehydration the `placeholderData: keepPreviousData` path can deliver that empty object as `data`. The result: `data` is a non-array, non-empty object that bypasses `if (!data || data.length === 0)` checks and crashes downstream code. Persisting only success-state queries dodges this entirely.
2. **Never persist queries whose data contains `Map`, `Set`, `Date`, or `BigInt`.** They don't survive `JSON.stringify`/`JSON.parse` — Maps roundtrip as `{}` (losing entries and methods), Dates become strings, BigInt throws. `node-state` is the canonical example: its `ccns`/`crns` are Maps, so it's deliberately excluded from persistence.

### Credit Flow Diagram — Loading Placeholder

**Context:** While `useCreditExpenses` was in-flight the credits page showed a single grey skeleton block where the flow diagram would appear, leaving the page feeling empty during the slow api2 fetch.
**Approach:** `CreditFlowDiagram` accepts `summary: DistributionSummary | undefined`. When undefined, it renders `CreditFlowPlaceholder` — the same SVG layout (source/destination box positions, bezier connector paths) but with `var(--color-muted-foreground)` colors at low opacity, em-dash values instead of ALEPH amounts, no animated particles or gradients, and a subtle `animate-pulse` on the SVG. Boxes use the same `BOX_W`/`BOX_H` constants and Y coordinates as the live diagram so there's no visual jump when data arrives.
**Key files:** `src/components/credit-flow-diagram.tsx` (`CreditFlowPlaceholder`, `PlaceholderBox`)

### Credit Flow Diagram — Particle Animation

**Context:** The credit distribution Sankey-style diagram needed engaging animation to convey flow directionality.
**Approach:** Three-layer SVG rendering per flow path: (1) invisible measurement `<path>` in `<defs>` for `getTotalLength()` and `<animateMotion>` references, (2) gradient-stroked background path, (3) `<circle>` particles with `<animateMotion>` traveling along the path. Source→destination gradients use `<linearGradient gradientUnits="userSpaceOnUse">`. Particles are randomized (size, speed, opacity, spacing) via a seeded pseudo-random function (`Math.sin` based) to avoid hydration mismatches from `Math.random()`. ~20% of particles get a glow effect (`feGaussianBlur` filter) with larger radius for visual interest. Particles use negative `begin` offsets to appear pre-populated across all paths on first render (no empty lines on load). All paths from each source box originate from a single point (the box center Y), fanning out to their destinations. Hover dims unrelated paths/boxes (35% flows, 50% boxes) and expands the hovered flow's pill badge to show an ALEPH amount. Percentage labels are pill badges (rounded rect + text) positioned at parametric bezier points with staggered `t` values (storage paths at t=0.3–0.45, execution at t=0.55–0.7) to avoid overlap. Source boxes have a colored left accent bar. Wrapped in DS `Card` component.
**Color mapping:** Storage=accent-500 (lime), Execution/CRN=success-500 (green), CCN=primary-400 (purple), Stakers=warning-400 (amber), Dev Fund=error-400 (coral). Each flow has a unique hue for readability in both light and dark modes.
**Key files:** `src/components/credit-flow-diagram.tsx`, `src/app/globals.css` (`flow-draw`, `fade-in` keyframes)
**Notes:** `pathLength` is measured via `useRef` + `useEffect` for gradient stroke rendering. Particle count scales with flow thickness (`max(10, thickness * 2.5)`). Base animation duration is 4.5s+ (slow, organic feel). `bezierPoint()` evaluates the cubic bezier at arbitrary `t` for label placement.

### Credit Revenue Sparkline

**Context:** Jonathan requested a chart showing "evolution of total credits over time" inside the Total Revenue stat card on the credits page.
**Approach:** Pure SVG sparkline (zero dependencies). `buildCumulativeSeries()` buckets the already-fetched `CreditExpense[]` into time intervals (hourly for 24h, 6-hourly for 7d, daily for 30d) and returns a cumulative `{t, value}[]` series. The `Sparkline` component renders a `<polyline>` stroke + `<polygon>` gradient fill. It bleeds to the card edges via negative margins (`-mx-6 -mb-6`). Gradient IDs use `useId()` with colon-stripping (SSR-safe, no `CSS.escape`). `preserveAspectRatio="none"` + `vectorEffect="non-scaling-stroke"` for fluid width with consistent stroke.
**Key files:** `src/lib/sparkline-data.ts`, `src/components/sparkline.tsx`, `src/components/credit-summary-bar.tsx`
**Notes:** Only the Total Revenue card gets the sparkline. Returns `null` for <2 data points. `aria-hidden="true"` since the chart is decorative.

### Sidebar Categories

**Context:** With 5+ nav items, flat navigation list needed structure.
**Approach:** Two categories: Dashboard (Overview), Resources (Nodes, VMs, Credits). Small uppercase section titles as visual grouping only (not clickable, no collapse). Issues and API Status are grouped behind a "More" overflow popover button in the sidebar footer — Issues is a dev-focused diagnostic page, not primary navigation. The trigger button shows a `⋯` icon, "More" label, and the API health `StatusDot` so health status is visible at a glance without opening the menu. Popover opens upward, closes on click-outside or navigation.
**Key files:** `src/components/app-sidebar.tsx`
**Notes:** `NAV_SECTIONS` array drives the main nav rendering. The `UtilityMenu` component manages popover state with `mousedown` click-outside detection.

### Client-Side Pagination

**Context:** Both list pages render hundreds of rows. Displaying all at once hurts scroll performance and makes scanning difficult.
**Approach:** `usePagination(items)` hook owns `page` and `pageSize` state, returns a sliced `pageItems` array. Pagination is the **last step** in the filter pipeline: `allData → search → advancedFilters → statusFilter → sort → paginate → Table`. A `useEffect` resets to page 1 when any filter input changes. The `TablePagination` component composes the DS `Pagination` with a page-size dropdown (25/50/100) and a "Showing X–Y of Z" label. Hidden when total pages ≤ 1.
**Sort scope:** Sorting is lifted out of the DS `Table` and runs on the **full filtered dataset** before pagination. Each table owns `sortColumn` / `sortDirection` state, applies it via `applySort` from `src/lib/sort.ts` (which mirrors the DS Table comparison rules so indicator and row order stay in sync), then slices to `pageItems`. The DS Table operates in controlled mode (`sortColumn` / `sortDirection` / `onSortChange` props from `@aleph-front/ds@0.13.3`) so it skips its internal sort and renders the indicator from the props. If the table sorted internally on `pageItems`, clicks would only re-order the visible 25 rows — high-stat rows on later pages would never bubble up.
**Key files:** `src/hooks/use-pagination.ts`, `src/components/table-pagination.tsx`, `src/lib/sort.ts`, `src/components/node-table.tsx`, `src/components/vm-table.tsx`, `src/components/issues-vm-table.tsx`, `src/components/issues-node-table.tsx`, `src/components/credit-recipient-table.tsx`
**Notes:** Page clamping happens via `setState` during render (React's idiomatic pattern for derived-state corrections) to avoid an extra render cycle. Data fetching is unchanged — `fetchAllPages` still retrieves all records; pagination is purely a display concern.

### Responsive Layout

**Context:** Dashboard must work on mobile, tablet, and desktop.
**Approach:** Two breakpoints: `md` (768px) for sidebar visibility, `lg` (1024px) for detail panel layout. Mobile sidebar is a fixed overlay with backdrop. Detail panels (Nodes, VMs) render as full-width slide-in overlays below `lg`, inline side panels above. Tables use `overflow-x-auto` for horizontal scrolling on narrow screens. When a detail panel is open on desktop, lower-priority table columns are hidden to prevent the table from being squeezed — columns reappear when the panel closes. Each table defines a `COMPACT_HIDDEN_HEADERS` set; columns are filtered by header string when `compact` is true (or when the internal selection state is non-null for self-contained tables like Issues). The `FilterToolbar` + `FilterPanel` always render above the `flex gap-6` container that holds the table and detail panel side-by-side — this ensures the toolbar gets full width regardless of whether the panel is open. Table components (`NodeTable`, `VMTable`) accept a `sidePanel` prop for the detail panel; the flex layout wrapping `Table` + `TablePagination` + `sidePanel` lives inside the table component.
**Key files:** `src/components/app-sidebar.tsx`, `src/app/nodes/page.tsx`, `src/app/vms/page.tsx`, `src/components/node-detail-panel.tsx`, `src/components/vm-detail-panel.tsx`, `src/components/node-table.tsx`, `src/components/vm-table.tsx`, `src/components/issues-vm-table.tsx`, `src/components/issues-node-table.tsx`
**Notes:** Uses `bg-background` token for the content area. Detail panels use glass card styling (`bg-foreground/[0.03]`, `border-foreground/[0.06]`, `variant="ghost"`), `lg:sticky lg:top-0` to stay visible while scrolling, and truncate long lists (6 VMs, 5 history entries) with "+N more" indicators to keep the "View full details →" CTA reachable. Adaptive column hiding priority tiers: Nodes hides GPU/CPU/VMs; VMs hides Type/Node/Last Updated; Issues VM hides Scheduled On/Observed On; Issues Node hides Total VMs/Last Updated.

---

## Recipes

### Adding a New Page

1. Create `src/app/<route>/page.tsx`
2. Add nav entry to `NAV_ITEMS` in `src/components/app-sidebar.tsx`
3. Verify with `pnpm build` (static export must include the route)

### Typography & Motion System

**Context:** Dashboard needed to feel more premium to prospective operators evaluating Aleph Cloud.
**Approach:** Three-tier font hierarchy: Rigid Square (headings, via Typekit), Titillium Web (body, via Typekit), Source Code Pro (technical data, via Google Fonts). The `--font-mono` CSS variable overrides Tailwind's `font-mono` stack so all existing `font-mono` usage automatically resolves to Source Code Pro. A shared `--ease-spring` CSS variable (`cubic-bezier(0.16, 1, 0.3, 1)`) coordinates entrance animations. Card entrance uses CSS `@keyframes card-entrance` (opacity + translateY) with staggered `animation-delay` on overview stat cards. All animations respect `prefers-reduced-motion`.
**Key files:** `src/app/globals.css`, `src/components/stats-bar.tsx`

### Network Health Page

**Context:** The API Status page needed marketing-grade presentation for prospective operators.
**Approach:** Reframed `/status` as "Network Health" with left-aligned title and a status `Badge` (success/error variant) showing "All Systems Operational" or degraded count. Glassmorphism stat cards for Endpoints Healthy and Avg Latency (computed from probe results). A third card shows Last Checked timestamp with a Recheck button. Endpoint sections in a side-by-side 2-column grid (`lg:grid-cols-2`), simplified headers with "N/N healthy" text count (removed per-section donut rings). Same endpoint probing logic — no new API calls.
**Key files:** `src/app/status/page.tsx`, `src/components/app-sidebar.tsx`

### API Status Page (legacy name — now Network Health)

See "Network Health Page" above. URL remains `/status`.

### Deploying to IPFS

**Context:** Static export deployed to IPFS via Aleph Cloud with delegated billing.
**Approach:** Manual `workflow_dispatch` trigger in GitHub Actions. The workflow builds the site, uploads `out/` to IPFS via the Aleph SDK (not CLI — the CLI lacks delegation support), and prints the gateway URL in the job summary. Uses `aiohttp.FormData` with explicit filenames for correct MIME type inference. CIDv0→CIDv1 conversion for subdomain gateway format.
**Key files:** `.github/workflows/deploy.yml`, `scripts/deploy-ipfs.py`
**Auth:** CI wallet signs messages, main wallet (`0xB136...`) pays via `address` parameter in `create_store()`. CI wallet private key stored as `ALEPH_PRIVATE_KEY` GitHub Actions secret.
**Gateway URL format:** `https://<cidv1>.ipfs.aleph.sh/`

### Adding a New API Endpoint

1. Add types to `src/api/types.ts`
2. Add client function to `src/api/client.ts`
3. Create hook in `src/hooks/` with appropriate `refetchInterval`
