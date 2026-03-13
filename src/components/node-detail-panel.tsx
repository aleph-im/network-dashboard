"use client";

import Link from "next/link";
import { ShieldCheck } from "@phosphor-icons/react";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { useNode } from "@/hooks/use-nodes";
import { ResourceBar } from "@/components/resource-bar";
import { relativeTime, formatCpuLabel } from "@/lib/format";
import {
  nodeStatusToDot,
  NODE_STATUS_VARIANT,
  VM_STATUS_VARIANT,
} from "@/lib/status-map";

type NodeDetailPanelProps = {
  hash: string;
  onClose: () => void;
};

export function NodeDetailPanel({ hash, onClose }: NodeDetailPanelProps) {
  const { data: node, isLoading } = useNode(hash);

  if (isLoading) {
    return (
      <Card padding="md" variant="ghost" className="w-full lg:w-96 space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.03]">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </Card>
    );
  }

  if (!node) return null;

  return (
    <Card padding="md" variant="ghost" className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] lg:sticky lg:top-0 lg:w-96">
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
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Full Hash</dt>
          <dd className="min-w-0 truncate font-mono text-xs">
            <CopyableText text={node.hash} startChars={10} endChars={10} size="sm" />
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
            <Badge fill="outline" variant={NODE_STATUS_VARIANT[node.status]} size="sm">
              {node.status}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Staked</dt>
          <dd>
            <Badge fill="outline" variant={node.staked ? "success" : "default"} size="sm">
              {node.staked ? "Yes" : "No"}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Confidential</dt>
          <dd className="flex items-center gap-1">
            {node.confidentialComputing ? (
              <>
                <ShieldCheck size={14} weight="fill" className="text-primary-400" />
                <span className="text-sm">Enabled</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">No</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Updated</dt>
          <dd className="text-xs">{relativeTime(node.updatedAt)}</dd>
        </div>
      </dl>

      {node.owner && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Owner
          </h4>
          <CopyableText
            text={node.owner}
            startChars={8}
            endChars={8}
            size="sm"
            href={`/wallet?address=${node.owner}`}
          />
        </div>
      )}

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

      <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          CPU
        </h4>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Architecture</dt>
            <dd className="text-xs">{node.cpuArchitecture ?? "Unknown"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Vendor</dt>
            <dd className="text-xs">
              {formatCpuLabel(node.cpuVendor, null)}
            </dd>
          </div>
          {node.cpuFeatures.length > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Features</dt>
              <dd className="text-xs">{node.cpuFeatures.join(", ")}</dd>
            </div>
          )}
        </dl>
      </div>

      {(node.gpus.used.length > 0 || node.gpus.available.length > 0) && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            GPUs ({node.gpus.used.length + node.gpus.available.length})
          </h4>
          <ul className="space-y-1">
            {[...node.gpus.used, ...node.gpus.available].map((gpu, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-xs">{gpu.vendor} {gpu.model || gpu.deviceName}</span>
                <Badge fill="outline"
                  variant={i < node.gpus.used.length ? "warning" : "success"}
                  size="sm"
                >
                  {i < node.gpus.used.length ? "in use" : "available"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {node.vms.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            VMs ({node.vms.length})
          </h4>
          <ul className="space-y-1">
            {node.vms.slice(0, 6).map((vm) => (
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
                <Badge fill="outline" variant={VM_STATUS_VARIANT[vm.status]} size="sm">
                  {vm.status}
                </Badge>
              </li>
            ))}
          </ul>
          {node.vms.length > 6 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              +{node.vms.length - 6} more
            </p>
          )}
        </div>
      )}

      {node.history.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            History
          </h4>
          <ul className="space-y-1">
            {node.history.slice(0, 5).map((row) => (
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
          {node.history.length > 5 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              +{node.history.length - 5} more
            </p>
          )}
        </div>
      )}

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
