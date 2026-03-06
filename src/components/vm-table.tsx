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
import { Button } from "@aleph-front/ds/button";
import { Input } from "@aleph-front/ds/input";
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
        const { vmTypes: _, ...rest } = prev;
        return next.size === ALL_VM_TYPES.length
          ? rest
          : { ...rest, vmTypes: next };
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
        const { paymentStatuses: _, ...rest } = prev;
        return next.size === ALL_PAYMENT_STATUSES.length
          ? rest
          : { ...rest, paymentStatuses: next };
      });
    });
  }

  function updateAdvanced(
    updater: (prev: VmAdvancedFilters) => VmAdvancedFilters,
  ) {
    startTransition(() => setAdvanced(updater));
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
            placeholder="Search hash, node..."
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
                updateAdvanced((p) => {
                  const { hasAllocatedNode: _, ...rest } = p;
                  return v === true
                    ? { ...rest, hasAllocatedNode: true }
                    : rest;
                })
              }
            />
            Has Node
          </label>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>vCPUs &ge;</span>
            <Input
              size="sm"
              type="number"
              min={0}
              value={advanced.minVcpus ?? ""}
              onChange={(e) =>
                updateAdvanced((p) => {
                  const { minVcpus: _, ...rest } = p;
                  return e.target.value
                    ? { ...rest, minVcpus: Number(e.target.value) }
                    : rest;
                })
              }
              className="w-18 tabular-nums"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Mem &ge;</span>
            <Input
              size="sm"
              type="number"
              min={0}
              value={advanced.minMemoryMb ?? ""}
              onChange={(e) =>
                updateAdvanced((p) => {
                  const { minMemoryMb: _, ...rest } = p;
                  return e.target.value
                    ? { ...rest, minMemoryMb: Number(e.target.value) }
                    : rest;
                })
              }
              className="w-18 tabular-nums"
              placeholder="MB"
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
        data={displayedRows}
        keyExtractor={(r) => r.hash}
        onRowClick={(r) => onSelectVM(r.hash)}
        activeKey={selectedKey}
      />
    </TooltipProvider>
  );
}
