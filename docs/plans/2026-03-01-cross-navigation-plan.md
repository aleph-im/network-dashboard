# Cross-Page Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add clickable cross-navigation so users can drill from overview cards to filtered list pages, and between node/VM detail panels and their counterpart pages.

**Architecture:** URL search params (`?status=`, `?selected=`) are the cross-page communication mechanism. Pages read params on mount to initialize local state. Overview cards use `<Link>`, detail panels use `<Link>` for cross-entity refs. No global state, no new dependencies.

**Tech Stack:** Next.js `useSearchParams`, `next/link`, existing React `useState`

**Design doc:** `docs/plans/2026-03-01-cross-navigation-design.md`

---

### Task 1: NodeTable accepts initialStatus prop

**Files:**
- Modify: `src/components/node-table.tsx`

**Step 1: Add `initialStatus` prop to `NodeTableProps`**

```tsx
type NodeTableProps = {
  onSelectNode: (hash: string) => void;
  initialStatus?: NodeStatus;
};
```

**Step 2: Use it in the component**

Change the `useState` initializer in `NodeTable`:

```tsx
export function NodeTable({ onSelectNode, initialStatus }: NodeTableProps) {
  const [statusFilter, setStatusFilter] = useState<NodeStatus | undefined>(
    initialStatus,
  );
```

**Step 3: Verify build**

Run: `pnpm typecheck`
Expected: PASS (prop is optional, no callers break)

**Step 4: Commit**

```bash
git add src/components/node-table.tsx
git commit -m "feat(node-table): accept initialStatus prop for cross-navigation"
```

---

### Task 2: VMTable accepts initialStatus prop

**Files:**
- Modify: `src/components/vm-table.tsx`

**Step 1: Add `initialStatus` prop to `VMTableProps`**

```tsx
type VMTableProps = {
  onSelectVM: (hash: string) => void;
  initialStatus?: VMStatus;
};
```

**Step 2: Use it in the component**

Change the `useState` initializer in `VMTable`:

```tsx
export function VMTable({ onSelectVM, initialStatus }: VMTableProps) {
  const [statusFilter, setStatusFilter] = useState<VMStatus | undefined>(
    initialStatus,
  );
```

**Step 3: Verify build**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/vm-table.tsx
git commit -m "feat(vm-table): accept initialStatus prop for cross-navigation"
```

---

### Task 3: Nodes page reads URL search params

**Files:**
- Modify: `src/app/nodes/page.tsx`

**Step 1: Rewrite the page to read search params**

The page needs `useSearchParams()` which requires a Suspense boundary in static exports. Split into an inner component that reads params and the default export that wraps it.

```tsx
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { NodeTable } from "@/components/node-table";
import { NodeDetailPanel } from "@/components/node-detail-panel";
import type { NodeStatus } from "@/api/types";

const VALID_NODE_STATUSES = new Set<string>([
  "healthy",
  "degraded",
  "offline",
  "unknown",
]);

function NodesContent() {
  const searchParams = useSearchParams();

  const statusParam = searchParams.get("status");
  const initialStatus =
    statusParam && VALID_NODE_STATUSES.has(statusParam)
      ? (statusParam as NodeStatus)
      : undefined;

  const selectedParam = searchParams.get("selected");
  const [selectedNode, setSelectedNode] = useState<string | null>(
    selectedParam,
  );

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <NodeTable
          onSelectNode={setSelectedNode}
          initialStatus={initialStatus}
        />
      </div>
      {selectedNode && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSelectedNode(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto bg-surface p-4 shadow-lg lg:static lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none">
            <NodeDetailPanel
              hash={selectedNode}
              onClose={() => setSelectedNode(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function NodesPage() {
  return (
    <Suspense>
      <NodesContent />
    </Suspense>
  );
}
```

**Step 2: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS

**Step 3: Manual test**

- Visit `/nodes` — behaves as before (no filter, no detail open)
- Visit `/nodes?status=degraded` — Degraded filter tab is active
- Visit `/nodes?selected=<any-mock-hash>` — detail panel opens
- Visit `/nodes?status=offline&selected=<hash>` — both work together

**Step 4: Commit**

```bash
git add src/app/nodes/page.tsx
git commit -m "feat(nodes): read status and selected from URL search params"
```

---

### Task 4: VMs page reads URL search params

**Files:**
- Modify: `src/app/vms/page.tsx`

**Step 1: Rewrite the page to read search params**

Same pattern as nodes page.

```tsx
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { VMTable } from "@/components/vm-table";
import { VMDetailPanel } from "@/components/vm-detail-panel";
import type { VMStatus } from "@/api/types";

const VALID_VM_STATUSES = new Set<string>([
  "scheduled",
  "observed",
  "orphaned",
  "missing",
  "unschedulable",
]);

function VMsContent() {
  const searchParams = useSearchParams();

  const statusParam = searchParams.get("status");
  const initialStatus =
    statusParam && VALID_VM_STATUSES.has(statusParam)
      ? (statusParam as VMStatus)
      : undefined;

  const selectedParam = searchParams.get("selected");
  const [selectedVM, setSelectedVM] = useState<string | null>(selectedParam);

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <VMTable onSelectVM={setSelectedVM} initialStatus={initialStatus} />
      </div>
      {selectedVM && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSelectedVM(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto bg-surface p-4 shadow-lg lg:static lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none">
            <VMDetailPanel
              hash={selectedVM}
              onClose={() => setSelectedVM(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function VMsPage() {
  return (
    <Suspense>
      <VMsContent />
    </Suspense>
  );
}
```

**Step 2: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS

**Step 3: Manual test**

- Visit `/vms` — behaves as before
- Visit `/vms?status=orphaned` — Orphaned filter active
- Visit `/vms?selected=<mock-vm-hash>` — detail panel opens

**Step 4: Commit**

```bash
git add src/app/vms/page.tsx
git commit -m "feat(vms): read status and selected from URL search params"
```

---

### Task 5: NodeHealthSummary links to filtered nodes page

**Files:**
- Modify: `src/components/node-health-summary.tsx`

**Step 1: Make legend rows clickable**

Import `Link` and convert `<li>` content to links. The status values in the segments array map directly to the `NodeStatus` type (lowercase), which matches the URL param contract.

```tsx
import Link from "next/link";
```

Replace the legend `<ul>` mapping (the `.filter().map()` block inside `<ul>`):

```tsx
{segments
  .filter((s) => s.count > 0)
  .map((seg) => (
    <li key={seg.label}>
      <Link
        href={`/nodes?status=${seg.status}`}
        className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted"
        style={{ transitionDuration: "var(--duration-fast)" }}
      >
        <StatusDot status={seg.status} size="sm" />
        <span className="text-muted-foreground">{seg.label}</span>
        <span className="ml-auto font-medium tabular-nums">
          {seg.count}
        </span>
      </Link>
    </li>
  ))}
```

**Step 2: Verify build**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Manual test**

- Hover over "Healthy" row — background highlight, pointer cursor
- Click "Degraded" — navigates to `/nodes?status=degraded`, filter is active

**Step 4: Commit**

```bash
git add src/components/node-health-summary.tsx
git commit -m "feat(overview): node health rows link to filtered nodes page"
```

---

### Task 6: VMAllocationSummary links to filtered VMs page

**Files:**
- Modify: `src/components/vm-allocation-summary.tsx`

**Step 1: Make status rows clickable**

Import `Link` and convert `<li>` content to links. The status values need to be added to the `VMStatusRow` type so we can build the URL. The label names match the `VMStatus` values when lowercased.

Add a `status` field to `VMStatusRow`:

```tsx
type VMStatusRow = {
  label: string;
  status: VMStatus;
  count: number;
  variant: "default" | "success" | "warning" | "error" | "info";
};
```

Import `Link` and `VMStatus`:

```tsx
import Link from "next/link";
import type { VMStatus } from "@/api/types";
```

Update the rows array to include `status`:

```tsx
const rows: VMStatusRow[] = [
  { label: "Scheduled", status: "scheduled", count: stats.scheduledVMs, variant: "info" },
  { label: "Observed", status: "observed", count: stats.observedVMs, variant: "success" },
  { label: "Orphaned", status: "orphaned", count: stats.orphanedVMs, variant: "warning" },
  { label: "Missing", status: "missing", count: stats.missingVMs, variant: "error" },
  { label: "Unschedulable", status: "unschedulable", count: stats.unschedulableVMs, variant: "error" },
];
```

Replace the `<li>` mapping:

```tsx
{rows.map((row) => (
  <li key={row.label}>
    <Link
      href={`/vms?status=${row.status}`}
      className="flex items-center justify-between rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted"
      style={{ transitionDuration: "var(--duration-fast)" }}
    >
      <div className="flex items-center gap-2">
        <Badge variant={row.variant} size="sm">
          {row.label}
        </Badge>
      </div>
      <span className="font-medium tabular-nums">{row.count}</span>
    </Link>
  </li>
))}
```

**Step 2: Verify build**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Manual test**

- Hover over "Orphaned" — background highlight, pointer cursor
- Click "Missing" — navigates to `/vms?status=missing`, filter active

**Step 4: Commit**

```bash
git add src/components/vm-allocation-summary.tsx
git commit -m "feat(overview): VM allocation rows link to filtered VMs page"
```

---

### Task 7: NodeDetailPanel VM hashes link to VMs page

**Files:**
- Modify: `src/components/node-detail-panel.tsx`

**Step 1: Make VM hashes clickable links**

Import `Link`:

```tsx
import Link from "next/link";
```

In the VMs list section, replace the VM hash `<span>` with a `<Link>`:

Change this (inside the `node.vms.map` block):

```tsx
<span className="font-mono text-xs">
  {truncateHash(vm.hash)}
</span>
```

To:

```tsx
<Link
  href={`/vms?selected=${vm.hash}`}
  className="font-mono text-xs text-accent-500 hover:underline"
>
  {truncateHash(vm.hash)}
</Link>
```

**Step 2: Verify build**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Manual test**

- Open a node detail panel, see VM hashes in accent color
- Hover — underline appears
- Click — navigates to `/vms?selected=<hash>`, VM detail panel opens

**Step 4: Commit**

```bash
git add src/components/node-detail-panel.tsx
git commit -m "feat(node-detail): VM hashes link to VMs page with detail open"
```

---

### Task 8: VMDetailPanel assigned node links to nodes page

**Files:**
- Modify: `src/components/vm-detail-panel.tsx`

**Step 1: Make assigned node hash a clickable link**

Import `Link`:

```tsx
import Link from "next/link";
```

Replace the "Assigned Node" `<dd>` content. Change:

```tsx
<dd className="font-mono text-xs">
  {vm.assignedNode ? truncateHash(vm.assignedNode) : "\u2014"}
</dd>
```

To:

```tsx
<dd className="font-mono text-xs">
  {vm.assignedNode ? (
    <Link
      href={`/nodes?selected=${vm.assignedNode}`}
      className="text-accent-500 hover:underline"
    >
      {truncateHash(vm.assignedNode)}
    </Link>
  ) : (
    "\u2014"
  )}
</dd>
```

**Step 2: Verify build**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Manual test**

- Open a VM detail panel with an assigned node
- Node hash shows in accent color
- Click — navigates to `/nodes?selected=<hash>`, node detail panel opens

**Step 4: Commit**

```bash
git add src/components/vm-detail-panel.tsx
git commit -m "feat(vm-detail): assigned node links to nodes page with detail open"
```

---

### Task 9: Full integration test and build verification

**Step 1: Run full check**

Run: `pnpm check` (lint + typecheck + test)
Expected: PASS

**Step 2: Build static export**

Run: `pnpm build`
Expected: PASS — static export to `out/`

**Step 3: Manual integration walkthrough**

Test the four flows end-to-end:
1. Overview → click "Degraded" in Node Health → nodes page, Degraded filter active
2. Overview → click "Orphaned" in VM Allocation → VMs page, Orphaned filter active
3. Nodes page → open node detail → click a VM hash → VMs page, VM detail open
4. VMs page → open VM detail → click assigned node → Nodes page, node detail open

**Step 4: Commit if any fixes were needed**

---

### Task 10: Update docs

- [ ] ARCHITECTURE.md — document the URL search params contract and cross-navigation pattern
- [ ] DECISIONS.md — log the decision to use URL params (read-once on mount, no write-back)
- [ ] BACKLOG.md — no completed items to move; no new deferred ideas unless discovered
- [ ] CLAUDE.md — add "Cross-page navigation via URL search params" to Current Features
