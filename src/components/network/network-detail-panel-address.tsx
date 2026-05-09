"use client";

import Link from "next/link";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import type { GraphNode } from "@/lib/network-graph-model";

type Props = {
  node: GraphNode;
  degree: number;
};

export function NetworkDetailPanelAddress({ node, degree }: Props) {
  const kindLabel = node.kind === "staker" ? "Staker" : "Reward address";
  const noun = node.kind === "staker" ? "CCNs" : "nodes";

  return (
    <div className="space-y-3 px-4 py-3 text-sm">
      <div>
        <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
          {kindLabel}
        </div>
        <CopyableText
          text={node.id}
          startChars={8}
          endChars={8}
          size="sm"
          href={`/wallet?address=${node.id}`}
        />
      </div>

      {degree > 0 && (
        <p className="text-xs text-muted-foreground">
          Connected to {degree} {noun} in the visible graph.
        </p>
      )}

      <Link
        href={`/wallet?address=${node.id}`}
        className="block text-sm font-medium text-primary-300 hover:underline"
      >
        Open wallet view →
      </Link>
    </div>
  );
}
