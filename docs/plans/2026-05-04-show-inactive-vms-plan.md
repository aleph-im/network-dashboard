---
status: partial
date: 2026-05-04
spec: docs/plans/2026-05-04-show-inactive-vms-design.md
branch: feature/show-inactive-vms
note: Tasks 1–3 + 5 + 6 shipped; Task 4 (status pill cap) deferred to BACKLOG until DS Tabs `maxVisible` prop lands. Scoped docs to what shipped (Decision #67, changelog 0.9.0).
---

# Show Inactive VMs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-on "Show inactive VMs" filter on `/vms` that hides VMs whose `allocatedNode` resolves to a node in `{unreachable, removed, unknown}` status, with two-way URL persistence and a quiet UI placement in the FilterPanel. Reorder the status pills so All/Dispatched/Scheduled are the only three visible (rest in overflow), via a new `maxVisible` prop on the DS Tabs component.

**Architecture:** A new pure function `applyInactiveVmFilter` in `src/lib/filters.ts` runs early in the VMTable filter pipeline, taking a `Map<string, NodeStatus>` derived from `useNodes()`. State lives in `VmAdvancedFilters.showInactive`. URL persistence uses `?showInactive=true` (param omitted at default). Count-badge math gets one new branch so the All-tab reads as a plain count when only the default-on inactive-hide is culling.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, React Query, Tailwind 4, `@aleph-front/ds`, vitest.

**Spec:** `docs/plans/2026-05-04-show-inactive-vms-design.md`

**Branch:** `feature/show-inactive-vms` (already created from main; spec already committed)

---

## Prerequisites

Task 4 (tab cap) depends on a `maxVisible?: number` prop landing in `@aleph-front/ds`'s `Tabs` component first. That work happens in `../aleph-cloud-ds` per the DS lifecycle and is out of scope for this plan. Tasks 1–3 are independent of the DS update and can land in their own PR if the DS work is delayed.

If the DS prop has not shipped when Task 4 starts, stop and surface that to the user — do not work around it with width hacks.

---

## Task 1: Pure filter function + tests

**Files:**
- Modify: `src/lib/filters.ts` — add `INACTIVE_NODE_STATUSES`, `applyInactiveVmFilter`, extend `VmAdvancedFilters` type
- Modify: `src/lib/filters.test.ts` — add 5 test cases

- [ ] **Step 1: Write failing tests for `applyInactiveVmFilter`**

Append to `src/lib/filters.test.ts` (after the existing `applyVmAdvancedFilters` tests; mirror the existing `makeVm` / `makeNode` fixture style at the top of the file):

```ts
import { applyInactiveVmFilter, INACTIVE_NODE_STATUSES } from "@/lib/filters";
import type { NodeStatus } from "@/api/types";

describe("applyInactiveVmFilter", () => {
  function statusMap(entries: Array<[string, NodeStatus]>): Map<string, NodeStatus> {
    return new Map(entries);
  }

  it("returns identity when showInactive=true", () => {
    const vms = [
      makeVm({ hash: "v1", allocatedNode: "node-down" }),
      makeVm({ hash: "v2", allocatedNode: "node-ok" }),
    ];
    const map = statusMap([
      ["node-down", "removed"],
      ["node-ok", "healthy"],
    ]);
    expect(applyInactiveVmFilter(vms, map, true)).toEqual(vms);
  });

  it("hides VMs whose allocatedNode is unreachable, removed, or unknown", () => {
    const vms = [
      makeVm({ hash: "v-unreach", allocatedNode: "n-unreach" }),
      makeVm({ hash: "v-removed", allocatedNode: "n-removed" }),
      makeVm({ hash: "v-unknown", allocatedNode: "n-unknown" }),
      makeVm({ hash: "v-ok", allocatedNode: "n-ok" }),
    ];
    const map = statusMap([
      ["n-unreach", "unreachable"],
      ["n-removed", "removed"],
      ["n-unknown", "unknown"],
      ["n-ok", "healthy"],
    ]);
    const result = applyInactiveVmFilter(vms, map, false);
    expect(result.map((v) => v.hash)).toEqual(["v-ok"]);
  });

  it("keeps VMs with no allocatedNode regardless of showInactive", () => {
    const vms = [
      makeVm({ hash: "v-orphan", allocatedNode: null }),
      makeVm({ hash: "v-missing", allocatedNode: null }),
    ];
    const map = statusMap([]);
    expect(applyInactiveVmFilter(vms, map, false).map((v) => v.hash))
      .toEqual(["v-orphan", "v-missing"]);
  });

  it("keeps VMs whose allocatedNode is missing from the map (fail-open)", () => {
    const vms = [makeVm({ hash: "v1", allocatedNode: "node-not-loaded" })];
    expect(applyInactiveVmFilter(vms, statusMap([]), false).map((v) => v.hash))
      .toEqual(["v1"]);
  });

  it("keeps VMs on healthy nodes when showInactive=false", () => {
    const vms = [makeVm({ hash: "v1", allocatedNode: "n-ok" })];
    const map = statusMap([["n-ok", "healthy"]]);
    expect(applyInactiveVmFilter(vms, map, false).map((v) => v.hash))
      .toEqual(["v1"]);
  });

  it("INACTIVE_NODE_STATUSES contains exactly unreachable, removed, unknown", () => {
    expect([...INACTIVE_NODE_STATUSES].sort()).toEqual(
      ["removed", "unknown", "unreachable"],
    );
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test -- filters.test.ts`
Expected: 6 failures with "applyInactiveVmFilter is not exported" or similar.

- [ ] **Step 3: Implement the filter and extend the type**

In `src/lib/filters.ts`, add `NodeStatus` to the imports from `@/api/types` (or expand the existing import line — check what's already imported):

```ts
import type { Node, NodeStatus, VM, VmType } from "@/api/types";
```

Append after the existing `applyVmAdvancedFilters` block (currently ending around line 261):

```ts
export const INACTIVE_NODE_STATUSES: ReadonlySet<NodeStatus> = new Set<NodeStatus>([
  "unreachable",
  "removed",
  "unknown",
]);

/**
 * Hide VMs whose allocated node is in an inactive status.
 *
 * Fail-open behavior: VMs with no allocatedNode pass; VMs whose allocatedNode
 * is missing from the status map (e.g. nodes still loading) also pass. Once
 * the nodes load, the memo re-runs and inactive VMs disappear.
 */
export function applyInactiveVmFilter(
  vms: VM[],
  nodeStatusByHash: Map<string, NodeStatus>,
  showInactive: boolean,
): VM[] {
  if (showInactive) return vms;
  return vms.filter((v) => {
    if (!v.allocatedNode) return true;
    const status = nodeStatusByHash.get(v.allocatedNode);
    if (!status) return true;
    return !INACTIVE_NODE_STATUSES.has(status);
  });
}
```

Then extend `VmAdvancedFilters` (currently at line 164):

```ts
export type VmAdvancedFilters = {
  vmTypes?: Set<VmType>;
  paymentStatuses?: Set<string>;
  hasAllocatedNode?: boolean;
  requiresGpu?: boolean;
  requiresConfidential?: boolean;
  vcpusRange?: [number, number];
  memoryGbRange?: [number, number];
  showInactive?: boolean;
};
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm test -- filters.test.ts`
Expected: all green.

- [ ] **Step 5: Run full lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: 0 warnings, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/filters.ts src/lib/filters.test.ts
git commit -m "feat(filters): add applyInactiveVmFilter for node-status culling"
```

---

## Task 2: Wire filter + checkbox into VMTable

**Files:**
- Modify: `src/components/vm-table.tsx` — fetch nodes, derive status map, integrate filter into pipeline, extend `activeAdvancedCount`, update `formatCount`, add checkbox to FilterPanel column 2

- [ ] **Step 1: Add `useNodes` import and call**

At the top of `src/components/vm-table.tsx`, add to imports:

```ts
import { useNodes } from "@/hooks/use-nodes";
import type { NodeStatus, AlephMessageInfo, VM, VmStatus, VmType } from "@/api/types";
```

(merge the `NodeStatus` into the existing type import line)

Inside `VMTable` component, after the existing `useVMs()` call (~line 259):

```ts
const { data: allNodes } = useNodes();
const nodeStatusByHash = useMemo(() => {
  const m = new Map<string, NodeStatus>();
  for (const n of allNodes ?? []) m.set(n.hash, n.status);
  return m;
}, [allNodes]);
```

- [ ] **Step 2: Wire `applyInactiveVmFilter` into the pipeline**

Update the `useMemo` filter pipeline (currently ~line 289). Add the inactive filter as the first step after search:

```ts
const { displayedRows, filteredCounts, unfilteredCounts } = useMemo(() => {
  const all = allVms ?? [];
  const uCounts = countByStatus(all, (v) => v.status);

  const vmSearchFields = (v: VM) => [
    ...VM_BASE_SEARCH_FIELDS(v),
    messageInfo?.get(v.hash)?.name,
  ];
  const afterSearch = textSearch(all, debouncedQuery, vmSearchFields);
  const afterInactive = applyInactiveVmFilter(
    afterSearch,
    nodeStatusByHash,
    advanced.showInactive ?? false,
  );
  const afterAdvanced = applyVmAdvancedFilters(afterInactive, advanced, filterMaxes);
  const fCounts = countByStatus(afterAdvanced, (v) => v.status);

  const afterStatus = statusFilter
    ? afterAdvanced.filter((v) => v.status === statusFilter)
    : afterAdvanced;

  return {
    displayedRows: afterStatus,
    filteredCounts: fCounts,
    unfilteredCounts: uCounts,
  };
}, [allVms, debouncedQuery, advanced, statusFilter, messageInfo, filterMaxes, nodeStatusByHash]);
```

Add the import to the top of the file:

```ts
import {
  textSearch,
  countByStatus,
  applyInactiveVmFilter,
  applyVmAdvancedFilters,
  computeVmFilterMaxes,
  type VmAdvancedFilters,
} from "@/lib/filters";
```

- [ ] **Step 3: Extend `activeAdvancedCount` to count enabled showInactive**

Update the `activeAdvancedCount` computation (currently ~line 270). Add one entry to the array:

```ts
const activeAdvancedCount = [
  advanced.vmTypes != null &&
    advanced.vmTypes.size > 0 &&
    advanced.vmTypes.size < ALL_VM_TYPES.length,
  advanced.paymentStatuses != null &&
    advanced.paymentStatuses.size > 0 &&
    advanced.paymentStatuses.size < ALL_PAYMENT_STATUSES.length,
  advanced.hasAllocatedNode,
  advanced.requiresGpu,
  advanced.requiresConfidential,
  advanced.vcpusRange != null &&
    (advanced.vcpusRange[0] > 0 ||
      advanced.vcpusRange[1] < filterMaxes.vcpus),
  advanced.memoryGbRange != null &&
    (advanced.memoryGbRange[0] > 0 ||
      advanced.memoryGbRange[1] < filterMaxes.memoryGb),
  advanced.showInactive === true,
].filter(Boolean).length;
```

- [ ] **Step 4: Update `formatCount` for the inactive-only fast path**

Replace the `formatCount` function body (currently ~line 343). The fast path: when only the default-on inactive-hide is culling, return the plain filtered count.

```ts
function formatCount(status: VmStatus | undefined): string {
  const key = status ?? "all";
  const filtered =
    key === "all"
      ? Object.values(filteredCounts).reduce((a, b) => a + b, 0)
      : (filteredCounts[key] ?? 0);
  const unfiltered =
    key === "all"
      ? Object.values(unfilteredCounts).reduce((a, b) => a + b, 0)
      : (unfilteredCounts[key] ?? 0);

  // When the only thing culling rows is the default-on inactive-hide
  // (no search, no other advanced filters, showInactive at default),
  // show a plain count — the default state shouldn't shout.
  const inactiveCulling = advanced.showInactive !== true;
  const onlyInactiveCulling =
    inactiveCulling && activeAdvancedCount === 0 && debouncedQuery.trim() === "";

  if (onlyInactiveCulling) {
    return `${filtered}`;
  }

  if (hasNonStatusFilters && filtered !== unfiltered) {
    return `${filtered}/${unfiltered}`;
  }
  return `${unfiltered}`;
}
```

Note: `activeAdvancedCount` already counts `showInactive === true`, so when the user enables showing inactive, `onlyInactiveCulling` is false (because `activeAdvancedCount >= 1`) and we fall through to the existing branches.

- [ ] **Step 5: Add the "Show inactive VMs" checkbox to FilterPanel**

In the FilterPanel JSX, find the **Payment & Allocation** column (currently around line 472). Inside the second `<div className="space-y-2.5">` block (the misc-row block, after the divider), append a fourth checkbox after "Requires Confidential":

```tsx
<label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none">
  <Checkbox
    size="sm"
    checked={advanced.showInactive ?? false}
    onCheckedChange={(v) =>
      updateAdvanced((p) => {
        const { showInactive: _, ...rest } = p;
        return v === true
          ? { ...rest, showInactive: true }
          : rest;
      })
    }
  />
  <span>
    Show inactive VMs
    <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
      — include VMs on unreachable, removed, or unknown nodes
    </span>
  </span>
</label>
```

- [ ] **Step 6: Run lint + typecheck + tests**

Run: `pnpm check`
Expected: all green.

- [ ] **Step 7: Manual smoke test**

Run: `pnpm dev`. Open `http://localhost:3000/vms`. Verify:
- All-tab count is now lower than before (inactive VMs hidden by default), shown as plain count (no slash).
- Open FilterPanel, find "Show inactive VMs" in Payment & Allocation column, unchecked.
- Check it: All-tab count jumps to the full set, panel-header active-count badge ticks up by 1.
- Uncheck: count drops back, badge un-ticks.
- Type something in search: count switches to `filtered/unfiltered` slash format.
- Click reset on FilterPanel: showInactive resets to unchecked (default).

- [ ] **Step 8: Commit**

```bash
git add src/components/vm-table.tsx
git commit -m "feat(vms): wire applyInactiveVmFilter into VMTable + add checkbox"
```

---

## Task 3: URL persistence

**Files:**
- Modify: `src/components/vm-table.tsx` — accept `initialShowInactive` prop, write `?showInactive=true` to URL on toggle
- Modify: `src/app/vms/page.tsx` — read `?showInactive=true` from search params, thread to VMTable

- [ ] **Step 1: Add `initialShowInactive` prop to VMTable**

In `src/components/vm-table.tsx`, extend `VMTableProps` (~line 221):

```ts
type VMTableProps = {
  onSelectVM: (hash: string) => void;
  initialStatus?: VmStatus;
  initialQuery?: string;
  initialShowInactive?: boolean;
  selectedKey?: string;
  compact?: boolean;
  sidePanel?: React.ReactNode;
};
```

Destructure it in the function signature (~line 230):

```ts
export function VMTable({
  onSelectVM,
  initialStatus,
  initialQuery,
  initialShowInactive,
  selectedKey,
  compact,
  sidePanel,
}: VMTableProps) {
```

Seed `advanced` initial state from it. The current `useState<VmAdvancedFilters>({})` becomes:

```ts
const [advanced, setAdvanced] = useState<VmAdvancedFilters>(
  initialShowInactive ? { showInactive: true } : {},
);
```

- [ ] **Step 2: Add `useRouter` for URL writes**

Add to imports at the top of `src/components/vm-table.tsx`:

```ts
import { useRouter, useSearchParams, usePathname } from "next/navigation";
```

Inside the component body, near the other hook calls:

```ts
const router = useRouter();
const pathname = usePathname();
const searchParams = useSearchParams();
```

- [ ] **Step 3: Write `?showInactive=true` to URL on toggle**

Replace the `onCheckedChange` handler in the "Show inactive VMs" checkbox you added in Task 2. Wrap the state update so it also updates the URL via `router.replace`:

```tsx
<Checkbox
  size="sm"
  checked={advanced.showInactive ?? false}
  onCheckedChange={(v) => {
    updateAdvanced((p) => {
      const { showInactive: _, ...rest } = p;
      return v === true ? { ...rest, showInactive: true } : rest;
    });
    const params = new URLSearchParams(searchParams.toString());
    if (v === true) {
      params.set("showInactive", "true");
    } else {
      params.delete("showInactive");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }}
/>
```

Also handle reset: the existing `clearAdvanced` function (~line 405) needs to drop the URL param too:

```ts
function clearAdvanced() {
  startTransition(() => setAdvanced({}));
  const params = new URLSearchParams(searchParams.toString());
  params.delete("showInactive");
  const qs = params.toString();
  router.replace(qs ? `${pathname}?${qs}` : pathname);
}
```

- [ ] **Step 4: Read `?showInactive=true` in `src/app/vms/page.tsx`**

Inside `VMsContent()` after the existing `queryParam` line (~line 33):

```ts
const showInactiveParam = searchParams.get("showInactive") === "true";
```

Pass it to VMTable in the JSX (~line 50):

```tsx
<VMTable
  onSelectVM={setSelectedVM}
  {...(initialStatus ? { initialStatus } : {})}
  initialQuery={queryParam}
  {...(showInactiveParam ? { initialShowInactive: true } : {})}
  {...(selectedVM ? { selectedKey: selectedVM } : {})}
  compact={!!selectedVM}
  sidePanel={...}
/>
```

(Use the spread-with-conditional pattern to satisfy `exactOptionalPropertyTypes` — see project memory: cannot pass `undefined` to optional props.)

- [ ] **Step 5: Run pnpm check**

Run: `pnpm check`
Expected: all green.

- [ ] **Step 6: Manual test**

`pnpm dev`. Open `/vms`:
- Toggle the checkbox on → URL gains `?showInactive=true`. Refresh → checkbox stays on, inactive VMs visible.
- Toggle off → URL drops the param. Refresh → checkbox off, inactive hidden.
- Click reset on FilterPanel with checkbox on → checkbox resets to off AND URL drops the param.
- Open `/vms?showInactive=true` directly → page loads with checkbox on.

- [ ] **Step 7: Commit**

```bash
git add src/components/vm-table.tsx src/app/vms/page.tsx
git commit -m "feat(vms): persist showInactive toggle via ?showInactive query param"
```

---

## Task 4: Tab reorder + tab cap (depends on DS prerequisite)

**Prerequisite:** `@aleph-front/ds` Tabs component must support `maxVisible?: number` prop. If not yet released, **stop and surface to the user** — do not work around it.

**Files:**
- Modify: `src/components/filter-toolbar.tsx` — add optional `maxVisibleStatuses?: number` prop, thread to TabsList
- Modify: `src/components/vm-table.tsx` — reorder `STATUS_PILLS`, pass `maxVisibleStatuses={3}` to FilterToolbar

- [ ] **Step 1: Verify the DS update is in place**

Run: `pnpm list @aleph-front/ds`. Expected: a version that ships `maxVisible` on Tabs (check the DS changelog / ARCHITECTURE.md for the merge note).

If the prop isn't there, stop here and report to the user.

- [ ] **Step 2: Add `maxVisibleStatuses` prop to FilterToolbar**

In `src/components/filter-toolbar.tsx`, extend `FilterToolbarProps`:

```ts
type FilterToolbarProps<S> = {
  statuses: StatusPill<S>[];
  activeStatus: S;
  onStatusChange: (status: S) => void;
  formatCount: (status: S) => string;
  filtersOpen?: boolean;
  onFiltersToggle?: () => void;
  activeFilterCount?: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  leading?: ReactNode;
  maxVisibleStatuses?: number;
};
```

Destructure `maxVisibleStatuses` in the function signature, then thread it to `TabsList`:

```tsx
<TabsList
  variant="underline"
  size="sm"
  overflow="collapse"
  {...(maxVisibleStatuses != null ? { maxVisible: maxVisibleStatuses } : {})}
>
```

- [ ] **Step 3: Reorder `STATUS_PILLS` in vm-table.tsx**

Replace the `STATUS_PILLS` array (~line 36) so the first three are the visible set:

```ts
const STATUS_PILLS: { value: VmStatus | undefined; label: string; tooltip?: string }[] = [
  { value: undefined, label: "All" },
  { value: "dispatched", label: "Dispatched", tooltip: "Running on the correct node" },
  { value: "scheduled", label: "Scheduled", tooltip: "Assigned to a node but not yet observed" },
  { value: "duplicated", label: "Duplicated", tooltip: "Running on correct node plus extra copies" },
  { value: "misplaced", label: "Misplaced", tooltip: "Running on wrong node(s), not on assigned node" },
  { value: "missing", label: "Missing", tooltip: "Scheduled but not found on any node" },
  { value: "orphaned", label: "Orphaned", tooltip: "Running without active scheduling intent" },
  { value: "unschedulable", label: "Unschedulable", tooltip: "No node meets this VM's requirements" },
  { value: "unscheduled", label: "Unscheduled", tooltip: "Deliberately unscheduled" },
  { value: "unknown", label: "Unknown", tooltip: "Status could not be determined" },
];
```

- [ ] **Step 4: Pass `maxVisibleStatuses={3}` from VMTable**

In the `<FilterToolbar ...>` JSX (~line 421), add the prop:

```tsx
<FilterToolbar
  statuses={STATUS_PILLS}
  activeStatus={statusFilter}
  onStatusChange={(s) => startTransition(() => setStatusFilter(s))}
  formatCount={formatCount}
  filtersOpen={filtersOpen}
  onFiltersToggle={() => setFiltersOpen((v) => !v)}
  activeFilterCount={activeAdvancedCount}
  searchValue={searchInput}
  onSearchChange={setSearchInput}
  searchPlaceholder="Search hash, name, node..."
  maxVisibleStatuses={3}
/>
```

- [ ] **Step 5: Run pnpm check**

Run: `pnpm check`
Expected: all green.

- [ ] **Step 6: Manual test**

`pnpm dev`. Open `/vms`:
- Tab bar shows exactly: All, Dispatched, Scheduled. Plus the overflow `⋯` dropdown.
- Click overflow → 7 remaining statuses appear (Duplicated, Misplaced, Missing, Orphaned, Unschedulable, Unscheduled, Unknown).
- Pick one from the dropdown → that status becomes the active tab (DS Tabs handles this).
- Verify Nodes page (`/nodes`) and Issues page (`/issues`) tab bars are unchanged — width-based collapse still works since they don't pass `maxVisibleStatuses`.

- [ ] **Step 7: Commit**

```bash
git add src/components/filter-toolbar.tsx src/components/vm-table.tsx
git commit -m "feat(vms): cap visible status pills to 3 via DS Tabs maxVisible"
```

---

## Task 5: Verify and refine

- [ ] **Step 1: Run full project checks**

Run: `pnpm check`
Expected: all green.

- [ ] **Step 2: Manual end-to-end test of the golden path and edges**

`pnpm dev`. Walk through:

- Fresh `/vms` load: All-tab shows plain count (no slash), inactive VMs hidden, FilterPanel checkbox off. Tab bar shows only 3 + overflow.
- Open FilterPanel, check "Show inactive VMs": URL gains `?showInactive=true`, count jumps to full set, badge ticks up.
- Refresh page: state restored from URL.
- Add a search query while showInactive is off: count format switches to `1234/5678`.
- Click overflow tab, pick "Missing": active tab is now Missing, count behaves consistently.
- Click reset on FilterPanel: showInactive clears, URL drops param, count returns to plain.
- Direct URL `/vms?showInactive=true&q=foo` → both states applied.
- Click a VM row, detail panel opens, side panel narrows the table — tab bar still shows 3 (not affected by table width).
- Toggle dark/light mode: panel chrome and checkbox styling consistent.
- Open `/nodes` and `/issues`: tab bars unchanged from before, no regression.

- [ ] **Step 3: Fix any issues found**

If anything fails, fix in place. Re-run `pnpm check`. Iterate until clean.

- [ ] **Step 4: Commit any fixes**

```bash
git add <changed files>
git commit -m "fix(vms): <description of issue>"
```

(Skip this step if no issues found.)

---

## Task 6: Update docs and version

- [ ] **Step 1: Update `docs/ARCHITECTURE.md`**

Find the section discussing the VMs page filter system (search for "Filter Pipeline" or the VMs-specific section, around line 209 based on Decision #62 references). Add a paragraph describing the inactive-VM filter:

```markdown
**Inactive-VM filter (default on).** The VMs page hides VMs whose `allocatedNode` resolves to a node in `{unreachable, removed, unknown}` status by default. State lives in `VmAdvancedFilters.showInactive` (default `undefined`/`false` = hidden); toggleable via a checkbox in the FilterPanel's Payment & Allocation column. Two-way URL persistence via `?showInactive=true` (param omitted at default). The pure filter `applyInactiveVmFilter(vms, nodeStatusByHash, showInactive)` runs early in the pipeline; the lookup map is derived from `useNodes()` data already cached app-wide. Fail-open on unloaded nodes — VMs whose allocated node isn't yet in the loaded set stay visible until the next memo run.
```

Also add a line in the FilterToolbar / Tabs section (search for "Tabs" / "overflow"):

```markdown
The DS `Tabs` component supports an optional `maxVisible?: number` prop that caps the visible tab count regardless of available width — used on the VMs page to lock the visible set to All/Dispatched/Scheduled, with the rest in the overflow dropdown.
```

- [ ] **Step 2: Update `docs/DECISIONS.md`**

Add a new decision at the top (Decision #66, dated 2026-05-04):

```markdown
## Decision #66 - 2026-05-04
**Context:** Reza on Telegram raised that the VMs page lists VMs allocated to dead-ish nodes (unreachable / removed / unknown) alongside live workload, mirroring the "Show inactive nodes" pattern from the Aleph Account app.
**Decision:** Default-on filter on `/vms` that hides VMs whose `allocatedNode` resolves to a node in `{unreachable, removed, unknown}`. Toggle lives in the FilterPanel (not the toolbar) under Payment & Allocation. Two-way URL persistence via `?showInactive=true`. Status pills capped to 3 visible (All/Dispatched/Scheduled) via a new `maxVisible` prop on the DS Tabs component; the rest live in the overflow dropdown. Count badge stays plain when only the default-on inactive-hide is culling — the slash suffix returns when other filters stack on top.
**Rationale:** Strict node-status semantics (Q1: option A) keep the toggle conceptually crisp — "is the home this VM lives in alive?" — and avoid bundling VM-status long-tail filtering, which the existing status pills already handle. Including `unknown` in the inactive set (Q2: option B) treats prolonged silence as effectively dead; if a node recovers it flips back to `healthy` and its VMs reappear automatically. FilterPanel placement (Q3) keeps the filter quiet by default — the user's intent was "don't give it more attention than it needs". Plain-count fast path (Q4: option B) prevents the All-tab from constantly screaming `1234/7800` on every page load. URL persistence is in scope here (single-boolean two-way sync) even though the broader URL-persistence retrofit for other advanced filters stays parked as a roadmap item — sharing a "show me inactive too" link is the meaningful use case.
**Alternatives considered:** Bundling VM-status long-tail (rejected — confusing). Toolbar placement next to status pills (rejected — toolbar is for navigation/scope, not advanced filters). Inline banner on culling state (rejected — too loud for a default-on filter). Always showing `filtered/unfiltered` (rejected — noisy by default).
```

- [ ] **Step 3: Update `docs/BACKLOG.md`**

Move the "VMs page Show inactive VMs filter" entry from `Needs planning` to `Completed`:

Remove the existing entry at line ~65–68 (the `### 2026-05-03 - VMs page "Show inactive VMs" filter` block) and append to Completed:

```markdown
- ✅ 2026-05-04 - VMs page "Show inactive VMs" filter — default-on filter hiding VMs whose allocatedNode is in {unreachable, removed, unknown}, FilterPanel placement, ?showInactive=true URL persistence, status pills capped to 3 visible via new DS Tabs maxVisible prop (Decision #66, Reza feedback)
```

- [ ] **Step 4: Update `CLAUDE.md` Current Features**

Find the VMs-page bullet (search for "VMs page:" around line 294). Append to the bullet:

```
default-on "Show inactive VMs" filter (FilterPanel checkbox, hides VMs whose allocatedNode is in {unreachable, removed, unknown}; `?showInactive=true` URL persistence). Status tabs capped to 3 visible (All / Dispatched / Scheduled) with the rest in the overflow dropdown via DS Tabs `maxVisible` prop.
```

(Insert near the other filter descriptions, keeping the existing comma-separated bullet format.)

- [ ] **Step 5: Update `src/changelog.ts`**

Bump `CURRENT_VERSION` to `0.9.0` (minor — new feature):

```ts
export const CURRENT_VERSION = "0.9.0";

export const CHANGELOG: VersionEntry[] = [
  {
    version: "0.9.0",
    date: "2026-05-04",
    changes: [
      {
        type: "feature",
        text: "VMs page now hides VMs allocated to inactive nodes (unreachable, removed, or unknown) by default. Toggle via the new \"Show inactive VMs\" checkbox in the FilterPanel — Payment & Allocation column. Shareable via ?showInactive=true URL parameter.",
      },
      {
        type: "ui",
        text: "VMs page status tabs now show only All, Dispatched, and Scheduled — the rest live in the overflow dropdown. Reduces visual noise on the toolbar.",
      },
    ],
  },
  // ...existing entries continue below
];
```

- [ ] **Step 6: Update plan frontmatter status**

Edit the top of `docs/plans/2026-05-04-show-inactive-vms-plan.md`:

```yaml
---
status: done
date: 2026-05-04
spec: docs/plans/2026-05-04-show-inactive-vms-design.md
branch: feature/show-inactive-vms
note: awaiting ship — to be merged via /dio:ship
---
```

(No post-merge note update needed — once `status: done` and the branch is squash-merged, the PR/SHA pairing is recoverable via `git log --grep` / `gh pr list`.)

- [ ] **Step 7: Run pnpm check one more time**

Run: `pnpm check`
Expected: all green.

- [ ] **Step 8: Commit docs + version**

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md CLAUDE.md src/changelog.ts docs/plans/2026-05-04-show-inactive-vms-plan.md
git commit -m "docs(vms): record show-inactive feature + bump 0.9.0"
```

---

## Done state

After Task 6, the branch contains:
- New pure filter (`applyInactiveVmFilter`) with full unit coverage.
- VMs page filtering inactive VMs by default, with FilterPanel toggle.
- Two-way `?showInactive=true` URL persistence.
- Status tabs capped to 3 visible via DS `maxVisible` prop.
- Updated ARCHITECTURE / DECISIONS (#66) / BACKLOG / CLAUDE.md / changelog (0.9.0).

User then runs `/dio:ship` to merge.
