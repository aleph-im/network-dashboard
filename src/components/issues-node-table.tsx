"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import Link from "next/link";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import { Card } from "@aleph-front/ds/card";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { TooltipProvider } from "@aleph-front/ds/tooltip";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { FilterToolbar } from "@/components/filter-toolbar";
import { textSearch } from "@/lib/filters";
import {
  nodeStatusToDot,
  NODE_STATUS_VARIANT,
  VM_STATUS_VARIANT,
} from "@/lib/status-map";
import { relativeTime } from "@/lib/format";
import type { IssueNode, IssueVM } from "@/hooks/use-issues";

type NodeIssueFilter = "hasOrphaned" | "hasMissing" | undefined;

const STATUS_PILLS: {
  value: NodeIssueFilter;
  label: string;
  tooltip?: string;
}[] = [
  { value: undefined, label: "All" },
  { value: "hasOrphaned", label: "Has Orphaned", tooltip: "Nodes running VMs not in the schedule" },
  { value: "hasMissing", label: "Has Missing", tooltip: "Nodes with scheduled VMs not found on them" },
];

const SEARCH_FIELDS = (n: IssueNode) => [
  n.node.hash,
  n.node.name,
  n.node.owner,
];

const COMPACT_HIDDEN_HEADERS = new Set(["Total VMs", "Last Updated"]);

const columns: Column<IssueNode>[] = [
  {
    header: "Status",
    accessor: (r) => (
      <span className="inline-flex items-center gap-2">
        <StatusDot status={nodeStatusToDot(r.node.status)} size="sm" />
        <Badge fill="outline"
          variant={NODE_STATUS_VARIANT[r.node.status]}
          size="sm"
        >
          {r.node.status}
        </Badge>
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.node.status,
  },
  {
    header: "Node Hash",
    accessor: (r) => (
      <CopyableText
        text={r.node.hash}
        startChars={8}
        endChars={8}
        size="sm"
      />
    ),
    sortable: true,
    sortValue: (r) => r.node.hash,
  },
  {
    header: "Name",
    accessor: (r) =>
      r.node.name ? (
        <span className="text-sm font-medium">{r.node.name}</span>
      ) : (
        <span className="text-xs text-muted-foreground">{"\u2014"}</span>
      ),
    sortable: true,
    sortValue: (r) => r.node.name ?? "",
  },
  {
    header: "Orphaned",
    accessor: (r) => (
      <span
        className={`text-xs tabular-nums ${r.orphanedCount > 0 ? "text-warning-400 font-bold" : "text-muted-foreground"}`}
      >
        {r.orphanedCount}
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.orphanedCount,
    align: "right",
  },
  {
    header: "Missing",
    accessor: (r) => (
      <span
        className={`text-xs tabular-nums ${r.missingCount > 0 ? "text-error-400 font-bold" : "text-muted-foreground"}`}
      >
        {r.missingCount}
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.missingCount,
    align: "right",
  },
  {
    header: "Total VMs",
    accessor: (r) => (
      <span className="text-xs tabular-nums text-muted-foreground">
        {r.totalVmCount}
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.totalVmCount,
    align: "right",
  },
  {
    header: "Last Updated",
    accessor: (r) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {r.lastUpdated ? relativeTime(r.lastUpdated) : "\u2014"}
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.lastUpdated,
    align: "right",
  },
];

type IssuesNodeDetailPanelProps = {
  issueNode: IssueNode;
  onClose: () => void;
};

function IssuesNodeDetailPanel({
  issueNode,
  onClose,
}: IssuesNodeDetailPanelProps) {
  const { node } = issueNode;

  return (
    <Card
      padding="md"
      variant="ghost"
      className="w-full rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] lg:sticky lg:top-0 lg:w-96"
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={nodeStatusToDot(node.status)} />
          {node.name ? (
            <h3 className="text-sm font-bold">{node.name}</h3>
          ) : (
            <CopyableText text={node.hash} startChars={8} endChars={8} size="sm" />
          )}
        </div>
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

      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Full Hash</dt>
          <dd className="min-w-0 truncate font-mono text-xs">
            <CopyableText
              text={node.hash}
              startChars={10}
              endChars={10}
              size="sm"
            />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge fill="outline"
              variant={NODE_STATUS_VARIANT[node.status]}
              size="sm"
            >
              {node.status}
            </Badge>
          </dd>
        </div>
        {node.resources && (
          <>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">vCPUs</dt>
              <dd className="tabular-nums text-xs">
                {node.resources.vcpusAvailable} / {node.resources.vcpusTotal}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Memory</dt>
              <dd className="tabular-nums text-xs">
                {Math.round(node.resources.memoryAvailableMb / 1024)} /{" "}
                {Math.round(node.resources.memoryTotalMb / 1024)} GB
              </dd>
            </div>
          </>
        )}
      </dl>

      {/* Issue summary */}
      <div className="mt-4 flex gap-3 border-t border-edge pt-3">
        {issueNode.orphanedCount > 0 && (
          <div className="flex-1 rounded-lg border border-warning-400/20 bg-warning-400/5 p-2.5 text-center">
            <p className="text-lg font-bold text-warning-400 tabular-nums">
              {issueNode.orphanedCount}
            </p>
            <p className="text-xs text-muted-foreground">Orphaned</p>
          </div>
        )}
        {issueNode.missingCount > 0 && (
          <div className="flex-1 rounded-lg border border-error-400/20 bg-error-400/5 p-2.5 text-center">
            <p className="text-lg font-bold text-error-400 tabular-nums">
              {issueNode.missingCount}
            </p>
            <p className="text-xs text-muted-foreground">Missing</p>
          </div>
        )}
      </div>

      {/* Discrepancy VMs */}
      <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Discrepancy VMs ({issueNode.discrepancyVMs.length})
        </h4>
        <ul className="space-y-1">
          {issueNode.discrepancyVMs.slice(0, 10).map((vm: IssueVM) => (
            <li
              key={vm.hash}
              className="flex items-center justify-between text-sm"
            >
              <CopyableText
                text={vm.hash}
                startChars={8}
                endChars={8}
                size="sm"
                href={`/vms?view=${vm.hash}`}
              />
              <Badge fill="outline"
                variant={VM_STATUS_VARIANT[vm.status]}
                size="sm"
              >
                {vm.status}
              </Badge>
            </li>
          ))}
        </ul>
        {issueNode.discrepancyVMs.length > 10 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            +{issueNode.discrepancyVMs.length - 10} more
          </p>
        )}
      </div>

      <div className="mt-4 border-t border-edge pt-3">
        <Link
          href={`/nodes?view=${node.hash}`}
          className="text-sm font-medium text-primary-300 hover:underline"
        >
          View full details →
        </Link>
      </div>
    </Card>
  );
}

type IssuesNodeTableProps = {
  issueNodes: IssueNode[];
  isLoading: boolean;
  leading?: React.ReactNode;
};

export function IssuesNodeTable({
  issueNodes,
  isLoading,
  leading,
}: IssuesNodeTableProps) {
  const [, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState("");
  const debouncedQuery = useDebounce(searchInput, 300);
  const [statusFilter, setStatusFilter] =
    useState<NodeIssueFilter>(undefined);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { displayedRows, filteredCounts, unfilteredCounts } =
    useMemo(() => {
      const uCounts: Record<string, number> = {
        all: issueNodes.length,
        hasOrphaned: issueNodes.filter((n) => n.orphanedCount > 0)
          .length,
        hasMissing: issueNodes.filter((n) => n.missingCount > 0)
          .length,
      };

      const afterSearch = textSearch(
        issueNodes,
        debouncedQuery,
        SEARCH_FIELDS,
      );
      const fCounts: Record<string, number> = {
        all: afterSearch.length,
        hasOrphaned: afterSearch.filter((n) => n.orphanedCount > 0)
          .length,
        hasMissing: afterSearch.filter((n) => n.missingCount > 0)
          .length,
      };

      let afterStatus = afterSearch;
      if (statusFilter === "hasOrphaned") {
        afterStatus = afterSearch.filter((n) => n.orphanedCount > 0);
      } else if (statusFilter === "hasMissing") {
        afterStatus = afterSearch.filter((n) => n.missingCount > 0);
      }

      return {
        displayedRows: afterStatus,
        filteredCounts: fCounts,
        unfilteredCounts: uCounts,
      };
    }, [issueNodes, debouncedQuery, statusFilter]);

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

  function formatCount(status: NodeIssueFilter): string {
    const key = status ?? "all";
    const filtered = filteredCounts[key] ?? 0;
    const unfiltered = unfilteredCounts[key] ?? 0;
    if (hasNonStatusFilters && filtered !== unfiltered) {
      return `${filtered}/${unfiltered}`;
    }
    return `${unfiltered}`;
  }

  const selectedIssueNode = selectedNode
    ? issueNodes.find((n) => n.node.hash === selectedNode)
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
      <FilterToolbar
        leading={leading}
        statuses={STATUS_PILLS}
        activeStatus={statusFilter}
        onStatusChange={(s) =>
          startTransition(() => setStatusFilter(s))
        }
        formatCount={formatCount}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search node hash, name..."
      />

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <Table
            columns={selectedIssueNode ? columns.filter((c) => !COMPACT_HIDDEN_HEADERS.has(c.header)) : columns}
            data={pageItems}
            keyExtractor={(r) => r.node.hash}
            onRowClick={(r) => setSelectedNode(r.node.hash)}
            activeKey={selectedNode ?? undefined}
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

        {selectedIssueNode && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setSelectedNode(null)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto bg-surface p-4 shadow-lg lg:static lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none">
              <IssuesNodeDetailPanel
                issueNode={selectedIssueNode}
                onClose={() => setSelectedNode(null)}
              />
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
