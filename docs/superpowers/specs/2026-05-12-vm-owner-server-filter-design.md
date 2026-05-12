# Server-side `?owners=` filter for VMs

**Date:** 2026-05-12
**Status:** Design approved, ready for implementation planning
**Related:** Scheduler API additions (PR #167 — new VM list filter params). Depends on Spec `2026-05-12-vm-fields-migrating-status-design.md` adding the `owner` field to the `VM` type.

## Goal

Plumb the scheduler's new server-side filter params through the client and React Query layer, then wire one concrete consumer: an "Owner address" filter input on the VMs page. This turns "show me every VM owned by 0x…" from a full-fleet fetch + client filter into a targeted server query.

`?scheduling_status=` is passed through too (it's free — adding one URL param), but kept dormant until a real consumer needs it (see Backlog).

## Scope

**In scope:**

1. `VmFilters` gains `owner?: string` and `schedulingStatus?: VmStatus`.
2. `getVMs()` appends `owners=` and `scheduling_status=` to the query string when present.
3. VMs page advanced filter panel gains an "Owner address" text input. When non-empty and well-formed (`/^0x[0-9a-fA-F]{40}$/`), the input value is passed to `useVMs({ owner })` after a 500ms debounce.
4. Status count badges reflect the filtered server result when owner is set.

**Out of scope** (explicitly backlogged):

- **Wallet view parallel scheduler fetch for owned VMs.** Use `useVMs({ owner: address })` alongside the existing api2 message fetch in `useWalletVMs(address)` to detect VMs in the scheduler that lack an INSTANCE/PROGRAM message (and vice versa). Promising for diagnostics; needs its own design pass for the merge logic and UX (which source wins, how to display divergence).
- **Issues page `?scheduling_status=` divergence detection.** Fetch a thin `useVMs({ schedulingStatus: "dispatched" })` query and cross-check against the main `useVMs()` to flag VMs whose derived status disagrees with the scheduler's raw status. Concrete diagnostic value, but Issues already needs the full dataset for the node-perspective view; the cross-check would be additive, not replacement, and needs care.
- **Other server-side filters** (`cpu_architecture`, `has_gpu`, `requires_confidential`, `cpu_vendor`, `supports_ipv6`, `confidential_computing_enabled`) — kept client-side. Client filtering is instantaneous for these and avoids refetch+loading-state UX on every toggle. The scheduler exposes them, but the dashboard has no payload pressure that justifies the worse UX yet.
- **Range filters server-side** (vCPUs, memory) — would need debouncing on every slider tick; client-side is the right call.

## Why selective

Most filters belong client-side because the dashboard fetches the whole VM list anyway (paginated, parallelized, 30s polled). Toggling filters in-memory is instant. Moving filters server-side costs the user a loading state on every toggle.

Two filters justify the trade-off:

- **Owner.** A wallet address narrows the result from ~thousands of VMs to ~tens. Massive payload reduction; user types a deliberate query rather than rapidly toggling. Loading state is acceptable.
- **Scheduling status** — passed through as plumbing; the concrete consumer comes later (see Backlog). Adding the param to the type now is cheap and keeps Spec A and Spec C cleaner.

## Data layer

### `src/api/types.ts`

```ts
export type VmFilters = {
  status?: VmStatus;
  node?: string;
  owner?: string;             // new — 0x-prefixed address
  schedulingStatus?: VmStatus; // new — raw scheduler value
};
```

### `src/api/client.ts`

```ts
export async function getVMs(filters?: VmFilters): Promise<VM[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.node) params.set("node", filters.node);
  if (filters?.owner) params.set("owners", filters.owner);
  if (filters?.schedulingStatus)
    params.set("scheduling_status", filters.schedulingStatus);
  const qs = params.toString();
  const raw = await fetchAllPages<ApiVmRow>(
    `/api/v1/vms${qs ? `?${qs}` : ""}`,
  );
  return raw.map(transformVm);
}
```

The query string forms a stable cache key naturally because `useVMs({ filters })` already includes `filters` in the queryKey.

### `src/hooks/use-vms.ts`

No signature change. `filters` already in queryKey. Owner-input flip = new query = expected loading state.

## UI: Owner filter input

### `src/app/vms/page.tsx`

Add an "Owner address" text input to the existing `FilterPanel` (collapsible advanced filters). Layout: between the existing filter groups, in its own row. Placeholder text `0x…`.

State management:
- Local controlled input state (raw user typing).
- Debounced via the existing `useDebounce` hook (500ms).
- The debounced value is validated against `/^0x[0-9a-fA-F]{40}$/`. If valid → passed as `owner` to `useVMs`. If invalid (still typing, malformed) → not passed; the page renders today's full data.
- URL persistence via a new `?owner=` search param so the filter survives reloads and is shareable.
- Filter panel "Reset" button clears the owner alongside the rest.
- Active-filter dot on the toolbar's filter toggle: lights up when owner is set.

Visual treatment matches the existing search input style (DS `Input`, size `sm`, pill rounded).

### Count badge behavior

The status tab count badges already iterate `vms.filter(...)` over the React Query result. When owner is set, the server returns only VMs for that owner — so the badges reflect "this owner's distribution by status", which is exactly what the user wants. No special handling needed; the existing math composes correctly.

### Empty / error states

- Valid owner address with zero results → table renders empty (DS Table empty state). No special copy needed beyond the default; the filter input being non-empty tells the story.
- Invalid address format → table renders today's full data (the malformed input simply isn't passed to the query). No inline error message — the user is mid-typing; the field's pattern doesn't error mid-stroke.
- Server error → bubbles up through React Query like any other VMs query; the existing error boundary handles it.

## Files changed

- `src/api/types.ts` — extend `VmFilters`.
- `src/api/client.ts` — extend `getVMs` to append new params.
- `src/app/vms/page.tsx` — Owner address input, URL param, debounced query, filter-reset wiring.
- `src/components/filter-panel.tsx` — new "Owner address" field.
- `src/api/client.test.ts` — assert URL building for `owner` and `schedulingStatus`.
- `src/app/vms/page.test.tsx` (if exists) — debounce + URL persistence smoke test.
- `src/changelog.ts` — minor bump entry.
- `docs/ARCHITECTURE.md` — note the server-side filter strategy (selective adoption rationale).
- `docs/BACKLOG.md` — file the two deferred consumers under "Needs planning":
  - "Wallet view: cross-check api2 INSTANCE/PROGRAM messages against scheduler `?owners=` for divergence detection."
  - "Issues page: server-side `?scheduling_status=` cross-check to flag derived/raw status divergence beyond what Spec A's Schedule-vs-Reality row catches."
- `CLAUDE.md` — Current Features list entry for the new owner filter.

## Testing

- `src/api/client.test.ts`: parameterize cases — owner only, status only, both, schedulingStatus only — and assert the resulting URL string.
- React Query integration: assert that providing `{ owner }` to `useVMs` produces a distinct queryKey vs `useVMs()` (i.e. forces a refetch).
- Manual: paste a known owner address, confirm only that owner's VMs render and status badges reflect the filtered set.

## Open questions

None at design approval time. Implementation-time decisions deferred:

- **Owner-input debounce duration.** 500ms is a starting point; tune during implementation if it feels laggy or jittery.
- **Should we surface "results pinned to owner X" as a chip near the toolbar?** Probably yes for discoverability, but defer until the input itself is in users' hands.
