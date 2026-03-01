"use client";

import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useVM } from "@/hooks/use-vms";
import { relativeTime, truncateHash } from "@/lib/format";
import type { VMStatus } from "@/api/types";

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

type VMDetailPanelProps = {
  hash: string;
  onClose: () => void;
};

export function VMDetailPanel({ hash, onClose }: VMDetailPanelProps) {
  const { data: vm, isLoading } = useVM(hash);

  if (isLoading) {
    return (
      <Card padding="md" className="w-96 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </Card>
    );
  }

  if (!vm) return null;

  return (
    <Card padding="md" className="w-96">
      <div className="mb-4 flex items-start justify-between">
        <h3 className="text-sm font-bold font-mono">
          {truncateHash(vm.hash, 12)}
        </h3>
        <button
          type="button"
          onClick={onClose}
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
          <dd className="font-mono text-xs">{vm.hash}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Type</dt>
          <dd>
            <Badge variant="default" size="sm">{vm.type}</Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Assigned Node</dt>
          <dd className="font-mono text-xs">
            {vm.assignedNode ? truncateHash(vm.assignedNode) : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Scheduled Status</dt>
          <dd>
            <Badge variant={VM_STATUS_VARIANT[vm.scheduledStatus]} size="sm">
              {vm.scheduledStatus}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Observed Status</dt>
          <dd>
            {vm.observedStatus ? (
              <Badge variant={VM_STATUS_VARIANT[vm.observedStatus]} size="sm">
                {vm.observedStatus}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Requirements
        </h4>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">CPU</dt>
            <dd className="tabular-nums">{vm.requirements.cpu} cores</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Memory</dt>
            <dd className="tabular-nums">{vm.requirements.memory} GB</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Disk</dt>
            <dd className="tabular-nums">{vm.requirements.disk} GB</dd>
          </div>
        </dl>
      </div>

      {vm.schedulingHistory.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scheduling History
          </h4>
          <ul className="space-y-1">
            {vm.schedulingHistory.map((evt) => (
              <li
                key={evt.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-xs text-muted-foreground">
                  {evt.type.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {relativeTime(evt.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {vm.recentEvents.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Events
          </h4>
          <ul className="space-y-1">
            {vm.recentEvents.slice(0, 5).map((evt) => (
              <li
                key={evt.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-xs text-muted-foreground">
                  {evt.type.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {relativeTime(evt.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
