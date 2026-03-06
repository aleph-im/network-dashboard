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
import { Button } from "@aleph-front/ds/button";
import { Input } from "@aleph-front/ds/input";
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
  const [advanced, setAdvanced] = useState<NodeAdvancedFilters>(
    initialHasVms ? { hasVms: true } : {},
  );

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
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
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
            size="sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search hash, owner, name..."
            className="pl-10 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
        <Button
          variant="text"
          size="xs"
          onClick={() => setFiltersOpen((v) => !v)}
          className="relative"
        >
          Filters
          {hasActiveAdvanced && !filtersOpen && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary-500" />
          )}
        </Button>
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
                updateAdvanced((p) => {
                  const { hasVms: _, ...rest } = p;
                  return v === true ? { ...rest, hasVms: true } : rest;
                })
              }
            />
            Has VMs
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
            <Checkbox
              size="xs"
              checked={advanced.staked ?? false}
              onCheckedChange={(v) =>
                updateAdvanced((p) => {
                  const { staked: _, ...rest } = p;
                  return v === true ? { ...rest, staked: true } : rest;
                })
              }
            />
            Staked
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
            <Checkbox
              size="xs"
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
            IPv6
          </label>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>CPU &ge;</span>
            <Input
              size="sm"
              type="number"
              min={0}
              max={100}
              value={advanced.minCpu ?? ""}
              onChange={(e) =>
                updateAdvanced((p) => {
                  const { minCpu: _, ...rest } = p;
                  return e.target.value
                    ? { ...rest, minCpu: Number(e.target.value) }
                    : rest;
                })
              }
              className="w-18 tabular-nums"
              placeholder="%"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Mem &ge;</span>
            <Input
              size="sm"
              type="number"
              min={0}
              max={100}
              value={advanced.minMemory ?? ""}
              onChange={(e) =>
                updateAdvanced((p) => {
                  const { minMemory: _, ...rest } = p;
                  return e.target.value
                    ? { ...rest, minMemory: Number(e.target.value) }
                    : rest;
                })
              }
              className="w-18 tabular-nums"
              placeholder="%"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Disk &ge;</span>
            <Input
              size="sm"
              type="number"
              min={0}
              max={100}
              value={advanced.minDisk ?? ""}
              onChange={(e) =>
                updateAdvanced((p) => {
                  const { minDisk: _, ...rest } = p;
                  return e.target.value
                    ? { ...rest, minDisk: Number(e.target.value) }
                    : rest;
                })
              }
              className="w-18 tabular-nums"
              placeholder="%"
            />
          </div>

          {hasActiveAdvanced && (
            <Button
              variant="text"
              size="xs"
              onClick={clearAdvanced}
              className="ml-auto"
            >
              Clear all
            </Button>
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
