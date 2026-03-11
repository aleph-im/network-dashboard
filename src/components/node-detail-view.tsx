"use client";

import Link from "next/link";
import { ShieldCheck } from "@phosphor-icons/react";
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
import {
  relativeTime,
  truncateHash,
  formatDateTime,
  formatCpuLabel,
} from "@/lib/format";
import {
  nodeStatusToDot,
  NODE_STATUS_VARIANT,
  VM_STATUS_VARIANT,
} from "@/lib/status-map";

type NodeDetailViewProps = {
  hash: string;
};

function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

export function NodeDetailView({ hash }: NodeDetailViewProps) {
  const { data: node, isLoading, error } = useNode(hash);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!node) {
    return (
      <div className="space-y-4">
        <Link
          href="/nodes"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Nodes
        </Link>
        <Card padding="md" variant="ghost" className="border border-white/[0.06] bg-white/[0.03]">
          <h3 className="text-sm font-semibold">Node not found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {error
              ? `Failed to load node ${hash}: ${error.message}`
              : `No node found with hash ${hash}`}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/nodes"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Nodes
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <StatusDot status={nodeStatusToDot(node.status)} />
        <h2 className="text-xl font-bold">
          {node.name ?? truncateHash(node.hash, 16)}
        </h2>
        <Badge
          variant={NODE_STATUS_VARIANT[node.status]}
          size="sm"
          className="capitalize"
        >
          {node.status}
        </Badge>
        <Badge
          variant={node.staked ? "success" : "default"}
          size="sm"
        >
          {node.staked ? "Staked" : "Not staked"}
        </Badge>
      </div>

      {/* Metadata */}
      <Card padding="md">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Details
        </h3>
        <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <MetaItem label="Hash">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help font-mono text-xs">
                    {node.hash}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{node.hash}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </MetaItem>
          {node.address && (
            <MetaItem label="Address">
              <span className="text-xs">{node.address}</span>
            </MetaItem>
          )}
          {node.owner && (
            <MetaItem label="Owner">
              <span className="font-mono text-xs">
                {truncateHash(node.owner, 16)}
              </span>
            </MetaItem>
          )}
          {node.supportsIpv6 != null && (
            <MetaItem label="IPv6">
              {node.supportsIpv6 ? "Yes" : "No"}
            </MetaItem>
          )}
          <MetaItem label="Confidential">
            {node.confidentialComputing ? (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck size={14} weight="fill" className="text-primary-400" />
                Enabled
              </span>
            ) : (
              "No"
            )}
          </MetaItem>
          <MetaItem label="CPU">
            {formatCpuLabel(node.cpuVendor, node.cpuArchitecture)}
          </MetaItem>
          {node.cpuFeatures.length > 0 && (
            <MetaItem label="CPU Features">
              {node.cpuFeatures.join(", ")}
            </MetaItem>
          )}
          {node.discoveredAt && (
            <MetaItem label="Discovered">
              {formatDateTime(node.discoveredAt)}
            </MetaItem>
          )}
          <MetaItem label="Last updated">
            {relativeTime(node.updatedAt)}
          </MetaItem>
        </dl>
      </Card>

      {/* Resources */}
      {node.resources && (
        <Card padding="md">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resources
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">CPU</span>
                <span className="text-xs tabular-nums">
                  {node.resources.vcpusTotal} vCPUs
                </span>
              </div>
              <ResourceBar
                value={node.resources.cpuUsagePct}
                label="CPU"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Memory</span>
                <span className="text-xs tabular-nums">
                  {Math.round(node.resources.memoryTotalMb / 1024)} GB
                </span>
              </div>
              <ResourceBar
                value={node.resources.memoryUsagePct}
                label="Memory"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Disk</span>
                <span className="text-xs tabular-nums">
                  {Math.round(node.resources.diskTotalMb / 1024)} GB
                </span>
              </div>
              <ResourceBar
                value={node.resources.diskUsagePct}
                label="Disk"
              />
            </div>
          </div>
        </Card>
      )}

      {/* GPUs */}
      {(node.gpus.used.length > 0 || node.gpus.available.length > 0) && (
        <Card padding="md">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            GPUs ({node.gpus.used.length + node.gpus.available.length})
          </h3>
          <ul className="space-y-2">
            {node.gpus.used.map((gpu, i) => (
              <li key={`used-${i}`} className="flex items-center justify-between text-sm">
                <span>{gpu.vendor} {gpu.model || gpu.deviceName}</span>
                <Badge variant="warning" size="sm">in use</Badge>
              </li>
            ))}
            {node.gpus.available.map((gpu, i) => (
              <li key={`avail-${i}`} className="flex items-center justify-between text-sm">
                <span>{gpu.vendor} {gpu.model || gpu.deviceName}</span>
                <Badge variant="success" size="sm">available</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* VMs */}
      {node.vms.length > 0 && (
        <Card padding="md">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Virtual Machines ({node.vms.length})
          </h3>
          <ul className="space-y-1.5">
            {node.vms.map((vm) => (
              <li
                key={vm.hash}
                className="flex items-center justify-between text-sm"
              >
                <Link
                  href={`/vms?view=${vm.hash}`}
                  className="group/link inline-flex items-center gap-1 font-mono text-xs font-bold text-primary-300 hover:underline"
                >
                  {truncateHash(vm.hash)}
                  <svg
                    className="size-3 transition-transform duration-150 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 17L17 7M7 7h10v10"
                    />
                  </svg>
                </Link>
                <Badge
                  variant={VM_STATUS_VARIANT[vm.status]}
                  size="sm"
                  className="capitalize"
                >
                  {vm.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* History */}
      <Card padding="md">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          History ({node.history.length})
        </h3>
        {node.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No history events recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Action</th>
                  <th className="pb-2 pr-4 font-medium">VM</th>
                  <th className="pb-2 pr-4 font-medium">Reason</th>
                  <th className="pb-2 font-medium text-right">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {node.history.map((row) => (
                  <tr key={row.id}>
                    <td className="py-1.5 pr-4 capitalize">
                      {row.action.replace(/_/g, " ")}
                    </td>
                    <td className="py-1.5 pr-4">
                      <Link
                        href={`/vms?view=${row.vmHash}`}
                        className="font-mono text-xs text-primary-300 hover:underline"
                      >
                        {truncateHash(row.vmHash)}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-4 text-muted-foreground">
                      {row.reason ?? "—"}
                    </td>
                    <td className="py-1.5 text-right text-xs text-muted-foreground tabular-nums">
                      {relativeTime(row.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
