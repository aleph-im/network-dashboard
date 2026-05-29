"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
import { Input } from "@aleph-front/ds/input";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { useVMs } from "@/hooks/use-vms";
import { useVMMessageInfo } from "@/hooks/use-vm-creation-times";
import { useDebounce } from "@/hooks/use-debounce";
import { FilterToolbar } from "@/components/filter-toolbar";
import { FilterPanel } from "@/components/filter-panel";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";
import {
  textSearch,
  countByStatus,
  applyRetentionWindow,
  applyVmAdvancedFilters,
  computeVmFilterMaxes,
  DEFAULT_RETENTION,
  RETENTION_WINDOWS,
  type RetentionWindow,
  type VmAdvancedFilters,
} from "@/lib/filters";
import { applySort, type SortDirection } from "@/lib/sort";
import { VM_STATUS_VARIANT } from "@/lib/status-map";
import { relativeTime } from "@/lib/format";
import type { AlephMessageInfo, VM, VmStatus, VmType } from "@/api/types";

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

const ALL_VM_TYPES: VmType[] = [
  "micro_vm",
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
    value: "micro_vm",
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
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
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
  initialOwner?: string;
  initialRetention?: RetentionWindow;
  selectedKey?: string;
  compact?: boolean;
  sidePanel?: React.ReactNode;
};

export function VMTable({
  onSelectVM,
  initialStatus,
  initialQuery,
  initialOwner,
  initialRetention,
  selectedKey,
  compact,
  sidePanel,
}: VMTableProps) {
  const [, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Search
  const [searchInput, setSearchInput] = useState(initialQuery ?? "");
  const debouncedQuery = useDebounce(searchInput, 300);

  // Owner address filter — server-side via ?owners=.
  // Raw input is local; passed to the query only when valid + debounced.
  const [ownerInput, setOwnerInput] = useState(initialOwner ?? "");
  const debouncedOwner = useDebounce(ownerInput, 500);
  const validOwner = /^0x[0-9a-fA-F]{40}$/.test(debouncedOwner)
    ? debouncedOwner
    : "";

  // Status filter
  const [statusFilter, setStatusFilter] = useState<
    VmStatus | undefined
  >(initialStatus);

  // Retention window — the primary "how far back" lens.
  const [retention, setRetention] = useState<RetentionWindow>(
    initialRetention ?? DEFAULT_RETENTION,
  );

  // Sort (controlled — sort runs over the full filtered dataset, then paginated)
  const [sortColumn, setSortColumn] = useState<string | undefined>();
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("asc");

  // Advanced filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advanced, setAdvanced] = useState<VmAdvancedFilters>({});

  // Data — fetch full dataset (or owner-filtered subset when valid)
  const { data: allVms, isLoading } = useVMs(
    validOwner ? { owner: validOwner } : undefined,
  );
  const hashes = useMemo(() => (allVms ?? []).map((v) => v.hash), [allVms]);
  const { data: messageInfo } = useVMMessageInfo(hashes);

  // Slider extents derived from data — power-of-2 ceilings so the slider
  // always covers the full fleet, even as VM requirements grow over time.
  const filterMaxes = useMemo(
    () => computeVmFilterMaxes(allVms ?? []),
    [allVms],
  );

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
        advanced.vcpusRange[1] < filterMaxes.vcpus),
    advanced.memoryGbRange != null &&
      (advanced.memoryGbRange[0] > 0 ||
        advanced.memoryGbRange[1] < filterMaxes.memoryGb),
    validOwner !== "",
  ].filter(Boolean).length;

  // An explicit lookup (hash/name search or owner address) bypasses the
  // retention window — it's a request to find a specific VM, so the match must
  // surface regardless of how recently it was active. Advanced filters like
  // GPU/vCPU ranges are browse-refinement, not lookup, so they stay inside the
  // window.
  const hasLookupQuery =
    debouncedQuery.trim() !== "" || validOwner !== "";

  // Filter pipeline
  const { displayedRows, filteredCounts, unfilteredCounts } =
    useMemo(() => {
      const all = allVms ?? [];
      const uCounts = countByStatus(all, (v) => v.status);

      const vmSearchFields = (v: VM) => [
        ...VM_BASE_SEARCH_FIELDS(v),
        messageInfo?.get(v.hash)?.name,
      ];
      const afterSearch = textSearch(all, debouncedQuery, vmSearchFields);
      const afterAdvanced = applyVmAdvancedFilters(
        afterSearch,
        advanced,
        filterMaxes,
      );

      // The window is the always-on lens — unless an explicit lookup
      // (search/owner) is active, which shows matches regardless of age.
      const afterWindow = hasLookupQuery
        ? afterAdvanced
        : applyRetentionWindow(afterAdvanced, retention, Date.now());

      const fCounts = countByStatus(afterWindow, (v) => v.status);

      const afterStatus = statusFilter
        ? afterWindow.filter((v) => v.status === statusFilter)
        : afterWindow;

      return {
        displayedRows: afterStatus,
        filteredCounts: fCounts,
        unfilteredCounts: uCounts,
      };
    }, [allVms, debouncedQuery, validOwner, hasLookupQuery, retention, advanced, statusFilter, messageInfo, filterMaxes]);

  const tableColumns = useMemo(
    () => buildColumns(messageInfo, compact),
    [messageInfo, compact],
  );

  const sortedRows = useMemo(
    () => applySort(displayedRows, tableColumns, sortColumn, sortDirection),
    [displayedRows, tableColumns, sortColumn, sortDirection],
  );

  const {
    page, pageSize, totalPages, startItem, endItem,
    totalItems, pageItems, setPage, setPageSize,
  } = usePagination(sortedRows);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, advanced, statusFilter, validOwner, retention, setPage]);

  // Persist ?owner= in the URL. Reflects raw input (not just valid) so a
  // reload after a typo restores what the user actually typed.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (ownerInput.trim() === "") {
      params.delete("owner");
    } else {
      params.set("owner", ownerInput);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    // searchParams is read live via .toString(); excluded from deps to avoid
    // ping-pong updates when other params change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerInput, router, pathname]);

  function formatCount(status: VmStatus | undefined): string {
    if (status !== undefined) {
      const filtered = filteredCounts[status] ?? 0;
      if (hasLookupQuery) {
        // Lookup bypasses the window → compare against the all-time count.
        const unfiltered = unfilteredCounts[status] ?? 0;
        return filtered !== unfiltered ? `${filtered}/${unfiltered}` : `${unfiltered}`;
      }
      return `${filtered}`;
    }

    const filteredAll = Object.values(filteredCounts).reduce((a, b) => a + b, 0);
    if (hasLookupQuery) {
      const unfilteredAll = Object.values(unfilteredCounts).reduce((a, b) => a + b, 0);
      return filteredAll !== unfilteredAll ? `${filteredAll}/${unfilteredAll}` : `${unfilteredAll}`;
    }
    return `${filteredAll}`;
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
    startTransition(() => {
      setAdvanced({});
      setOwnerInput("");
    });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("owner");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  // Retention is a primary lens, not an advanced filter — it has its own pill
  // selector and URL param, and Reset leaves it untouched.
  function setRetentionAndUrl(w: RetentionWindow) {
    startTransition(() => setRetention(w));
    const params = new URLSearchParams(searchParams.toString());
    if (w === DEFAULT_RETENTION) {
      params.delete("retention");
    } else {
      params.set("retention", w);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
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
        leading={
          <Tabs
            value={retention}
            onValueChange={(v) => setRetentionAndUrl(v as RetentionWindow)}
          >
            <TabsList variant="pill" size="sm">
              {RETENTION_WINDOWS.map((w) => (
                <TabsTrigger key={w} value={w}>
                  {w === "all" ? "All" : w}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        statuses={STATUS_PILLS}
        activeStatus={statusFilter}
        onStatusChange={(s) => {
          startTransition(() => setStatusFilter(s));
          const params = new URLSearchParams(searchParams.toString());
          if (s) {
            params.set("status", s);
          } else {
            params.delete("status");
          }
          const qs = params.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname);
        }}
        formatCount={formatCount}
        filtersOpen={filtersOpen}
        onFiltersToggle={() => setFiltersOpen((v) => !v)}
        activeFilterCount={activeAdvancedCount}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search hash, name, node..."
        maxVisibleStatuses={4}
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

            {/* Owner */}
            <div>
              <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                Owner address
              </span>
              <Input
                size="sm"
                placeholder="0x…"
                value={ownerInput}
                onChange={(e) => setOwnerInput(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <p className="mt-2 text-xs text-muted-foreground/50">
                Filters server-side. Loads when a complete address is entered.
              </p>
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
                      {advanced.vcpusRange?.[1] ?? filterMaxes.vcpus}
                    </span>
                  </div>
                  <Slider
                    size="sm"
                    min={0}
                    max={filterMaxes.vcpus}
                    step={1}
                    value={
                      advanced.vcpusRange ?? [0, filterMaxes.vcpus]
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
                      {advanced.memoryGbRange?.[0] ?? 0} GB–
                      {advanced.memoryGbRange?.[1] ??
                        filterMaxes.memoryGb}{" "}
                      GB
                    </span>
                  </div>
                  <Slider
                    size="sm"
                    min={0}
                    max={filterMaxes.memoryGb}
                    step={1}
                    value={
                      advanced.memoryGbRange ??
                      [0, filterMaxes.memoryGb]
                    }
                    onValueChange={(val) =>
                      updateAdvanced((p) => ({
                        ...p,
                        memoryGbRange: val as [number, number],
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
            columns={tableColumns}
            data={pageItems}
            keyExtractor={(r) => r.hash}
            onRowClick={(r) => onSelectVM(r.hash)}
            activeKey={selectedKey}
            {...(sortColumn ? { sortColumn } : {})}
            sortDirection={sortDirection}
            onSortChange={(col, dir) => {
              setSortColumn(col);
              setSortDirection(dir);
            }}
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
