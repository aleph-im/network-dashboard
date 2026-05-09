"use client";

import { CaretLeft, X } from "@phosphor-icons/react";
import type { GraphNode } from "@/lib/network-graph-model";

type Props = {
  focusNode: GraphNode;
  onStepBack: () => void;
  onClearFocus: () => void;
};

export function NetworkFocusPill({ focusNode, onStepBack, onClearFocus }: Props) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/30 bg-primary-600/10 py-1 pl-1.5 pr-2 text-xs">
      <button
        type="button"
        onClick={onStepBack}
        aria-label="Step back one focus level"
        title="Step back one focus level"
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <CaretLeft weight="bold" className="size-3" />
      </button>
      <span className="text-muted-foreground">Focused:</span>
      <span className="truncate font-medium">{focusNode.label}</span>
      <button
        type="button"
        onClick={onClearFocus}
        aria-label="Clear focus"
        title="Show all nodes"
        className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X weight="bold" className="size-3" />
      </button>
    </span>
  );
}
