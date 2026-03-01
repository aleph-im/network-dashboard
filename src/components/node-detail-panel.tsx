"use client";

import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useNode } from "@/hooks/use-nodes";
import { ResourceBar } from "@/components/resource-bar";
import { relativeTime, truncateHash } from "@/lib/format";

type NodeDetailPanelProps = {
  hash: string;
  onClose: () => void;
};

export function NodeDetailPanel({ hash, onClose }: NodeDetailPanelProps) {
  const { data: node, isLoading } = useNode(hash);

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

  if (!node) return null;

  return (
    <Card padding="md" className="w-96">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={node.status} />
          <h3 className="text-sm font-bold">{truncateHash(node.hash, 12)}</h3>
        </div>
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
          <dd className="font-mono text-xs">{node.hash}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Address</dt>
          <dd className="truncate ml-4 text-xs">{node.address}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge
              variant={
                node.status === "healthy"
                  ? "success"
                  : node.status === "degraded"
                    ? "warning"
                    : node.status === "offline"
                      ? "error"
                      : "default"
              }
              size="sm"
            >
              {node.status}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Staked</dt>
          <dd className="tabular-nums">
            {node.stakedAmount.toLocaleString()} ALEPH
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Last Seen</dt>
          <dd className="text-xs">{relativeTime(node.lastSeen)}</dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Resources
        </h4>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">CPU ({node.resources.cpu} cores)</span>
          <ResourceBar value={node.resources.cpuUsage} label="CPU" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Mem ({node.resources.memory} GB)</span>
          <ResourceBar value={node.resources.memoryUsage} label="Memory" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Disk ({node.resources.disk} GB)</span>
          <ResourceBar value={node.resources.diskUsage} label="Disk" />
        </div>
      </div>

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
                <span className="font-mono text-xs">
                  {truncateHash(vm.hash)}
                </span>
                <Badge
                  variant={
                    vm.scheduledStatus === "scheduled"
                      ? "info"
                      : vm.scheduledStatus === "orphaned"
                        ? "warning"
                        : vm.scheduledStatus === "missing"
                          ? "error"
                          : "default"
                  }
                  size="sm"
                >
                  {vm.scheduledStatus}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {node.recentEvents.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Events
          </h4>
          <ul className="space-y-1">
            {node.recentEvents.slice(0, 5).map((evt) => (
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
