# VM fields & `migrating` status

**Date:** 2026-05-12
**Status:** Design approved, ready for implementation planning
**Related:** Scheduler API additions (PRs #151, #158, #159, #167). Decision #65 (`ACTIVE_VM_STATUSES` definition).

## Goal

Adopt the new VM-level fields the scheduler now returns (`scheduling_status`, `migration_target`, `migration_started_at`, `owner`) and the new `migrating` status value. Surface them in three places where they're materially useful: the VMs table, the VM detail surfaces, the Issues page, and the network graph. Make migrations visible to operators at a glance.

Reuse existing visual primitives (status pills, CopyableText with wallet link, the network-graph edge palette). No new visual vocabulary; one new edge type.

## Scope

**In scope:**

1. New API fields on the VM type and transform layer.
2. `migrating` added to `VmStatus`; included in `ACTIVE_VM_STATUSES`; promoted to a visible tab slot on `/vms`.
3. Owner address rendered as a clickable wallet link on VM detail panel + view (mirrors Node detail).
4. Migration section on VM detail panel + view when a VM is migrating: target node link + relative `migrationStartedAt`.
5. Issues page detail panel shows a "Schedule vs Reality" sub-row when `schedulingStatus !== status`.
6. Network graph renders a `type: "migration"` amber arrow from source CRN → target CRN for every migrating VM. CRN detail panel surfaces inbound/outbound migration counts.

**Out of scope** (deferred / handled elsewhere):

- Server-side filtering by `scheduling_status` or `owners` — that's Spec B (`2026-05-12-vm-owner-server-filter-design.md`).
- WebSocket-driven live updates / pulse animations on the network graph — that's Spec C (`2026-05-12-scheduler-websocket-design.md`); polled cache invalidation already keeps migration arrows fresh on the existing refetch interval.
- A standalone "Migrations" page or filter beyond the new tab pill.
- Showing `scheduling_status` on the VMs list table (only surfaces on Issues + VM detail when it diverges).
- Owner column in the VM table (owner addresses are 42-char hashes and crowd the table; click-through from detail is enough).
- A network-graph layer toggle for migration edges. Migrations are rare and informative; always-on.

## Data layer

### `src/api/types.ts`

```ts
export type VmStatus =
  | "scheduled"
  | "dispatched"
  | "migrating"      // new
  | "duplicated"
  | "misplaced"
  | "missing"
  | "orphaned"
  | "unscheduled"
  | "unschedulable"
  | "unknown";

export type VM = {
  // ... existing fields
  schedulingStatus: VmStatus | null;    // new — raw scheduler value
  migrationTarget: string | null;       // new — destination node hash
  migrationStartedAt: string | null;    // new — ISO timestamp
  owner: string | null;                 // new — creator wallet address
};

export type ApiVmRow = {
  // ... existing fields
  scheduling_status: VmStatus | null;
  migration_target: string | null;
  migration_started_at: string | null;
  owner: string | null;
};
```

### `src/api/client.ts`

Extend `transformVm` to map the new four fields verbatim (no derived values). All four are nullable on the wire — keep them nullable in the domain type. No back-compat shim: the field names match the scheduler's documented response.

### `src/lib/filters.ts`

```ts
export const ACTIVE_VM_STATUSES: ReadonlySet<VmStatus> = new Set<VmStatus>([
  "dispatched",
  "migrating",        // new
  "duplicated",
  "misplaced",
  "missing",
  "unschedulable",
]);
```

A VM in mid-migration is still allocated and consuming resources — it belongs in the active set so Overview "Total VMs" counts it and the default `showInactive=false` filter leaves it visible.

### `src/lib/status-map.ts`

```ts
export const VM_STATUS_VARIANT: Record<VmStatus, BadgeVariant> = {
  dispatched: "success",
  scheduled: "default",
  migrating: "warning",      // new — amber pill, signals transient operational state
  duplicated: "warning",
  misplaced: "warning",
  missing: "error",
  orphaned: "warning",
  unscheduled: "default",
  unschedulable: "error",
  unknown: "default",
};
```

## VMs page

### Status tab promotion (`src/app/vms/page.tsx`)

DS Tabs `maxVisible` goes from `3` → `4`. Visible: **All / Dispatched / Scheduled / Migrating**. Overflow (`⋯`): duplicated, misplaced, missing, orphaned, unscheduled, unschedulable, unknown.

Count badge logic unchanged — it already iterates `VmStatus` keys generically. The `?status=migrating` URL param is parsed by the existing validator since `migrating` is now a valid `VmStatus`.

### Default-hide filter interaction

`migrating` in `ACTIVE_VM_STATUSES` means the default "Show inactive VMs = off" leaves migrating VMs visible. No code change beyond the set update.

## VM detail (panel + full view)

`src/components/vm-detail-panel.tsx` and `src/components/vm-detail-view.tsx`:

### Owner row

New row in the metadata section, between existing rows. Format mirrors Node detail's owner row:

```tsx
<DetailRow label="Owner">
  {vm.owner ? (
    <CopyableText
      value={vm.owner}
      href={`/wallet?address=${vm.owner}`}
    >
      {truncateAddress(vm.owner)}
    </CopyableText>
  ) : (
    <span className="text-muted">—</span>
  )}
</DetailRow>
```

`CopyableText` auto-applies the link styling when `href` is set (per existing memory). Same row placement on both the panel and the view for visual consistency.

### Migration section

When `vm.status === "migrating"`, render a new section after the existing "Allocation" section, titled **Migration**:

- **Target** — `CopyableText` with `href="/nodes?view={migrationTarget}"` (same param shape as the existing cross-link from nodes ↔ vms).
- **Started** — relative time formatted via the existing time helper (e.g. `3m ago`).

Hidden entirely for non-migrating VMs (no empty section). If `migrationTarget` is null for a migrating VM (malformed data), show "Target: unknown" rather than crashing — defensive but expected to be rare.

## Issues page

### Schedule vs Reality (`src/components/issues-vm-table.tsx`, around the existing "Schedule vs Reality" card)

When `vm.schedulingStatus !== null && vm.schedulingStatus !== vm.status`, render a sub-row inside the existing "Schedule vs Reality" card showing both values as side-by-side DS Badges:

```
Derived:    [orphaned]      ← what we currently display under "Status"
Scheduler:  [dispatched]    ← raw scheduling_status
```

This is the diagnostic value of the new field — when they diverge, the operator sees both at once and the discrepancy explanation gets concrete grounding.

When they match (the common case), suppress the sub-row entirely.

### Migration metadata in the issue card

Migrating VMs are **not** discrepancies — they don't enter `DISCREPANCY_STATUSES` (`src/hooks/use-issues.ts`). They simply don't appear on Issues. (Edge case: a `status === "migrating"` VM with a divergent `schedulingStatus` could theoretically appear; the cascade still excludes it because migrating is not in the discrepancy set.)

No changes to `DiscrepancyStatus` or `DISCREPANCY_STATUSES` — both stay as today.

## Network graph

### Hook (`src/hooks/use-network-graph.ts`)

```ts
const { data: vmsData } = useVMs();

const migrations = useMemo<VM[]>(() => {
  if (!vmsData) return [];
  return vmsData.filter(
    (v) =>
      v.status === "migrating" &&
      v.allocatedNode != null &&
      v.migrationTarget != null,
  );
}, [vmsData]);

const fullGraph = useMemo<Graph>(() => {
  if (!state) return { nodes: [], edges: [] };
  return buildGraph(state, layers, ownerBalances, crnStatuses, migrations);
}, [state, layers, ownerBalances, crnStatuses, migrations]);
```

`useVMs()` is already polled (30s interval, cached); cost is essentially free for users navigating between `/vms` and `/network`.

### Model (`src/lib/network-graph-model.ts`)

```ts
export type EdgeType =
  | "structural"
  | "owner"
  | "staker"
  | "reward"
  | "geo"
  | "migration";   // new

export function buildGraph(
  state: NodeState,
  layers: Set<GraphLayer>,
  ownerBalances?: Map<string, number>,
  crnStatuses?: Map<string, string>,
  migrations?: VM[],
): Graph {
  // ... existing edge emission

  // Always-on (not gated by a layer). Migrations are rare and informative.
  if (migrations) {
    for (const vm of migrations) {
      // Both endpoints must exist as CRN nodes in the graph — otherwise the
      // edge would dangle. Skip silently if a hash isn't in the model.
      if (
        crnHashes.has(vm.allocatedNode!) &&
        crnHashes.has(vm.migrationTarget!)
      ) {
        edges.push({
          source: vm.allocatedNode!,
          target: vm.migrationTarget!,
          type: "migration",
        });
      }
    }
  }
  // ...
}
```

No new `GraphLayer`. Migrations bypass the layer toggle — operators always want to see them.

### Render layer (`src/components/network/network-edge.tsx`)

New case for `edge.type === "migration"`:

- Stroke: `var(--color-warning-500)` (amber, same token as the warning ring).
- Stroke width: `1` (slightly thicker than the `0.5` structural lines so the migration reads as a foreground signal).
- Solid (no dash).
- Arrowhead on the target end. Re-use the existing `#arrow-end` marker pattern but reference a new `<marker id="arrow-end-warning">` whose fill is `context-stroke` so it inherits the amber color naturally (same pattern as the structural arrow).
- Respects the existing **selection spotlight** logic: if neither endpoint is in `relevantIds`, render at the standard faded opacity. If incident to the selected node, full opacity. (This works "for free" because spotlight logic keys on endpoint membership, not edge type.)

### CRN detail panel (`src/components/network/network-detail-panel-crn.tsx`)

Derive inbound/outbound counts from `visibleGraph.edges` (passed in from the network page):

```ts
const outbound = visibleGraph.edges.filter(
  (e) => e.type === "migration" && e.source === node.id,
).length;
const inbound = visibleGraph.edges.filter(
  (e) => e.type === "migration" && e.target === node.id,
).length;
```

When `outbound + inbound > 0`, render a new "Migrations" row:

```
Migrations:  → 2 outbound  ← 1 inbound
```

Counts are clickable: clicking opens the first / a list... actually no — keep it simple. Just display the counts as static text. Drilling into individual migrations is `/vms?status=migrating` territory, not network-panel territory.

## Files changed

**Data layer:**
- `src/api/types.ts` — add `migrating` to `VmStatus`; add four fields to `VM` and `ApiVmRow`.
- `src/api/client.ts` — extend `transformVm` to map the four new fields.
- `src/lib/filters.ts` — add `migrating` to `ACTIVE_VM_STATUSES`.
- `src/lib/status-map.ts` — add `migrating: "warning"` to `VM_STATUS_VARIANT`.

**VMs page:**
- `src/app/vms/page.tsx` — bump `maxVisible` to 4, ensure migrating is between scheduled and duplicated in the tab order.

**VM detail:**
- `src/components/vm-detail-panel.tsx` — Owner row + Migration section.
- `src/components/vm-detail-view.tsx` — same.

**Issues page:**
- `src/components/issues-vm-table.tsx` — new sub-row in the Schedule vs Reality card when statuses diverge.

**Network graph:**
- `src/hooks/use-network-graph.ts` — call `useVMs()`, extract migrations, pass to `buildGraph`.
- `src/lib/network-graph-model.ts` — extend `EdgeType`, add `migrations?` param to `buildGraph`, emit edges.
- `src/components/network/network-edge.tsx` — render case for `type === "migration"`, new `<marker id="arrow-end-warning">` defined in `src/components/network/network-graph.tsx` alongside the existing arrow marker.
- `src/components/network/network-detail-panel-crn.tsx` — Migrations row.
- `src/app/network/page.tsx` — pass `visibleGraph.edges` (or the derived counts) to the CRN panel.

**Tests:**
- `src/api/client.test.ts` — assert `transformVm` parses the four new fields including the null cases.
- `src/lib/network-graph-model.test.ts` — migration edges emitted when both endpoints exist; skipped when an endpoint is missing.
- VM detail panel/view component tests (if they exist) — Owner row renders, Migration section visible only for migrating VMs.
- `src/hooks/use-issues.ts` — confirm migrating VMs are excluded from discrepancy lists.

**Docs / changelog:**
- `src/changelog.ts` — new VersionEntry (minor bump; user-visible new fields + tab + graph treatment).
- `docs/ARCHITECTURE.md` — note `EdgeType.migration` and the always-on edge family.
- `CLAUDE.md` — Current Features list updates for the VM detail, Issues, and network-graph additions.
- `docs/DECISIONS.md` — entry for "migrating is active + visible tab + amber warning variant".

## Testing

- **Type/transform tests:** assert `transformVm` accepts and parses the new field shapes; assert null values for VMs that don't have them.
- **Status map tests:** assert `VM_STATUS_VARIANT.migrating === "warning"`; ensure no missing keys after the enum extension (TypeScript exhaustiveness will catch this at compile time too).
- **Graph model tests:** seed `buildGraph` with a CRN, a target CRN, and a migrating VM linking them; assert one `type: "migration"` edge appears with the correct source/target. Negative test: when target CRN is absent from `state`, no edge emitted.
- **Issues hook tests:** add a fixture with a `status === "migrating"` VM and confirm it's filtered out of `issueVMs` and `issueNodes`.
- **Manual visual check:** preview the migration tether color and arrow direction against the existing structural edges; verify the warning pill on the VMs tab matches the warning ring on the graph for visual consistency.

## Open questions

None at design approval time. Implementation-time decisions deferred:

- **Migration tether animation.** Spec is solid color (no animated dash). If migrations stay too visually static once we see them in production, an animated dash flow could be added — but defer until we know we need it.
- **What if `schedulingStatus` is null on every VM?** Some scheduler versions may not populate it. The Schedule vs Reality sub-row already guards on `!== null`, so this degrades gracefully.
- **Migration count interaction.** Currently static text. If users want to click through to filtered VM lists, a follow-up can wire `→ 2 outbound` to `/vms?status=migrating&node=<sourceHash>` (or similar). Out of scope for v1.
