"use client";

import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { ResourceBar } from "@/components/resource-bar";
import { useNode } from "@/hooks/use-nodes";
import type { CCNInfo, CRNInfo } from "@/api/credit-types";
import { countryFlag } from "@/lib/country-flag";
import { countryName } from "@/lib/network-address-info";

type Props = {
  info: CRNInfo;
  parent: CCNInfo | null;
  country?: string | undefined;
  onFocusParent: (parentId: string) => void;
};

function crnChipVariant(info: CRNInfo): "success" | "warning" | "default" {
  if (info.inactiveSince != null) return "default";
  if (info.status === "active") return "success";
  return "warning";
}

export function NetworkDetailPanelCRN({ info, parent, country, onFocusParent }: Props) {
  const { data: node, isLoading } = useNode(info.hash);
  const showResources =
    isLoading || (node?.resources != null && node.resources.vcpusTotal > 0);
  const flag = country ? countryFlag(country) : null;
  const land = country ? countryName(country) : null;

  return (
    <div className="space-y-4 px-4 py-3 text-sm">
      <dl className="space-y-1.5">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Type</dt>
          <dd className="font-medium">CRN</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge fill="outline" variant={crnChipVariant(info)} size="sm">
              {info.status}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">VMs</dt>
          <dd>
            {isLoading ? (
              <Skeleton className="h-4 w-6" />
            ) : node ? (
              <span className="font-medium">{node.vms.length}</span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </dd>
        </div>
        {land && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Location</dt>
            <dd className="flex items-center gap-1.5">
              {flag && <span aria-hidden>{flag}</span>}
              <span>{land}</span>
            </dd>
          </div>
        )}
      </dl>

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Parent CCN
        </h4>
        {parent ? (
          <button
            type="button"
            onClick={() => onFocusParent(parent.hash)}
            className="text-left text-sm font-medium text-primary-300 hover:underline"
          >
            {parent.name} →
          </button>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>

      {showResources && (
        <div className="space-y-2 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resources
          </h4>
          {isLoading || !node?.resources ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  CPU · {node.resources.vcpusTotal} vCPUs
                </span>
                <ResourceBar value={node.resources.cpuUsagePct} label="CPU" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Memory · {Math.round(node.resources.memoryTotalMb / 1024)} GB
                </span>
                <ResourceBar
                  value={node.resources.memoryUsagePct}
                  label="Memory"
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Owner
        </h4>
        <CopyableText
          text={info.owner}
          startChars={8}
          endChars={8}
          size="sm"
          href={`/wallet?address=${info.owner}`}
        />
      </div>
    </div>
  );
}
