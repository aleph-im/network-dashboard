"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Checkbox } from "@aleph-front/ds/checkbox";
import type { GraphLayer } from "@/lib/network-graph-model";
import { parseLayers } from "@/hooks/use-network-graph";

const ALL: { id: GraphLayer; label: string }[] = [
  { id: "structural", label: "Structural" },
  { id: "owner", label: "Owner" },
  { id: "staker", label: "Stakers" },
  { id: "reward", label: "Reward addr" },
];

export function NetworkLayerToggles() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = parseLayers(searchParams.get("layers"));

  const toggle = useCallback((id: GraphLayer) => {
    const next = new Set(active);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) next.add("structural");

    const params = new URLSearchParams(searchParams.toString());
    if (next.size === 1 && next.has("structural")) params.delete("layers");
    else params.set("layers", [...next].join(","));

    router.replace(`/network?${params.toString()}`, { scroll: false });
  }, [active, router, searchParams]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {ALL.map((l) => (
        <label
          key={l.id}
          className="flex cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground select-none hover:text-foreground"
        >
          <Checkbox
            size="sm"
            checked={active.has(l.id)}
            onCheckedChange={() => toggle(l.id)}
          />
          {l.label}
        </label>
      ))}
    </div>
  );
}
