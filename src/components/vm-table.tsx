"use client";

import { useState } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useVMs } from "@/hooks/use-vms";
import { truncateHash } from "@/lib/format";
import type { VM, VMStatus } from "@/api/types";

const STATUS_FILTERS: { label: string; value: VMStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Scheduled", value: "scheduled" },
  { label: "Observed", value: "observed" },
  { label: "Orphaned", value: "orphaned" },
  { label: "Missing", value: "missing" },
  { label: "Unschedulable", value: "unschedulable" },
];

const VM_STATUS_VARIANT: Record<
  VMStatus,
  "default" | "success" | "warning" | "error" | "info"
> = {
  scheduled: "info",
  observed: "success",
  orphaned: "warning",
  missing: "error",
  unschedulable: "error",
};

function isDiscrepancy(vm: VM): boolean {
  return (
    vm.scheduledStatus === "orphaned" ||
    vm.scheduledStatus === "missing" ||
    vm.scheduledStatus === "unschedulable"
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
      r.assignedNode ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help font-mono text-xs text-muted-foreground">
              {truncateHash(r.assignedNode)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{r.assignedNode}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    sortable: true,
    sortValue: (r) => r.assignedNode ?? "",
  },
  {
    header: "Scheduled",
    accessor: (r) => (
      <Badge variant={VM_STATUS_VARIANT[r.scheduledStatus]} size="sm">
        {r.scheduledStatus}
      </Badge>
    ),
    sortable: true,
    sortValue: (r) => r.scheduledStatus,
  },
  {
    header: "Observed",
    accessor: (r) =>
      r.observedStatus ? (
        <Badge variant={VM_STATUS_VARIANT[r.observedStatus]} size="sm">
          {r.observedStatus}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    sortable: true,
    sortValue: (r) => r.observedStatus ?? "",
  },
  {
    header: "CPU",
    accessor: (r) => (
      <span className="text-xs tabular-nums">{r.requirements.cpu}</span>
    ),
    sortable: true,
    sortValue: (r) => r.requirements.cpu,
    align: "right",
  },
  {
    header: "Mem",
    accessor: (r) => (
      <span className="text-xs tabular-nums">{r.requirements.memory} GB</span>
    ),
    sortable: true,
    sortValue: (r) => r.requirements.memory,
    align: "right",
  },
];

type VMTableProps = {
  onSelectVM: (hash: string) => void;
};

export function VMTable({ onSelectVM }: VMTableProps) {
  const [statusFilter, setStatusFilter] = useState<VMStatus | undefined>(
    undefined,
  );
  const filters = statusFilter ? { status: statusFilter } : undefined;
  const { data: vms, isLoading } = useVMs(filters);

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
        data={vms ?? []}
        keyExtractor={(r) => r.hash}
        onRowClick={(r) => onSelectVM(r.hash)}
      />
    </TooltipProvider>
  );
}
