"use client";

import Link from "next/link";
import { ShieldCheck } from "@phosphor-icons/react";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { useVM } from "@/hooks/use-vms";
import { useNode } from "@/hooks/use-nodes";
import { useVMMessageInfo } from "@/hooks/use-vm-creation-times";
import {
  relativeTime,
  formatDateTime,
} from "@/lib/format";
import { VM_STATUS_VARIANT } from "@/lib/status-map";

type VMDetailViewProps = {
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

export function VMDetailView({ hash }: VMDetailViewProps) {
  const { data: vm, isLoading, error } = useVM(hash);
  const { data: messageInfo } = useVMMessageInfo([hash]);
  const { data: allocatedNodeData } = useNode(vm?.allocatedNode ?? "");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!vm) {
    return (
      <div className="space-y-4">
        <Link
          href="/vms"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Virtual Machines
        </Link>
        <Card padding="md" variant="ghost" className="border border-white/[0.06] bg-white/[0.03]">
          <h3 className="text-sm font-semibold">VM not found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {error
              ? `Failed to load VM ${hash}: ${error.message}`
              : `No VM found with hash ${hash}`}
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
          href="/vms"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Virtual Machines
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <CopyableText text={hash} startChars={8} endChars={8} size="md" />
        <Badge fill="outline" variant="default" size="sm">
          {vm.type}
        </Badge>
        <Badge fill="outline"
          variant={VM_STATUS_VARIANT[vm.status]}
          size="sm"
        >
          {vm.status}
        </Badge>
        {vm.paymentStatus && (
          <Badge fill="outline"
            variant={
              vm.paymentStatus === "validated" ? "success" : "error"
            }
            size="sm"
          >
            {vm.paymentStatus}
          </Badge>
        )}
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
                    {vm.hash}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{vm.hash}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </MetaItem>
          {messageInfo?.get(vm.hash)?.sender && (
            <MetaItem label="Owner">
              <CopyableText
                text={messageInfo.get(vm.hash)!.sender}
                startChars={8}
                endChars={8}
                size="sm"
                href={`/wallet?address=${messageInfo.get(vm.hash)!.sender}`}
              />
            </MetaItem>
          )}
          <MetaItem label="Type">{vm.type}</MetaItem>
          {vm.paymentType && (
            <MetaItem label="Payment type">
              {vm.paymentType}
            </MetaItem>
          )}
          {vm.allocatedAt && (
            <MetaItem label="Allocated at">
              {formatDateTime(vm.allocatedAt)}
            </MetaItem>
          )}
          {vm.lastObservedAt && (
            <MetaItem label="Last observed">
              {formatDateTime(vm.lastObservedAt)}
            </MetaItem>
          )}
          <MetaItem label="Last updated">
            {relativeTime(vm.updatedAt)}
          </MetaItem>
        </dl>
      </Card>

      {/* Allocated Node */}
      <Card padding="md">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Allocated Node
        </h3>
        {vm.allocatedNode ? (
          <div className="flex items-center justify-between gap-2">
            <CopyableText
              text={vm.allocatedNode}
              startChars={8}
              endChars={8}
              size="sm"
              href={`/nodes?view=${vm.allocatedNode}`}
            />
            {allocatedNodeData?.name && (
              <span className="text-sm text-muted-foreground">
                {allocatedNodeData.name}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not allocated
          </p>
        )}
      </Card>

      {/* Observed Nodes */}
      {vm.observedNodes.length > 0 && (
        <Card padding="md">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Observed Nodes ({vm.observedNodes.length})
          </h3>
          <ul className="space-y-1.5">
            {vm.observedNodes.map((nodeHash) => (
              <li key={nodeHash}>
                <CopyableText
                  text={nodeHash}
                  startChars={8}
                  endChars={8}
                  size="sm"
                  href={`/nodes?view=${nodeHash}`}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Requirements */}
      <Card padding="md">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Requirements
        </h3>
        <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
          <MetaItem label="vCPUs">
            <span className="tabular-nums">
              {vm.requirements.vcpus ?? "None"}
            </span>
          </MetaItem>
          <MetaItem label="Memory">
            <span className="tabular-nums">
              {vm.requirements.memoryMb != null
                ? `${vm.requirements.memoryMb} MB`
                : "None"}
            </span>
          </MetaItem>
          <MetaItem label="Disk">
            <span className="tabular-nums">
              {vm.requirements.diskMb != null
                ? `${vm.requirements.diskMb} MB`
                : "None"}
            </span>
          </MetaItem>
          {vm.gpuRequirements.length > 0 && (
            <MetaItem label="GPU">
              <span>
                {vm.gpuRequirements
                  .map((g) => `${g.vendor} ${g.model || g.deviceName}`)
                  .join(", ")}
              </span>
            </MetaItem>
          )}
          <MetaItem label="Confidential">
            {vm.requiresConfidential ? (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck size={14} weight="fill" className="text-primary-400" />
                Required
              </span>
            ) : (
              "No"
            )}
          </MetaItem>
        </dl>
      </Card>

      {/* History */}
      <Card padding="md">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          History ({vm.history.length})
        </h3>
        {vm.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No history events recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Action</th>
                  <th className="pb-2 pr-4 font-medium">Node</th>
                  <th className="pb-2 pr-4 font-medium">Reason</th>
                  <th className="pb-2 font-medium text-right">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {vm.history.map((row) => (
                  <tr key={row.id}>
                    <td className="py-1.5 pr-4 capitalize">
                      {row.action.replace(/_/g, " ")}
                    </td>
                    <td className="py-1.5 pr-4">
                      <CopyableText
                        text={row.nodeHash}
                        startChars={8}
                        endChars={8}
                        size="sm"
                        href={`/nodes?view=${row.nodeHash}`}
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
    </div>
  );
}
