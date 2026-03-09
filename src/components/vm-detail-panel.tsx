"use client";

import Link from "next/link";
import { ShieldCheck } from "@phosphor-icons/react";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useVM } from "@/hooks/use-vms";
import { useVMMessageInfo } from "@/hooks/use-vm-creation-times";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { useNode } from "@/hooks/use-nodes";
import { relativeTime, truncateHash } from "@/lib/format";
import { VM_STATUS_VARIANT } from "@/lib/status-map";

type VMDetailPanelProps = {
  hash: string;
  onClose: () => void;
};

export function VMDetailPanel({ hash, onClose }: VMDetailPanelProps) {
  const { data: vm, isLoading } = useVM(hash);
  const { data: messageInfo } = useVMMessageInfo([hash]);
  const { data: allocatedNodeData } = useNode(vm?.allocatedNode ?? "");

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

  if (!vm) return null;

  return (
    <Card padding="md" variant="ghost" className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] lg:sticky lg:top-0 lg:w-96">
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
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Full Hash</dt>
          <dd className="min-w-0 truncate font-mono text-xs">
            <CopyableText
              text={vm.hash}
              startChars={16}
              endChars={6}
              size="sm"
              {...(messageInfo?.get(vm.hash)?.explorerUrl ? { href: messageInfo.get(vm.hash)!.explorerUrl } : {})}
            />
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
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/nodes?view=${vm.allocatedNode}`}
              className="group/link inline-flex items-center gap-1 font-mono text-xs font-bold text-primary-300 hover:underline"
            >
              {truncateHash(vm.allocatedNode)}
              <svg className="size-3 transition-transform duration-150 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M7 7h10v10" />
              </svg>
            </Link>
            {allocatedNodeData?.name && (
              <span className="truncate text-xs text-muted-foreground">
                {allocatedNodeData.name}
              </span>
            )}
          </div>
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
            {vm.observedNodes.slice(0, 6).map((nodeHash) => (
              <li key={nodeHash}>
                <Link
                  href={`/nodes?view=${nodeHash}`}
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
          {vm.observedNodes.length > 6 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              +{vm.observedNodes.length - 6} more
            </p>
          )}
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
          {vm.gpuRequirements.length > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">GPU</dt>
              <dd className="text-xs">
                {vm.gpuRequirements
                  .map((g) => `${g.vendor} ${g.model || g.deviceName}`)
                  .join(", ")}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Confidential</dt>
            <dd className="flex items-center gap-1">
              {vm.requiresConfidential ? (
                <>
                  <ShieldCheck size={14} weight="fill" className="text-primary-400" />
                  <span className="text-sm">Required</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">No</span>
              )}
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
            {vm.history.slice(0, 5).map((row) => (
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
          {vm.history.length > 5 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              +{vm.history.length - 5} more
            </p>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-edge pt-3">
        <Link
          href={`/vms?view=${vm.hash}`}
          className="text-sm font-medium text-primary-300 hover:underline"
        >
          View full details →
        </Link>
      </div>
    </Card>
  );
}
