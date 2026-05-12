---
status: in-progress
branch: feature/vm-fields-migrating-status
date: 2026-05-12
wave: 2026-05-12-scheduler-v1
reservedDecision: 86
note: fanned out as part of wave 2026-05-12-scheduler-v1
---

# VM Fields & Migrating Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the four new scheduler-level VM fields (`schedulingStatus`, `migrationTarget`, `migrationStartedAt`, `owner`) plus the new `migrating` status in the VMs table, VM detail surfaces, Issues page, and network graph — including an always-on migration tether between source and target CRN.

**Architecture:** Data flows scheduler API → `transformVm` (verbatim mapping for the four fields) → `VM` domain type → existing React Query hooks. `migrating` joins `ACTIVE_VM_STATUSES` and the `VM_STATUS_VARIANT` map (warning amber), and gets promoted to a visible tab on `/vms` (maxVisible 3 → 4). VM detail panel + view render an Owner row + a conditional Migration section. Issues page surfaces a Schedule-vs-Reality sub-row whenever `schedulingStatus !== status` (migrating is *not* added to `DISCREPANCY_STATUSES`). Network graph: `useNetworkGraph` pulls `useVMs()`, filters to migrating VMs with both endpoints resolved, threads them into `buildGraph` as a new `migrations?` param; `buildGraph` emits `type: "migration"` edges (new `EdgeType` distinct from `GraphLayer` because migration is not toggleable); `network-edge.tsx` renders them as a solid amber line with a new `arrow-end-warning` marker; `network-detail-panel-crn.tsx` derives inbound/outbound counts from `visibleGraph.edges`.

**Tech Stack:** Next.js 16 (App Router, static export), TypeScript (strict), Tailwind CSS 4, React Query, `@aleph-front/ds`, Vitest + Testing Library, d3-force/d3-drag.

**Spec:** `docs/superpowers/specs/2026-05-12-vm-fields-migrating-status-design.md`

---

## File Structure

**Modify (data layer):**
- `src/api/types.ts` — add `"migrating"` to `VmStatus`; add four fields (`schedulingStatus`, `migrationTarget`, `migrationStartedAt`, `owner`) to `VM`; add `scheduling_status`, `migration_target`, `migration_started_at`, `owner` to `ApiVmRow`.
- `src/api/client.ts` — export `transformVm`; extend it to map the four new fields verbatim.
- `src/api/client.transform.test.ts` — new unit test for `transformVm` (the existing `client.test.ts` is live-API integration only).
- `src/lib/filters.ts` — add `"migrating"` to `ACTIVE_VM_STATUSES`.
- `src/lib/status-map.ts` — add `migrating: "warning"` to `VM_STATUS_VARIANT`.

**Modify (VMs page):**
- `src/components/vm-table.tsx` — bump `maxVisibleStatuses` 3 → 4; reorder STATUS_PILLS to put Migrating between Scheduled and Duplicated.

**Modify (VM detail):**
- `src/components/vm-detail-panel.tsx` — replace api2-derived Owner row with the scheduler-supplied `vm.owner`; add a Migration section visible only when `vm.status === "migrating"`.
- `src/components/vm-detail-view.tsx` — same Owner + Migration treatment in the full view.

**Modify (Issues page):**
- `src/components/issues-vm-table.tsx` — add a "Scheduler" sub-row inside the Schedule vs Reality card when `schedulingStatus !== null && schedulingStatus !== status`.
- `src/hooks/use-issues.test.ts` — new test confirming migrating VMs are excluded from discrepancies.

**Modify (network graph):**
- `src/lib/network-graph-model.ts` — introduce `EdgeType` (`"structural" | "owner" | "staker" | "reward" | "geo" | "migration"`); retype `GraphEdge.type` to `EdgeType`; accept `migrations?: VM[]` as a new 5th param on `buildGraph`; emit migration edges when both endpoints are CRN nodes in the model.
- `src/lib/network-graph-model.test.ts` — 3 new cases for migration edge emission; update existing geo-layer calls for the new param position.
- `src/hooks/use-network-graph.ts` — call `useVMs()`, derive `migrations` via `useMemo`, thread into `buildGraph`.
- `src/components/network/network-graph.tsx` — define `<marker id="arrow-end-warning">` alongside `arrow-end`; flag migration edges with the new marker + back-off to the target CRN border.
- `src/components/network/network-edge.tsx` — new render branch for `type === "migration"`: amber stroke at width 1, no dash, arrow end.
- `src/components/network/network-detail-panel-crn.tsx` — accept `inbound` + `outbound` migration counts; render a Migrations row when their sum > 0.
- `src/components/network/network-detail-panel.tsx` — derive counts from `visibleGraph.edges` and pass to the CRN body.
- `src/components/network/network-detail-panel-crn.test.tsx` — 2 new cases (Migrations row appears / hides).

**Modify (docs & version):**
- `src/changelog.ts` — bump `CURRENT_VERSION` 0.16.0 → 0.17.0; add a new `VersionEntry` describing the migrating status + migration tether.
- `CLAUDE.md`, `docs/ARCHITECTURE.md` — Current Features list + Network graph paragraph updates.
- `docs/DECISIONS.md` — new Decision entry for "migrating is active + visible tab + amber warning + always-on migration edge".
- `docs/BACKLOG.md` — sweep for completed items if any.

---

## Task 1: Extend `VmStatus`, `VM`, and `ApiVmRow`

**Files:**
- Modify: `src/api/types.ts`

- [ ] **Step 1: Add `"migrating"` to the `VmStatus` union**

In `src/api/types.ts`, the current `VmStatus`:

```ts
export type VmStatus =
  | "scheduled"
  | "dispatched"
  | "duplicated"
  | "misplaced"
  | "missing"
  | "orphaned"
  | "unscheduled"
  | "unschedulable"
  | "unknown";
```

Becomes:

```ts
export type VmStatus =
  | "scheduled"
  | "dispatched"
  | "migrating"
  | "duplicated"
  | "misplaced"
  | "missing"
  | "orphaned"
  | "unscheduled"
  | "unschedulable"
  | "unknown";
```

- [ ] **Step 2: Add the four new fields to `VM`**

In the `VM` type, after `requiresConfidential: boolean;`, append:

```ts
  schedulingStatus: VmStatus | null;
  migrationTarget: string | null;
  migrationStartedAt: string | null;
  owner: string | null;
```

- [ ] **Step 3: Add the matching snake_case fields to `ApiVmRow`**

In `ApiVmRow`, after `cpu_features: string[];`, append:

```ts
  scheduling_status: VmStatus | null;
  migration_target: string | null;
  migration_started_at: string | null;
  owner: string | null;
```

- [ ] **Step 4: Skip typecheck for now — it will fail in two known places**

Adding required fields to `VM` makes `transformVm` (Task 2) fail to construct a complete `VM`, and adding a member to `VmStatus` makes `VM_STATUS_VARIANT` (Task 3) fail the `Record<VmStatus, ...>` exhaustiveness check. Both are intentional — they get closed in the next two tasks. Run typecheck at the end of Task 3 to confirm both are resolved.

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(vms): extend VmStatus + VM + ApiVmRow for migrating + scheduler fields"
```

---

## Task 2: Map the four new fields in `transformVm` (TDD)

**Files:**
- Modify: `src/api/client.ts`
- Create: `src/api/client.transform.test.ts`

- [ ] **Step 1: Export `transformVm`**

`transformVm` is currently file-private. Change its declaration in `src/api/client.ts`:

```ts
function transformVm(raw: ApiVmRow): VM {
```

To:

```ts
export function transformVm(raw: ApiVmRow): VM {
```

- [ ] **Step 2: Write the failing tests**

Create `src/api/client.transform.test.ts` (the existing `client.test.ts` is live-API integration and gated by `RUN_API_TESTS`; we want a pure unit test that runs in `pnpm test`):

```ts
import { describe, expect, it } from "vitest";
import { transformVm } from "@/api/client";
import type { ApiVmRow } from "@/api/types";

function makeRow(overrides?: Partial<ApiVmRow>): ApiVmRow {
  return {
    vm_hash: "vm-1",
    vm_type: "instance",
    allocated_node: null,
    allocated_at: null,
    observed_nodes: [],
    last_observed_at: null,
    status: "scheduled",
    requirements_vcpus: null,
    requirements_memory_mb: null,
    requirements_disk_mb: null,
    payment_type: null,
    payment_status: null,
    updated_at: "2026-05-12T00:00:00Z",
    requires_confidential: false,
    gpu_requirements: [],
    cpu_architecture: null,
    cpu_vendor: null,
    cpu_features: [],
    scheduling_status: null,
    migration_target: null,
    migration_started_at: null,
    owner: null,
    ...overrides,
  };
}

describe("transformVm", () => {
  it("maps the four new fields verbatim", () => {
    const vm = transformVm(
      makeRow({
        scheduling_status: "dispatched",
        migration_target: "node-target-hash",
        migration_started_at: "2026-05-12T12:34:56Z",
        owner: "0xabc1230000000000000000000000000000000000",
      }),
    );
    expect(vm.schedulingStatus).toBe("dispatched");
    expect(vm.migrationTarget).toBe("node-target-hash");
    expect(vm.migrationStartedAt).toBe("2026-05-12T12:34:56Z");
    expect(vm.owner).toBe("0xabc1230000000000000000000000000000000000");
  });

  it("preserves nulls when the scheduler omits the fields", () => {
    const vm = transformVm(makeRow());
    expect(vm.schedulingStatus).toBeNull();
    expect(vm.migrationTarget).toBeNull();
    expect(vm.migrationStartedAt).toBeNull();
    expect(vm.owner).toBeNull();
  });

  it("accepts `migrating` as a valid status value", () => {
    const vm = transformVm(makeRow({ status: "migrating" }));
    expect(vm.status).toBe("migrating");
  });
});
```

- [ ] **Step 3: Run the tests, expect failure**

```bash
pnpm test --run src/api/client.transform.test.ts
```

Expected: the four new-field assertions fail at runtime — vitest's transpile-only mode runs the suite even though `tsc --noEmit` would complain about `transformVm`'s incomplete return type. The runtime values are `undefined`, so `toBeNull()` fails for each. If vitest itself errors out, surface that — it means the transpile-only invariant has changed and we need a different sequencing.

- [ ] **Step 4: Extend `transformVm` in `src/api/client.ts`**

The current `transformVm`:

```ts
function transformVm(raw: ApiVmRow): VM {
  return {
    hash: raw.vm_hash,
    type: raw.vm_type,
    allocatedNode: raw.allocated_node,
    observedNodes: raw.observed_nodes ?? [],
    status: raw.status,
    requirements: {
      vcpus: raw.requirements_vcpus,
      memoryMb: raw.requirements_memory_mb,
      diskMb: raw.requirements_disk_mb,
    },
    paymentStatus: raw.payment_status,
    updatedAt: raw.updated_at,
    allocatedAt: raw.allocated_at,
    lastObservedAt: raw.last_observed_at,
    paymentType: raw.payment_type,
    gpuRequirements: raw.gpu_requirements.map(transformGpu),
    requiresConfidential: raw.requires_confidential,
  };
}
```

Becomes (with the `export` keyword from Step 1):

```ts
export function transformVm(raw: ApiVmRow): VM {
  return {
    hash: raw.vm_hash,
    type: raw.vm_type,
    allocatedNode: raw.allocated_node,
    observedNodes: raw.observed_nodes ?? [],
    status: raw.status,
    requirements: {
      vcpus: raw.requirements_vcpus,
      memoryMb: raw.requirements_memory_mb,
      diskMb: raw.requirements_disk_mb,
    },
    paymentStatus: raw.payment_status,
    updatedAt: raw.updated_at,
    allocatedAt: raw.allocated_at,
    lastObservedAt: raw.last_observed_at,
    paymentType: raw.payment_type,
    gpuRequirements: raw.gpu_requirements.map(transformGpu),
    requiresConfidential: raw.requires_confidential,
    schedulingStatus: raw.scheduling_status,
    migrationTarget: raw.migration_target,
    migrationStartedAt: raw.migration_started_at,
    owner: raw.owner,
  };
}
```

- [ ] **Step 5: Run the tests, expect pass**

```bash
pnpm test --run src/api/client.transform.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/client.ts src/api/client.transform.test.ts
git commit -m "feat(vms): map scheduler VM fields in transformVm

Adds verbatim snake_case → camelCase mapping for scheduling_status,
migration_target, migration_started_at, owner. Exports transformVm and
adds a unit test alongside the existing live-API integration suite."
```

---

## Task 3: `migrating` joins `ACTIVE_VM_STATUSES` + `VM_STATUS_VARIANT`

**Files:**
- Modify: `src/lib/filters.ts`
- Modify: `src/lib/status-map.ts`

- [ ] **Step 1: Add `migrating` to `ACTIVE_VM_STATUSES`**

In `src/lib/filters.ts`, the current set:

```ts
export const ACTIVE_VM_STATUSES: ReadonlySet<VmStatus> = new Set<VmStatus>([
  "dispatched",
  "duplicated",
  "misplaced",
  "missing",
  "unschedulable",
]);
```

Becomes:

```ts
export const ACTIVE_VM_STATUSES: ReadonlySet<VmStatus> = new Set<VmStatus>([
  "dispatched",
  "migrating",
  "duplicated",
  "misplaced",
  "missing",
  "unschedulable",
]);
```

A VM mid-migration is still allocated and consuming resources — it belongs in the Overview Total VMs count and stays visible under the default `showInactive=false` filter.

- [ ] **Step 2: Add `migrating: "warning"` to `VM_STATUS_VARIANT`**

In `src/lib/status-map.ts`, the current map:

```ts
export const VM_STATUS_VARIANT: Record<VmStatus, BadgeVariant> = {
  dispatched: "success",
  scheduled: "default",
  duplicated: "warning",
  misplaced: "warning",
  missing: "error",
  orphaned: "warning",
  unscheduled: "default",
  unschedulable: "error",
  unknown: "default",
};
```

Becomes:

```ts
export const VM_STATUS_VARIANT: Record<VmStatus, BadgeVariant> = {
  dispatched: "success",
  scheduled: "default",
  migrating: "warning",
  duplicated: "warning",
  misplaced: "warning",
  missing: "error",
  orphaned: "warning",
  unscheduled: "default",
  unschedulable: "error",
  unknown: "default",
};
```

- [ ] **Step 3: Run typecheck + tests**

```bash
pnpm check
```

Expected: passes — the `Record<VmStatus, BadgeVariant>` exhaustiveness check is now satisfied, and `ACTIVE_VM_STATUSES` typing also accepts the new member.

- [ ] **Step 4: Commit**

```bash
git add src/lib/filters.ts src/lib/status-map.ts
git commit -m "feat(vms): treat migrating as active + amber warning variant"
```

---

## Task 4: Promote `migrating` to a visible VMs tab

**Files:**
- Modify: `src/components/vm-table.tsx`

- [ ] **Step 1: Add the `migrating` pill between `scheduled` and `duplicated`**

In `src/components/vm-table.tsx`, the current `STATUS_PILLS` (lines 39-50):

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

Becomes:

```ts
const STATUS_PILLS: { value: VmStatus | undefined; label: string; tooltip?: string }[] = [
  { value: undefined, label: "All" },
  { value: "dispatched", label: "Dispatched", tooltip: "Running on the correct node" },
  { value: "scheduled", label: "Scheduled", tooltip: "Assigned to a node but not yet observed" },
  { value: "migrating", label: "Migrating", tooltip: "Being moved to a different node" },
  { value: "duplicated", label: "Duplicated", tooltip: "Running on correct node plus extra copies" },
  { value: "misplaced", label: "Misplaced", tooltip: "Running on wrong node(s), not on assigned node" },
  { value: "missing", label: "Missing", tooltip: "Scheduled but not found on any node" },
  { value: "orphaned", label: "Orphaned", tooltip: "Running without active scheduling intent" },
  { value: "unschedulable", label: "Unschedulable", tooltip: "No node meets this VM's requirements" },
  { value: "unscheduled", label: "Unscheduled", tooltip: "Deliberately unscheduled" },
  { value: "unknown", label: "Unknown", tooltip: "Status could not be determined" },
];
```

- [ ] **Step 2: Bump `maxVisibleStatuses` 3 → 4**

Find the FilterToolbar render (around line 485):

```tsx
        maxVisibleStatuses={3}
```

Change to:

```tsx
        maxVisibleStatuses={4}
```

Visible tabs become: **All / Dispatched / Scheduled / Migrating**. The remaining pills land in the `⋯` overflow dropdown via DS Tabs' existing `maxVisible` behavior.

- [ ] **Step 3: Run typecheck + tests**

```bash
pnpm check
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/vm-table.tsx
git commit -m "feat(vms): promote migrating to a visible status tab"
```

---

## Task 5: VM detail panel — scheduler-supplied Owner + Migration section

**Files:**
- Modify: `src/components/vm-detail-panel.tsx`

- [ ] **Step 1: Replace the api2-derived Owner row with `vm.owner`**

The current Owner section in `src/components/vm-detail-panel.tsx` (lines 96-109) keys off `messageInfo?.get(vm.hash)?.sender` (api2 lookup). The scheduler now returns `vm.owner` directly — prefer the scheduler value, fall back to api2 only when the scheduler hasn't populated it yet.

Replace:

```tsx
      {messageInfo?.get(vm.hash)?.sender && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Owner
          </h4>
          <CopyableText
            text={messageInfo.get(vm.hash)!.sender}
            startChars={8}
            endChars={8}
            size="sm"
            href={`/wallet?address=${messageInfo.get(vm.hash)!.sender}`}
          />
        </div>
      )}
```

With:

```tsx
      {(() => {
        const owner = vm.owner ?? messageInfo?.get(vm.hash)?.sender ?? null;
        if (!owner) return null;
        return (
          <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Owner
            </h4>
            <CopyableText
              text={owner}
              startChars={8}
              endChars={8}
              size="sm"
              href={`/wallet?address=${owner}`}
            />
          </div>
        );
      })()}
```

- [ ] **Step 2: Add a Migration section after the Allocated Node block**

Right after the closing `</div>` of the `Allocated Node` block (currently around line 133, before the Observed Nodes block), add a new section that renders only when `vm.status === "migrating"`:

```tsx
      {vm.status === "migrating" && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Migration
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Target</dt>
              <dd>
                {vm.migrationTarget ? (
                  <CopyableText
                    text={vm.migrationTarget}
                    startChars={8}
                    endChars={8}
                    size="sm"
                    href={`/nodes?view=${vm.migrationTarget}`}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">unknown</span>
                )}
              </dd>
            </div>
            {vm.migrationStartedAt && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Started</dt>
                <dd className="text-xs tabular-nums">
                  {relativeTime(vm.migrationStartedAt)}
                </dd>
              </div>
            )}
          </div>
        </div>
      )}
```

`relativeTime` is already imported in this file (line 12). `dt`/`dd` outside a `<dl>` is intentional here — it matches the inline-row pattern used elsewhere in the panel and avoids a redundant nested list.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/vm-detail-panel.tsx
git commit -m "feat(vms): show scheduler-supplied owner + Migration section on VM panel"
```

---

## Task 6: VM detail view — same Owner + Migration treatment

**Files:**
- Modify: `src/components/vm-detail-view.tsx`

- [ ] **Step 1: Prefer `vm.owner` in the Owner MetaItem**

Current Owner row (lines 132-142):

```tsx
          {messageInfo?.get(vm.hash)?.sender && (
            <MetaItem label="Owner">
              <CopyableText
                text={messageInfo.get(vm.hash)!.sender}
                startChars={8}
                endChars={8}
                size="sm"
                href={`/wallet?address=${messageInfo.get(vm.hash)!.sender}`}
              />
            </MetaItem>
          )}
```

Becomes:

```tsx
          {(() => {
            const owner = vm.owner ?? messageInfo?.get(vm.hash)?.sender ?? null;
            if (!owner) return null;
            return (
              <MetaItem label="Owner">
                <CopyableText
                  text={owner}
                  startChars={8}
                  endChars={8}
                  size="sm"
                  href={`/wallet?address=${owner}`}
                />
              </MetaItem>
            );
          })()}
```

- [ ] **Step 2: Add the Migration Card between Allocated Node and Observed Nodes**

After the closing `</Card>` of the `Allocated Node` block (around line 190, before `{/* Observed Nodes */}`), insert:

```tsx
      {/* Migration */}
      {vm.status === "migrating" && (
        <Card padding="md">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Migration
          </h3>
          <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <MetaItem label="Target">
              {vm.migrationTarget ? (
                <CopyableText
                  text={vm.migrationTarget}
                  startChars={8}
                  endChars={8}
                  size="sm"
                  href={`/nodes?view=${vm.migrationTarget}`}
                />
              ) : (
                <span className="text-xs text-muted-foreground">unknown</span>
              )}
            </MetaItem>
            {vm.migrationStartedAt && (
              <MetaItem label="Started">
                <span className="tabular-nums">
                  {relativeTime(vm.migrationStartedAt)}
                </span>
              </MetaItem>
            )}
          </dl>
        </Card>
      )}
```

`relativeTime` and `Card` / `MetaItem` are already in scope.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/vm-detail-view.tsx
git commit -m "feat(vms): show scheduler-supplied owner + Migration card on VM view"
```

---

## Task 7: Issues page — Schedule vs Reality sub-row

**Files:**
- Modify: `src/components/issues-vm-table.tsx`

- [ ] **Step 1: Add a "Scheduler" sub-row inside the Schedule vs Reality card**

In `src/components/issues-vm-table.tsx`, find the Schedule vs Reality `<dl>` (around lines 178-220). Inside the same `<dl>`, after the "Observed on" row (just before the closing `</dl>` near line 220), insert a new conditional row:

```tsx
          {vm.schedulingStatus != null && vm.schedulingStatus !== vm.status && (
            <>
              <div className="flex justify-between pt-1.5">
                <dt className="text-muted-foreground">Derived</dt>
                <dd>
                  <Badge fill="outline"
                    variant={VM_STATUS_VARIANT[vm.status]}
                    size="sm"
                  >
                    {vm.status}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Scheduler</dt>
                <dd>
                  <Badge fill="outline"
                    variant={VM_STATUS_VARIANT[vm.schedulingStatus]}
                    size="sm"
                  >
                    {vm.schedulingStatus}
                  </Badge>
                </dd>
              </div>
            </>
          )}
```

The two values are side-by-side so the operator can spot the divergence at a glance. When statuses match (the common case), the block is suppressed entirely. `Badge` and `VM_STATUS_VARIANT` are already imported.

- [ ] **Step 2: Run typecheck + tests**

```bash
pnpm check
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/issues-vm-table.tsx
git commit -m "feat(issues): surface scheduler status when it diverges from derived"
```

---

## Task 8: Confirm `migrating` is excluded from discrepancies (TDD)

**Files:**
- Create: `src/hooks/use-issues.test.tsx`

`DISCREPANCY_STATUSES` already lists only `orphaned / missing / unschedulable / duplicated / misplaced` — migrating is *not* in the set and we do not add it. This task is a regression guard so a future edit doesn't accidentally widen the set.

- [ ] **Step 1: Write the test**

Create `src/hooks/use-issues.test.tsx` (`.tsx` because the wrapper uses JSX):

```tsx
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Node, VM } from "@/api/types";

vi.mock("@/hooks/use-vms", () => ({
  useVMs: vi.fn(),
}));
vi.mock("@/hooks/use-nodes", () => ({
  useNodes: vi.fn(),
}));

import { useVMs } from "@/hooks/use-vms";
import { useNodes } from "@/hooks/use-nodes";
import { useIssues } from "@/hooks/use-issues";

const useVMsMock = vi.mocked(useVMs);
const useNodesMock = vi.mocked(useNodes);

function makeVm(overrides: Partial<VM> & Pick<VM, "hash" | "status">): VM {
  return {
    type: "instance",
    allocatedNode: null,
    observedNodes: [],
    requirements: { vcpus: null, memoryMb: null, diskMb: null },
    paymentStatus: null,
    updatedAt: "2026-05-12T00:00:00Z",
    allocatedAt: null,
    lastObservedAt: null,
    paymentType: null,
    gpuRequirements: [],
    requiresConfidential: false,
    schedulingStatus: null,
    migrationTarget: null,
    migrationStartedAt: null,
    owner: null,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useIssues — migrating exclusion", () => {
  it("does not include migrating VMs in issueVMs", () => {
    useVMsMock.mockReturnValue({
      data: [
        makeVm({ hash: "vm-mig", status: "migrating" }),
        makeVm({ hash: "vm-orphan", status: "orphaned" }),
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useVMs>);
    useNodesMock.mockReturnValue({
      data: [] as Node[],
      isLoading: false,
    } as unknown as ReturnType<typeof useNodes>);

    const { result } = renderHook(() => useIssues(), { wrapper });
    const hashes = result.current.issueVMs.map((v) => v.hash);
    expect(hashes).toContain("vm-orphan");
    expect(hashes).not.toContain("vm-mig");
  });
});
```

- [ ] **Step 2: Run the test, expect pass**

```bash
pnpm test --run src/hooks/use-issues.test.tsx
```

Expected: passes immediately — the existing `isDiscrepancyStatus` filter already excludes `"migrating"`. The test acts as a regression guard.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-issues.test.tsx
git commit -m "test(issues): guard against migrating leaking into discrepancies"
```

---

## Task 9: Introduce `EdgeType` and add `migrations?` param to `buildGraph` (TDD)

**Files:**
- Modify: `src/lib/network-graph-model.ts`
- Modify: `src/lib/network-graph-model.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block at the end of `src/lib/network-graph-model.test.ts`:

```ts
import type { VM } from "@/api/types";

function makeMigratingVm(
  allocatedNode: string,
  migrationTarget: string,
  hash = `mig-${allocatedNode}-${migrationTarget}`,
): VM {
  return {
    hash,
    type: "instance",
    allocatedNode,
    observedNodes: [],
    status: "migrating",
    requirements: { vcpus: null, memoryMb: null, diskMb: null },
    paymentStatus: null,
    updatedAt: "2026-05-12T00:00:00Z",
    allocatedAt: null,
    lastObservedAt: null,
    paymentType: null,
    gpuRequirements: [],
    requiresConfidential: false,
    schedulingStatus: null,
    migrationTarget,
    migrationStartedAt: null,
    owner: null,
  };
}

describe("buildGraph — migration edges", () => {
  it("emits a migration edge between two CRN nodes that exist in the model", () => {
    const state = makeState({
      ccns: [ccn("c1", { resourceNodes: ["r1", "r2"] })],
      crns: [crn("r1", { parent: "c1" }), crn("r2", { parent: "c1" })],
    });
    const migrations = [makeMigratingVm("r1", "r2")];
    const graph = buildGraph(
      state,
      new Set(["structural"]),
      undefined,
      undefined,
      migrations,
    );
    const migrationEdges = graph.edges.filter((e) => e.type === "migration");
    expect(migrationEdges).toHaveLength(1);
    expect(migrationEdges[0]).toMatchObject({
      source: "r1",
      target: "r2",
      type: "migration",
    });
  });

  it("skips migration edges when an endpoint is missing from the model", () => {
    const state = makeState({
      ccns: [ccn("c1", { resourceNodes: ["r1"] })],
      crns: [crn("r1", { parent: "c1" })],
    });
    const migrations = [makeMigratingVm("r1", "r-ghost")];
    const graph = buildGraph(
      state,
      new Set(["structural"]),
      undefined,
      undefined,
      migrations,
    );
    expect(graph.edges.filter((e) => e.type === "migration")).toHaveLength(0);
  });

  it("emits migration edges even when the structural layer is off (always-on)", () => {
    const state = makeState({
      ccns: [ccn("c1", { resourceNodes: ["r1", "r2"] })],
      crns: [crn("r1", { parent: "c1" }), crn("r2", { parent: "c1" })],
    });
    const migrations = [makeMigratingVm("r1", "r2")];
    const graph = buildGraph(
      state,
      new Set<GraphLayer>(),
      undefined,
      undefined,
      migrations,
    );
    expect(graph.edges.filter((e) => e.type === "migration")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests, expect failure**

```bash
pnpm test --run src/lib/network-graph-model.test.ts
```

Expected: the 3 new tests fail (`buildGraph` doesn't accept a 5th param and never emits migration edges); existing tests still pass.

- [ ] **Step 3: Update the geo-test signature for the new param position**

The 6 existing geo-layer tests pass `geo` as the 5th positional arg, but after this task `migrations?` slides in as the 5th and `geo` moves to 6th. Re-read the spec file structure callouts — the cleanest fix is to put `migrations` BEFORE `geo` so existing geo tests need a new `undefined` slot.

Wait — the existing tests at lines 360, 376, 399, 413, 425, 437 already pass `undefined, undefined,` before the geo object (Decision #85 left them at: `state, layers, undefined (ownerBalances), undefined (crnStatuses), geoObj`). So the new param position is: `state, layers, ownerBalances?, crnStatuses?, migrations?, geo`. The geo tests need *another* `undefined` slot inserted at position 5.

In `src/lib/network-graph-model.test.ts`, replace each of the 6 existing geo-layer calls:

```ts
const graph = buildGraph(state, new Set(["structural"]), undefined, undefined, {
  locations: { c1: { country: "FR" }, r1: { country: "FR" } },
  centroids: { FR: FR_CENTROID },
});
```

With:

```ts
const graph = buildGraph(state, new Set(["structural"]), undefined, undefined, undefined, {
  locations: { c1: { country: "FR" }, r1: { country: "FR" } },
  centroids: { FR: FR_CENTROID },
});
```

Apply to all 6 calls (verify via `grep -n "centroids:" src/lib/network-graph-model.test.ts` after edit).

- [ ] **Step 4: Update `buildGraph` signature, retype `GraphEdge`, emit migration edges**

In `src/lib/network-graph-model.ts`:

Above the `GraphEdge` type (currently line 94), add a new exported `EdgeType`:

```ts
// Edge type discriminator. Most edge types correspond 1:1 to a `GraphLayer`
// (toggleable via URL), but `"migration"` is always-on — migrations are rare
// and informative, so we don't gate them behind a layer toggle.
export type EdgeType = GraphLayer | "migration";
```

Then change `GraphEdge.type`:

```ts
export type GraphEdge = {
  source: string;
  target: string;
  type: GraphLayer;
};
```

To:

```ts
export type GraphEdge = {
  source: string;
  target: string;
  type: EdgeType;
};
```

Add the `VM` import at the top of the file:

```ts
import type { VM } from "@/api/types";
```

Change the `buildGraph` signature:

```ts
export function buildGraph(
  state: NodeState,
  layers: Set<GraphLayer>,
  ownerBalances?: Map<string, number>,
  crnStatuses?: Map<string, string>,
  geo: GeoData = DEFAULT_GEO,
): Graph {
```

To:

```ts
export function buildGraph(
  state: NodeState,
  layers: Set<GraphLayer>,
  ownerBalances?: Map<string, number>,
  crnStatuses?: Map<string, string>,
  migrations?: VM[],
  geo: GeoData = DEFAULT_GEO,
): Graph {
```

Then, right before the geo block (currently `if (layers.has("geo"))` around line 221), emit migration edges. Both endpoints must be CRN nodes in the model — otherwise the edge would dangle and d3-force would crash:

```ts
  // Migration edges are always-on (not gated by a layer toggle). Both endpoints
  // must resolve to CRN nodes in the model; otherwise skip silently.
  if (migrations && migrations.length > 0) {
    const crnIds = new Set<string>();
    for (const r of state.crns.values()) crnIds.add(r.hash);
    for (const vm of migrations) {
      const src = vm.allocatedNode;
      const dst = vm.migrationTarget;
      if (src == null || dst == null) continue;
      if (!crnIds.has(src) || !crnIds.has(dst)) continue;
      edges.push({ source: src, target: dst, type: "migration" });
    }
  }
```

- [ ] **Step 5: Run the tests, expect all pass**

```bash
pnpm test --run src/lib/network-graph-model.test.ts
```

Expected: all tests pass (including the 3 new ones).

- [ ] **Step 6: Run full check**

```bash
pnpm check
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/network-graph-model.ts src/lib/network-graph-model.test.ts
git commit -m "feat(network): EdgeType + migrations param on buildGraph

Adds a new EdgeType discriminator (GraphLayer | \"migration\") and an
optional migrations VM[] param to buildGraph. Migrations are emitted as
type: \"migration\" edges, always-on (not gated by a layer toggle).
Endpoints are validated against the CRN model so the edge can't dangle."
```

---

## Task 10: Thread `useVMs()` migrations through `useNetworkGraph`

**Files:**
- Modify: `src/hooks/use-network-graph.ts`

- [ ] **Step 1: Import `useVMs` + VM type**

In `src/hooks/use-network-graph.ts`, add below the `useNodes` import:

```ts
import { useVMs } from "@/hooks/use-vms";
import type { VM } from "@/api/types";
```

- [ ] **Step 2: Derive the `migrations` array via `useMemo`**

Inside `useNetworkGraph()`, right after the existing `crnStatuses` `useMemo` block, add:

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
```

- [ ] **Step 3: Thread it into `buildGraph`**

Change:

```ts
  const fullGraph = useMemo<Graph>(() => {
    if (!state) return { nodes: [], edges: [] };
    return buildGraph(state, layers, ownerBalances, crnStatuses);
  }, [state, layers, ownerBalances, crnStatuses]);
```

To:

```ts
  const fullGraph = useMemo<Graph>(() => {
    if (!state) return { nodes: [], edges: [] };
    return buildGraph(state, layers, ownerBalances, crnStatuses, migrations);
  }, [state, layers, ownerBalances, crnStatuses, migrations]);
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-network-graph.ts
git commit -m "feat(network): thread migrating VMs into the graph hook

useNetworkGraph now pulls useVMs(), filters to status === migrating
with both endpoints resolved, and feeds the list to buildGraph as the
new migrations param."
```

---

## Task 11: Render migration edges with an amber arrow

**Files:**
- Modify: `src/components/network/network-edge.tsx`
- Modify: `src/components/network/network-graph.tsx`

- [ ] **Step 1: Update `NetworkEdge` to accept the new `EdgeType`**

In `src/components/network/network-edge.tsx`, swap the import and re-type `Props.type`:

```ts
import type { EdgeType } from "@/lib/network-graph-model";

type Props = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: EdgeType;
  faded: boolean;
  highlightColor?: string;
  withArrow?: boolean;
};
```

Then extend the three lookup records:

```ts
const STROKE: Record<EdgeType, string> = {
  structural: "currentColor",
  owner: "currentColor",
  staker: "var(--color-warning-500)",
  reward: "var(--network-edge-reward)",
  geo: "var(--network-country)",
  migration: "var(--color-warning-500)",
};

const OPACITY: Record<EdgeType, number> = {
  structural: 0.6,
  owner: 0.2,
  staker: 0.2,
  reward: 0.2,
  geo: 0.35,
  migration: 0.9,
};

const DASH: Partial<Record<EdgeType, string>> = {
  owner: "1.5 1",
  reward: "0 0.4",
  geo: "1 2",
};
```

Migration is solid (no entry in `DASH`), amber, at 0.9 opacity so it reads as foreground without blowing past full opacity.

Adjust the body so migration edges get stroke width 1 (same as the other non-dashed edges) and the warning arrow marker:

```tsx
export const NetworkEdge = memo(function NetworkEdge({
  x1, y1, x2, y2, type, faded, highlightColor, withArrow,
}: Props) {
  const dash = DASH[type];
  const stroke = highlightColor ?? STROKE[type];
  const opacity = highlightColor
    ? type === "staker" ? 1 : 0.9
    : faded ? OPACITY[type] * 0.2 : OPACITY[type];
  const markerId =
    type === "migration" ? "arrow-end-warning" : "arrow-end";
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={dash ? 0.5 : 1}
      {...(dash ? { strokeDasharray: dash, strokeLinecap: "round" } : {})}
      {...(withArrow ? { markerEnd: `url(#${markerId})` } : {})}
    />
  );
});
```

- [ ] **Step 2: Define `<marker id="arrow-end-warning">` in `network-graph.tsx`**

Open `src/components/network/network-graph.tsx`. Find the existing `<marker id="arrow-end">` (around line 594). Right after its closing `</marker>`, add a sibling warning marker that re-uses the same geometry (so the arrow tip stays consistent in size) and inherits stroke color via `context-stroke`:

```tsx
          <marker
            id="arrow-end-warning"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth={arrowSize}
            markerHeight={arrowSize}
            orient="auto"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              fill="context-stroke"
              fillOpacity="0.9"
            />
          </marker>
```

`fill="context-stroke"` makes the arrowhead inherit the line's amber color — no new color token needed.

- [ ] **Step 3: Add an arrow to migration edges + apply the same target-side back-off**

Still in `network-graph.tsx`, find the existing `withArrow` block (around line 622-636). Current:

```tsx
            const targetIsCrn = nodeKindMap.get(e.target) === "crn";
            const withArrow = e.type === "structural" && targetIsCrn;
            let x2 = b.x;
            let y2 = b.y;
            if (withArrow) {
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const L = Math.sqrt(dx * dx + dy * dy);
              if (L > 0) {
                const backoff = RADIUS.crn * nodeScale + 1.5;
                const t = Math.min(1, backoff / L);
                x2 = b.x - dx * t;
                y2 = b.y - dy * t;
              }
            }
```

Change `withArrow` to also fire for migration edges (their target is always a CRN by construction):

```tsx
            const targetIsCrn = nodeKindMap.get(e.target) === "crn";
            const withArrow =
              (e.type === "structural" && targetIsCrn) ||
              e.type === "migration";
```

The existing back-off math already keys off `withArrow`, so no other change is needed in that block.

- [ ] **Step 4: Run typecheck + tests**

```bash
pnpm check
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/network/network-edge.tsx src/components/network/network-graph.tsx
git commit -m "feat(network): render migration edges as amber arrows

NetworkEdge gains a migration branch (solid amber stroke, opacity 0.9,
arrow-end-warning marker). network-graph.tsx defines the new marker
and extends the withArrow gate so the arrow tip lands just outside
the target CRN border via the same back-off used for structural edges."
```

---

## Task 12: CRN detail panel — Migrations row (TDD)

**Files:**
- Modify: `src/components/network/network-detail-panel.tsx`
- Modify: `src/components/network/network-detail-panel-crn.tsx`
- Modify: `src/components/network/network-detail-panel-crn.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/network/network-detail-panel-crn.test.tsx`, append two new cases inside the existing `describe("NetworkDetailPanelCRN", ...)` block:

```tsx
  it("renders the Migrations row when inbound + outbound > 0", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={CRN}
        parent={PARENT}
        unreachable={false}
        inboundMigrations={1}
        outboundMigrations={2}
        onFocusParent={() => {}}
      />,
    );
    expect(screen.getByText(/Migrations/i)).toBeInTheDocument();
    expect(screen.getByText(/→\s*2\s*outbound/i)).toBeInTheDocument();
    expect(screen.getByText(/←\s*1\s*inbound/i)).toBeInTheDocument();
  });

  it("hides the Migrations row when both counts are zero", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={CRN}
        parent={PARENT}
        unreachable={false}
        inboundMigrations={0}
        outboundMigrations={0}
        onFocusParent={() => {}}
      />,
    );
    expect(screen.queryByText(/Migrations/i)).not.toBeInTheDocument();
  });
```

Also update each of the 7 existing `<NetworkDetailPanelCRN ... />` render calls in this file (search for `unreachable={`) to add the two new optional props with default-zero values. The two new props are optional with default `0`, so this step is belt-and-suspenders — keeps the tests explicit so a future widening of the default doesn't silently change assertions:

```tsx
        inboundMigrations={0}
        outboundMigrations={0}
```

- [ ] **Step 2: Run the tests, expect failure**

```bash
pnpm test --run src/components/network/network-detail-panel-crn.test.tsx
```

Expected: the 2 new tests fail (props not accepted; row not rendered); existing tests fail too because of the new required-ish props (we'll make them default to 0 below).

- [ ] **Step 3: Extend the CRN panel `Props`**

In `src/components/network/network-detail-panel-crn.tsx`, current `Props`:

```ts
type Props = {
  info: CRNInfo;
  parent: CCNInfo | null;
  country?: string | undefined;
  unreachable: boolean;
  onFocusParent: (parentId: string) => void;
};
```

Becomes:

```ts
type Props = {
  info: CRNInfo;
  parent: CCNInfo | null;
  country?: string | undefined;
  unreachable: boolean;
  inboundMigrations?: number;
  outboundMigrations?: number;
  onFocusParent: (parentId: string) => void;
};
```

Update the destructure:

```tsx
export function NetworkDetailPanelCRN({
  info,
  parent,
  country,
  unreachable,
  inboundMigrations = 0,
  outboundMigrations = 0,
  onFocusParent,
}: Props) {
```

- [ ] **Step 4: Render the Migrations row**

Right after the Score row inside the top `<dl>` (currently around line 72, before the Location row), insert a conditional Migrations row:

```tsx
        {inboundMigrations + outboundMigrations > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Migrations</dt>
            <dd className="flex items-center gap-2 text-xs">
              {outboundMigrations > 0 && (
                <span className="tabular-nums">
                  → {outboundMigrations} outbound
                </span>
              )}
              {inboundMigrations > 0 && (
                <span className="tabular-nums">
                  ← {inboundMigrations} inbound
                </span>
              )}
            </dd>
          </div>
        )}
```

The unicode arrows match the spec mockup; counts are static text (drilling into specific migrations is `/vms?status=migrating` territory).

- [ ] **Step 5: Compute the counts in `NetworkDetailPanel` and pass them down**

In `src/components/network/network-detail-panel.tsx`, right after the existing `crnUnreachable` line (around line 115), derive the counts from `visibleGraph.edges`:

```ts
  const crnOutboundMigrations = crnInfo
    ? visibleGraph.edges.filter(
        (e) => e.type === "migration" && e.source === crnInfo.hash,
      ).length
    : 0;
  const crnInboundMigrations = crnInfo
    ? visibleGraph.edges.filter(
        (e) => e.type === "migration" && e.target === crnInfo.hash,
      ).length
    : 0;
```

Then add the two new props to the `<NetworkDetailPanelCRN>` render call:

```tsx
        {crnInfo && (
          <NetworkDetailPanelCRN
            info={crnInfo}
            parent={parentInfo}
            country={node.country}
            unreachable={crnUnreachable}
            inboundMigrations={crnInboundMigrations}
            outboundMigrations={crnOutboundMigrations}
            onFocusParent={onFocus}
          />
        )}
```

- [ ] **Step 6: Run the tests, expect pass**

```bash
pnpm test --run src/components/network/network-detail-panel-crn.test.tsx
```

Expected: all tests pass.

- [ ] **Step 7: Run full check**

```bash
pnpm check
```

Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add src/components/network/network-detail-panel.tsx \
        src/components/network/network-detail-panel-crn.tsx \
        src/components/network/network-detail-panel-crn.test.tsx
git commit -m "feat(network): surface migration counts on CRN detail panel

NetworkDetailPanel derives inbound/outbound migration counts from the
visible edge set and passes them to the CRN body. The CRN panel
renders a Migrations row (\"→ N outbound  ← M inbound\") when either
count is non-zero; hidden otherwise."
```

---

## Task 13: Verify and refine

- [ ] Run full project checks (`pnpm check`)
- [ ] Manual testing / smoke test the feature in `pnpm dev`:
  - `/vms` — confirm a "Migrating" tab appears as the 4th visible pill; click it and verify the URL becomes `?status=migrating`.
  - VM detail (panel + view) — pick a migrating VM (or temporarily edit one via the dev React DevTools / mock data) and confirm the Owner row uses `vm.owner` and the Migration section renders Target + Started.
  - `/issues` — open a VM whose `schedulingStatus` diverges from `status`; confirm Derived + Scheduler badges appear inside Schedule vs Reality.
  - `/network` — confirm migration edges appear as amber arrows between source and target CRN. Click a CRN that's a migration endpoint and confirm the Migrations row shows up in its detail panel with the right counts.
- [ ] Fix any issues found
- [ ] Re-run checks until clean

---

## Task 14: Update docs and version

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/BACKLOG.md`
- Modify: `CLAUDE.md`
- Modify: `src/changelog.ts`

- [ ] **Step 1: ARCHITECTURE.md** — note the `EdgeType` discriminator + always-on migration edge family; update the VM-detail recipe to mention the scheduler-supplied owner + Migration section.

- [ ] **Step 2: DECISIONS.md** — log a new Decision: "migrating joins ACTIVE_VM_STATUSES + visible tab + amber warning + always-on migration edge". Rationale: migrations are short-lived but operationally significant; the warning amber matches `duplicated/misplaced/orphaned` (visual continuity); always-on (no layer toggle) because migrations are rare and informative. Alternatives considered: red error variant (rejected — migration isn't a failure), a separate Migrations layer toggle (rejected — discoverability).

- [ ] **Step 3: BACKLOG.md** — sweep for any matching entries (likely none) and move to Completed if found.

- [ ] **Step 4: CLAUDE.md** — extend the VMs page bullet to mention the new Migrating tab (visible cap 3 → 4); extend the VM detail bullet to mention scheduler-supplied owner + Migration section; extend the Network graph bullet to mention always-on migration edges + Migrations row on CRN panel.

- [ ] **Step 5: src/changelog.ts** — bump `CURRENT_VERSION` 0.16.0 → 0.17.0 (minor — user-facing feature); insert a new entry at the top of `CHANGELOG`:

```ts
  {
    version: "0.17.0",
    date: "2026-05-12",
    changes: [
      {
        type: "feature",
        text: "Migrating VMs are now first-class: a new **Migrating** tab on `/vms` (now 4 visible status pills instead of 3), an amber warning pill across all surfaces, an Owner row sourced directly from the scheduler on VM detail, and a Migration section showing target node + time started.",
      },
      {
        type: "feature",
        text: "Network graph: migrations now render as **amber arrows** from source to target CRN, always-on (not gated by a layer toggle). The CRN detail panel shows a Migrations row with inbound/outbound counts.",
      },
      {
        type: "feature",
        text: "Issues page: when the scheduler's reported `scheduling_status` diverges from our derived `status`, Schedule vs Reality shows both side-by-side so the discrepancy has concrete grounding.",
      },
    ],
  },
```

- [ ] **Step 6: Run final check**

```bash
pnpm check
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md src/changelog.ts \
        docs/superpowers/specs/2026-05-12-vm-fields-migrating-status-design.md \
        docs/superpowers/plans/2026-05-12-vm-fields-migrating-status.md
git commit -m "docs: VM fields & migrating status — ARCHITECTURE, DECISIONS, CLAUDE.md, changelog v0.17.0"
```

(The two `docs/superpowers/` files are the spec + this plan, both currently untracked from the brainstorming session. Including them in this final commit ships the design artifacts alongside the feature.)

---

## Done

After Task 14:
- Branch has the full feature + tests + docs.
- The plan's status frontmatter at the top should be updated to `status: done` before invoking the ship sequence.
- Run `/dio:ship` to push, open the PR, run the CI gate, squash-merge, and clean up local state.
