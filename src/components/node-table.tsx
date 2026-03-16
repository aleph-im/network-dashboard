"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { StatusDot } from "@aleph-front/ds/status-dot";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@aleph-front/ds/tooltip";
import { ShieldCheck } from "@phosphor-icons/react";
import { Checkbox } from "@aleph-front/ds/checkbox";
import { Badge } from "@aleph-front/ds/badge";
import { Slider } from "@aleph-front/ds/slider";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { useNodes } from "@/hooks/use-nodes";
import { useDebounce } from "@/hooks/use-debounce";
import { FilterToolbar } from "@/components/filter-toolbar";
import { FilterPanel } from "@/components/filter-panel";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { relativeTime, formatGpuLabel, formatCpuLabel } from "@/lib/format";
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

const STATUS_PILLS: { value: NodeStatus | undefined; label: string; tooltip?: string }[] = [
  { value: undefined, label: "All" },
  { value: "healthy", label: "Healthy", tooltip: "Online and responding normally" },
  { value: "unreachable", label: "Unreachable", tooltip: "Not responding to health checks" },
  { value: "unknown", label: "Unknown", tooltip: "Status could not be determined" },
  { value: "removed", label: "Removed", tooltip: "Deregistered from the scheduler" },
];

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
      <Badge fill="outline"
        variant={NODE_STATUS_VARIANT[r.status]}
        size="sm"
      >
        {r.status}
      </Badge>
    ),
    sortable: true,
    sortValue: (r) => r.status,
  },
  {
    header: "Hash",
    accessor: (r) => <CopyableText text={r.hash} startChars={8} endChars={8} size="sm" />,
    sortable: true,
    sortValue: (r) => r.hash,
  },
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
    header: "CPU",
    accessor: (r) => (
      <span className="text-xs">
        {formatCpuLabel(r.cpuVendor, r.cpuArchitecture)}
      </span>
    ),
    sortable: true,
    sortValue: (r) => formatCpuLabel(r.cpuVendor, r.cpuArchitecture),
  },
  {
    header: "GPU",
    accessor: (r) => {
      const allGpus = [...r.gpus.used, ...r.gpus.available];
      if (allGpus.length === 0) return null;
      return (
        <Badge fill="outline" variant="default" size="sm">
          {formatGpuLabel(allGpus)}
        </Badge>
      );
    },
    sortable: true,
    sortValue: (r) => r.gpus.used.length + r.gpus.available.length,
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

const COMPACT_HIDDEN_HEADERS = new Set(["CPU", "GPU", "VMs"]);

type NodeTableProps = {
  onSelectNode: (hash: string) => void;
  initialStatus?: NodeStatus;
  initialHasVms?: boolean;
  initialSort?: SortConfig;
  initialQuery?: string;
  selectedKey?: string;
  compact?: boolean;
};

export function NodeTable({
  onSelectNode,
  initialStatus,
  initialHasVms,
  initialSort,
  initialQuery,
  selectedKey,
  compact,
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
    advanced.hasGpu,
    advanced.confidentialComputing,
    advanced.cpuVendors != null &&
      advanced.cpuVendors.size > 0 &&
      advanced.cpuVendors.size < 2,
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

  const {
    page, pageSize, totalPages, startItem, endItem,
    totalItems, pageItems, setPage, setPageSize,
  } = usePagination(sortedRows);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, advanced, statusFilter, setPage]);

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
        searchPlaceholder="Search hash, owner, name..."
      />

      <FilterPanel
        open={filtersOpen}
        activeCount={activeAdvancedCount}
        onReset={clearAdvanced}
      >
        <div className="grid grid-cols-1 gap-8 p-6 pb-8 sm:grid-cols-2 sm:p-8 sm:pb-10 lg:grid-cols-4 lg:gap-10">
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
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none">
                  <Checkbox
                    size="sm"
                    checked={advanced.hasGpu ?? false}
                    onCheckedChange={(v) =>
                      updateAdvanced((p) => {
                        const { hasGpu: _, ...rest } = p;
                        return v === true
                          ? { ...rest, hasGpu: true }
                          : rest;
                      })
                    }
                  />
                  <span>
                    Has GPU
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                      — has one or more GPUs
                    </span>
                  </span>
                </label>
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
              </div>
            </div>

            {/* CPU Vendor */}
            <div>
              <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                CPU Vendor
              </span>
              <div className="space-y-2.5">
                {(
                  [
                    ["AuthenticAMD", "AMD"],
                    ["GenuineIntel", "Intel"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none"
                  >
                    <Checkbox
                      size="sm"
                      checked={advanced.cpuVendors?.has(value) ?? false}
                      onCheckedChange={(checked) =>
                        updateAdvanced((p) => {
                          const next = new Set(p.cpuVendors);
                          if (checked === true) {
                            next.add(value);
                          } else {
                            next.delete(value);
                          }
                          return next.size > 0
                            ? { ...p, cpuVendors: next }
                            : (() => {
                                const { cpuVendors: _, ...rest } = p;
                                return rest;
                              })();
                        })
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
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
      </FilterPanel>

      <Table
        columns={compact ? columns.filter((c) => !COMPACT_HIDDEN_HEADERS.has(c.header)) : columns}
        data={pageItems}
        keyExtractor={(r) => r.hash}
        onRowClick={(r) => onSelectNode(r.hash)}
        activeKey={selectedKey}
      />

      <TablePagination
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        startItem={startItem}
        endItem={endItem}
        totalItems={totalItems}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </TooltipProvider>
  );
}
