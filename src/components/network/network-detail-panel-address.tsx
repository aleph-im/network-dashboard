"use client";

import Link from "next/link";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import type { NodeState } from "@/api/credit-types";
import type { GraphNode } from "@/lib/network-graph-model";
import { NetworkStakingSection } from "./network-staking-section";

type Props = {
  node: GraphNode;
  degree: number;
  nodeState: NodeState | undefined;
};

export function NetworkDetailPanelAddress({ node, degree, nodeState }: Props) {
  const noun = node.kind === "staker" ? "CCNs" : "nodes";

  return (
    <div className="space-y-3 px-4 py-3 text-sm">
      <CopyableText
        text={node.id}
        startChars={8}
        endChars={8}
        size="sm"
        href={`/wallet?address=${node.id}`}
      />

      {degree > 0 && (
        <p className="text-xs text-muted-foreground">
          Connected to {degree} {noun} in the visible graph.
        </p>
      )}

      <NetworkStakingSection address={node.id} nodeState={nodeState} />

      <Link
        href={`/wallet?address=${node.id}`}
        className="block text-sm font-medium text-primary-300 hover:underline"
      >
        Open wallet view →
      </Link>
    </div>
  );
}
