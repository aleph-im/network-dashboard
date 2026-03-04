# Latest VMs Card on Overview Page

## Context

Second of two activity cards for the overview page (see also: top-nodes-card-design). Shows the most recently created VMs on the network.

## Design

**Card: "Latest VMs"**
- Shows 15 most recently created VMs, sorted by creation time descending
- Each row: VM hash (truncated), status Badge, creation date (relative time)
- Progressive loading: scheduler data shows immediately, creation dates show Skeleton until api2 responds
- Footer CTA: "View all →" links to `/vms`
- Loading state: full Skeleton rows while scheduler data loads

## Data Sources

### Scheduler API (source of truth)
- `useVMs()` fetches all VMs with status, hash, allocatedNode, etc.
- Polls every 30s

### Aleph Message API (enrichment)
- VMs have no `createdAt` field in the scheduler API
- Creation timestamps come from `api2.aleph.im` where VM hashes are message `item_hash` values
- Endpoint: `GET https://api2.aleph.im/api/v0/messages.json?hashes=hash1,hash2,...`
- Response: `{ messages: [{ item_hash, time, ... }] }` where `time` is Unix timestamp

### Data Flow
1. Fetch all VMs from scheduler → render rows with hash + status
2. Pass VM hashes to `useVMCreationTimes(hashes)` → fetches from api2
3. Once api2 responds, sort by creation time and show relative dates
4. `staleTime: 5min` — creation timestamps are immutable

## New Hook

```ts
useVMCreationTimes(hashes: string[]): Map<string, number>
```

Queries api2, returns hash → Unix timestamp map. Long staleTime since creation times never change.

## New API Functions

- `getAlephBaseUrl()` — returns `https://api2.aleph.im` (overridable via `NEXT_PUBLIC_ALEPH_API_URL`)
- `getMessagesByHashes(hashes: string[])` — fetches messages, returns `Map<string, number>`

## Components

- `LatestVMsCard` — new component in `src/components/latest-vms-card.tsx`
- Reuses: `Card`, `Badge`, `Skeleton`, `Tooltip` from `@aleph-front/ds`
- Place in the second column of the existing `lg:grid-cols-2` grid on `src/app/page.tsx` (TopNodesCard is in the first column)

## Learnings from Top Nodes Card Implementation

These patterns were discovered during the sibling card implementation and apply here:

### TypeScript `exactOptionalPropertyTypes`
The tsconfig has `exactOptionalPropertyTypes: true`. You cannot pass `undefined` as a value for optional properties. Use spread instead:
```ts
// BAD — TypeScript error
{ status: statusFilter, hasVms: flag || undefined }
// GOOD
{ ...(statusFilter ? { status: statusFilter } : {}) }
```

### DS Table has no initial sort API
The DS `Table` manages sort state internally and has no `initialSort` prop. To show pre-sorted data, sort the array before passing it as `data`. The Table's built-in sort then works on top.

### Client-side filters must stay out of the React Query key
If a filter is applied post-fetch (like `vmCount > 0`), including it in the query key triggers unnecessary refetches. Filter in the component, not in the API client. Wrap filter state setters in `useTransition` if the re-render is expensive (large tables).

### DS Button for card CTAs
Use `<Button variant="text" size="xs" asChild><Link href="...">CTA text</Link></Button>` for card footer links. Raw `<Link>` with text styling is not visible enough on dark backgrounds.

### DS Checkbox available at `@aleph-front/ds/checkbox`
Supports `size="xs"`, uses Radix UI under the hood. `onCheckedChange` returns `boolean | "indeterminate"` — cast with `v === true`.

### Pluralization
Remember `{count === 1 ? "VM" : "VMs"}` — easy to miss.

### `.env.local` for real API during development
`NEXT_PUBLIC_API_URL=https://rust-scheduler.aleph.im` is set in `.env.local` for local dev with real data. No need for `NEXT_PUBLIC_USE_MOCKS=true` when using this.
