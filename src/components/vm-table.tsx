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
import type { VM, VmStatus } from "@/api/types";

const STATUS_FILTERS: { label: string; value: VmStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Scheduled", value: "scheduled" },
  { label: "Unscheduled", value: "unscheduled" },
  { label: "Orphaned", value: "orphaned" },
  { label: "Missing", value: "missing" },
  { label: "Unschedulable", value: "unschedulable" },
  { label: "Unknown", value: "unknown" },
];

const VM_STATUS_VARIANT: Record<
  VmStatus,
  "default" | "success" | "warning" | "error" | "info"
> = {
  scheduled: "info",
  unscheduled: "default",
  orphaned: "warning",
  missing: "error",
  unschedulable: "error",
  unknown: "default",
};

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
      <Badge variant={VM_STATUS_VARIANT[r.status]} size="sm" className="capitalize">
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
        {r.requirements.vcpus ?? "—"}
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
        {r.requirements.memoryMb != null ? `${r.requirements.memoryMb} MB` : "—"}
      </span>
    ),
    sortable: true,
    sortValue: (r) => r.requirements.memoryMb ?? 0,
    align: "right",
  },
];

type VMTableProps = {
  onSelectVM: (hash: string) => void;
  initialStatus?: VmStatus | undefined;
  selectedKey?: string | undefined;
};

export function VMTable({ onSelectVM, initialStatus, selectedKey }: VMTableProps) {
  const [statusFilter, setStatusFilter] = useState<VmStatus | undefined>(
    initialStatus,
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
      <div className="mb-3 flex flex-wrap gap-1.5">
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
        activeKey={selectedKey}
      />
    </TooltipProvider>
  );
}
