"use client";

import Link from "next/link";
import { Button } from "@aleph-front/ds/button";
import { Card } from "@aleph-front/ds/card";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { NodeDetailPanel } from "@/components/node-detail-panel";
import type { GraphNode } from "@/lib/network-graph-model";

type Props = {
  node: GraphNode | null;
  onClose: () => void;
  onFocus: (id: string) => void;
};

export function NetworkDetailPanel({ node, onClose, onFocus }: Props) {
  if (!node) return null;

  if (node.kind === "ccn" || node.kind === "crn") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <Button size="xs" variant="text" onClick={() => onFocus(node.id)}>
            Focus on this node
          </Button>
          <Button size="xs" variant="text" onClick={onClose}>
            Close
          </Button>
        </div>
        <NodeDetailPanel hash={node.id} onClose={onClose} />
      </div>
    );
  }

  return (
    <Card padding="md" className="m-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {node.kind === "staker" ? "Staker" : "Reward address"}
        </span>
        <Button size="xs" variant="text" onClick={onClose}>
          Close
        </Button>
      </div>
      <CopyableText text={node.id} href={`/wallet?address=${node.id}`} />
      <div className="mt-3 flex gap-2">
        <Button size="xs" variant="outline" onClick={() => onFocus(node.id)}>
          Focus
        </Button>
        <Button size="xs" variant="text" asChild>
          <Link href={`/wallet?address=${node.id}`}>Open wallet view →</Link>
        </Button>
      </div>
    </Card>
  );
}
