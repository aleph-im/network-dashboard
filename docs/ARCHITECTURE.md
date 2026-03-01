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
| Deployment | Static export (`out/`) for IPFS hosting |

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
│   └── vms/
│       └── page.tsx        # VMs page
├── api/
│   ├── types.ts            # Scheduler entity types
│   ├── client.ts           # API client with mock fallback
│   └── mock.ts             # Deterministic mock data (15 nodes, 40 VMs, 50 events)
├── hooks/
│   ├── use-nodes.ts        # useNodes, useNode (30s/15s polling)
│   ├── use-vms.ts          # useVMs, useVM (30s/15s polling)
│   ├── use-events.ts       # useEvents (10s polling)
│   └── use-overview-stats.ts  # useOverviewStats (30s polling)
├── components/
│   ├── app-shell.tsx       # Layout: sidebar + header + content
│   ├── app-sidebar.tsx     # Navigation sidebar
│   ├── app-header.tsx      # Page title + theme toggle
│   ├── theme-toggle.tsx    # Dark/light toggle with localStorage
│   ├── stats-bar.tsx       # Overview stat cards row
│   ├── node-health-summary.tsx  # Node health bar chart + legend
│   ├── vm-allocation-summary.tsx # VM status breakdown
│   ├── event-feed.tsx      # Chronological event list with category filters
│   ├── node-table.tsx      # Nodes table with status filters
│   ├── node-detail-panel.tsx # Node detail side panel
│   ├── vm-table.tsx        # VMs table with status filters
│   ├── vm-detail-panel.tsx # VM detail side panel
│   └── resource-bar.tsx    # CPU/memory/disk usage bar
└── lib/
    └── format.ts           # relativeTime, truncateHash, formatPercent
```

---

## Patterns

### API Client with Mock Fallback

**Context:** Dashboard must work without a live API (static export on IPFS).
**Approach:** Each API function checks `NEXT_PUBLIC_USE_MOCKS` env var. If true, dynamically imports mock data. If false, fetches from `NEXT_PUBLIC_API_URL`. Runtime URL override via `?api=` query parameter.
**Key files:** `src/api/client.ts`, `src/api/mock.ts`
**Notes:** Dynamic imports keep mock data tree-shakeable in production builds.

### React Query Polling

**Context:** Real-time data without WebSockets.
**Approach:** Each hook uses `refetchInterval` for automatic polling. Events poll at 10s, detail views at 15s, list views at 30s.
**Key files:** `src/hooks/`
**Notes:** `staleTime: 10_000` and `retry: 2` configured globally in providers.tsx.

### DS Component Policy

**Context:** Avoid duplicate UI primitives across projects.
**Approach:** All reusable UI components live in `@aleph-front/ds` and are imported via subpath exports. Dashboard-specific compositions that combine DS components with domain logic live in `src/components/`.
**Key files:** `node_modules/@aleph-front/ds/`, `src/components/`
**Notes:** DS is linked via `file:` protocol. The `@ac/*` path alias must be mapped in tsconfig.json for DS internal imports to resolve.

### Dark Theme Default

**Context:** Operations dashboards are typically used in dark environments.
**Approach:** `theme-dark` class on `<html>` element. ThemeToggle persists preference to localStorage and toggles the class. DS tokens resolve to dark variants via `@custom-variant dark`.
**Key files:** `src/app/layout.tsx`, `src/components/theme-toggle.tsx`

### App Shell Layout

**Context:** Consistent navigation across all pages.
**Approach:** AppShell wraps all pages with sidebar + header + scrollable content area. On desktop (`md+`), the sidebar is always visible. On mobile, it collapses to an off-canvas drawer triggered by a hamburger button in the header. The sidebar auto-closes on route change.
**Key files:** `src/components/app-shell.tsx`, `src/components/app-sidebar.tsx`, `src/components/app-header.tsx`

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

### Adding a New API Endpoint

1. Add types to `src/api/types.ts`
2. Add mock data to `src/api/mock.ts`
3. Add client function to `src/api/client.ts` (with mock fallback)
4. Create hook in `src/hooks/` with appropriate `refetchInterval`
