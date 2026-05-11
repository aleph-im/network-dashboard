"use client";

import Link from "next/link";
import { X } from "@phosphor-icons/react";
import { Button } from "@aleph-front/ds/button";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { StatusDot } from "@aleph-front/ds/status-dot";
import type { NodeState } from "@/api/credit-types";
import { NetworkStakingSection } from "./network-staking-section";

type Props = {
  address: string;
  matchCount: number;
  nodeState: NodeState | undefined;
  onClose: () => void;
};

export function NetworkSearchAddressPanel({
  address,
  matchCount,
  nodeState,
  onClose,
}: Props) {
  return (
    <section className="flex max-h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-foreground/[0.06] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status="unknown" />
          <h3 className="truncate text-sm font-semibold">Address</h3>
        </div>
        <Button
          size="xs"
          variant="text"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X weight="bold" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        <CopyableText
          text={address}
          startChars={8}
          endChars={8}
          size="sm"
          href={`/wallet?address=${address}`}
        />
        <p className="text-xs text-muted-foreground">
          {matchCount === 0
            ? "No matching nodes in the visible graph."
            : `Linked to ${matchCount} ${matchCount === 1 ? "node" : "nodes"} in the visible graph.`}
        </p>
        <NetworkStakingSection address={address} nodeState={nodeState} />
        <Link
          href={`/wallet?address=${address}`}
          className="block text-sm font-medium text-primary-300 hover:underline"
        >
          Open wallet view →
        </Link>
      </div>
    </section>
  );
}
