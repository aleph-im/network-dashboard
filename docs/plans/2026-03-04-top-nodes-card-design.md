# Top Nodes Card on Overview Page

## Context

The overview page shows stats, a node health bar, and a VM allocation summary. Adding a "Top Nodes" card to surface the busiest nodes (by VM count) with a CTA to a filtered nodes list. This is the first of two new activity cards — the "Latest VMs" card is a separate plan.

## Design

**Card: "Top Nodes"**
- Shows 15 nodes sorted by `vmCount` descending (only nodes with VMs)
- Each row: node name (or truncated hash if no name), StatusDot, VM count
- Footer CTA: "View all →" links to `/nodes?hasVms=true`
- Loading state: Skeleton rows
- Reuses existing `useNodes()` hook (already polls at 30s)

## Data Source

- `useNodes()` fetches all nodes from the scheduler API
- Client-side: filter `vmCount > 0`, sort desc, take top 15
- No new API endpoint needed

## New: `hasVms` Filter

- Add `hasVms?: boolean` to `NodeFilters` type
- Client-side filter in `getNodes()`: keeps nodes where `vmCount > 0`
- Nodes page reads `?hasVms=true` from URL params

## Components

- `TopNodesCard` — new component in `src/components/top-nodes-card.tsx`
- Reuses: `Card`, `StatusDot`, `Skeleton`, `Tooltip` from `@aleph-front/ds`
