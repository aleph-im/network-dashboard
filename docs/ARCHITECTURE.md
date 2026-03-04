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
│   ├── types.ts            # Scheduler entity types
│   ├── client.ts           # API client (/api/v1) with mock fallback + snake→camel transform
│   ├── mock.ts              # Deterministic mock data (15 nodes, 43 VMs, 40 history rows)
│   └── mock.test.ts         # Mock data integrity tests
├── hooks/
│   ├── use-nodes.ts        # useNodes, useNode (30s/15s polling)
│   ├── use-vms.ts          # useVMs, useVM (30s/15s polling)
│   └── use-overview-stats.ts  # useOverviewStats (30s polling)
├── components/
│   ├── app-shell.tsx       # Layout: sidebar + header + content
│   ├── app-sidebar.tsx     # Navigation sidebar
│   ├── app-header.tsx      # Page title + theme toggle
│   ├── theme-toggle.tsx    # Dark/light toggle with localStorage
│   ├── stats-bar.tsx       # Overview stat cards row (no sparklines)
│   ├── node-health-summary.tsx  # Node health bar chart + legend
│   ├── vm-allocation-summary.tsx # VM status breakdown
│   ├── top-nodes-card.tsx   # Top nodes by VM count card
│   ├── node-table.tsx      # Nodes table with status filters
│   ├── node-detail-panel.tsx # Node detail side panel
│   ├── vm-table.tsx        # VMs table with status filters
│   ├── vm-detail-panel.tsx # VM detail side panel
│   └── resource-bar.tsx    # CPU/memory/disk usage bar
└── lib/
    ├── format.ts           # relativeTime, truncateHash, formatPercent
    └── status-map.ts       # nodeStatusToDot() — maps API node statuses to DS StatusDot variants
```

---

## Patterns

### API Client with Mock Fallback

**Context:** Dashboard must work without a live API (static export on IPFS).
**Approach:** Each API function checks `NEXT_PUBLIC_USE_MOCKS` env var. If true, dynamically imports mock data. If false, fetches from `NEXT_PUBLIC_API_URL` (default: `http://localhost:8081`). Runtime URL override via `?api=` query parameter. API endpoints are prefixed with `/api/v1`. Wire types (`Api*Row`) use snake_case matching the raw JSON; transform functions convert to camelCase app types. Detail endpoints (`getNode`, `getVM`) use `Promise.all` for parallel fetching of the resource + related VMs/history.
**Key files:** `src/api/types.ts` (wire + app types), `src/api/client.ts`, `src/api/mock.ts`
**Notes:** Dynamic imports keep mock data tree-shakeable in production builds. The `getOverviewStats` function fetches `/stats` + `/vms` + `/nodes` in parallel to derive per-status counts not available from `/stats` alone.

### React Query Polling

**Context:** Real-time data without WebSockets.
**Approach:** Each hook uses `refetchInterval` for automatic polling. Detail views poll at 15s, list views and overview stats at 30s.
**Key files:** `src/hooks/`
**Notes:** `staleTime: 10_000` and `retry: 2` configured globally in providers.tsx.

### DS Component Policy

**Context:** Avoid duplicate UI primitives across projects.
**Approach:** All reusable UI components live in `@aleph-front/ds` and are imported via subpath exports. Dashboard-specific compositions that combine DS components with domain logic live in `src/components/`.
**Key files:** `node_modules/@aleph-front/ds/`, `src/components/`
**Notes:** DS is installed from npm (pinned version). The `@ac/*` path alias must be mapped in tsconfig.json (and vitest.config.ts) for DS internal imports to resolve. DS color tokens use `error`/`success`/`warning` naming (not Tailwind's `destructive`). Always verify token vars exist in DS `tokens.css` before use.

### Status Mapping

**Context:** The DS `StatusDot` component accepts a fixed set of variants (`"healthy" | "degraded" | "error" | "offline" | "unknown"`), but the API returns different node statuses (`"Healthy" | "Unreachable" | "Unknown" | "removed"`).
**Approach:** `nodeStatusToDot()` maps API node statuses to the closest DS StatusDot variant: `unreachable → error`, `removed → offline`.
**Key files:** `src/lib/status-map.ts`
**Notes:** VM statuses don't need mapping — they're displayed as text badges, not StatusDots.

### Dark Theme Default

**Context:** Operations dashboards are typically used in dark environments.
**Approach:** `theme-dark` class on `<html>` element. ThemeToggle persists preference to localStorage and toggles the class. DS tokens resolve to dark variants via `@custom-variant dark`.
**Key files:** `src/app/layout.tsx`, `src/components/theme-toggle.tsx`

### App Shell Layout

**Context:** Consistent navigation across all pages.
**Approach:** AppShell wraps all pages with sidebar + header + scrollable content area. On desktop (`md+`), the sidebar is always visible. On mobile, it collapses to an off-canvas drawer triggered by a hamburger button in the header. The sidebar auto-closes on route change.
**Key files:** `src/components/app-shell.tsx`, `src/components/app-sidebar.tsx`, `src/components/app-header.tsx`

### Cross-Page Navigation via URL Search Params

**Context:** Users need to drill from overview cards to filtered list pages, and between node/VM detail panels.
**Approach:** URL search params (`?status=`, `?selected=`, `?hasVms=`) are the cross-page communication mechanism. Pages read params on mount via `useSearchParams()` to initialize local state (read-once, no write-back). Overview cards use `<Link>` to navigate with status filters. Detail panels use `<Link>` for cross-entity references. Requires `<Suspense>` boundary in static exports since search params aren't known at build time.
**Key files:** `src/app/nodes/page.tsx`, `src/app/vms/page.tsx`, `src/components/node-health-summary.tsx`, `src/components/vm-allocation-summary.tsx`, `src/components/node-detail-panel.tsx`, `src/components/vm-detail-panel.tsx`
**Notes:** Tables accept `initialStatus` and `initialHasVms` props to seed filter state from URL params. Validation via `Set.has()` prevents invalid status values from breaking the UI. DS Table `activeKey` prop highlights the selected row with a left border accent (`inset box-shadow`); the same accent appears on hover for all clickable rows.

### Responsive Layout

**Context:** Dashboard must work on mobile, tablet, and desktop.
**Approach:** Two breakpoints: `md` (768px) for sidebar visibility, `lg` (1024px) for detail panel layout. Mobile sidebar is a fixed overlay with backdrop. Detail panels (Nodes, VMs) render as full-width slide-in overlays below `lg`, inline side panels above. Tables use `overflow-x-auto` for horizontal scrolling on narrow screens.
**Key files:** `src/components/app-sidebar.tsx`, `src/app/nodes/page.tsx`, `src/app/vms/page.tsx`, `src/components/node-detail-panel.tsx`, `src/components/vm-detail-panel.tsx`
**Notes:** Uses `bg-surface` token (renamed from `bg-card` in DS). Detail panels use `w-full lg:w-96` for responsive width.

---

## Recipes

### Adding a New Page

1. Create `src/app/<route>/page.tsx`
2. Add nav entry to `NAV_ITEMS` in `src/components/app-sidebar.tsx`
3. Add route title to `ROUTE_TITLES` in `src/components/app-header.tsx`
4. Verify with `pnpm build` (static export must include the route)

### API Status Page

**Context:** Need a diagnostic page to verify all scheduler endpoints are reachable.
**Approach:** Standalone client component at `/status` that fires fetch requests to all 7 API endpoints on mount. Uses a two-phase strategy: first hits independent endpoints (stats, nodes list, vms list), then resolves `:hash` placeholders from list results for dependent endpoints (node/vm detail + history). `Promise.allSettled` ensures one failure doesn't block others. StatusDot shows health, HTTP codes displayed alongside. Base URL comes from `NEXT_PUBLIC_API_URL` with `?api=` query param override. Sidebar link is separated from main nav via `border-t` to signal it's a utility page, not primary navigation.
**Key files:** `src/app/status/page.tsx`, `src/components/app-sidebar.tsx`

### Adding a New API Endpoint

1. Add types to `src/api/types.ts`
2. Add mock data to `src/api/mock.ts`
3. Add client function to `src/api/client.ts` (with mock fallback)
4. Create hook in `src/hooks/` with appropriate `refetchInterval`
