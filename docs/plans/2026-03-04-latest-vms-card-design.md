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
