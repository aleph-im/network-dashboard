"use client";

import Link from "next/link";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useVM } from "@/hooks/use-vms";
import { relativeTime, truncateHash } from "@/lib/format";
import type { VmStatus } from "@/api/types";

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

type VMDetailPanelProps = {
  hash: string;
  onClose: () => void;
};

export function VMDetailPanel({ hash, onClose }: VMDetailPanelProps) {
  const { data: vm, isLoading } = useVM(hash);

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

  if (!vm) return null;

  return (
    <Card padding="md" className="w-full lg:w-96">
      <div className="mb-4 flex items-start justify-between">
        <h3 className="text-sm font-bold font-mono">
          {truncateHash(vm.hash, 12)}
        </h3>
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
                  <span className="cursor-help">{vm.hash}</span>
                </TooltipTrigger>
                <TooltipContent>{vm.hash}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Type</dt>
          <dd>
            <Badge variant="default" size="sm">{vm.type}</Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge variant={VM_STATUS_VARIANT[vm.status]} size="sm" className="capitalize">
              {vm.status}
            </Badge>
          </dd>
        </div>
        {vm.paymentStatus && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Payment</dt>
            <dd>
              <Badge
                variant={vm.paymentStatus === "validated" ? "success" : "error"}
                size="sm"
                className="capitalize"
              >
                {vm.paymentStatus}
              </Badge>
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Allocated Node
        </h4>
        {vm.allocatedNode ? (
          <Link
            href={`/nodes?selected=${vm.allocatedNode}`}
            className="group/link inline-flex items-center gap-1 font-mono text-xs font-bold text-primary-300 hover:underline"
          >
            {truncateHash(vm.allocatedNode)}
            <svg className="size-3 transition-transform duration-150 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M7 7h10v10" />
            </svg>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">Not allocated</span>
        )}
      </div>

      {vm.observedNodes.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Observed Nodes ({vm.observedNodes.length})
          </h4>
          <ul className="space-y-1">
            {vm.observedNodes.map((nodeHash) => (
              <li key={nodeHash}>
                <Link
                  href={`/nodes?selected=${nodeHash}`}
                  className="group/link inline-flex items-center gap-1 font-mono text-xs font-bold text-primary-300 hover:underline"
                >
                  {truncateHash(nodeHash)}
                  <svg className="size-3 transition-transform duration-150 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M7 7h10v10" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-2 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Requirements
        </h4>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">vCPUs</dt>
            <dd className="tabular-nums">
              {vm.requirements.vcpus ?? "None"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Memory</dt>
            <dd className="tabular-nums">
              {vm.requirements.memoryMb != null
                ? `${vm.requirements.memoryMb} MB`
                : "None"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Disk</dt>
            <dd className="tabular-nums">
              {vm.requirements.diskMb != null
                ? `${vm.requirements.diskMb} MB`
                : "None"}
            </dd>
          </div>
        </dl>
      </div>

      {vm.history.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            History
          </h4>
          <ul className="space-y-1">
            {vm.history.slice(0, 10).map((row) => (
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
