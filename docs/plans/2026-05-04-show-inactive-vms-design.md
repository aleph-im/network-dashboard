---
status: draft
date: 2026-05-04
note: design only — implementation plan TBD via writing-plans skill
---

# Show Inactive VMs — Design

## Problem

The VMs page (`/vms`) lists every VM the scheduler knows about. A meaningful slice of those are allocated to nodes that are dead from the operator's perspective: the node is unreachable, removed, or has gone silent (`unknown`). These VMs aren't doing useful work, but they fill table rows alongside live workload, making it harder to scan for what's actually running.

Reza on Telegram raised this — the Aleph Account app already has a "Show inactive nodes" pattern, and the same idea applies to VMs.

## Decisions resolved during brainstorm

The four open questions logged in the backlog are now settled:

1. **What counts as inactive** — strict node-status only. Hide VMs whose `allocatedNode` resolves to a node in an inactive status. Don't fold VM-status long-tail (`scheduled`/`unscheduled`/`orphaned`) into this filter — those have their own dedicated status pills, and bundling two unrelated reasons-for-hiding under one toggle is confusing. (Q1: option A.)
2. **Which node statuses are "inactive"** — `{unreachable, removed, unknown}`. `healthy` is active. (Q2: option B.)
3. **Where the toggle lives** — inside the existing `FilterPanel` (the collapsible advanced-filters card), not on the toolbar. The user wants the filter quiet, not foregrounded. (Q3.)
4. **Count badge handling** — when "Show inactive" is the *only* culling control (no other filters or search), the All-tab and per-status pills show a plain count, not the `filtered/unfiltered` slash suffix. The default-on filter should feel like baseline, not an applied filter. The slash returns when other filters are stacked on top. (Q4: option B.)

Additional scope from the brainstorm:

5. **Tab cap** — limit the VMs page status pills to 3 visible (All, Dispatched, Scheduled), rest in the existing overflow dropdown. Requires a small additive `maxVisible?: number` prop on the DS `Tabs` component (currently overflow is width-based per Decision #49).
6. **URL persistence** — two-way sync for the toggle via `?showInactive=true|false`, default omitted from URL. Other advanced filters remain session-only (the broader URL-persistence retrofit stays parked as a roadmap item).

## Architecture

### Filter pipeline change

The existing pipeline in `vm-table.tsx`:

```
allVms → search → applyVmAdvancedFilters → status pill → sort → paginate
```

Becomes:

```
allVms → search → applyInactiveVmFilter → applyVmAdvancedFilters → status pill → sort → paginate
```

`applyInactiveVmFilter` is a new pure function in `src/lib/filters.ts` next to the existing filters:

```ts
export const INACTIVE_NODE_STATUSES: ReadonlySet<NodeStatus> = new Set([
  "unreachable",
  "removed",
  "unknown",
]);

export function applyInactiveVmFilter(
  vms: VM[],
  nodeStatusByHash: Map<string, NodeStatus>,
  showInactive: boolean,
): VM[] {
  if (showInactive) return vms;
  return vms.filter((v) => {
    if (!v.allocatedNode) return true; // unallocated VMs always pass
    const status = nodeStatusByHash.get(v.allocatedNode);
    if (!status) return true; // node not (yet) loaded — fail-open
    return !INACTIVE_NODE_STATUSES.has(status);
  });
}
```

**Why this signature.** Pure function over plain inputs — testable without mocking React Query. Fail-open on missing map entries means a VM whose `allocatedNode` isn't yet in the loaded node set stays visible, avoiding flicker during initial load.

### Data flow in `VMTable`

`VMTable` currently calls `useVMs()`. It will additionally call `useNodes()` (already cached app-wide via React Query, so no extra network cost) and derive the lookup map once via `useMemo`:

```ts
const { data: allNodes } = useNodes();
const nodeStatusByHash = useMemo(() => {
  const m = new Map<string, NodeStatus>();
  for (const n of allNodes ?? []) m.set(n.hash, n.status);
  return m;
}, [allNodes]);
```

The map is passed into `applyInactiveVmFilter` inside the existing `useMemo` filter pipeline. Adds one dep to that memo.

### State shape

`showInactive` becomes a new optional field on `VmAdvancedFilters`:

```ts
export type VmAdvancedFilters = {
  // ...existing fields...
  showInactive?: boolean;
};
```

Stored *as the user-facing intent* — `true` means "show them, don't hide". `undefined`/`false` is the default-hidden state. The checkbox label is "Show inactive VMs", so unchecked = hidden = filter active.

### URL persistence

Two-way sync, single param `?showInactive=true`:

- **Read:** `/vms` page reads `?showInactive=true` from `useSearchParams()` once on mount, threads it down to `VMTable` via a new `initialShowInactive?: boolean` prop, which seeds `advanced.showInactive`.
- **Write:** when the user toggles the checkbox, `VMTable` calls `router.replace()` with the updated query string. Set the param to `true` when the user enables showing inactive; remove the param when they disable (default state). Use `replace`, not `push`, so the back button doesn't accumulate filter-toggle history.

Default value omitted from URL keeps shared links clean (`/vms` not `/vms?showInactive=false`).

### Active-filter count + count-badge formatting

Two distinct counters interact here, governed by one rule: **the badge tracks state that diverges from default; the count-suffix tracks state that culls rows.**

- `activeAdvancedCount` (the panel-header badge): increments by 1 when `advanced.showInactive === true` (user has explicitly enabled showing inactive — a non-default state). At default `undefined`/`false` it does not increment. This matches how every other advanced filter contributes — non-default state → badge tick.

- `formatCount` (the per-tab count text): gains one branch — when the *only* thing culling rows is the default inactive-hide, return the plain filtered count instead of `${filtered}/${unfiltered}`.

```ts
// True when the default-on inactive-hide is currently culling rows.
const isInactiveCulling = advanced.showInactive !== true;

// True when that's the only thing culling — no search, no other filters.
const onlyInactiveCulling =
  isInactiveCulling
  && activeAdvancedCount === 0
  && debouncedQuery.trim() === "";
```

When `onlyInactiveCulling` is true, return `${filtered}`. Otherwise fall through to the existing `${filtered}/${unfiltered}` logic. The result: a fresh page load reads `All 1234`. Add a search query and the All-tab reads `1234/7800` because two things are now culling.

Calling convention: the component coalesces optional state at the call site —
`applyInactiveVmFilter(vms, nodeStatusByHash, advanced.showInactive ?? false)`.

### Tab cap (DS-side change)

The `@aleph-front/ds` `Tabs` component currently supports `overflow="collapse"` with width-based overflow. We add a new optional prop:

```ts
maxVisible?: number;
```

Behavior: when set together with `overflow="collapse"`, caps the visible tabs at `maxVisible` regardless of available width. Tabs beyond the cap render via the existing overflow dropdown. When `maxVisible` is unset, behavior is unchanged (width-based collapse continues to work).

This is a small additive prop on an existing component; follow the DS lifecycle for component changes (preview page update, tests, docs in DS DESIGN-SYSTEM.md). See DS `docs/ARCHITECTURE.md` § Recipes for the canonical extension flow.

### Tab reorder (dashboard-side)

`STATUS_PILLS` in `vm-table.tsx` is reordered:

```
Visible (first 3):
  All, Dispatched, Scheduled
Overflow (rest, in current priority order):
  Duplicated, Misplaced, Missing, Orphaned, Unschedulable, Unscheduled, Unknown
```

Pass `maxVisible={3}` from `VMTable` through `FilterToolbar` to the underlying DS `Tabs`. The `FilterToolbar` API gains an optional `maxVisibleStatuses?: number` prop.

Other consumers of `FilterToolbar` (Nodes page, Issues page) don't pass the prop — width-based overflow continues for them.

## UI

### FilterPanel placement

The "Show inactive VMs" checkbox slots into the existing **Payment & Allocation** column, after the divider that already separates the payment checkboxes from the misc row. The column becomes:

```
PAYMENT & ALLOCATION
  [ ] Validated      — payment confirmed
  [ ] Invalidated    — payment rejected or expired
  ─────────────────────────────────────────
  [ ] Allocated to a node    — running on a CRN
  [ ] Requires GPU           — needs GPU hardware
  [ ] Requires Confidential  — requires TEE
  [ ] Show inactive VMs      — include VMs on unreachable, removed, or unknown nodes
```

Reset button on the FilterPanel restores `showInactive` to default (hidden), same behavior as every other advanced filter. URL param is removed in the same operation.

### Toolbar appearance

Tab group caps to 3 visible. Overflow dropdown holds the remaining 7 statuses with their existing tooltips.

When `?showInactive=true` is set, no banner — that was option C in the brainstorm and was explicitly rejected. The user discovers the state via the FilterPanel checkbox and (when other filters are also active) the `filtered/unfiltered` slash suffix on counts.

## Testing

Unit tests in `src/lib/filters.test.ts`:

- `applyInactiveVmFilter` returns identity when `showInactive=true`.
- `applyInactiveVmFilter` hides VMs whose `allocatedNode` resolves to `unreachable`, `removed`, or `unknown`.
- `applyInactiveVmFilter` keeps VMs with no `allocatedNode` regardless of `showInactive`.
- `applyInactiveVmFilter` keeps VMs whose `allocatedNode` is missing from the map (fail-open).
- `applyInactiveVmFilter` keeps VMs on `healthy` nodes.

Existing `vm-table.test.tsx` (or a new lightweight integration test) covers:

- All-tab count is plain when only `showInactive` is hiding rows (no slash).
- Slash suffix returns when search or another advanced filter is layered on top.
- Toggling the checkbox updates the URL via `router.replace`.
- Initial state seeded from `?showInactive=true`.

DS-side: a `maxVisible` test in the DS Tabs test suite — width-independent visible-count cap, overflow dropdown contains the remainder.

## Edge cases & loading

- **Nodes still loading** — `nodeStatusByHash` is empty. Filter fails-open per branch above; once nodes load, the memo re-runs and inactive VMs are hidden. Acceptable visual shift, matches the rest of the page's progressive render.
- **`allocatedNode` points to a hash absent from the nodes list** — fail-open, VM stays visible. No logging plumbed in; if this becomes a recurring source of confusion, revisit.
- **All VMs hidden by the filter** — table renders zero rows; existing empty-state covers it. The user's signal that something's wrong is the count: All-tab shows `0` plainly. They can open FilterPanel and see "Show inactive VMs" is unchecked.

## Out of scope

- Banner / inline disclosure of "X inactive VMs hidden" (option C in Q3 was rejected — keep it quiet).
- VM-status long-tail filtering bundled into this toggle (rejected in Q1).
- URL persistence for the *other* advanced filters (vmTypes, paymentStatuses, ranges) — stays in the parked roadmap backlog item.
- Application of the same logic to Issues page tables, detail panels, or Top Nodes / Latest VMs cards on Overview.

## Files touched

**Dashboard:**
- `src/lib/filters.ts` — add `INACTIVE_NODE_STATUSES`, `applyInactiveVmFilter`, extend `VmAdvancedFilters`.
- `src/lib/filters.test.ts` — new test cases.
- `src/components/vm-table.tsx` — fetch nodes, build map, integrate filter, reorder STATUS_PILLS, pass `maxVisible={3}`, add showInactive checkbox to FilterPanel column 2, count-badge logic, URL read/write.
- `src/components/filter-toolbar.tsx` — new optional `maxVisibleStatuses?: number` prop, threaded to underlying Tabs.
- `src/app/vms/page.tsx` — read `?showInactive=true` from search params, pass as `initialShowInactive`.
- `docs/ARCHITECTURE.md` — note the inactive-VM filter pattern + tab-cap usage.
- `docs/DECISIONS.md` — log decision #66 (this design).
- `docs/BACKLOG.md` — move "VMs page Show inactive VMs filter" to Completed.
- `CLAUDE.md` — Current Features bullet for VMs page.
- `src/changelog.ts` — bump and add entry.

**DS (`@aleph-front/ds`):**
- `Tabs` component — add `maxVisible?: number` prop and behavior.
- Tabs preview page / tests / docs per DS lifecycle.
