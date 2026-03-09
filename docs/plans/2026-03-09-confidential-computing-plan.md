# Confidential Computing Indicators — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface confidential computing boolean fields from the API on both node and VM tables, detail views, and filters.

**Architecture:** Wire types already have `confidential_computing_enabled` (nodes) and `requires_confidential` (VMs). We add these to app-level types, transform functions, filter logic, and UI. The `ShieldCheck` icon from `@phosphor-icons/react` (already a DS transitive dep) serves as the visual indicator.

**Tech Stack:** TypeScript, React, Tailwind CSS, `@phosphor-icons/react`, `@aleph-front/ds` (Tooltip, Checkbox, Badge)

**Design doc:** `docs/plans/2026-03-09-confidential-computing-design.md`

---

### Task 1: Add dependency and create feature branch

**Step 1: Create feature branch**

```bash
git checkout main && git pull --ff-only origin main
git checkout -b feature/confidential-computing
```

**Step 2: Add `@phosphor-icons/react` as a direct dependency**

```bash
pnpm add @phosphor-icons/react@2.1.10
```

**Step 3: Verify import resolves**

```bash
node -e "import('@phosphor-icons/react').then(m => console.log('ShieldCheck:', typeof m.ShieldCheck))"
```

Expected: `ShieldCheck: function`

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @phosphor-icons/react as direct dependency"
```

---

### Task 2: Add fields to app types and transforms

**Files:**
- Modify: `src/api/types.ts:27-40` (Node type), `src/api/types.ts:70-83` (VM type)
- Modify: `src/api/client.ts:123-141` (transformNode), `src/api/client.ts:143-162` (transformVm)

**Step 1: Add `confidentialComputing` to `Node` type**

In `src/api/types.ts`, add after `gpus` field (line 39):

```typescript
export type Node = {
  hash: string;
  name: string | null;
  address: string | null;
  status: NodeStatus;
  staked: boolean;
  resources: NodeResources | null;
  vmCount: number;
  updatedAt: string;
  owner: string | null;
  supportsIpv6: boolean | null;
  discoveredAt: string | null;
  gpus: { used: GpuDevice[]; available: GpuDevice[] };
  confidentialComputing: boolean;
};
```

**Step 2: Add `requiresConfidential` to `VM` type**

In `src/api/types.ts`, add after `gpuRequirements` field (line 82):

```typescript
export type VM = {
  hash: string;
  type: VmType;
  allocatedNode: string | null;
  observedNodes: string[];
  status: VmStatus;
  requirements: VmRequirements;
  paymentStatus: "validated" | "invalidated" | null;
  updatedAt: string;
  allocatedAt: string | null;
  lastObservedAt: string | null;
  paymentType: string | null;
  gpuRequirements: GpuDevice[];
  requiresConfidential: boolean;
};
```

**Step 3: Map in `transformNode`**

In `src/api/client.ts`, add to the `transformNode` return object (after `gpus`, line 139):

```typescript
confidentialComputing: raw.confidential_computing_enabled,
```

**Step 4: Map in `transformVm`**

In `src/api/client.ts`, add to the `transformVm` return object (after `gpuRequirements`, line 160):

```typescript
requiresConfidential: raw.requires_confidential,
```

**Step 5: Fix test factories**

In `src/lib/filters.test.ts`, add default values to `makeNode` (line 10) and `makeVm` (line 26):

`makeNode`: add `confidentialComputing: false,` after the `gpus` line.

`makeVm`: add `requiresConfidential: false,` after the `gpuRequirements` line.

**Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors

**Step 7: Run tests**

```bash
pnpm test
```

Expected: all pass (existing tests unaffected, new default values match existing factory shapes)

**Step 8: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/lib/filters.test.ts
git commit -m "feat: add confidential computing fields to types and transforms"
```

---

### Task 3: Add filter logic with tests (TDD)

**Files:**
- Modify: `src/lib/filters.ts:43-50` (NodeAdvancedFilters), `src/lib/filters.ts:52-98` (applyNodeAdvancedFilters)
- Modify: `src/lib/filters.ts:102-109` (VmAdvancedFilters), `src/lib/filters.ts:122-170` (applyVmAdvancedFilters)
- Modify: `src/lib/filters.test.ts`

**Step 1: Write failing test for node confidential filter**

Add to `src/lib/filters.test.ts` inside the `applyNodeAdvancedFilters` describe block, after the `hasGpu` test (around line 231):

```typescript
  it("filters by confidentialComputing", () => {
    const nodes = [
      makeNode({ confidentialComputing: true }),
      makeNode({ confidentialComputing: false }),
      makeNode(),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      confidentialComputing: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.confidentialComputing).toBe(true);
  });
```

**Step 2: Run test to verify it fails**

```bash
pnpm test -- --reporter verbose 2>&1 | tail -20
```

Expected: FAIL — `confidentialComputing` is not a valid key on `NodeAdvancedFilters`

**Step 3: Add `confidentialComputing` to `NodeAdvancedFilters` type**

In `src/lib/filters.ts:43-50`, add after `hasGpu`:

```typescript
export type NodeAdvancedFilters = {
  staked?: boolean;
  supportsIpv6?: boolean;
  hasGpu?: boolean;
  confidentialComputing?: boolean;
  vmCountRange?: [number, number];
  vcpusTotalRange?: [number, number];
  memoryTotalGbRange?: [number, number];
};
```

**Step 4: Add filter logic in `applyNodeAdvancedFilters`**

In `src/lib/filters.ts`, add after the `hasGpu` block (after line 67):

```typescript
  if (filters.confidentialComputing) {
    result = result.filter((n) => n.confidentialComputing);
  }
```

**Step 5: Run test to verify it passes**

```bash
pnpm test -- --reporter verbose 2>&1 | tail -20
```

Expected: PASS

**Step 6: Write failing test for VM confidential filter**

Add to `src/lib/filters.test.ts` inside the `applyVmAdvancedFilters` describe block, after the `requiresGpu` test (around line 341):

```typescript
  it("filters by requiresConfidential", () => {
    const vms = [
      makeVm({ requiresConfidential: true }),
      makeVm({ requiresConfidential: false }),
      makeVm(),
    ];
    const result = applyVmAdvancedFilters(vms, {
      requiresConfidential: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.requiresConfidential).toBe(true);
  });
```

**Step 7: Run test to verify it fails**

```bash
pnpm test -- --reporter verbose 2>&1 | tail -20
```

Expected: FAIL — `requiresConfidential` is not a valid key on `VmAdvancedFilters`

**Step 8: Add `requiresConfidential` to `VmAdvancedFilters` type**

In `src/lib/filters.ts:102-109`, add after `requiresGpu`:

```typescript
export type VmAdvancedFilters = {
  vmTypes?: Set<VmType>;
  paymentStatuses?: Set<string>;
  hasAllocatedNode?: boolean;
  requiresGpu?: boolean;
  requiresConfidential?: boolean;
  vcpusRange?: [number, number];
  memoryMbRange?: [number, number];
};
```

**Step 9: Add filter logic in `applyVmAdvancedFilters`**

In `src/lib/filters.ts`, add after the `requiresGpu` block (after line 150):

```typescript
  if (filters.requiresConfidential) {
    result = result.filter((v) => v.requiresConfidential);
  }
```

**Step 10: Run all tests**

```bash
pnpm test
```

Expected: all pass

**Step 11: Commit**

```bash
git add src/lib/filters.ts src/lib/filters.test.ts
git commit -m "feat: add confidential computing filter logic with tests"
```

---

### Task 4: Add ShieldCheck icon to table Name columns

**Files:**
- Modify: `src/components/node-table.tsx:1-6` (imports), `src/components/node-table.tsx:81-91` (Name column)
- Modify: `src/components/vm-table.tsx:1-6` (imports), `src/components/vm-table.tsx:137-149` (Name column)

**Step 1: Update node table Name column**

In `src/components/node-table.tsx`, add imports at the top:

```typescript
import { ShieldCheck } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
```

Note: `TooltipProvider` is already imported from `@aleph-front/ds/tooltip` — merge the imports into one statement.

Replace the Name column definition (lines 81-91):

```typescript
  {
    header: "Name",
    accessor: (r) => (
      <span className="inline-flex items-center gap-1.5">
        {r.name ? (
          <span className="text-sm">{r.name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{"\u2014"}</span>
        )}
        {r.confidentialComputing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <ShieldCheck size={14} weight="fill" className="shrink-0 text-primary-400" />
            </TooltipTrigger>
            <TooltipContent>Supports confidential computing (TEE)</TooltipContent>
          </Tooltip>
        )}
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.name ?? "",
  },
```

**Step 2: Update VM table Name column**

In `src/components/vm-table.tsx`, add imports at the top:

```typescript
import { ShieldCheck } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
```

Note: `TooltipProvider` is already imported — merge the imports into one statement.

Replace the Name column definition in `buildColumns` (lines 137-149):

```typescript
  {
    header: "Name",
    accessor: (r) => {
      const name = msgInfo?.get(r.hash)?.name;
      return (
        <span className="inline-flex items-center gap-1.5">
          {name ? (
            <span className="text-sm">{name}</span>
          ) : (
            <span className="text-xs text-muted-foreground">{"\u2014"}</span>
          )}
          {r.requiresConfidential && (
            <Tooltip>
              <TooltipTrigger asChild>
                <ShieldCheck size={14} weight="fill" className="shrink-0 text-primary-400" />
              </TooltipTrigger>
              <TooltipContent>Requires confidential computing</TooltipContent>
            </Tooltip>
          )}
        </span>
      );
    },
    sortable: true,
    sortValue: (r) => msgInfo?.get(r.hash)?.name ?? "",
  },
```

**Step 3: Run typecheck + build**

```bash
pnpm typecheck && pnpm build
```

Expected: no errors

**Step 4: Commit**

```bash
git add src/components/node-table.tsx src/components/vm-table.tsx
git commit -m "feat: add ShieldCheck icon to table name columns for confidential computing"
```

---

### Task 5: Add checkbox filters to both tables

**Files:**
- Modify: `src/components/node-table.tsx:195-208` (activeAdvancedCount), `src/components/node-table.tsx:440-459` (Properties checkboxes)
- Modify: `src/components/vm-table.tsx:232-247` (activeAdvancedCount), `src/components/vm-table.tsx:554-573` (Payment & Allocation checkboxes)

**Step 1: Update node table `activeAdvancedCount` to include the new filter**

In `src/components/node-table.tsx`, add `advanced.confidentialComputing,` to the `activeAdvancedCount` array, after `advanced.hasGpu,` (around line 198):

```typescript
  const activeAdvancedCount = [
    advanced.staked,
    advanced.supportsIpv6,
    advanced.hasGpu,
    advanced.confidentialComputing,
    advanced.vmCountRange != null &&
      isRangeActive(advanced.vmCountRange, NODE_VM_COUNT_MAX),
    advanced.vcpusTotalRange != null &&
      isRangeActive(advanced.vcpusTotalRange, NODE_VCPUS_MAX),
    advanced.memoryTotalGbRange != null &&
      isRangeActive(
        advanced.memoryTotalGbRange,
        NODE_MEMORY_GB_MAX,
      ),
  ].filter(Boolean).length;
```

**Step 2: Add Confidential checkbox in the Properties column**

In `src/components/node-table.tsx`, add a new `<label>` after the Has GPU checkbox (after line 459, before the closing `</div>` of the Properties section):

```tsx
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none">
                  <Checkbox
                    size="sm"
                    checked={advanced.confidentialComputing ?? false}
                    onCheckedChange={(v) =>
                      updateAdvanced((p) => {
                        const { confidentialComputing: _, ...rest } = p;
                        return v === true
                          ? { ...rest, confidentialComputing: true }
                          : rest;
                      })
                    }
                  />
                  <span>
                    Confidential
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                      — supports TEE
                    </span>
                  </span>
                </label>
```

**Step 3: Update VM table `activeAdvancedCount` to include the new filter**

In `src/components/vm-table.tsx`, add `advanced.requiresConfidential,` to the `activeAdvancedCount` array, after `advanced.requiresGpu,` (around line 240):

```typescript
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
        advanced.vcpusRange[1] < VM_VCPUS_MAX),
    advanced.memoryMbRange != null &&
      (advanced.memoryMbRange[0] > 0 ||
        advanced.memoryMbRange[1] < VM_MEMORY_MB_MAX),
  ].filter(Boolean).length;
```

**Step 4: Add Requires Confidential checkbox in the Payment & Allocation column**

In `src/components/vm-table.tsx`, add a new `<label>` after the Requires GPU checkbox (after line 573, before the closing `</div>` of the Payment & Allocation section):

```tsx
              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none">
                <Checkbox
                  size="sm"
                  checked={advanced.requiresConfidential ?? false}
                  onCheckedChange={(v) =>
                    updateAdvanced((p) => {
                      const { requiresConfidential: _, ...rest } = p;
                      return v === true
                        ? { ...rest, requiresConfidential: true }
                        : rest;
                    })
                  }
                />
                <span>
                  Requires Confidential
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                    — requires TEE
                  </span>
                </span>
              </label>
```

**Step 5: Run typecheck + build**

```bash
pnpm typecheck && pnpm build
```

Expected: no errors

**Step 6: Commit**

```bash
git add src/components/node-table.tsx src/components/vm-table.tsx
git commit -m "feat: add confidential computing checkbox filters"
```

---

### Task 6: Add to detail panels

**Files:**
- Modify: `src/components/node-detail-panel.tsx:60-93` (metadata dl)
- Modify: `src/components/vm-detail-panel.tsx:152-190` (requirements section)

**Step 1: Add to node detail panel**

In `src/components/node-detail-panel.tsx`, add import at top:

```typescript
import { ShieldCheck } from "@phosphor-icons/react";
```

Add a row in the `<dl>` metadata section, after the Staked row (after line 88):

```tsx
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Confidential</dt>
          <dd className="flex items-center gap-1">
            {node.confidentialComputing ? (
              <>
                <ShieldCheck size={14} weight="fill" className="text-primary-400" />
                <span className="text-sm">Enabled</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">No</span>
            )}
          </dd>
        </div>
```

**Step 2: Add to VM detail panel**

In `src/components/vm-detail-panel.tsx`, add import at top:

```typescript
import { ShieldCheck } from "@phosphor-icons/react";
```

Add a row in the Requirements `<dl>`, after the GPU row (after line 188):

```tsx
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Confidential</dt>
            <dd className="flex items-center gap-1">
              {vm.requiresConfidential ? (
                <>
                  <ShieldCheck size={14} weight="fill" className="text-primary-400" />
                  <span className="text-sm">Required</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">No</span>
              )}
            </dd>
          </div>
```

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors

**Step 4: Commit**

```bash
git add src/components/node-detail-panel.tsx src/components/vm-detail-panel.tsx
git commit -m "feat: add confidential computing to detail panels"
```

---

### Task 7: Add to detail views

**Files:**
- Modify: `src/components/node-detail-view.tsx:92-135` (Details card)
- Modify: `src/components/vm-detail-view.tsx:208-243` (Requirements card)

**Step 1: Add to node detail view**

In `src/components/node-detail-view.tsx`, add import at top:

```typescript
import { ShieldCheck } from "@phosphor-icons/react";
```

Add a `MetaItem` in the Details `<dl>`, after the IPv6 row (after line 126):

```tsx
          <MetaItem label="Confidential">
            {node.confidentialComputing ? (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck size={14} weight="fill" className="text-primary-400" />
                Enabled
              </span>
            ) : (
              "No"
            )}
          </MetaItem>
```

**Step 2: Add to VM detail view**

In `src/components/vm-detail-view.tsx`, add import at top:

```typescript
import { ShieldCheck } from "@phosphor-icons/react";
```

Add a `MetaItem` in the Requirements `<dl>`, after the GPU row (after line 241):

```tsx
          <MetaItem label="Confidential">
            {vm.requiresConfidential ? (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck size={14} weight="fill" className="text-primary-400" />
                Required
              </span>
            ) : (
              "No"
            )}
          </MetaItem>
```

**Step 3: Run full check**

```bash
pnpm check
```

Expected: lint + typecheck + all tests pass

**Step 4: Commit**

```bash
git add src/components/node-detail-view.tsx src/components/vm-detail-view.tsx
git commit -m "feat: add confidential computing to detail views"
```

---

### Task 8: Update docs

- [ ] ARCHITECTURE.md — update API Client notes to mention confidential fields are now surfaced (remove "not yet surfaced in the UI" for confidential_computing)
- [ ] DECISIONS.md — no new architectural decisions (follows existing GPU pattern)
- [ ] BACKLOG.md — move "Confidential computing indicators" to Completed section
- [ ] CLAUDE.md — update Current Features to mention confidential computing indicators

**Step 1: Update all four docs**

Update `docs/ARCHITECTURE.md` API Client notes (line 78): remove "confidential_computing" from the "Additional wire fields... not yet surfaced" sentence. If only `cpu_architecture`/`cpu_vendor`/`cpu_features` remain unsurfaced, update the note accordingly.

Update `docs/BACKLOG.md`: move the "Confidential computing indicators" item from Open Items to the Completed section (add checkmark entry in the `<details>` block).

Update `CLAUDE.md` Current Features: add confidential computing indicators mention to the Nodes page and VMs page bullet points (ShieldCheck icon, tooltip, checkbox filter, detail view row).

**Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md docs/BACKLOG.md CLAUDE.md
git commit -m "docs: update docs for confidential computing feature"
```

**Step 3: Finish the branch**

Follow the "Finishing a branch" checklist from CLAUDE.md:

```bash
pnpm check
git push -u origin feature/confidential-computing
gh pr create --title "feat: add confidential computing indicators" --body "$(cat <<'EOF'
## Summary
- Add `confidentialComputing` (nodes) and `requiresConfidential` (VMs) fields to app types, transforms, and filter logic
- ShieldCheck icon (Phosphor) next to name in table rows with tooltip
- Checkbox filter on both Nodes and VMs advanced filters
- Confidential row in all four detail panels/views
- Filter tests for both new boolean filters

## Test plan
- [ ] `pnpm check` passes (lint + typecheck + tests)
- [ ] Node table shows shield icon for confidential nodes
- [ ] VM table shows shield icon for confidential VMs
- [ ] Tooltips display correct text on hover
- [ ] Confidential checkbox filters work on both pages
- [ ] Detail panels/views show Confidential row with icon
EOF
)"
gh pr merge --squash --delete-branch
git checkout main && git pull --ff-only origin main
git branch -D feature/confidential-computing
```
