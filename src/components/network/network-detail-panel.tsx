"use client";

import Link from "next/link";
import { X } from "@phosphor-icons/react";
import { Button } from "@aleph-front/ds/button";
import { StatusDot } from "@aleph-front/ds/status-dot";
import type { NodeState } from "@/api/credit-types";
import type { Graph, GraphNode } from "@/lib/network-graph-model";
import { NetworkDetailPanelAddress } from "@/components/network/network-detail-panel-address";
import { NetworkDetailPanelCCN } from "@/components/network/network-detail-panel-ccn";
import { NetworkDetailPanelCRN } from "@/components/network/network-detail-panel-crn";
import { NetworkDetailPanelCountry } from "@/components/network/network-detail-panel-country";
import { NetworkFocusPill } from "@/components/network/network-focus-pill";

type Props = {
  node: GraphNode | null;
  nodeState: NodeState | undefined;
  ownerBalances: Map<string, number> | undefined;
  crnStatuses: Map<string, string> | undefined;
  visibleGraph: Graph;
  focusNode: GraphNode | null;
  onClose: () => void;
  onFocus: (id: string) => void;
  onStepBackFocus: () => void;
  onClearFocus: () => void;
};

type DotStatus = "healthy" | "degraded" | "error" | "offline" | "unknown";

function dotStatusFor(node: GraphNode): DotStatus {
  if (node.kind === "country") return "unknown";
  if (node.inactive) return "offline";
  if (node.kind === "staker" || node.kind === "reward") return "unknown";
  if (node.kind === "crn" && node.flagged) return "degraded";
  if (node.status === "active" || node.status === "linked") return "healthy";
  if (node.status === "unreachable") return "error";
  if (node.status === "unknown") return "unknown";
  return "degraded";
}

function titleFor(node: GraphNode): string {
  if (node.kind === "country") return node.label;
  if (node.kind === "staker") return "Staker";
  if (node.kind === "reward") return "Reward address";
  return node.label || `${node.id.slice(0, 10)}…`;
}

function countDegree(graph: Graph, id: string): number {
  let n = 0;
  for (const e of graph.edges) {
    if (e.source === id || e.target === id) n++;
  }
  return n;
}

function countryAggregate(graph: Graph, countryId: string): {
  code: string;
  ccnCount: number;
  crnCount: number;
  uniqueOwners: number;
  inactiveCount: number;
} {
  const code = countryId.replace("country:", "");
  let ccn = 0;
  let crn = 0;
  let inactive = 0;
  const owners = new Set<string>();
  const ids = new Set<string>();
  for (const e of graph.edges) {
    if (e.type !== "geo" || e.target !== countryId) continue;
    ids.add(e.source);
  }
  for (const n of graph.nodes) {
    if (!ids.has(n.id)) continue;
    if (n.kind === "ccn") ccn++;
    if (n.kind === "crn") crn++;
    if (n.inactive) inactive++;
    if (n.owner) owners.add(n.owner);
  }
  return {
    code,
    ccnCount: ccn,
    crnCount: crn,
    uniqueOwners: owners.size,
    inactiveCount: inactive,
  };
}

export function NetworkDetailPanel({
  node,
  nodeState,
  ownerBalances,
  crnStatuses,
  visibleGraph,
  focusNode,
  onClose,
  onFocus,
  onStepBackFocus,
  onClearFocus,
}: Props) {
  if (!node) return null;

  const showFooter = node.kind === "ccn" || node.kind === "crn";
  const ccnInfo = node.kind === "ccn" ? nodeState?.ccns.get(node.id) : undefined;
  const crnInfo = node.kind === "crn" ? nodeState?.crns.get(node.id) : undefined;
  const parentInfo = crnInfo?.parent
    ? nodeState?.ccns.get(crnInfo.parent) ?? null
    : null;
  const ccnOwnerBal = ccnInfo
    ? ownerBalances?.get(ccnInfo.owner.toLowerCase()) ?? null
    : null;
  const crnSchedulerStatus = crnInfo
    ? crnStatuses?.get(crnInfo.hash) ?? null
    : null;
  const crnUnreachable = crnSchedulerStatus === "unreachable";

  return (
    <section className="flex max-h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-foreground/[0.06] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={dotStatusFor(node)} />
          <h3 className="truncate text-sm font-semibold">{titleFor(node)}</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button size="xs" variant="text" onClick={() => onFocus(node.id)}>
            Focus
          </Button>
          <Button
            size="xs"
            variant="text"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X weight="bold" />
          </Button>
        </div>
      </header>

      {focusNode && (
        <div className="border-b border-foreground/[0.06] px-4 py-2">
          <NetworkFocusPill
            focusNode={focusNode}
            onStepBack={onStepBackFocus}
            onClearFocus={onClearFocus}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {ccnInfo && (
          <NetworkDetailPanelCCN
            info={ccnInfo}
            country={node.country}
            ownerBalance={ccnOwnerBal}
          />
        )}
        {crnInfo && (
          <NetworkDetailPanelCRN
            info={crnInfo}
            parent={parentInfo}
            country={node.country}
            unreachable={crnUnreachable}
            onFocusParent={onFocus}
          />
        )}
        {(node.kind === "staker" || node.kind === "reward") && (
          <NetworkDetailPanelAddress
            node={node}
            degree={countDegree(visibleGraph, node.id)}
            nodeState={nodeState}
          />
        )}
        {node.kind === "country" && (() => {
          const agg = countryAggregate(visibleGraph, node.id);
          return (
            <NetworkDetailPanelCountry
              code={agg.code}
              name={node.label}
              ccnCount={agg.ccnCount}
              crnCount={agg.crnCount}
              uniqueOwners={agg.uniqueOwners}
              inactiveCount={agg.inactiveCount}
            />
          );
        })()}
      </div>

      {showFooter && (
        <footer className="border-t border-foreground/[0.06] px-4 py-3">
          <Link
            href={`/nodes?view=${node.id}`}
            className="text-sm font-medium text-primary-300 hover:underline"
          >
            View full details →
          </Link>
        </footer>
      )}
    </section>
  );
}
