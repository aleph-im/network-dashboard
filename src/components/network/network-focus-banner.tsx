"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@aleph-front/ds/button";
import type { GraphNode } from "@/lib/network-graph-model";

type Props = {
  focusNode: GraphNode | null;
  connectionCount: number;
};

export function NetworkFocusBanner({ focusNode, connectionCount }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  if (!focusNode) return null;

  const onShowAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    router.replace(`/network?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="mx-6 mb-3 flex items-center justify-between rounded-md border border-primary-500/20 bg-primary-600/5 px-3 py-2 text-xs">
      <span>
        Focused on <span className="font-medium">{focusNode.label}</span>
        {" · "}
        <span className="text-muted-foreground">
          {connectionCount} connection{connectionCount === 1 ? "" : "s"}
        </span>
      </span>
      <Button size="xs" variant="text" onClick={onShowAll}>
        Show all
      </Button>
    </div>
  );
}
