# List Page Filtering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add text search, dynamic count badges, and collapsible advanced filters to the Nodes and VMs list pages.

**Architecture:** All filtering is client-side post-fetch. A shared `useFilterPipeline` pattern computes unfiltered counts, applies search + advanced filters, computes filtered counts, then applies status filter last. The collapsible section uses CSS grid-template-rows animation. No new DS components.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, @aleph-front/ds (Checkbox)

**Design doc:** `docs/plans/2026-03-05-list-filtering-design.md`

---

### Task 1: Filter utility functions

Pure functions for the filter pipeline. No UI — just logic. These are shared between both pages.

**Files:**
- Create: `src/lib/filters.ts`
- Create: `src/lib/filters.test.ts`

**Step 1: Write the tests**

```ts
// src/lib/filters.test.ts
import { describe, expect, it } from "vitest";
import {
  textSearch,
  countByStatus,
  applyNodeAdvancedFilters,
  applyVmAdvancedFilters,
} from "@/lib/filters";
import type { Node, VM } from "@/api/types";

const makeNode = (overrides: Partial<Node> = {}): Node => ({
  hash: "abc123def456",
  name: null,
  address: null,
  status: "healthy",
  staked: false,
  resources: null,
  vmCount: 0,
  updatedAt: "2026-01-01T00:00:00Z",
  owner: null,
  supportsIpv6: null,
  discoveredAt: null,
  ...overrides,
});

const makeVm = (overrides: Partial<VM> = {}): VM => ({
  hash: "vm_hash_001",
  type: "MicroVm",
  allocatedNode: null,
  observedNodes: [],
  status: "scheduled",
  requirements: { vcpus: 2, memoryMb: 1024, diskMb: 10000 },
  paymentStatus: null,
  updatedAt: "2026-01-01T00:00:00Z",
  allocatedAt: null,
  lastObservedAt: null,
  paymentType: null,
  ...overrides,
});

describe("textSearch", () => {
  const nodes = [
    makeNode({ hash: "aaaa1111", name: "alpha-node", owner: "0xOwnerA" }),
    makeNode({ hash: "bbbb2222", name: null, owner: "0xOwnerB" }),
    makeNode({ hash: "cccc3333", name: "gamma-node", owner: null }),
  ];

  it("returns all rows when query is empty", () => {
    const fields = (n: Node) => [n.hash, n.owner, n.name];
    expect(textSearch(nodes, "", fields)).toHaveLength(3);
  });

  it("matches hash substring case-insensitively", () => {
    const fields = (n: Node) => [n.hash, n.owner, n.name];
    expect(textSearch(nodes, "AAAA", fields)).toEqual([nodes[0]]);
  });

  it("matches owner field", () => {
    const fields = (n: Node) => [n.hash, n.owner, n.name];
    expect(textSearch(nodes, "ownerb", fields)).toEqual([nodes[1]]);
  });

  it("matches name field", () => {
    const fields = (n: Node) => [n.hash, n.owner, n.name];
    expect(textSearch(nodes, "gamma", fields)).toEqual([nodes[2]]);
  });

  it("skips null fields without error", () => {
    const fields = (n: Node) => [n.hash, n.owner, n.name];
    expect(textSearch(nodes, "null", fields)).toEqual([]);
  });
});

describe("countByStatus", () => {
  it("counts items grouped by status", () => {
    const items = [
      makeNode({ status: "healthy" }),
      makeNode({ status: "healthy" }),
      makeNode({ status: "unreachable" }),
    ];
    const counts = countByStatus(items, (n) => n.status);
    expect(counts).toEqual({
      healthy: 2,
      unreachable: 1,
    });
  });

  it("returns empty object for empty array", () => {
    expect(countByStatus([], (n: Node) => n.status)).toEqual({});
  });
});

describe("applyNodeAdvancedFilters", () => {
  it("filters by hasVms", () => {
    const nodes = [makeNode({ vmCount: 3 }), makeNode({ vmCount: 0 })];
    const result = applyNodeAdvancedFilters(nodes, { hasVms: true });
    expect(result).toHaveLength(1);
    expect(result[0].vmCount).toBe(3);
  });

  it("filters by staked", () => {
    const nodes = [
      makeNode({ staked: true }),
      makeNode({ staked: false }),
    ];
    const result = applyNodeAdvancedFilters(nodes, { staked: true });
    expect(result).toHaveLength(1);
  });

  it("filters by supportsIpv6", () => {
    const nodes = [
      makeNode({ supportsIpv6: true }),
      makeNode({ supportsIpv6: false }),
      makeNode({ supportsIpv6: null }),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      supportsIpv6: true,
    });
    expect(result).toHaveLength(1);
  });

  it("filters by minCpu", () => {
    const nodes = [
      makeNode({
        resources: {
          cpuUsagePct: 80,
          memoryUsagePct: 0,
          diskUsagePct: 0,
          vcpusTotal: 8,
          memoryTotalMb: 0,
          diskTotalMb: 0,
          vcpusAvailable: 2,
          memoryAvailableMb: 0,
          diskAvailableMb: 0,
        },
      }),
      makeNode({
        resources: {
          cpuUsagePct: 20,
          memoryUsagePct: 0,
          diskUsagePct: 0,
          vcpusTotal: 8,
          memoryTotalMb: 0,
          diskTotalMb: 0,
          vcpusAvailable: 6,
          memoryAvailableMb: 0,
          diskAvailableMb: 0,
        },
      }),
      makeNode({ resources: null }),
    ];
    const result = applyNodeAdvancedFilters(nodes, { minCpu: 50 });
    expect(result).toHaveLength(1);
    expect(result[0].resources?.cpuUsagePct).toBe(80);
  });

  it("combines multiple filters with AND logic", () => {
    const nodes = [
      makeNode({ vmCount: 3, staked: true }),
      makeNode({ vmCount: 3, staked: false }),
      makeNode({ vmCount: 0, staked: true }),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      hasVms: true,
      staked: true,
    });
    expect(result).toHaveLength(1);
  });

  it("returns all when no filters active", () => {
    const nodes = [makeNode(), makeNode()];
    expect(applyNodeAdvancedFilters(nodes, {})).toHaveLength(2);
  });
});

describe("applyVmAdvancedFilters", () => {
  it("filters by vmTypes", () => {
    const vms = [
      makeVm({ type: "MicroVm" }),
      makeVm({ type: "PersistentProgram" }),
      makeVm({ type: "Instance" }),
    ];
    const result = applyVmAdvancedFilters(vms, {
      vmTypes: new Set(["MicroVm", "Instance"]),
    });
    expect(result).toHaveLength(2);
  });

  it("does not filter when vmTypes includes all types", () => {
    const vms = [makeVm({ type: "MicroVm" })];
    const result = applyVmAdvancedFilters(vms, {
      vmTypes: new Set(["MicroVm", "PersistentProgram", "Instance"]),
    });
    expect(result).toHaveLength(1);
  });

  it("filters by paymentStatuses", () => {
    const vms = [
      makeVm({ paymentStatus: "validated" }),
      makeVm({ paymentStatus: "invalidated" }),
      makeVm({ paymentStatus: null }),
    ];
    const result = applyVmAdvancedFilters(vms, {
      paymentStatuses: new Set(["validated"]),
    });
    expect(result).toHaveLength(1);
  });

  it("filters by hasAllocatedNode", () => {
    const vms = [
      makeVm({ allocatedNode: "node_abc" }),
      makeVm({ allocatedNode: null }),
    ];
    const result = applyVmAdvancedFilters(vms, {
      hasAllocatedNode: true,
    });
    expect(result).toHaveLength(1);
  });

  it("filters by minVcpus", () => {
    const vms = [
      makeVm({ requirements: { vcpus: 4, memoryMb: 1024, diskMb: 0 } }),
      makeVm({ requirements: { vcpus: 1, memoryMb: 1024, diskMb: 0 } }),
      makeVm({ requirements: { vcpus: null, memoryMb: null, diskMb: null } }),
    ];
    const result = applyVmAdvancedFilters(vms, { minVcpus: 2 });
    expect(result).toHaveLength(1);
    expect(result[0].requirements.vcpus).toBe(4);
  });

  it("filters by minMemoryMb", () => {
    const vms = [
      makeVm({ requirements: { vcpus: 2, memoryMb: 2048, diskMb: 0 } }),
      makeVm({ requirements: { vcpus: 2, memoryMb: 512, diskMb: 0 } }),
    ];
    const result = applyVmAdvancedFilters(vms, { minMemoryMb: 1024 });
    expect(result).toHaveLength(1);
  });

  it("returns all when no filters active", () => {
    const vms = [makeVm(), makeVm()];
    expect(applyVmAdvancedFilters(vms, {})).toHaveLength(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/filters.test.ts`
Expected: FAIL — module `@/lib/filters` does not exist.

**Step 3: Write the implementation**

```ts
// src/lib/filters.ts
import type { Node, VM, VmType } from "@/api/types";

/** Generic text search: matches if any field contains the query. */
export function textSearch<T>(
  items: T[],
  query: string,
  fields: (item: T) => (string | null | undefined)[],
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    fields(item).some((f) => f?.toLowerCase().includes(q)),
  );
}

/** Count items grouped by a key extractor. */
export function countByStatus<T>(
  items: T[],
  getStatus: (item: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const s = getStatus(item);
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

// --- Node advanced filters ---

export type NodeAdvancedFilters = {
  hasVms?: boolean;
  staked?: boolean;
  supportsIpv6?: boolean;
  minCpu?: number;
  minMemory?: number;
  minDisk?: number;
};

export function applyNodeAdvancedFilters(
  nodes: Node[],
  filters: NodeAdvancedFilters,
): Node[] {
  let result = nodes;
  if (filters.hasVms) {
    result = result.filter((n) => n.vmCount > 0);
  }
  if (filters.staked) {
    result = result.filter((n) => n.staked);
  }
  if (filters.supportsIpv6) {
    result = result.filter((n) => n.supportsIpv6 === true);
  }
  if (filters.minCpu != null) {
    result = result.filter(
      (n) => (n.resources?.cpuUsagePct ?? 0) >= filters.minCpu!,
    );
  }
  if (filters.minMemory != null) {
    result = result.filter(
      (n) => (n.resources?.memoryUsagePct ?? 0) >= filters.minMemory!,
    );
  }
  if (filters.minDisk != null) {
    result = result.filter(
      (n) => (n.resources?.diskUsagePct ?? 0) >= filters.minDisk!,
    );
  }
  return result;
}

// --- VM advanced filters ---

export type VmAdvancedFilters = {
  vmTypes?: Set<VmType>;
  paymentStatuses?: Set<string>;
  hasAllocatedNode?: boolean;
  minVcpus?: number;
  minMemoryMb?: number;
};

const ALL_VM_TYPES: Set<VmType> = new Set([
  "MicroVm",
  "PersistentProgram",
  "Instance",
]);

export function applyVmAdvancedFilters(
  vms: VM[],
  filters: VmAdvancedFilters,
): VM[] {
  let result = vms;
  if (filters.vmTypes && filters.vmTypes.size < ALL_VM_TYPES.size) {
    result = result.filter((v) => filters.vmTypes!.has(v.type));
  }
  if (filters.paymentStatuses) {
    result = result.filter(
      (v) => v.paymentStatus != null
        && filters.paymentStatuses!.has(v.paymentStatus),
    );
  }
  if (filters.hasAllocatedNode) {
    result = result.filter((v) => v.allocatedNode != null);
  }
  if (filters.minVcpus != null) {
    result = result.filter(
      (v) => (v.requirements.vcpus ?? 0) >= filters.minVcpus!,
    );
  }
  if (filters.minMemoryMb != null) {
    result = result.filter(
      (v) => (v.requirements.memoryMb ?? 0) >= filters.minMemoryMb!,
    );
  }
  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/filters.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/filters.ts src/lib/filters.test.ts
git commit -m "feat: add filter utility functions for nodes and VMs"
```

---

### Task 2: Collapsible component

A reusable animated collapsible wrapper using CSS grid-template-rows.

**Files:**
- Create: `src/components/collapsible-section.tsx`

**Step 1: Write the component**

```tsx
// src/components/collapsible-section.tsx
type CollapsibleSectionProps = {
  open: boolean;
  children: React.ReactNode;
};

export function CollapsibleSection({
  open,
  children,
}: CollapsibleSectionProps) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/collapsible-section.tsx
git commit -m "feat: add CollapsibleSection with CSS grid animation"
```

---

### Task 3: useDebounce hook

**Files:**
- Create: `src/hooks/use-debounce.ts`

**Step 1: Write the hook**

```ts
// src/hooks/use-debounce.ts
import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-debounce.ts
git commit -m "feat: add useDebounce hook"
```

---

### Task 4: Refactor NodeTable with full filter pipeline

Replace the existing inline filter logic with the new pipeline: search bar, status pills with counts, collapsible advanced filters.

**Files:**
- Modify: `src/components/node-table.tsx` (full rewrite of filter UI)
- Modify: `src/app/nodes/page.tsx` (add `?q=` URL param)

**Step 1: Update `src/app/nodes/page.tsx` to pass `initialQuery`**

Add `?q=` reading alongside existing params:

```tsx
// In NodesContent(), after the existing searchParams reads:
const queryParam = searchParams.get("q") ?? "";
```

Pass it to NodeTable:

```tsx
<NodeTable
  onSelectNode={setSelectedNode}
  initialStatus={initialStatus}
  initialHasVms={hasVms}
  initialSort={initialSort}
  initialQuery={queryParam}
  selectedKey={selectedNode ?? undefined}
/>
```

Update `NodeTableProps` in `node-table.tsx` to accept `initialQuery?: string`.

**Step 2: Rewrite `src/components/node-table.tsx`**

Key changes:
- Add search input with debounce
- Remove `hasVmsFilter` from inline state (moves to advanced filters)
- Fetch full dataset: `useNodes()` with no status filter in the query key
- Apply filter pipeline: `textSearch` -> `applyNodeAdvancedFilters` -> compute counts -> apply status filter
- Status pills show count badges
- Collapsible section with checkboxes and range inputs
- "Filters" toggle button with active-indicator dot

```tsx
// src/components/node-table.tsx
"use client";

import { useState, useTransition, useMemo } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { StatusDot } from "@aleph-front/ds/status-dot";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { Checkbox } from "@aleph-front/ds/checkbox";
import { Badge } from "@aleph-front/ds/badge";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useNodes } from "@/hooks/use-nodes";
import { useDebounce } from "@/hooks/use-debounce";
import { ResourceBar } from "@/components/resource-bar";
import { CollapsibleSection } from "@/components/collapsible-section";
import { truncateHash, relativeTime } from "@/lib/format";
import {
  textSearch,
  countByStatus,
  applyNodeAdvancedFilters,
  type NodeAdvancedFilters,
} from "@/lib/filters";
import {
  nodeStatusToDot,
  NODE_STATUS_VARIANT,
} from "@/lib/status-map";
import type { Node, NodeStatus } from "@/api/types";

const ALL_STATUSES: (NodeStatus | undefined)[] = [
  undefined,
  "healthy",
  "unreachable",
  "unknown",
  "removed",
];

const STATUS_LABELS: Record<string, string> = {
  all: "All",
  healthy: "Healthy",
  unreachable: "Unreachable",
  unknown: "Unknown",
  removed: "Removed",
};

const NODE_SEARCH_FIELDS = (n: Node) => [n.hash, n.owner, n.name];

const columns: Column<Node>[] = [
  {
    header: "",
    accessor: (r) => (
      <StatusDot status={nodeStatusToDot(r.status)} size="sm" />
    ),
    width: "40px",
    align: "center",
  },
  {
    header: "Hash",
    accessor: (r) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help font-mono text-sm">
            {truncateHash(r.hash)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{r.hash}</TooltipContent>
      </Tooltip>
    ),
    sortable: true,
    sortValue: (r) => r.hash,
  },
  {
    header: "Status",
    accessor: (r) => (
      <Badge
        variant={NODE_STATUS_VARIANT[r.status]}
        size="sm"
        className="capitalize"
      >
        {r.status}
      </Badge>
    ),
    sortable: true,
    sortValue: (r) => r.status,
  },
  {
    header: "CPU",
    accessor: (r) => (
      <ResourceBar value={r.resources?.cpuUsagePct ?? 0} label="CPU" />
    ),
    sortable: true,
    sortValue: (r) => r.resources?.cpuUsagePct ?? 0,
  },
  {
    header: "Memory",
    accessor: (r) => (
      <ResourceBar
        value={r.resources?.memoryUsagePct ?? 0}
        label="Memory"
      />
    ),
    sortable: true,
    sortValue: (r) => r.resources?.memoryUsagePct ?? 0,
  },
  {
    header: "VMs",
    accessor: (r) => (
      <span className="tabular-nums">{r.vmCount}</span>
    ),
    sortable: true,
    sortValue: (r) => r.vmCount,
    align: "center",
  },
  {
    header: "Updated",
    accessor: (r) => (
      <span className="text-xs text-muted-foreground">
        {relativeTime(r.updatedAt)}
      </span>
    ),
    sortable: true,
    sortValue: (r) => new Date(r.updatedAt).getTime(),
  },
];

type SortConfig = {
  field: "vms";
  direction: "asc" | "desc";
};

type NodeTableProps = {
  onSelectNode: (hash: string) => void;
  initialStatus?: NodeStatus;
  initialHasVms?: boolean;
  initialSort?: SortConfig;
  initialQuery?: string;
  selectedKey?: string;
};

export function NodeTable({
  onSelectNode,
  initialStatus,
  initialHasVms,
  initialSort,
  initialQuery,
  selectedKey,
}: NodeTableProps) {
  const [, startTransition] = useTransition();

  // Search
  const [searchInput, setSearchInput] = useState(initialQuery ?? "");
  const debouncedQuery = useDebounce(searchInput, 300);

  // Status filter
  const [statusFilter, setStatusFilter] = useState<
    NodeStatus | undefined
  >(initialStatus);

  // Advanced filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advanced, setAdvanced] = useState<NodeAdvancedFilters>({
    ...(initialHasVms ? { hasVms: true } : {}),
  });

  const hasActiveAdvanced =
    advanced.hasVms ||
    advanced.staked ||
    advanced.supportsIpv6 ||
    advanced.minCpu != null ||
    advanced.minMemory != null ||
    advanced.minDisk != null;

  // Data — fetch full dataset, no status in query key
  const { data: allNodes, isLoading } = useNodes();

  // Filter pipeline
  const { displayedRows, filteredCounts, unfilteredCounts } =
    useMemo(() => {
      const all = allNodes ?? [];
      const uCounts = countByStatus(all, (n) => n.status);

      const afterSearch = textSearch(
        all,
        debouncedQuery,
        NODE_SEARCH_FIELDS,
      );
      const afterAdvanced = applyNodeAdvancedFilters(
        afterSearch,
        advanced,
      );
      const fCounts = countByStatus(afterAdvanced, (n) => n.status);

      const afterStatus = statusFilter
        ? afterAdvanced.filter((n) => n.status === statusFilter)
        : afterAdvanced;

      return {
        displayedRows: afterStatus,
        filteredCounts: fCounts,
        unfilteredCounts: uCounts,
      };
    }, [allNodes, debouncedQuery, advanced, statusFilter]);

  // Apply initial sort if present
  const sortedRows = initialSort
    ? [...displayedRows].sort((a, b) => {
        const dir = initialSort.direction === "asc" ? 1 : -1;
        return (a.vmCount - b.vmCount) * dir;
      })
    : displayedRows;

  const hasNonStatusFilters =
    debouncedQuery.trim() !== "" || hasActiveAdvanced;

  function formatCount(status: NodeStatus | undefined): string {
    const key = status ?? "all";
    const filtered =
      key === "all"
        ? Object.values(filteredCounts).reduce((a, b) => a + b, 0)
        : (filteredCounts[key] ?? 0);
    const unfiltered =
      key === "all"
        ? Object.values(unfilteredCounts).reduce((a, b) => a + b, 0)
        : (unfilteredCounts[key] ?? 0);

    if (hasNonStatusFilters && filtered !== unfiltered) {
      return `${filtered}/${unfiltered}`;
    }
    return `${unfiltered}`;
  }

  function updateAdvanced(patch: Partial<NodeAdvancedFilters>) {
    startTransition(() => setAdvanced((prev) => ({ ...prev, ...patch })));
  }

  function clearAdvanced() {
    startTransition(() => setAdvanced({}));
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      {/* Search bar + Filters toggle */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search hash, owner, name..."
            className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`relative flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
            filtersOpen
              ? "border-primary-500 bg-primary-600/10 text-primary-500"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          Filters
          {hasActiveAdvanced && !filtersOpen && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary-500" />
          )}
        </button>
      </div>

      {/* Status pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ALL_STATUSES.map((status) => {
          const key = status ?? "all";
          const label = STATUS_LABELS[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                startTransition(() => setStatusFilter(status))
              }
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === status
                  ? "bg-primary-600/10 text-primary-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              style={{ transitionDuration: "var(--duration-fast)" }}
            >
              {label}{" "}
              <span className="tabular-nums opacity-70">
                ({formatCount(status)})
              </span>
            </button>
          );
        })}
      </div>

      {/* Collapsible advanced filters */}
      <CollapsibleSection open={filtersOpen}>
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-border bg-muted/30 p-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
            <Checkbox
              size="xs"
              checked={advanced.hasVms ?? false}
              onCheckedChange={(v) =>
                updateAdvanced({ hasVms: v === true || undefined })
              }
            />
            Has VMs
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
            <Checkbox
              size="xs"
              checked={advanced.staked ?? false}
              onCheckedChange={(v) =>
                updateAdvanced({ staked: v === true || undefined })
              }
            />
            Staked
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
            <Checkbox
              size="xs"
              checked={advanced.supportsIpv6 ?? false}
              onCheckedChange={(v) =>
                updateAdvanced({
                  supportsIpv6: v === true || undefined,
                })
              }
            />
            IPv6
          </label>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>CPU &ge;</span>
            <input
              type="number"
              min={0}
              max={100}
              value={advanced.minCpu ?? ""}
              onChange={(e) =>
                updateAdvanced({
                  minCpu: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              className="h-7 w-16 rounded border border-border bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="%"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Mem &ge;</span>
            <input
              type="number"
              min={0}
              max={100}
              value={advanced.minMemory ?? ""}
              onChange={(e) =>
                updateAdvanced({
                  minMemory: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              className="h-7 w-16 rounded border border-border bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="%"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Disk &ge;</span>
            <input
              type="number"
              min={0}
              max={100}
              value={advanced.minDisk ?? ""}
              onChange={(e) =>
                updateAdvanced({
                  minDisk: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              className="h-7 w-16 rounded border border-border bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="%"
            />
          </div>

          {hasActiveAdvanced && (
            <button
              type="button"
              onClick={clearAdvanced}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      </CollapsibleSection>

      <Table
        columns={columns}
        data={sortedRows}
        keyExtractor={(r) => r.hash}
        onRowClick={(r) => onSelectNode(r.hash)}
        activeKey={selectedKey}
      />
    </TooltipProvider>
  );
}
```

**Step 3: Update `src/app/nodes/page.tsx`**

Read `?q=` from search params and pass to NodeTable. Also remove the `hasVmsFilter` reset logic since that now lives inside NodeTable's advanced filters.

The key diff in `NodesContent`:
- Add: `const queryParam = searchParams.get("q") ?? "";`
- Add prop: `initialQuery={queryParam}` on `<NodeTable>`

**Step 4: Run checks**

Run: `pnpm check`
Expected: lint + typecheck + tests all pass.

**Step 5: Commit**

```bash
git add src/components/node-table.tsx src/app/nodes/page.tsx
git commit -m "feat: add search, count badges, and advanced filters to NodeTable"
```

---

### Task 5: Refactor VMTable with full filter pipeline

Same pattern as NodeTable but with VM-specific filters.

**Files:**
- Modify: `src/components/vm-table.tsx` (full rewrite of filter UI)
- Modify: `src/app/vms/page.tsx` (add `?q=` URL param)

**Step 1: Update `src/app/vms/page.tsx` to pass `initialQuery`**

Same pattern as nodes page — read `?q=` and pass through.

**Step 2: Rewrite `src/components/vm-table.tsx`**

Key changes:
- Add search input (matches `hash`, `allocatedNode`)
- Fetch full dataset: `useVMs()` with no status filter in query key
- Apply pipeline: `textSearch` -> `applyVmAdvancedFilters` -> count -> status filter
- Status pills with count badges
- Collapsible section with: VM Type multi-select pills, Payment Status multi-select pills, Has Allocated Node checkbox, vCPUs and Memory range inputs

```tsx
// src/components/vm-table.tsx
"use client";

import { useState, useTransition, useMemo } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { Checkbox } from "@aleph-front/ds/checkbox";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useVMs } from "@/hooks/use-vms";
import { useDebounce } from "@/hooks/use-debounce";
import { CollapsibleSection } from "@/components/collapsible-section";
import { truncateHash } from "@/lib/format";
import {
  textSearch,
  countByStatus,
  applyVmAdvancedFilters,
  type VmAdvancedFilters,
} from "@/lib/filters";
import { VM_STATUS_VARIANT } from "@/lib/status-map";
import type { VM, VmStatus, VmType } from "@/api/types";

const ALL_STATUSES: (VmStatus | undefined)[] = [
  undefined,
  "scheduled",
  "unscheduled",
  "orphaned",
  "missing",
  "unschedulable",
  "unknown",
];

const STATUS_LABELS: Record<string, string> = {
  all: "All",
  scheduled: "Scheduled",
  unscheduled: "Unscheduled",
  orphaned: "Orphaned",
  missing: "Missing",
  unschedulable: "Unschedulable",
  unknown: "Unknown",
};

const ALL_VM_TYPES: VmType[] = [
  "MicroVm",
  "PersistentProgram",
  "Instance",
];
const ALL_PAYMENT_STATUSES = ["validated", "invalidated"] as const;

const VM_SEARCH_FIELDS = (v: VM) => [v.hash, v.allocatedNode];

function isDiscrepancy(vm: VM): boolean {
  return (
    vm.status === "orphaned" ||
    vm.status === "missing" ||
    vm.status === "unschedulable"
  );
}

const columns: Column<VM>[] = [
  {
    header: "Hash",
    accessor: (r) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`cursor-help font-mono text-sm ${
              isDiscrepancy(r) ? "text-warning-400" : ""
            }`}
          >
            {truncateHash(r.hash)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{r.hash}</TooltipContent>
      </Tooltip>
    ),
    sortable: true,
    sortValue: (r) => r.hash,
  },
  {
    header: "Type",
    accessor: (r) => (
      <Badge variant="default" size="sm">
        {r.type}
      </Badge>
    ),
    sortable: true,
    sortValue: (r) => r.type,
  },
  {
    header: "Node",
    accessor: (r) =>
      r.allocatedNode ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help font-mono text-xs text-muted-foreground">
              {truncateHash(r.allocatedNode)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{r.allocatedNode}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-xs text-muted-foreground">None</span>
      ),
    sortable: true,
    sortValue: (r) => r.allocatedNode ?? "",
  },
  {
    header: "Status",
    accessor: (r) => (
      <Badge
        variant={VM_STATUS_VARIANT[r.status]}
        size="sm"
        className="capitalize"
      >
        {r.status}
      </Badge>
    ),
    sortable: true,
    sortValue: (r) => r.status,
  },
  {
    header: "vCPUs",
    accessor: (r) => (
      <span className="text-xs tabular-nums">
        {r.requirements.vcpus ?? "\u2014"}
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.requirements.vcpus ?? 0,
    align: "right",
  },
  {
    header: "Memory",
    accessor: (r) => (
      <span className="text-xs tabular-nums">
        {r.requirements.memoryMb != null
          ? `${r.requirements.memoryMb} MB`
          : "\u2014"}
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.requirements.memoryMb ?? 0,
    align: "right",
  },
];

type VMTableProps = {
  onSelectVM: (hash: string) => void;
  initialStatus?: VmStatus;
  initialQuery?: string;
  selectedKey?: string;
};

export function VMTable({
  onSelectVM,
  initialStatus,
  initialQuery,
  selectedKey,
}: VMTableProps) {
  const [, startTransition] = useTransition();

  // Search
  const [searchInput, setSearchInput] = useState(initialQuery ?? "");
  const debouncedQuery = useDebounce(searchInput, 300);

  // Status filter
  const [statusFilter, setStatusFilter] = useState<
    VmStatus | undefined
  >(initialStatus);

  // Advanced filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advanced, setAdvanced] = useState<VmAdvancedFilters>({});

  const hasActiveAdvanced =
    (advanced.vmTypes != null &&
      advanced.vmTypes.size < ALL_VM_TYPES.length) ||
    advanced.paymentStatuses != null ||
    advanced.hasAllocatedNode ||
    advanced.minVcpus != null ||
    advanced.minMemoryMb != null;

  // Data — fetch full dataset
  const { data: allVms, isLoading } = useVMs();

  // Filter pipeline
  const { displayedRows, filteredCounts, unfilteredCounts } =
    useMemo(() => {
      const all = allVms ?? [];
      const uCounts = countByStatus(all, (v) => v.status);

      const afterSearch = textSearch(
        all,
        debouncedQuery,
        VM_SEARCH_FIELDS,
      );
      const afterAdvanced = applyVmAdvancedFilters(
        afterSearch,
        advanced,
      );
      const fCounts = countByStatus(afterAdvanced, (v) => v.status);

      const afterStatus = statusFilter
        ? afterAdvanced.filter((v) => v.status === statusFilter)
        : afterAdvanced;

      return {
        displayedRows: afterStatus,
        filteredCounts: fCounts,
        unfilteredCounts: uCounts,
      };
    }, [allVms, debouncedQuery, advanced, statusFilter]);

  const hasNonStatusFilters =
    debouncedQuery.trim() !== "" || hasActiveAdvanced;

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

    if (hasNonStatusFilters && filtered !== unfiltered) {
      return `${filtered}/${unfiltered}`;
    }
    return `${unfiltered}`;
  }

  function toggleVmType(type: VmType) {
    startTransition(() => {
      setAdvanced((prev) => {
        const current =
          prev.vmTypes ?? new Set<VmType>(ALL_VM_TYPES);
        const next = new Set(current);
        if (next.has(type)) {
          next.delete(type);
        } else {
          next.add(type);
        }
        return {
          ...prev,
          vmTypes:
            next.size === ALL_VM_TYPES.length ? undefined : next,
        };
      });
    });
  }

  function togglePaymentStatus(ps: string) {
    startTransition(() => {
      setAdvanced((prev) => {
        const current =
          prev.paymentStatuses ??
          new Set<string>(ALL_PAYMENT_STATUSES);
        const next = new Set(current);
        if (next.has(ps)) {
          next.delete(ps);
        } else {
          next.add(ps);
        }
        return {
          ...prev,
          paymentStatuses:
            next.size === ALL_PAYMENT_STATUSES.length
              ? undefined
              : next,
        };
      });
    });
  }

  function updateAdvanced(patch: Partial<VmAdvancedFilters>) {
    startTransition(() =>
      setAdvanced((prev) => ({ ...prev, ...patch })),
    );
  }

  function clearAdvanced() {
    startTransition(() => setAdvanced({}));
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      {/* Search bar + Filters toggle */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search hash, node..."
            className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`relative flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
            filtersOpen
              ? "border-primary-500 bg-primary-600/10 text-primary-500"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          Filters
          {hasActiveAdvanced && !filtersOpen && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary-500" />
          )}
        </button>
      </div>

      {/* Status pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ALL_STATUSES.map((status) => {
          const key = status ?? "all";
          const label = STATUS_LABELS[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                startTransition(() => setStatusFilter(status))
              }
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === status
                  ? "bg-primary-600/10 text-primary-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              style={{ transitionDuration: "var(--duration-fast)" }}
            >
              {label}{" "}
              <span className="tabular-nums opacity-70">
                ({formatCount(status)})
              </span>
            </button>
          );
        })}
      </div>

      {/* Collapsible advanced filters */}
      <CollapsibleSection open={filtersOpen}>
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-border bg-muted/30 p-3">
          {/* VM Type multi-select */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">Type:</span>
            {ALL_VM_TYPES.map((type) => {
              const selected =
                !advanced.vmTypes || advanced.vmTypes.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleVmType(type)}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                    selected
                      ? "bg-primary-600/10 text-primary-500"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>

          {/* Payment Status multi-select */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">Payment:</span>
            {ALL_PAYMENT_STATUSES.map((ps) => {
              const selected =
                !advanced.paymentStatuses ||
                advanced.paymentStatuses.has(ps);
              return (
                <button
                  key={ps}
                  type="button"
                  onClick={() => togglePaymentStatus(ps)}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors ${
                    selected
                      ? "bg-primary-600/10 text-primary-500"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {ps}
                </button>
              );
            })}
          </div>

          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
            <Checkbox
              size="xs"
              checked={advanced.hasAllocatedNode ?? false}
              onCheckedChange={(v) =>
                updateAdvanced({
                  hasAllocatedNode: v === true || undefined,
                })
              }
            />
            Has Node
          </label>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>vCPUs &ge;</span>
            <input
              type="number"
              min={0}
              value={advanced.minVcpus ?? ""}
              onChange={(e) =>
                updateAdvanced({
                  minVcpus: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              className="h-7 w-16 rounded border border-border bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Mem &ge;</span>
            <input
              type="number"
              min={0}
              value={advanced.minMemoryMb ?? ""}
              onChange={(e) =>
                updateAdvanced({
                  minMemoryMb: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              className="h-7 w-16 rounded border border-border bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="MB"
            />
          </div>

          {hasActiveAdvanced && (
            <button
              type="button"
              onClick={clearAdvanced}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      </CollapsibleSection>

      <Table
        columns={columns}
        data={displayedRows}
        keyExtractor={(r) => r.hash}
        onRowClick={(r) => onSelectVM(r.hash)}
        activeKey={selectedKey}
      />
    </TooltipProvider>
  );
}
```

**Step 3: Update `src/app/vms/page.tsx`**

- Add: `const queryParam = searchParams.get("q") ?? "";`
- Add prop: `initialQuery={queryParam}` on `<VMTable>`

**Step 4: Run checks**

Run: `pnpm check`
Expected: lint + typecheck + tests all pass.

**Step 5: Commit**

```bash
git add src/components/vm-table.tsx src/app/vms/page.tsx
git commit -m "feat: add search, count badges, and advanced filters to VMTable"
```

---

### Task 6: Remove unused code from hooks and API client

Now that both tables fetch the full dataset and filter client-side, the `NodeFilters` passed to `useNodes()` and the `VmFilters` status param passed to `useVMs()` are no longer used from the table components. The hooks and API client still support filters for other callers (e.g. overview page uses `getNodes()`), so keep the functions but verify no callers pass stale filter objects.

**Files:**
- Modify: `src/hooks/use-nodes.ts` — no changes needed (hook already accepts optional filters)
- Check: `src/hooks/use-vms.ts` — no changes needed
- Check: `src/api/types.ts` — `NodeFilters` type is still used by `applyNodeFilters` in client.ts

**Step 1: Verify no stale filter usage**

Run: `rg "useNodes\(" src/ --type ts`
Run: `rg "useVMs\(" src/ --type ts`

Confirm that `node-table.tsx` now calls `useNodes()` with no args, and `vm-table.tsx` calls `useVMs()` with no args.

**Step 2: Commit (if any cleanup needed)**

```bash
git commit -m "chore: remove stale filter params from table hook calls"
```

---

### Task 7: Visual verification

**Step 1: Start dev server**

Run: `pnpm dev`

**Step 2: Verify Nodes page**

- [ ] Search input visible with placeholder "Search hash, owner, name..."
- [ ] Typing filters rows after 300ms debounce
- [ ] Clear (x) button clears search
- [ ] Status pills show count badges
- [ ] Count badges show filtered/total format when search or advanced filters active
- [ ] "Filters" button toggles collapsible section
- [ ] Collapsible section animates smoothly (push-down, not overlay)
- [ ] Has VMs, Staked, IPv6 checkboxes work
- [ ] CPU/Memory/Disk range inputs filter correctly
- [ ] "Clear all" resets advanced filters
- [ ] Dot indicator appears on Filters button when collapsed with active filters
- [ ] `?q=test` in URL pre-fills search
- [ ] `?status=healthy` still works

**Step 3: Verify VMs page**

- [ ] Search input visible with placeholder "Search hash, node..."
- [ ] VM Type multi-select pills work (toggling deselects/selects)
- [ ] Payment Status multi-select pills work
- [ ] Has Node checkbox works
- [ ] vCPUs and Memory range inputs work
- [ ] Count badges and collapsible animation same as Nodes page
- [ ] `?q=` and `?status=` URL params work

**Step 4: Run final checks**

Run: `pnpm check`
Expected: All pass.

---

### Task 8: Update docs

- [ ] `docs/ARCHITECTURE.md` — document the filter pipeline pattern (textSearch -> advancedFilters -> countByStatus -> statusFilter), the CollapsibleSection component, and the useDebounce hook
- [ ] `docs/DECISIONS.md` — log decision: all filtering client-side post-fetch (not in query keys), status applied last for count badge accuracy, CSS grid-template-rows for animation
- [ ] `docs/BACKLOG.md` — move this feature to Completed section
- [ ] `CLAUDE.md` — update Current Features list to mention text search, count badges, collapsible advanced filters on both list pages
