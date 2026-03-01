"use client";

import { useState } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { StatusDot } from "@aleph-front/ds/status-dot";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { Badge } from "@aleph-front/ds/badge";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useNodes } from "@/hooks/use-nodes";
import { ResourceBar } from "@/components/resource-bar";
import { truncateHash, relativeTime } from "@/lib/format";
import type { Node, NodeStatus } from "@/api/types";

const STATUS_FILTERS: { label: string; value: NodeStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Healthy", value: "healthy" },
  { label: "Degraded", value: "degraded" },
  { label: "Offline", value: "offline" },
  { label: "Unknown", value: "unknown" },
];

const STATUS_VARIANT: Record<
  NodeStatus,
  "default" | "success" | "warning" | "error" | "info"
> = {
  healthy: "success",
  degraded: "warning",
  offline: "error",
  unknown: "default",
};

const columns: Column<Node>[] = [
  {
    header: "",
    accessor: (r) => <StatusDot status={r.status} size="sm" />,
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
      <ResourceBar value={r.resources.cpuUsage} label="CPU" />
    ),
    sortable: true,
    sortValue: (r) => r.resources.cpuUsage,
  },
  {
    header: "Memory",
    accessor: (r) => (
      <ResourceBar value={r.resources.memoryUsage} label="Memory" />
    ),
    sortable: true,
    sortValue: (r) => r.resources.memoryUsage,
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
    header: "Last Seen",
    accessor: (r) => (
      <span className="text-xs text-muted-foreground">
        {relativeTime(r.lastSeen)}
      </span>
    ),
    sortable: true,
    sortValue: (r) => new Date(r.lastSeen).getTime(),
  },
];

type NodeTableProps = {
  onSelectNode: (hash: string) => void;
};

export function NodeTable({ onSelectNode }: NodeTableProps) {
  const [statusFilter, setStatusFilter] = useState<NodeStatus | undefined>(
    undefined,
  );
  const filters = statusFilter ? { status: statusFilter } : undefined;
  const { data: nodes, isLoading } = useNodes(filters);

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
            onClick={() => setStatusFilter(filter.value)}
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
      </div>
      <Table
        columns={columns}
        data={nodes ?? []}
        keyExtractor={(r) => r.hash}
        onRowClick={(r) => onSelectNode(r.hash)}
      />
    </TooltipProvider>
  );
}
