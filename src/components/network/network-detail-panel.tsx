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

type Props = {
  node: GraphNode | null;
  nodeState: NodeState | undefined;
  visibleGraph: Graph;
  onClose: () => void;
  onFocus: (id: string) => void;
};

type DotStatus = "healthy" | "degraded" | "error" | "offline" | "unknown";

function dotStatusFor(node: GraphNode): DotStatus {
  if (node.inactive) return "offline";
  if (node.kind === "staker" || node.kind === "reward") return "unknown";
  if (node.status === "active") return "healthy";
  if (node.status === "unreachable") return "error";
  if (node.status === "unknown") return "unknown";
  return "degraded";
}

function titleFor(node: GraphNode): string {
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

export function NetworkDetailPanel({
  node,
  nodeState,
  visibleGraph,
  onClose,
  onFocus,
}: Props) {
  if (!node) return null;

  const showFooter = node.kind === "ccn" || node.kind === "crn";
  const ccnInfo = node.kind === "ccn" ? nodeState?.ccns.get(node.id) : undefined;
  const crnInfo = node.kind === "crn" ? nodeState?.crns.get(node.id) : undefined;
  const parentInfo = crnInfo?.parent
    ? nodeState?.ccns.get(crnInfo.parent) ?? null
    : null;

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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {ccnInfo && <NetworkDetailPanelCCN info={ccnInfo} />}
        {crnInfo && (
          <NetworkDetailPanelCRN
            info={crnInfo}
            parent={parentInfo}
            onFocusParent={onFocus}
          />
        )}
        {(node.kind === "staker" || node.kind === "reward") && (
          <NetworkDetailPanelAddress
            node={node}
            degree={countDegree(visibleGraph, node.id)}
          />
        )}
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
