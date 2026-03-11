# Backlog

Ideas and scope creep captured for later consideration.

---

## How Items Get Here

- Scope drift detected during focused work (active interrupt)
- Ideas that come up but aren't current priority
- "We should also..." moments
- Features identified but deferred

---

## Open Items

### 2026-03-11 - Issues page filter icon review
**Source:** User feedback
**Description:** The filter icon (advanced filters toggle) on the Issues page is currently a no-op (`filtersOpen={false}`, `onFiltersToggle={() => {}}`). Decide whether advanced filters are useful for the Issues tables (e.g. filter by node, resource range) and either implement them or remove the icon entirely.
**Priority:** Low

### 2026-03-06 - Remove tooltip from hash in Latest VMs card
**Source:** User request
**Description:** On the overview page's Latest VMs card, the hash column shows a tooltip on hover (from `CopyableText`). Remove the tooltip — the hash is already visible and the tooltip adds noise in this compact card context.
**Priority:** Low

### 2026-03-10 - Wallet view page
**Source:** Evolved from "VM detail: show owner wallet address" (2026-03-06)
**Description:** Add a wallet view at `/wallet?address=...` accessible by clicking any wallet address in the dashboard (node owner, VM sender). Phase 1: current permissions given (`api2 aggregates/<wallet>.json?keys=security` → `content.authorizations[]`). Permissions received: waiting on Olivier's CCN endpoint. Permission history and nodes/VMs owned: deferred. Also add owner wallet to VM detail view as part of this work.
**Priority:** Medium

### 2026-03-05 - Mobile-responsive filter UI
**Source:** Identified while brainstorming list page filtering overhaul
**Description:** Adapt the new filter bar (search, collapsible filters, status pills with count badges) for mobile viewports. Desktop version comes first; mobile adaptation deferred.
**Priority:** Medium

### 2026-03-04 - Stats sparklines via client-side accumulation
**Source:** Identified while working on real API migration (Decision #14)
**Description:** The API has no `/stats/history` endpoint. Sparklines were removed during migration. Could accumulate stats snapshots client-side in React Query cache (or a simple in-memory ring buffer) to rebuild 24h trend data. Better solution: request a `/stats/history` endpoint from the backend team.
**Priority:** Medium

### 2026-03-01 - WebSocket migration
**Source:** Design doc
**Description:** Replace polling with WebSocket connections for real-time event streaming. Would reduce latency and server load compared to 10-30s polling intervals.
**Priority:** Medium

### 2026-03-01 - Sidebar component in DS
**Source:** App shell implementation
**Description:** The AppSidebar is currently a local component. If other Aleph projects need similar navigation, consider promoting it to the DS with configurable nav items.
**Priority:** Low

### 2026-03-01 - E2E tests
**Source:** Implementation plan
**Description:** Add Playwright E2E tests for critical user flows: navigate pages, filter tables, open detail panels, toggle theme.
**Priority:** Medium

### 2026-03-01 - Resource usage charts
**Source:** Design doc
**Description:** Add time-series charts for CPU/memory/disk usage history on node detail views. Recharts was removed during API migration — would need to re-add or use a lighter charting library.
**Priority:** Medium


---

## Paused (waiting on backend)

### 2026-03-09 - Server-side search
**Source:** API pagination migration analysis
**Description:** Push search to API instead of client-side filtering. Would replace `textSearch()` in `filters.ts` with a `?search=` query param. Already have `useDebounce` hook ready.
**Blocked on:** Olivier adding search query params to v1 list endpoints

### 2026-03-09 - Expanded `/stats` endpoint
**Source:** API pagination migration analysis
**Description:** Request per-status breakdowns in `/stats` response (unreachable/unknown/removed nodes, scheduled/orphaned/missing/unschedulable VMs). Currently `getOverviewStats()` fetches all nodes + all VMs just to count by status — wasteful and won't scale.
**Blocked on:** Backend change from Olivier

---

## Investigate

### 2026-03-09 - Node map / geo view
**Description:** Visualize node locations on a map. Feasibility depends on whether IPv6 or address fields can be geolocated.

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

### 2026-03-10 - ~~Authorization reverse-index indexer~~ → Olivier building CCN endpoint
**Source:** Wallet view research (2026-03-10)
**Description:** ~~Build a backend indexer for reverse permission lookups.~~ Olivier will add a reverse permission lookup endpoint to pyaleph (CCN). No custom indexer needed. Wait for the endpoint, then integrate into the wallet view. Update the wallet view backlog item when the endpoint shape is known.

### 2026-03-09 - Bookmarkable filter URLs
**Description:** Write active filters back to URL search params (currently read-once on mount). Enables sharing filtered views via URL.

---

## Completed / Rejected

<details>
<summary>Archived items</summary>

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

</details>
