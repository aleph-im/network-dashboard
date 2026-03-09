"use client";

import { useState, useTransition, useMemo } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import { TooltipProvider } from "@aleph-front/ds/tooltip";
import { Checkbox } from "@aleph-front/ds/checkbox";
import { Button } from "@aleph-front/ds/button";
import { Input } from "@aleph-front/ds/input";
import { Slider } from "@aleph-front/ds/slider";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useVMs } from "@/hooks/use-vms";
import { useVMMessageInfo } from "@/hooks/use-vm-creation-times";
import { useDebounce } from "@/hooks/use-debounce";
import { CollapsibleSection } from "@/components/collapsible-section";
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
import type { AlephMessageInfo, VM, VmStatus, VmType } from "@/api/types";

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

function isDiscrepancy(vm: VM): boolean {
  return (
    vm.status === "orphaned" ||
    vm.status === "missing" ||
    vm.status === "unschedulable"
  );
}

function buildColumns(
  msgInfo: Map<string, AlephMessageInfo> | undefined,
): Column<VM>[] {
  return [
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
    header: "Hash",
    accessor: (r) => (
      <CopyableText
        text={r.hash}
        startChars={10}
        endChars={4}
        size="sm"
        className={isDiscrepancy(r) ? "text-warning-400" : ""}
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
      return name ? (
        <span className="text-sm">{name}</span>
      ) : (
        <span className="text-xs text-muted-foreground">{"\u2014"}</span>
      );
    },
    sortable: true,
    sortValue: (r) => msgInfo?.get(r.hash)?.name ?? "",
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
        <CopyableText
          text={r.allocatedNode}
          startChars={8}
          endChars={4}
          size="sm"
          className="text-muted-foreground"
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
  ];
}

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
  >(initialStatus ?? "scheduled");

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
            placeholder="Search hash, name, node..."
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
              <div className="border-t border-white/[0.04] pt-1.5" />
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
        </div>
      </CollapsibleSection>

      <Table
        columns={buildColumns(messageInfo)}
        data={displayedRows}
        keyExtractor={(r) => r.hash}
        onRowClick={(r) => onSelectVM(r.hash)}
        activeKey={selectedKey}
      />
    </TooltipProvider>
  );
}
