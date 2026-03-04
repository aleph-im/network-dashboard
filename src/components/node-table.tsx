"use client";

import { useState, useTransition } from "react";
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
import { ResourceBar } from "@/components/resource-bar";
import { truncateHash, relativeTime } from "@/lib/format";
import { nodeStatusToDot } from "@/lib/status-map";
import type { Node, NodeFilters, NodeStatus } from "@/api/types";

const STATUS_FILTERS: { label: string; value: NodeStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Healthy", value: "healthy" },
  { label: "Unreachable", value: "unreachable" },
  { label: "Unknown", value: "unknown" },
  { label: "Removed", value: "removed" },
];

const STATUS_VARIANT: Record<
  NodeStatus,
  "default" | "success" | "warning" | "error" | "info"
> = {
  healthy: "success",
  unreachable: "error",
  unknown: "default",
  removed: "warning",
};

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
      <Badge variant={STATUS_VARIANT[r.status]} size="sm">
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
      <ResourceBar value={r.resources?.memoryUsagePct ?? 0} label="Memory" />
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
  initialStatus?: NodeStatus | undefined;
  initialHasVms?: boolean | undefined;
  initialSort?: SortConfig | undefined;
  selectedKey?: string | undefined;
};

export function NodeTable({ onSelectNode, initialStatus, initialHasVms, initialSort, selectedKey }: NodeTableProps) {
  const [, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<NodeStatus | undefined>(
    initialStatus,
  );
  const [hasVmsFilter, setHasVmsFilter] = useState(
    initialHasVms ?? false,
  );
  const filters: NodeFilters | undefined = statusFilter
    ? { status: statusFilter }
    : undefined;
  const { data: nodes, isLoading } = useNodes(filters);

  const filteredNodes = hasVmsFilter
    ? (nodes ?? []).filter((n) => n.vmCount > 0)
    : nodes;

  const sortedNodes = initialSort
    ? [...(filteredNodes ?? [])].sort((a, b) => {
        const dir = initialSort.direction === "asc" ? 1 : -1;
        return (a.vmCount - b.vmCount) * dir;
      })
    : filteredNodes;

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
      <div className="mb-3 flex gap-1.5">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => startTransition(() => {
              setStatusFilter(filter.value);
              if (filter.value === undefined) setHasVmsFilter(false);
            })}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === filter.value
                ? "bg-primary-600/10 text-primary-500"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            style={{ transitionDuration: "var(--duration-fast)" }}
          >
            {filter.label}
          </button>
        ))}
        <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
          <Checkbox
            size="xs"
            checked={hasVmsFilter}
            onCheckedChange={(v) => startTransition(() => setHasVmsFilter(v === true))}
          />
          Has VMs
        </label>
      </div>
      <Table
        columns={columns}
        data={sortedNodes ?? []}
        keyExtractor={(r) => r.hash}
        onRowClick={(r) => onSelectNode(r.hash)}
        activeKey={selectedKey}
      />
    </TooltipProvider>
  );
}
