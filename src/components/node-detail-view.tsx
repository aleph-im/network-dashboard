"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ShieldCheck } from "@phosphor-icons/react";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { useNode } from "@/hooks/use-nodes";
import { useNodeState } from "@/hooks/use-node-state";
import { useOwnerBalances } from "@/hooks/use-owner-balances";
import { ResourceBar } from "@/components/resource-bar";
import { NodeEarningsTab } from "@/components/node-earnings-tab";
import { NodeDetailViewCcn } from "@/components/node-detail-view-ccn";
import {
  relativeTime,
  formatDateTime,
  formatCpuLabel,
} from "@/lib/format";
import {
  nodeStatusToDot,
  NODE_STATUS_VARIANT,
  VM_STATUS_VARIANT,
} from "@/lib/status-map";

type DetailTab = "overview" | "earnings";

type NodeDetailViewProps = {
  hash: string;
  initialTab?: DetailTab;
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

export function NodeDetailView({ hash, initialTab }: NodeDetailViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: node, isLoading: nodeLoading, error } = useNode(hash);
  const { data: nodeState, isLoading: stateLoading } = useNodeState();
  const { data: ownerBalances } = useOwnerBalances(nodeState);
  const [tab, setTab] = useState<DetailTab>(initialTab ?? "overview");

  const handleTabChange = (next: string) => {
    if (next !== "overview" && next !== "earnings") return;
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    router.replace(
      params.toString() ? `${pathname}?${params.toString()}` : pathname,
    );
  };

  // CCN dispatch — the scheduler API only returns CRN data, so CCNs are
  // routed to a separate detail view backed by nodeState.
  const ccn = nodeState?.ccns.get(hash);
  if (ccn) {
    return (
      <NodeDetailViewCcn
        hash={hash}
        ccn={ccn}
        ownerBalance={ownerBalances?.get(ccn.owner) ?? null}
        {...(initialTab ? { initialTab } : {})}
      />
    );
  }

  // From here on, the hash is a CRN (or unknown).
  if (nodeLoading || (!node && stateLoading)) {
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
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Nodes
        </button>
        <Card padding="md" variant="ghost" className="border border-foreground/[0.06] bg-foreground/[0.03]">
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
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Nodes
        </button>
      </div>
      <div className="flex items-center gap-3">
        <StatusDot status={nodeStatusToDot(node.status)} />
        {node.name ? (
          <h2 className="text-xl font-bold">{node.name}</h2>
        ) : (
          <CopyableText text={node.hash} startChars={8} endChars={8} size="md" />
        )}
        <Badge fill="outline"
          variant={NODE_STATUS_VARIANT[node.status]}
          size="sm"
        >
          {node.status}
        </Badge>
        <Badge fill="outline"
          variant={node.staked ? "success" : "default"}
          size="sm"
        >
          {node.staked ? "Staked" : "Not staked"}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList variant="underline" size="sm">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "overview" ? (
        <>
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
              <CopyableText
                text={node.owner}
                startChars={8}
                endChars={8}
                size="sm"
                href={`/wallet?address=${node.owner}`}
              />
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
                <Badge fill="outline" variant="warning" size="sm">in use</Badge>
              </li>
            ))}
            {node.gpus.available.map((gpu, i) => (
              <li key={`avail-${i}`} className="flex items-center justify-between text-sm">
                <span>{gpu.vendor} {gpu.model || gpu.deviceName}</span>
                <Badge fill="outline" variant="success" size="sm">available</Badge>
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
                <CopyableText
                  text={vm.hash}
                  startChars={8}
                  endChars={8}
                  size="sm"
                  href={`/vms?view=${vm.hash}`}
                />
                <Badge fill="outline"
                  variant={VM_STATUS_VARIANT[vm.status]}
                  size="sm"
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
                      <CopyableText
                        text={row.vmHash}
                        startChars={8}
                        endChars={8}
                        size="sm"
                        href={`/vms?view=${row.vmHash}`}
                      />
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
        </>
      ) : (
        <NodeEarningsTab hash={hash} />
      )}
    </div>
  );
}
