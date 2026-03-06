"use client";

import { useState, useTransition, useMemo } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { TooltipProvider } from "@aleph-front/ds/tooltip";
import { Checkbox } from "@aleph-front/ds/checkbox";
import { Badge } from "@aleph-front/ds/badge";
import { Button } from "@aleph-front/ds/button";
import { Input } from "@aleph-front/ds/input";
import { Slider } from "@aleph-front/ds/slider";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useNodes } from "@/hooks/use-nodes";
import { useDebounce } from "@/hooks/use-debounce";
import { CollapsibleSection } from "@/components/collapsible-section";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { relativeTime } from "@/lib/format";
import {
  textSearch,
  countByStatus,
  applyNodeAdvancedFilters,
  isRangeActive,
  NODE_VM_COUNT_MAX,
  NODE_VCPUS_MAX,
  NODE_MEMORY_GB_MAX,
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
    header: "Hash",
    accessor: (r) => <CopyableText text={r.hash} startChars={10} endChars={4} size="sm" />,
    sortable: true,
    sortValue: (r) => r.hash,
  },
  {
    header: "Name",
    accessor: (r) =>
      r.name ? (
        <span className="text-sm">{r.name}</span>
      ) : (
        <span className="text-xs text-muted-foreground">{"\u2014"}</span>
      ),
    sortable: true,
    sortValue: (r) => r.name ?? "",
  },
  {
    header: "vCPUs",
    accessor: (r) => (
      <span className="text-xs tabular-nums">
        {r.resources?.vcpusTotal ?? "\u2014"}
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.resources?.vcpusTotal ?? 0,
    align: "right",
  },
  {
    header: "Memory",
    accessor: (r) => {
      const mb = r.resources?.memoryTotalMb;
      if (mb == null) return <span className="text-xs">{"\u2014"}</span>;
      const gb = mb / 1024;
      return (
        <span className="text-xs tabular-nums">
          {gb % 1 === 0 ? gb : gb.toFixed(1)} GB
        </span>
      );
    },
    sortable: true,
    sortValue: (r) => r.resources?.memoryTotalMb ?? 0,
    align: "right",
  },
  {
    header: "VMs",
    accessor: (r) => (
      <span className="tabular-nums">{r.vmCount}</span>
    ),
    sortable: true,
    sortValue: (r) => r.vmCount,
    align: "right",
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
  >(initialStatus ?? "healthy");

  // Advanced filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advanced, setAdvanced] = useState<NodeAdvancedFilters>(
    initialHasVms
      ? { vmCountRange: [1, NODE_VM_COUNT_MAX] }
      : {},
  );

  const activeAdvancedCount = [
    advanced.staked,
    advanced.supportsIpv6,
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
    debouncedQuery.trim() !== "" || activeAdvancedCount > 0;

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

  function updateAdvanced(
    updater: (prev: NodeAdvancedFilters) => NodeAdvancedFilters,
  ) {
    startTransition(() => setAdvanced(updater));
  }

  function clearAdvanced() {
    startTransition(() => setAdvanced({}));
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      {/* Status pills + Filters toggle + Search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                statusFilter === status
                  ? "bg-primary-600/15 text-primary-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {label}{" "}
              <span className="tabular-nums opacity-60">
                ({formatCount(status)})
              </span>
            </button>
          );
        })}
        <Button
          variant="text"
          size="sm"
          onClick={() => setFiltersOpen((v) => !v)}
          className="relative"
        >
          Filters
          {activeAdvancedCount > 0 && !filtersOpen && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary-500" />
          )}
        </Button>
        <div className="relative ml-auto w-64">
          <svg
            className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
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
          <Input
            size="md"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search hash, owner, name..."
            className="pl-12 pr-10"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Collapsible advanced filters */}
      <CollapsibleSection open={filtersOpen}>
        <div className="stat-card mb-4 border border-white/[0.06] bg-white/[0.03]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Advanced Filters
            </span>
            <Button
              variant="text"
              size="xs"
              onClick={clearAdvanced}
              disabled={activeAdvancedCount === 0}
              className="disabled:opacity-30"
            >
              Reset
              {activeAdvancedCount > 0 && (
                <span className="ml-1 tabular-nums">
                  ({activeAdvancedCount})
                </span>
              )}
            </Button>
          </div>

          {/* Content: three-column layout */}
          <div className="grid grid-cols-1 gap-8 p-6 pb-8 sm:grid-cols-2 sm:p-8 sm:pb-10 lg:grid-cols-3 lg:gap-10">
            {/* Properties */}
            <div>
              <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                Properties
              </span>
              <div className="space-y-2.5">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none">
                  <Checkbox
                    size="sm"
                    checked={advanced.staked ?? false}
                    onCheckedChange={(v) =>
                      updateAdvanced((p) => {
                        const { staked: _, ...rest } = p;
                        return v === true
                          ? { ...rest, staked: true }
                          : rest;
                      })
                    }
                  />
                  <span>
                    Staked
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                      — linked to ALEPH token stake
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none">
                  <Checkbox
                    size="sm"
                    checked={advanced.supportsIpv6 ?? false}
                    onCheckedChange={(v) =>
                      updateAdvanced((p) => {
                        const { supportsIpv6: _, ...rest } = p;
                        return v === true
                          ? { ...rest, supportsIpv6: true }
                          : rest;
                      })
                    }
                  />
                  <span>
                    IPv6
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                      — supports IPv6 networking
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Workload */}
            <div>
              <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                Workload
              </span>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                  <span>VM Count</span>
                  <span className="tabular-nums text-xs">
                    {advanced.vmCountRange?.[0] ?? 0}–
                    {advanced.vmCountRange?.[1] ??
                      NODE_VM_COUNT_MAX}
                  </span>
                </div>
                <Slider
                  size="sm"
                  min={0}
                  max={NODE_VM_COUNT_MAX}
                  step={1}
                  value={
                    advanced.vmCountRange ??
                    [0, NODE_VM_COUNT_MAX]
                  }
                  onValueChange={(val) =>
                    updateAdvanced((p) => ({
                      ...p,
                      vmCountRange: val as [number, number],
                    }))
                  }
                  showTooltip
                />
              </div>
            </div>

            {/* Hardware */}
            <div>
              <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                Hardware
              </span>
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                    <span>vCPUs</span>
                    <span className="tabular-nums text-xs">
                      {advanced.vcpusTotalRange?.[0] ?? 0}–
                      {advanced.vcpusTotalRange?.[1] ??
                        NODE_VCPUS_MAX}
                    </span>
                  </div>
                  <Slider
                    size="sm"
                    min={0}
                    max={NODE_VCPUS_MAX}
                    step={1}
                    value={
                      advanced.vcpusTotalRange ??
                      [0, NODE_VCPUS_MAX]
                    }
                    onValueChange={(val) =>
                      updateAdvanced((p) => ({
                        ...p,
                        vcpusTotalRange: val as [number, number],
                      }))
                    }
                    showTooltip
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                    <span>Memory</span>
                    <span className="tabular-nums text-xs">
                      {advanced.memoryTotalGbRange?.[0] ?? 0} GB–
                      {advanced.memoryTotalGbRange?.[1] ??
                        NODE_MEMORY_GB_MAX}{" "}
                      GB
                    </span>
                  </div>
                  <Slider
                    size="sm"
                    min={0}
                    max={NODE_MEMORY_GB_MAX}
                    step={1}
                    value={
                      advanced.memoryTotalGbRange ??
                      [0, NODE_MEMORY_GB_MAX]
                    }
                    onValueChange={(val) =>
                      updateAdvanced((p) => ({
                        ...p,
                        memoryTotalGbRange: val as [
                          number,
                          number,
                        ],
                      }))
                    }
                    showTooltip
                  />
                </div>
              </div>
            </div>
          </div>
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
