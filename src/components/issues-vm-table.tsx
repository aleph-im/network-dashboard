"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import Link from "next/link";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import { Card } from "@aleph-front/ds/card";
import { TooltipProvider } from "@aleph-front/ds/tooltip";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { FilterToolbar } from "@/components/filter-toolbar";
import { textSearch, countByStatus } from "@/lib/filters";
import { VM_STATUS_VARIANT } from "@/lib/status-map";
import { relativeTime } from "@/lib/format";
import type { IssueVM, DiscrepancyStatus } from "@/hooks/use-issues";
import { getIssueDescription } from "@/hooks/use-issues";

type StatusFilter = DiscrepancyStatus | undefined;

const STATUS_PILLS: { value: StatusFilter; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "orphaned", label: "Orphaned" },
  { value: "missing", label: "Missing" },
  { value: "unschedulable", label: "Unschedulable" },
];

const SEARCH_FIELDS = (v: IssueVM) => [
  v.hash,
  v.allocatedNode,
  ...v.observedNodes,
];

const columns: Column<IssueVM>[] = [
  {
    header: "VM Hash",
    accessor: (r) => (
      <CopyableText
        text={r.hash}
        startChars={8}
        endChars={8}
        size="sm"
      />
    ),
    sortable: true,
    sortValue: (r) => r.hash,
  },
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
    header: "Issue",
    accessor: (r) => (
      <span className="text-xs text-muted-foreground">
        {r.issueDescription}
      </span>
    ),
  },
  {
    header: "Scheduled On",
    accessor: (r) =>
      r.allocatedNode ? (
        <CopyableText
          text={r.allocatedNode}
          startChars={8}
          endChars={8}
          size="sm"
        />
      ) : (
        <span className="text-xs text-muted-foreground">{"\u2014"}</span>
      ),
    sortable: true,
    sortValue: (r) => r.allocatedNode ?? "",
  },
  {
    header: "Observed On",
    accessor: (r) => {
      const firstNode = r.observedNodes[0];
      return firstNode ? (
        <span className="inline-flex items-center gap-1">
          <CopyableText text={firstNode} startChars={8} endChars={8} size="sm" />
          {r.observedNodes.length > 1 && (
            <span className="text-xs text-muted-foreground">
              +{r.observedNodes.length - 1}
            </span>
          )}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{"\u2014"}</span>
      );
    },
    sortable: true,
    sortValue: (r) => r.observedNodes[0] ?? "",
  },
  {
    header: "Last Updated",
    accessor: (r) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {relativeTime(r.updatedAt)}
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.updatedAt,
    align: "right",
  },
];

type IssuesVmDetailPanelProps = {
  vm: IssueVM;
  onClose: () => void;
};

function IssuesVmDetailPanel({ vm, onClose }: IssuesVmDetailPanelProps) {
  const status = vm.status as DiscrepancyStatus;

  return (
    <Card
      padding="md"
      variant="ghost"
      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] lg:sticky lg:top-0 lg:w-96"
    >
      <div className="mb-4 flex items-start justify-between">
        <CopyableText text={vm.hash} startChars={8} endChars={8} size="sm" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="text-muted-foreground hover:text-foreground"
        >
          <svg
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Status badge */}
      <div className="mb-4">
        <Badge fill="outline"
          variant={VM_STATUS_VARIANT[vm.status]}
          size="sm"
        >
          {vm.status}
        </Badge>
      </div>

      {/* Schedule vs Reality */}
      <div className="space-y-2 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Schedule vs Reality
        </h4>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Scheduled on</dt>
            <dd>
              {vm.allocatedNode ? (
                <CopyableText
                  text={vm.allocatedNode}
                  startChars={8}
                  endChars={8}
                  size="sm"
                  href={`/nodes?view=${vm.allocatedNode}`}
                  className="text-primary-400"
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  None
                </span>
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Observed on</dt>
            <dd>
              {vm.observedNodes.length > 0 ? (
                <span className="space-y-0.5">
                  {vm.observedNodes.map((n) => (
                    <CopyableText
                      key={n}
                      text={n}
                      startChars={8}
                      endChars={8}
                      size="sm"
                      href={`/nodes?view=${n}`}
                      className="text-primary-400"
                    />
                  ))}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Nowhere
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Issue explanation */}
      <div className="mt-4 rounded-lg border border-warning-400/20 bg-warning-400/5 p-3">
        <p className="text-xs leading-relaxed text-warning-300">
          {getIssueDescription(status)}
        </p>
      </div>

      {/* Quick facts */}
      <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Facts
        </h4>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Type</dt>
            <dd>
              <Badge fill="outline" variant="default" size="sm">
                {vm.type}
              </Badge>
            </dd>
          </div>
          {vm.lastObservedAt && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Last observed</dt>
              <dd className="text-xs tabular-nums">
                {relativeTime(vm.lastObservedAt)}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">vCPUs</dt>
            <dd className="tabular-nums text-xs">
              {vm.requirements.vcpus ?? "None"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Memory</dt>
            <dd className="tabular-nums text-xs">
              {vm.requirements.memoryMb != null
                ? `${vm.requirements.memoryMb} MB`
                : "None"}
            </dd>
          </div>
        </dl>
      </div>

      {/* View full details */}
      <div className="mt-4 border-t border-edge pt-3">
        <Link
          href={`/vms?view=${vm.hash}`}
          className="text-sm font-medium text-primary-300 hover:underline"
        >
          View full details →
        </Link>
      </div>
    </Card>
  );
}

type IssuesVMTableProps = {
  issueVMs: IssueVM[];
  isLoading: boolean;
  initialStatus?: DiscrepancyStatus;
  leading?: React.ReactNode;
};

export function IssuesVMTable({
  issueVMs,
  isLoading,
  initialStatus,
  leading,
}: IssuesVMTableProps) {
  const [, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState("");
  const debouncedQuery = useDebounce(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initialStatus,
  );
  const [selectedVM, setSelectedVM] = useState<string | null>(null);

  const { displayedRows, filteredCounts, unfilteredCounts } =
    useMemo(() => {
      const uCounts = countByStatus(issueVMs, (v) => v.status);
      const afterSearch = textSearch(
        issueVMs,
        debouncedQuery,
        SEARCH_FIELDS,
      );
      const fCounts = countByStatus(afterSearch, (v) => v.status);
      const afterStatus = statusFilter
        ? afterSearch.filter((v) => v.status === statusFilter)
        : afterSearch;
      return {
        displayedRows: afterStatus,
        filteredCounts: fCounts,
        unfilteredCounts: uCounts,
      };
    }, [issueVMs, debouncedQuery, statusFilter]);

  const {
    page,
    pageSize,
    totalPages,
    startItem,
    endItem,
    totalItems,
    pageItems,
    setPage,
    setPageSize,
  } = usePagination(displayedRows);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter, setPage]);

  const hasNonStatusFilters = debouncedQuery.trim() !== "";

  function formatCount(status: StatusFilter): string {
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

  const selectedIssueVM = selectedVM
    ? issueVMs.find((v) => v.hash === selectedVM)
    : null;

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
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <FilterToolbar
            leading={leading}
            statuses={STATUS_PILLS}
            activeStatus={statusFilter}
            onStatusChange={(s) =>
              startTransition(() => setStatusFilter(s))
            }
            formatCount={formatCount}
            filtersOpen={false}
            onFiltersToggle={() => {}}
            activeFilterCount={0}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder="Search VM hash, node..."
          />

          <Table
            columns={columns}
            data={pageItems}
            keyExtractor={(r) => r.hash}
            onRowClick={(r) => setSelectedVM(r.hash)}
            activeKey={selectedVM ?? undefined}
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

        {selectedIssueVM && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setSelectedVM(null)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto bg-surface p-4 shadow-lg lg:static lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none">
              <IssuesVmDetailPanel
                vm={selectedIssueVM}
                onClose={() => setSelectedVM(null)}
              />
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
