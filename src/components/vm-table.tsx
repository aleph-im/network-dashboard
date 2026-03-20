"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@aleph-front/ds/tooltip";
import { ShieldCheck } from "@phosphor-icons/react";
import { Checkbox } from "@aleph-front/ds/checkbox";
import { Slider } from "@aleph-front/ds/slider";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { useVMs } from "@/hooks/use-vms";
import { useVMMessageInfo } from "@/hooks/use-vm-creation-times";
import { useDebounce } from "@/hooks/use-debounce";
import { FilterToolbar } from "@/components/filter-toolbar";
import { FilterPanel } from "@/components/filter-panel";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import {
  textSearch,
  countByStatus,
  applyVmAdvancedFilters,
  VM_VCPUS_MAX,
  VM_MEMORY_MB_MAX,
  type VmAdvancedFilters,
} from "@/lib/filters";
import { VM_STATUS_VARIANT } from "@/lib/status-map";
import { relativeTime } from "@/lib/format";
import type { AlephMessageInfo, VM, VmStatus, VmType } from "@/api/types";

const STATUS_PILLS: { value: VmStatus | undefined; label: string; tooltip?: string }[] = [
  { value: undefined, label: "All" },
  { value: "dispatched", label: "Dispatched", tooltip: "Running on the correct node" },
  { value: "orphaned", label: "Orphaned", tooltip: "Running without active scheduling intent" },
  { value: "missing", label: "Missing", tooltip: "Scheduled but not found on any node" },
  { value: "misplaced", label: "Misplaced", tooltip: "Running on wrong node(s), not on assigned node" },
  { value: "duplicated", label: "Duplicated", tooltip: "Running on correct node plus extra copies" },
  { value: "scheduled", label: "Scheduled", tooltip: "Assigned to a node but not yet observed" },
  { value: "unscheduled", label: "Unscheduled", tooltip: "Deliberately unscheduled" },
  { value: "unschedulable", label: "Unschedulable", tooltip: "No node meets this VM's requirements" },
  { value: "unknown", label: "Unknown", tooltip: "Status could not be determined" },
];

const ALL_VM_TYPES: VmType[] = [
  "microvm",
  "persistent_program",
  "instance",
];
const ALL_PAYMENT_STATUSES = ["validated", "invalidated"] as const;

const VM_TYPE_OPTIONS: {
  value: VmType;
  label: string;
  desc: string;
}[] = [
  {
    value: "microvm",
    label: "Micro VM",
    desc: "— short-lived functions",
  },
  {
    value: "persistent_program",
    label: "Persistent Program",
    desc: "— always-on services",
  },
  {
    value: "instance",
    label: "Instance",
    desc: "— full virtual machines",
  },
];

const PAYMENT_OPTIONS: {
  value: string;
  label: string;
  desc: string;
}[] = [
  {
    value: "validated",
    label: "Validated",
    desc: "— payment confirmed",
  },
  {
    value: "invalidated",
    label: "Invalidated",
    desc: "— payment rejected or expired",
  },
];

const VM_BASE_SEARCH_FIELDS = (v: VM) => [v.hash, v.allocatedNode];

const COMPACT_HIDDEN_HEADERS = new Set(["Type", "Node", "Last Updated"]);

function buildColumns(
  msgInfo: Map<string, AlephMessageInfo> | undefined,
  compact?: boolean,
): Column<VM>[] {
  const all: Column<VM>[] = [
  {
    header: "Status",
    accessor: (r) => (
      <Badge fill="outline"
        variant={VM_STATUS_VARIANT[r.status]}
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
    accessor: (r) => (
      <CopyableText
        text={r.hash}
        startChars={8}
        endChars={8}
        size="sm"
        {...(msgInfo?.get(r.hash)?.explorerUrl ? { href: msgInfo.get(r.hash)!.explorerUrl } : {})}
      />
    ),
    sortable: true,
    sortValue: (r) => r.hash,
  },
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
  {
    header: "Type",
    accessor: (r) => (
      <Badge fill="outline" variant="default" size="sm">
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
        <CopyableText
          text={r.allocatedNode}
          startChars={8}
          endChars={8}
          size="sm"
        />
      ) : (
        <span className="text-xs text-muted-foreground">None</span>
      ),
    sortable: true,
    sortValue: (r) => r.allocatedNode ?? "",
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
  {
    header: "Last Updated",
    accessor: (r) => (
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {relativeTime(r.updatedAt)}
      </span>
    ),
    sortable: true,
    sortValue: (r) => new Date(r.updatedAt).getTime(),
    align: "right",
  },
  ];
  return compact ? all.filter((c) => !COMPACT_HIDDEN_HEADERS.has(c.header)) : all;
}

type VMTableProps = {
  onSelectVM: (hash: string) => void;
  initialStatus?: VmStatus;
  initialQuery?: string;
  selectedKey?: string;
  compact?: boolean;
  sidePanel?: React.ReactNode;
};

export function VMTable({
  onSelectVM,
  initialStatus,
  initialQuery,
  selectedKey,
  compact,
  sidePanel,
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

  // Data — fetch full dataset
  const { data: allVms, isLoading } = useVMs();
  const hashes = useMemo(() => (allVms ?? []).map((v) => v.hash), [allVms]);
  const { data: messageInfo } = useVMMessageInfo(hashes);

  // Filter pipeline
  const { displayedRows, filteredCounts, unfilteredCounts } =
    useMemo(() => {
      const all = allVms ?? [];
      const uCounts = countByStatus(all, (v) => v.status);

      const vmSearchFields = (v: VM) => [
        ...VM_BASE_SEARCH_FIELDS(v),
        messageInfo?.get(v.hash)?.name,
      ];
      const afterSearch = textSearch(
        all,
        debouncedQuery,
        vmSearchFields,
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
    }, [allVms, debouncedQuery, advanced, statusFilter, messageInfo]);

  const {
    page, pageSize, totalPages, startItem, endItem,
    totalItems, pageItems, setPage, setPageSize,
  } = usePagination(displayedRows);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, advanced, statusFilter, setPage]);

  const hasNonStatusFilters =
    debouncedQuery.trim() !== "" || activeAdvancedCount > 0;

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
      <div className="space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
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
        searchPlaceholder="Search hash, name, node..."
      />

      <FilterPanel
        open={filtersOpen}
        activeCount={activeAdvancedCount}
        onReset={clearAdvanced}
      >
        <div className="grid grid-cols-1 gap-8 p-6 pb-8 sm:grid-cols-2 sm:p-8 sm:pb-10 lg:grid-cols-3 lg:gap-10">
            {/* VM Type */}
            <div>
              <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                VM Type
              </span>
              <div className="space-y-2.5">
                {VM_TYPE_OPTIONS.map(({ value, label, desc }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none"
                  >
                    <Checkbox
                      size="sm"
                      checked={
                        !advanced.vmTypes ||
                        advanced.vmTypes.has(value)
                      }
                      onCheckedChange={() =>
                        toggleVmType(value)
                      }
                    />
                    <span>
                      {label}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                        {desc}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Payment & Allocation */}
            <div>
              <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                Payment & Allocation
              </span>
              <div className="space-y-2.5">
                {PAYMENT_OPTIONS.map(({ value, label, desc }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none"
                  >
                    <Checkbox
                      size="sm"
                      checked={
                        !advanced.paymentStatuses ||
                        advanced.paymentStatuses.has(value)
                      }
                      onCheckedChange={() =>
                        togglePaymentStatus(value)
                      }
                    />
                    <span>
                      {label}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                        {desc}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-2.5 border-t border-white/[0.04] pt-2.5" />
              <div className="space-y-2.5">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none">
                  <Checkbox
                    size="sm"
                    checked={advanced.hasAllocatedNode ?? false}
                    onCheckedChange={(v) =>
                      updateAdvanced((p) => {
                        const { hasAllocatedNode: _, ...rest } =
                          p;
                        return v === true
                          ? { ...rest, hasAllocatedNode: true }
                          : rest;
                      })
                    }
                  />
                  <span>
                    Allocated to a node
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                      — running on a CRN
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-muted-foreground select-none">
                  <Checkbox
                    size="sm"
                    checked={advanced.requiresGpu ?? false}
                    onCheckedChange={(v) =>
                      updateAdvanced((p) => {
                        const { requiresGpu: _, ...rest } = p;
                        return v === true
                          ? { ...rest, requiresGpu: true }
                          : rest;
                      })
                    }
                  />
                  <span>
                    Requires GPU
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                      — needs GPU hardware
                    </span>
                  </span>
                </label>
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
              </div>
            </div>

            {/* Requirements */}
            <div>
              <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                Requirements
              </span>
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                    <span>vCPUs</span>
                    <span className="tabular-nums text-xs">
                      {advanced.vcpusRange?.[0] ?? 0}–
                      {advanced.vcpusRange?.[1] ?? VM_VCPUS_MAX}
                    </span>
                  </div>
                  <Slider
                    size="sm"
                    min={0}
                    max={VM_VCPUS_MAX}
                    step={1}
                    value={
                      advanced.vcpusRange ?? [0, VM_VCPUS_MAX]
                    }
                    onValueChange={(val) =>
                      updateAdvanced((p) => ({
                        ...p,
                        vcpusRange: val as [number, number],
                      }))
                    }
                    showTooltip
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                    <span>Memory</span>
                    <span className="tabular-nums text-xs">
                      {advanced.memoryMbRange?.[0] ?? 0} MB–
                      {advanced.memoryMbRange?.[1] ??
                        VM_MEMORY_MB_MAX}{" "}
                      MB
                    </span>
                  </div>
                  <Slider
                    size="sm"
                    min={0}
                    max={VM_MEMORY_MB_MAX}
                    step={256}
                    value={
                      advanced.memoryMbRange ??
                      [0, VM_MEMORY_MB_MAX]
                    }
                    onValueChange={(val) =>
                      updateAdvanced((p) => ({
                        ...p,
                        memoryMbRange: val as [number, number],
                      }))
                    }
                    showTooltip
                  />
                </div>
              </div>
            </div>
        </div>
      </FilterPanel>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <Table
            columns={buildColumns(messageInfo, compact)}
            data={pageItems}
            keyExtractor={(r) => r.hash}
            onRowClick={(r) => onSelectVM(r.hash)}
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
        </div>
        {sidePanel}
      </div>
    </TooltipProvider>
  );
}
