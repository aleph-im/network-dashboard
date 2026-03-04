"use client";

import Link from "next/link";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { StatusDot } from "@aleph-front/ds/status-dot";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useNode } from "@/hooks/use-nodes";
import { ResourceBar } from "@/components/resource-bar";
import { relativeTime, truncateHash } from "@/lib/format";
import { nodeStatusToDot } from "@/lib/status-map";
import type { NodeStatus, VmStatus } from "@/api/types";

const NODE_STATUS_VARIANT: Record<
  NodeStatus,
  "default" | "success" | "warning" | "error" | "info"
> = {
  healthy: "success",
  unreachable: "error",
  unknown: "default",
  removed: "warning",
};

const VM_STATUS_VARIANT: Record<
  VmStatus,
  "default" | "success" | "warning" | "error" | "info"
> = {
  scheduled: "info",
  unscheduled: "default",
  unschedulable: "error",
  missing: "error",
  orphaned: "warning",
  unknown: "default",
};

type NodeDetailPanelProps = {
  hash: string;
  onClose: () => void;
};

export function NodeDetailPanel({ hash, onClose }: NodeDetailPanelProps) {
  const { data: node, isLoading } = useNode(hash);

  if (isLoading) {
    return (
      <Card padding="md" className="w-full lg:w-96 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </Card>
    );
  }

  if (!node) return null;

  return (
    <Card padding="md" className="w-full lg:w-96">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={nodeStatusToDot(node.status)} />
          <h3 className="text-sm font-bold">
            {node.name ?? truncateHash(node.hash, 12)}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="text-muted-foreground hover:text-foreground"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Full Hash</dt>
          <dd className="min-w-0 truncate font-mono text-xs">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">{node.hash}</span>
                </TooltipTrigger>
                <TooltipContent>{node.hash}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </dd>
        </div>
        {node.address && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Address</dt>
            <dd className="truncate ml-4 text-xs">{node.address}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge variant={NODE_STATUS_VARIANT[node.status]} size="sm" className="capitalize">
              {node.status}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Staked</dt>
          <dd>
            <Badge variant={node.staked ? "success" : "default"} size="sm">
              {node.staked ? "Yes" : "No"}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Updated</dt>
          <dd className="text-xs">{relativeTime(node.updatedAt)}</dd>
        </div>
      </dl>

      {node.resources && (
        <div className="mt-4 space-y-2 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resources
          </h4>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              CPU ({node.resources.vcpusTotal} vCPUs)
            </span>
            <ResourceBar value={node.resources.cpuUsagePct} label="CPU" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Mem ({Math.round(node.resources.memoryTotalMb / 1024)} GB)
            </span>
            <ResourceBar value={node.resources.memoryUsagePct} label="Memory" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Disk ({Math.round(node.resources.diskTotalMb / 1024)} GB)
            </span>
            <ResourceBar value={node.resources.diskUsagePct} label="Disk" />
          </div>
        </div>
      )}

      {node.vms.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            VMs ({node.vms.length})
          </h4>
          <ul className="space-y-1">
            {node.vms.map((vm) => (
              <li
                key={vm.hash}
                className="flex items-center justify-between text-sm"
              >
                <Link
                  href={`/vms?selected=${vm.hash}`}
                  className="group/link inline-flex items-center gap-1 font-mono text-xs font-bold text-primary-300 hover:underline"
                >
                  {truncateHash(vm.hash)}
                  <svg className="size-3 transition-transform duration-150 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M7 7h10v10" />
                  </svg>
                </Link>
                <Badge variant={VM_STATUS_VARIANT[vm.status]} size="sm" className="capitalize">
                  {vm.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {node.history.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            History
          </h4>
          <ul className="space-y-1">
            {node.history.slice(0, 10).map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-xs text-muted-foreground">
                  <span className="capitalize">{row.action.replace(/_/g, " ")}</span>
                  {row.reason ? ` (${row.reason})` : ""}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {relativeTime(row.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
