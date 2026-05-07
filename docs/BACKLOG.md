# Backlog

Ideas and scope creep captured for later consideration, triaged by readiness.

---

## How Items Get Here

- Scope drift detected during focused work (active interrupt)
- Ideas that come up but aren't current priority
- "We should also..." moments
- Features identified but deferred

New entries land in one of the three live sections below. When unsure, default
to **Needs planning** — it's cheaper to demote a too-fuzzy item than to ship a
half-baked one from **Ready to execute**. As entries get refined or
deprioritized, move them between sections (Roadmap → Needs planning → Ready to
execute → Completed).

---

## Ready to execute

Scope is clear, no open questions, can be picked up in a single sitting. Small
to medium size (one PR, one focused session).

### 2026-05-01 - Port deploy-ipfs.py to aleph-cloud-app's robust pattern
**Source:** Cross-repo learning — aleph-cloud-app's `scripts/deploy/client.py` solved a class of CI deploy failures (PRs #74, #75, #76 there)
**Description:** Our current script gets the timeout-fix bandage (PR #84 here), but a fuller port would make deploys reliably durable: switch IPFS upload from `aiohttp` to `requests` (simpler, well-understood timeout semantics); switch `create_store`/`create_aggregate` to `sync=False` + poll STORE/AGGREGATE message status until `processed`; add IPFS DHT propagation wait + post-resolve sleep before the STORE write to avoid `error_code: 4 — File not found` rejections; add structured rejection banners + `$GITHUB_STEP_SUMMARY` markdown table; bump GitHub job `timeout-minutes` to ~25. See `aleph-cloud-app/scripts/deploy/client.py` for the canonical pattern.
**Priority:** Medium

### 2026-03-20 - Sparkline hover tooltip
**Source:** Credit sparkline implementation
**Description:** Add a tooltip on sparkline hover showing the exact ALEPH value and timestamp at the cursor position. Would require tracking mouse position relative to the SVG and mapping x-coordinate back to the data series.
**Priority:** Low

### 2026-03-18 - Contextual Issues entry points from VM/node detail pages
**Source:** Issues page nav reorg (Decision #55)
**Description:** Add "View related issues" or similar links in VM and node detail views/panels when the entity has scheduling discrepancies (orphaned, missing, unschedulable). Provides a natural discovery path for the Issues page from relevant context.
**Priority:** Medium

### 2026-03-17 - DS CopyableText: show arrow icon for internal links
**Source:** Credit recipient table — internal hrefs (`/nodes?view=...`, `/wallet?address=...`) don't show the ArrowUpRight icon
**Description:** The DS `CopyableText` component only renders the arrow icon for external URLs (`isExternalUrl` check). Internal links should also show the arrow (without `target="_blank"`). Patched locally in `node_modules`; needs to be applied in `@aleph-front/ds`.
**Priority:** High

---

## Needs planning

Intent is agreed but there are open questions, design choices, or multi-step
coordination required. Needs a brainstorm or spec before someone can execute.
Multi-day / multi-PR work.

### 2026-05-01 - Pre-aggregated credit totals from backend
**Source:** Credit page slow-load research (Decision #60)
**Description:** Ask Olivier to publish a small Aleph AGGREGATE message (or expose a precomputed endpoint) with daily/hourly credit totals + per-recipient breakdowns. Page fetches a tiny doc instead of paging through ~1440 `aleph_credit_expense` messages. Would replace the current ~20s api2 fetch with a single small request. Best long-term solution; persisted cache + prefetch + placeholder are interim wins.
**Priority:** Medium

### 2026-03-21 - CI preview deploys to IPFS per branch
**Source:** Multi-branch preview brainstorming
**Description:** Add a GitHub Actions workflow that builds and deploys each feature branch to IPFS on push, then posts the preview URL (`https://<cid>.ipfs.aleph.sh/`) as a PR comment or commit status. Enables comparing multiple in-flight features via sharable URLs before deciding which to merge. Reuses existing `deploy.yml` patterns (pnpm build → aleph-client upload). Each branch gets its own content-addressed CID.
**Priority:** Medium

### 2026-03-20 - Credit insights row (credit price + network activity counts)
**Source:** Credit data audit — prototyped and reviewed in dev, backlogged for now
**Description:** A compact row below the summary cards showing Credit Price (ALEPH/credit rate), Unique Payers, Active VMs, and Active CRNs. Was implemented (`credit-insights-row.tsx`) and the data fields added to `DistributionSummary` (`uniquePayers`, `uniqueVms`, `uniqueCrns`, `creditPriceAleph`). Reverted before merge — revisit when the page has more breathing room or Jonathan wants it.
**Priority:** Medium

### 2026-03-20 - Top VMs by Cost card on credits page
**Source:** Credit data audit — `perVm` map is already computed but not rendered
**Description:** A ranked card showing which VMs cost the most ALEPH in the selected period. Component was prototyped (`top-vms-cost-card.tsx`, follows `TopNodesCard` pattern with bar chart rows) but removed before merge — needs better placement decision (competes with recipient table for space). Data is ready in `DistributionSummary.perVm`.
**Priority:** Medium

### 2026-03-20 - CCN→CRN topology view
**Source:** Data audit — corechannel aggregate has `resource_nodes[]` (CCN→CRN children) and CRN `parent` field
**Description:** Network topology showing which CRNs belong to which CCN. Data is already fetched via `getNodeState()` but parent-child relationships are dropped during parsing. Could be a tree view, network graph, or hierarchical table on the nodes page.
**Priority:** Medium

### 2026-03-20 - Per-staker breakdown per CCN
**Source:** Data audit — `ccn.stakers` map has individual staker addresses and amounts
**Description:** Currently staker data is aggregated into a single pool for credit distribution. Could show per-CCN staker lists with individual amounts — a staker leaderboard or drill-down on CCN detail views. Data available in `NodeState.ccns[].stakers`.
**Priority:** Medium

### 2026-03-19 - Expose `?scheduling_status=` API filter in UI
**Source:** VM status expansion brainstorming
**Description:** The scheduler API now supports a `?scheduling_status=` filter for raw scheduling intent (scheduled/unscheduled/unschedulable/unknown), independent of observation-based `?status=`. Could be exposed as a second filter dimension (e.g. two-tier tabs or an advanced filter) for power users who want to combine intent + observation queries. Not needed for v1 of the status expansion — the flat status tabs cover the primary use case.
**Priority:** Low

### 2026-03-05 - Mobile-responsive filter UI
**Source:** Identified while brainstorming list page filtering overhaul
**Description:** Adapt the new filter bar (search, collapsible filters, status pills with count badges) for mobile viewports. Desktop version comes first; mobile adaptation deferred.
**Priority:** Medium

### 2026-03-04 - Stats sparklines via client-side accumulation
**Source:** Identified while working on real API migration (Decision #14)
**Description:** The API has no `/stats/history` endpoint. Sparklines were removed during migration. Could accumulate stats snapshots client-side in React Query cache (or a simple in-memory ring buffer) to rebuild 24h trend data. Better solution: request a `/stats/history` endpoint from the backend team.
**Priority:** Medium

### 2026-03-01 - E2E tests
**Source:** Implementation plan
**Description:** Add Playwright E2E tests for critical user flows: navigate pages, filter tables, open detail panels, toggle theme.
**Priority:** Medium

### 2026-03-01 - Resource usage charts
**Source:** Design doc
**Description:** Add time-series charts for CPU/memory/disk usage history on node detail views. Recharts was removed during API migration — would need to re-add or use a lighter charting library.
**Priority:** Medium

---

## Roadmap ideations

Forward-looking ideas, possibly tied to a longer-form evolution doc. Not
actionable yet; captured so they're not lost. Might never ship in current
form, or might mature into a **Needs planning** entry once the surrounding
context lands.

### 2026-03-11 - Wallet identity hub (User Command Center evolution)
**Source:** Wallet view brainstorming
**Description:** Expand the wallet view beyond ops/debugging into a richer identity hub: wallet balance, ALEPH staking, transaction history, etc. Part of a broader evolution from an ops dashboard to a User Command Center. Build on top of the Phase 1 ops-focused wallet view.
**Priority:** Low

### 2026-03-01 - WebSocket migration
**Source:** Design doc
**Description:** Replace polling with WebSocket connections for real-time event streaming. Would reduce latency and server load compared to 10-30s polling intervals.
**Priority:** Medium

### 2026-03-01 - Sidebar component in DS
**Source:** App shell implementation
**Description:** The AppSidebar is currently a local component. If other Aleph projects need similar navigation, consider promoting it to the DS with configurable nav items.
**Priority:** Low

### 2026-05-06 - Worldmap v2: interactive node map
**Source:** Worldmap v1 implementation (Decision #69) explicitly punted interaction
**Description:** Add hover state per dot (node hash + country tooltip), click-to-detail (link to `/nodes?view=<hash>`), zoom/pan, and layer toggles for CRN vs CCN. Likely the moment to bring in `react-simple-maps` or D3 — pure SVG `<circle>` works for v1 but a real picker / hit-testing logic gets uncomfortable. Could also reuse the expand button (currently disabled with "Coming soon" tooltip) as the entry point to a full-screen modal map.

### 2026-05-06 - Worldmap city-level granularity
**Source:** Worldmap v1 implementation (Decision #69)
**Description:** Plot dots at city centroids instead of country centroids. Would need a larger geo DB (e.g. MaxMind GeoLite2-City, ~70MB) bundled at build time, or a smaller curated set of likely datacenter cities. v1 uses country centroids + hash-seeded scatter (~1.5°), which reads as continent-scale density without committing to specific cities.

### 2026-03-09 - Allocation timeline
**Description:** Visual timeline of VM migrations using history data. Show scheduled/migrated events per VM as a timeline component.

### 2026-03-09 - Health trends dashboard
**Description:** Track node health transitions over time, show uptime percentage per node. Likely needs a backend `/stats/history` or `/nodes/:hash/health` endpoint.

### 2026-03-09 - Resource capacity planning
**Description:** Cluster-wide utilization view — aggregate vCPU/memory/disk across all nodes, show remaining headroom. Data already available from node resources.

### 2026-03-09 - Alerts / anomaly indicators
**Description:** Flag nodes losing VMs or going unreachable frequently. Client-side heuristic from history data — detect patterns like repeated status changes.

### 2026-03-09 - Aleph Cloud hosting architecture research
**Description:** The current static export + client-side polling model won't scale long-term (fetching all pages on every poll, no persistent state, no indexing). Research how to run a proper frontend + backend on Aleph Cloud. Key questions: Can we run a backend VM on Aleph that indexes scheduler data and serves it via API? Can we use Aleph messages (STORE, AGGREGATE, POST) to persist historical snapshots, user preferences, or pre-computed stats? What's the deployment model — VM instance for the backend, static IPFS for the frontend, or both on a single instance? Look at existing Aleph Cloud apps (explorer, account) for patterns. Also consider filter state persistence as part of this — advanced filters (e.g. Has GPU) are lost on navigation because they live in React state, not URL params. The right solution depends on the architecture: URL params for static, server-side filter state or proper routing for a backend model.

### 2026-03-10 - ~~Authorization reverse-index indexer~~ → Integrated via api2 endpoints
**Source:** Wallet view research (2026-03-10)
**Description:** ~~Build a backend indexer for reverse permission lookups.~~ Integrated using api2's existing `/api/v0/authorizations/granted/` and `/api/v0/authorizations/received/` endpoints in the wallet view. If Olivier's CCN endpoint offers additional data, can enhance later.

### 2026-03-09 - Bookmarkable filter URLs
**Description:** Write active filters back to URL search params (currently read-once on mount). Enables sharing filtered views via URL.

---

## Paused (waiting on backend)

Items where the path forward is clear but blocked on external work.

### 2026-03-09 - Server-side search
**Source:** API pagination migration analysis
**Description:** Push search to API instead of client-side filtering. Would replace `textSearch()` in `filters.ts` with a `?search=` query param. Already have `useDebounce` hook ready.
**Blocked on:** Olivier adding search query params to v1 list endpoints

### 2026-03-09 - Expanded `/stats` endpoint
**Source:** API pagination migration analysis
**Description:** Request per-status breakdowns in `/stats` response (unreachable/unknown/removed nodes, scheduled/orphaned/missing/unschedulable VMs). Currently `getOverviewStats()` fetches all nodes + all VMs just to count by status — wasteful and won't scale.
**Blocked on:** Backend change from Olivier

---

## Completed

<details>
<summary>Archived items</summary>

- ✅ 2026-05-04 - Default credits range switched from 7d to 24h to align with wallet rewards (24h hardcoded there); sidebar prefetch now warms the same cache key — first credits/wallet visit in a 5-minute rounding window is instant. Resolves a row-vs-detail confusion users hit when drilling from a credits row into `/wallet?address=…` and seeing different ALEPH totals (Decision #68, PR #98)
- ✅ 2026-03-06 - Latest VMs card hash tooltip removed — current card renders the full hash as a plain `<span>` (no `CopyableText`, no `Tooltip`); the original `truncateHash` + Tooltip wrapper was dropped during a later refactor of the card
- ✅ 2026-05-06 - Worldmap card on Overview hero — Vemaps Web Mercator world map with one green SVG dot per sampled active node (CRN+CCN combined, per-country 1-in-10 sampling so RU/IT/CA always render), build-time JSON snapshot of node hash → country (`scripts/build-node-locations.ts` resolving CCN multiaddrs + CRN hostnames via DNS + `ip3country`), country centroids from `world-countries`, calibrated Mercator projection (centerX/equatorY/R/lngOffset fit against four landmarks), deterministic per-hash elliptical scatter (~2° lat × ~3.2° lng), hash-seeded subtle flicker animation respecting `prefers-reduced-motion`, theme-aware dot-pattern bg + inner vignette, map fills card via object-cover + SVG slice; slimmed Overview hero to 2×2 stat grid (Nodes Total/Healthy + VMs Total/Dispatched, dropped Unreachable/Removed/Missing/Unschedulable cards) — closes the long-standing "Node map / geo view" roadmap item (Decision #69)
- ✅ 2026-05-04 - VMs page "Show inactive VMs" filter + status pill cap — default-on filter hiding VMs whose status is not in ACTIVE_VM_STATUSES (matches Overview Total VMs definition, Decision #65); FilterPanel placement, ?showInactive=true URL persistence, bypassed when a specific status pill is selected; status pills capped to 3 visible (All / Dispatched / Scheduled) via new DS Tabs `maxVisible` prop (`@aleph-front/ds@0.14.0`), rest in `⋯` overflow (Decision #67, Reza feedback)
- ✅ 2026-05-04 - Credits recipient table: search by node name + whole-row click to `/wallet?address=…`, with `Matched: <name>` chip in Sources cell when row matched only via node name (Decision #66)
- ✅ 2026-05-04 - Overview "Total VMs" semantics — count only active statuses (dispatched + duplicated + misplaced + missing + unschedulable), update subtitle (Decision #65, Reza feedback)
- ✅ 2026-05-03 - Credit recipient table: drop misleading Node column, lead with Address, replace Roles with Sources column reading "2 CRNs · 1 CCN · staking" (Decision #64)
- ✅ 2026-05-02 - Sort scope bug on Nodes/VMs/Issues/Credits tables — sort was scoped to the visible page; lifted into each component to sort the full filtered dataset before pagination via DS Table controlled-sort props (Decision #63)
- ✅ 2026-05-02 - VMs filter Memory unit — switched from MB to GB (Decision #63)
- ✅ 2026-03-02 - Align DS color tokens with Tailwind conventions — resolved by Decision #11 (dashboard uses `--color-error-*` tokens directly)
- ✅ 2026-03-03 - IPFS page refresh: add trailingSlash — fixed by adding `trailingSlash: true` to `next.config.ts`
- ✅ 2026-03-04 - DS npm publishing — migrated from `file:` link to npm `0.0.3`
- ✅ 2026-03-04 - Real API integration — full type rewrite, client with `/api/v1` prefix, snake→camel transform layer
- ✅ 2026-03-05 - Remove mock data layer — mock.ts, mock.test.ts, useMocks() guards, NEXT_PUBLIC_USE_MOCKS env var
- ✅ 2026-03-04 - Verify real API integration end-to-end — addressed by API status page + v0→v1 switch (all 12 integration tests pass against v1)
- ✅ 2026-03-04 - Top Nodes card on overview page — implemented with hasVms filter, sort params, checkbox UI, useTransition
- ✅ 2026-03-04 - Latest VMs card on overview page — progressive loading from scheduler + api2.aleph.im
- ✅ 2026-03-05 - Dedicated detail views for nodes and VMs — full-width views via `?view=hash`, complete history tables, new API fields (owner, IPv6, discoveredAt, allocatedAt, etc.)
- ❌ 2026-03-05 - DS StatusDot variants for unreachable/removed — rejected; the mapping layer (`status-map.ts`) is the right pattern for translating domain statuses to generic DS variants
- ✅ 2026-03-06 - List page filtering — text search, count badges, collapsible advanced filters (checkboxes, range sliders, 3-column layout) on both Nodes and VMs pages
- ✅ 2026-03-09 - GPU info on nodes — GPU badge column, Has GPU filter, GPU card in detail view/panel
- ✅ 2026-03-09 - GPU requirements on VMs — Requires GPU filter, GPU row in detail view/panel
- ✅ 2026-03-09 - Confidential computing indicators — ShieldCheck icon in tables, checkbox filters, detail panel/view rows
- ✅ 2026-03-09 - CPU info on nodes — CPU column, vendor filter (AMD/Intel), CPU section in detail panel/view
- ✅ 2026-03-09 - Automated IPFS deployment — `workflow_dispatch` GitHub Actions workflow using Aleph SDK with delegated billing, CIDv0→CIDv1 conversion, gateway URL in job summary
- ✅ 2026-03-10 - Pagination UI for large datasets — client-side pagination with DS `Pagination` component, page-size dropdown (25/50/100), `usePagination` hook
- ✅ 2026-03-11 - Clickable stat cards on overview page — all stat cards now Link to filtered list pages, Issues section with Affected VMs/Nodes cards
- ✅ 2026-03-11 - Issues page — dedicated `/issues` page with VM/Node perspectives for scheduling discrepancies, sidebar categories with issue count badge
- ✅ 2026-03-11 - Wallet view page — `/wallet?address=0x...` with owned nodes, VMs with scheduler status, activity timeline, granted/received permissions, clickable wallet addresses in node detail views
- ✅ 2026-03-13 - Update pnpm/action-setup to Node.js 24 — updated to a version compatible with Node.js 24
- ✅ 2026-03-16 - Issues page filter icon review — removed no-op filter button, made FilterToolbar filter toggle optional

</details>
