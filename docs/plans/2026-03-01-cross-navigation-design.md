# Cross-Page Navigation Design

**Date:** 2026-03-01
**Status:** Approved

## Goal

Add cross-navigation between dashboard pages so users can click through from overview summaries to filtered lists, and between node/VM detail panels and their counterpart pages.

## Four Navigation Flows

| # | Source | Click Target | Destination |
|---|--------|-------------|-------------|
| 1 | NodeHealthSummary (overview) | Status legend row (e.g. "Degraded") | `/nodes?status=degraded` |
| 2 | VMAllocationSummary (overview) | Status row (e.g. "Orphaned") | `/vms?status=orphaned` |
| 3 | NodeDetailPanel | VM hash in VMs list | `/vms?selected=<vm-hash>` |
| 4 | VMDetailPanel | Assigned Node hash | `/nodes?selected=<node-hash>` |

## URL Search Params Contract

| Page | Param | Type | Effect |
|------|-------|------|--------|
| `/nodes` | `status` | `NodeStatus` | Pre-select the status filter tab |
| `/nodes` | `selected` | `string` (hash) | Open that node's detail panel |
| `/vms` | `status` | `VMStatus` | Pre-select the status filter tab |
| `/vms` | `selected` | `string` (hash) | Open that VM's detail panel |

Params compose: `/vms?status=orphaned&selected=abc123` filters to orphaned AND opens abc123's detail.

## Architecture

### State Flow

Currently all filter/selection state is component-local `useState` that resets on navigation. The change:

1. **Pages** (`nodes/page.tsx`, `vms/page.tsx`) read `useSearchParams()` on mount to initialize `selectedNode`/`selectedVM` from `?selected=`
2. **Tables** (`NodeTable`, `VMTable`) accept an optional `initialStatus` prop from the page (read from `?status=`). The table initializes its filter `useState` from this prop instead of `undefined`.
3. **Overview cards** use Next.js `<Link>` with the appropriate `href` — no programmatic navigation needed.
4. **Detail panels** use Next.js `<Link>` for cross-entity navigation (VM hash -> `/vms?selected=...`, node hash -> `/nodes?selected=...`).

No global state, no new dependencies. URL params are the cross-page communication mechanism.

### URL Param Syncing

Pages do NOT write back to URL params when the user changes filters or selects rows within the page. The URL params are read-once on mount for incoming navigation. In-page interactions continue to use local `useState` as they do today. This avoids history spam and keeps the implementation minimal.

### Changes Per File

**`src/components/node-health-summary.tsx`**
- Import `Link` from `next/link`
- Wrap each legend `<li>` in a `<Link href="/nodes?status={status}">` with hover styles (cursor-pointer, hover:bg-muted rounded)

**`src/components/vm-allocation-summary.tsx`**
- Import `Link` from `next/link`
- Wrap each status `<li>` in a `<Link href="/vms?status={status}">` with hover styles

**`src/components/node-detail-panel.tsx`**
- Import `Link` from `next/link`
- Change VM hash `<span>` to `<Link href="/vms?selected={vm.hash}">` with link styling (text-accent, underline on hover)

**`src/components/vm-detail-panel.tsx`**
- Import `Link` from `next/link`
- Change assigned node `<dd>` content to `<Link href="/nodes?selected={vm.assignedNode}">` with link styling

**`src/app/nodes/page.tsx`**
- Import `useSearchParams` from `next/navigation`
- Read `?selected=` to initialize `selectedNode` state
- Read `?status=` and pass as `initialStatus` prop to `NodeTable`

**`src/app/vms/page.tsx`**
- Import `useSearchParams` from `next/navigation`
- Read `?selected=` to initialize `selectedVM` state
- Read `?status=` and pass as `initialStatus` prop to `VMTable`

**`src/components/node-table.tsx`**
- Add `initialStatus?: NodeStatus` prop
- Initialize `statusFilter` state from `initialStatus` instead of `undefined`

**`src/components/vm-table.tsx`**
- Add `initialStatus?: VMStatus` prop
- Initialize `statusFilter` state from `initialStatus` instead of `undefined`

### Visual Treatment

- **Overview card rows:** Subtle hover effect (background highlight, pointer cursor). The entire row is the click target. No underlines — the hover state communicates clickability.
- **Detail panel cross-links:** Styled as inline links — accent color text, underline on hover, pointer cursor. Matches the convention for in-app navigation.

### Static Export Compatibility

`useSearchParams()` works in static exports because search params are client-side only (they're not part of the path, so no server-side rendering is involved). Next.js wraps `useSearchParams` in a Suspense boundary requirement for static exports — the page components will need a `<Suspense>` wrapper.

## Out of Scope

- URL param syncing on in-page filter changes (history spam, not needed)
- Browser back/forward for filter changes (would require full URL-driven state)
- Deep links from external sources (works for free via URL params, but not a stated goal)
