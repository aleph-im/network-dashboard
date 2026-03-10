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
│   ├── nodes/
│   │   └── page.tsx        # Nodes page
│   ├── status/
│   │   └── page.tsx        # API status page (endpoint health checks)
│   └── vms/
│       └── page.tsx        # VMs page
├── api/
│   ├── types.ts            # Scheduler entity types + Aleph Message API types
│   └── client.ts           # API client (/api/v1 + api2.aleph.im) with snake→camel transform
├── hooks/
│   ├── use-nodes.ts        # useNodes, useNode (30s/15s polling)
│   ├── use-vms.ts          # useVMs, useVM (30s/15s polling)
│   ├── use-vm-creation-times.ts  # useVMMessageInfo (api2, 5min stale, no polling)
│   ├── use-overview-stats.ts  # useOverviewStats (30s polling)
│   ├── use-health.ts       # useHealth — /health endpoint polling (30s)
│   └── use-debounce.ts     # useDebounce hook (generic, configurable delay)
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
│   ├── filter-toolbar.tsx  # Shared: status pills + filter toggle + search input
│   ├── filter-panel.tsx    # Shared: collapsible glassmorphism panel chrome + reset
│   ├── node-table.tsx      # Nodes table with search, filters, count badges
│   ├── node-detail-panel.tsx # Node detail side panel (quick-peek)
│   ├── node-detail-view.tsx # Node full-width detail view (?view= param)
│   ├── vm-table.tsx        # VMs table with search, filters, count badges
│   ├── vm-detail-panel.tsx # VM detail side panel (quick-peek)
│   ├── vm-detail-view.tsx  # VM full-width detail view (?view= param)
│   └── resource-bar.tsx    # CPU/memory/disk usage bar
├── lib/
│   ├── filters.ts          # Filter pipeline: textSearch, countByStatus, applyNodeAdvancedFilters, applyVmAdvancedFilters
│   ├── filters.test.ts     # Filter unit tests (32 tests)
│   ├── format.ts           # relativeTime, relativeTimeFromUnix, truncateHash, formatPercent, formatDateTime, formatCpuLabel, formatGpuLabel
│   └── status-map.ts       # Status-to-visual maps: nodeStatusToDot(), NODE_STATUS_VARIANT, VM_STATUS_VARIANT
```

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
**Notes:** `staleTime: 5min` since creation timestamps are immutable. `refetchInterval: false` — no polling needed. Query key includes the hash array so it refetches when the VM list changes. Hash lookups are batched (100 per request) to stay under URL length limits.

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
**Notes:** `scheduled` maps to `"success"` (green) — it's the healthy state for VMs. Badge size should always be `"sm"` across the dashboard for consistency.

### Dark Theme Default

**Context:** Operations dashboards are typically used in dark environments.
**Approach:** `theme-dark` class on `<html>` element. ThemeToggle persists preference to localStorage and toggles the class. DS tokens resolve to dark variants via `@custom-variant dark`.
**Key files:** `src/app/layout.tsx`, `src/components/theme-toggle.tsx`

### App Shell Layout

**Context:** Consistent navigation across all pages.
**Approach:** AppShell wraps all pages with sidebar + header + scrollable content area. Three-layer visual hierarchy: sidebar and header use `bg-background` (dark mode) / `bg-muted/40` (light mode) as app chrome; main content area uses `bg-surface` with `rounded-tl-2xl` as a recessed panel; individual cards sit inside with their own borders. A subtle accent-colored radial glow (`main-glow::before`) adds depth to the content area. The header contains only the hamburger menu (mobile) and theme toggle (right-aligned). Scroll position resets to top on route change via `usePathname` + ref. On desktop (`md+`), the sidebar is always visible. On mobile, it collapses to an off-canvas drawer. The sidebar auto-closes on route change. The sidebar header uses `LogoFull` from the DS (icon + "Aleph Cloud" wordmark). The API Status link shows a `StatusDot` with an animated SVG ring (`poll-ring` CSS animation) that draws over 30s matching the health poll interval, color-coded by `/health` endpoint status.
**Key files:** `src/components/app-shell.tsx`, `src/components/app-sidebar.tsx`, `src/components/app-header.tsx`, `src/hooks/use-health.ts`

### Overview Page Redesign

**Context:** The overview page needed more visual impact, spacing, and contextual help for users unfamiliar with Aleph Cloud terminology.
**Approach:** Hero stat cards with `text-4xl` numbers in rigid-square italic font, each in its own glassmorphism card (`bg-white/[0.03]`, `border-white/[0.06]`) with colored status indicators (green/amber/red), status-tinted backgrounds via CSS custom property `--stat-tint` at 7% opacity, SVG noise texture (`feTurbulence`) at 3% opacity for depth, and explanatory subtitles. Content cards have larger `text-2xl` titles with `?` info tooltips (DS Tooltip component) and `padding="lg"`. Page has a `text-4xl` title with subtitle, and `mt-12` / `gap-8` spacing between sections. A shared `CardHeader` component provides the title + tooltip pattern for all 4 content cards.
**Key files:** `src/app/page.tsx`, `src/components/stats-bar.tsx`, `src/components/card-header.tsx`, `src/app/globals.css`
**Notes:** Stats grid uses `xl` breakpoint for 6 columns (not `lg`) to prevent "UNSCHEDULABLE" label truncation. The `.stat-card::before` pseudo-element reads `--stat-tint` from inline styles for dynamic color tinting. The `.stat-card::after` pseudo-element adds an SVG noise grain texture. The `.card-glow` utility adds `shadow-brand` on hover. Status-specific stat cards show a `DonutRing` SVG in the top-right corner (absolutely positioned) displaying the value/total ratio with an animated arc (1.2s CSS transition on `stroke-dashoffset`, triggered by `requestAnimationFrame` after mount). Each ring contains a centered Phosphor-style inline SVG icon matching the status semantics (check, wifi-slash, trash, question, warning, prohibit).

### Cross-Page Navigation via URL Search Params

**Context:** Users need to drill from overview cards to filtered list pages, and between node/VM detail panels.
**Approach:** URL search params (`?status=`, `?selected=`, `?hasVms=`, `?sort=`, `?order=`, `?view=`) are the cross-page communication mechanism. Pages read params on mount via `useSearchParams()` to initialize local state (read-once, no write-back). Overview cards use `<Link>` to navigate with status filters. Detail panels use `<Link>` for cross-entity references. Requires `<Suspense>` boundary in static exports since search params aren't known at build time.
**Key files:** `src/app/nodes/page.tsx`, `src/app/vms/page.tsx`, `src/components/node-health-summary.tsx`, `src/components/vm-allocation-summary.tsx`, `src/components/node-detail-panel.tsx`, `src/components/vm-detail-panel.tsx`
**Notes:** Tables accept `initialStatus`, `initialHasVms`, and `initialSort` props to seed filter/sort state from URL params. Validation via `Set.has()` prevents invalid status values from breaking the UI. DS Table `activeKey` prop highlights the selected row with a left border accent (`inset box-shadow`); the same accent appears on hover for all clickable rows. The DS Table has no initial sort API — pre-sort data before passing it to `<Table>`.

### Detail Views (Full-Width)

**Context:** Side panels show truncated data (10 history rows, no owner/IPv6/payment fields). Users need a full view with all metadata and complete history.
**Approach:** Search-param-based view switching. When `?view=hash` is present on `/nodes` or `/vms`, the page renders a `NodeDetailView` or `VMDetailView` instead of the table+panel layout. Side panels remain as quick-peek with a "View full details →" link. The `AppHeader` reads `?view=` to show entity-specific titles (e.g. "Node: abc12..."). Cross-links between detail views use `?view=` (not `?selected=`).
**Key files:** `src/components/node-detail-view.tsx`, `src/components/vm-detail-view.tsx`, `src/app/nodes/page.tsx`, `src/app/vms/page.tsx`, `src/components/app-header.tsx`
**Notes:** Uses search params instead of dynamic route segments (`/nodes/[hash]`) because IPFS static export can't resolve arbitrary dynamic paths. The `AppHeader` wraps `useSearchParams()` in a `<Suspense>` boundary to avoid hydration issues. New API fields surfaced: `owner`, `supportsIpv6`, `discoveredAt` (nodes), `allocatedAt`, `lastObservedAt`, `paymentType` (VMs). VM panels/detail views cross-reference the allocated node via `useNode(hash)` to display the node name alongside the hash link.

### List Page Filter Pipeline

**Context:** Both Nodes and VMs pages need text search, status filters, and advanced filters (checkboxes, range sliders) — all client-side.
**Approach:** Four-stage pipeline applied in `useMemo`: (1) `textSearch` matches query against configurable fields, (2) `applyNodeAdvancedFilters` / `applyVmAdvancedFilters` applies checkbox and range filters, (3) `countByStatus` computes per-status counts on the filtered set (for badge display), (4) status filter selects a single status. Status is applied last so count badges show accurate per-status breakdowns after search+advanced filters. All filters are client-side post-fetch — none go in the React Query key. State setters wrapped in `useTransition` for responsive UI. Search input debounced at 300ms via `useDebounce`. The `CollapsibleSection` component uses CSS `grid-template-rows` animation for smooth expand/collapse. Filter panel uses a 3-column layout (`lg:grid-cols-3`) with glassmorphism card styling.
**Key files:** `src/lib/filters.ts` (pure filter functions + types), `src/lib/filters.test.ts`, `src/hooks/use-debounce.ts`, `src/components/collapsible-section.tsx`, `src/components/filter-toolbar.tsx`, `src/components/filter-panel.tsx`, `src/components/node-table.tsx`, `src/components/vm-table.tsx`
**Notes:** The visual shell (status pills, filter toggle button, search input, glassmorphism panel chrome with reset) is shared via `FilterToolbar` and `FilterPanel` — both tables compose these with their own status config, filter content, and grid layout. `FilterToolbar` is generic over the status type. Multi-select filters (VM type, payment status, CPU vendor) treat "all selected" and "none selected" identically as "no filter." Count badges show `filtered/total` format when non-status filters are active. The `VmType` values are lowercase (`"microvm"`, `"persistent_program"`, `"instance"`) matching the API wire format. Boolean checkbox filters: Staked, IPv6, Has GPU, Confidential (nodes); Allocated to a node, Requires GPU, Requires Confidential (VMs). Multi-select: CPU Vendor (AMD, Intel) on nodes. Filter panel uses a 4-column layout on nodes (`lg:grid-cols-4`: Properties, CPU Vendor, Workload, Hardware).

### Responsive Layout

**Context:** Dashboard must work on mobile, tablet, and desktop.
**Approach:** Two breakpoints: `md` (768px) for sidebar visibility, `lg` (1024px) for detail panel layout. Mobile sidebar is a fixed overlay with backdrop. Detail panels (Nodes, VMs) render as full-width slide-in overlays below `lg`, inline side panels above. Tables use `overflow-x-auto` for horizontal scrolling on narrow screens.
**Key files:** `src/components/app-sidebar.tsx`, `src/app/nodes/page.tsx`, `src/app/vms/page.tsx`, `src/components/node-detail-panel.tsx`, `src/components/vm-detail-panel.tsx`
**Notes:** Uses `bg-surface` token (renamed from `bg-card` in DS). Detail panels use glass card styling (`bg-white/[0.03]`, `border-white/[0.06]`, `variant="ghost"`), `lg:sticky lg:top-0` to stay visible while scrolling, and truncate long lists (6 VMs, 5 history entries) with "+N more" indicators to keep the "View full details →" CTA reachable.

---

## Recipes

### Adding a New Page

1. Create `src/app/<route>/page.tsx`
2. Add nav entry to `NAV_ITEMS` in `src/components/app-sidebar.tsx`
3. Verify with `pnpm build` (static export must include the route)

### API Status Page

**Context:** Need a diagnostic page to verify all scheduler endpoints are reachable.
**Approach:** Standalone client component at `/status` that fires fetch requests to all 8 API endpoints on mount. Checks `/health` (root-level) first, then uses a two-phase strategy: hits independent endpoints (stats, nodes list, vms list), then resolves `:hash` placeholders from list results for dependent endpoints (node/vm detail + history). `Promise.allSettled` ensures one failure doesn't block others. StatusDot shows health, HTTP codes displayed alongside. Base URL comes from `NEXT_PUBLIC_API_URL` with `?api=` query param override. Sidebar link is separated from main nav via `border-t` to signal it's a utility page, not primary navigation.
**Key files:** `src/app/status/page.tsx`, `src/components/app-sidebar.tsx`

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
