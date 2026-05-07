"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
      {ALL.map((l) => {
        const on = active.has(l.id);
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => toggle(l.id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              on
                ? "border-primary-500 bg-primary-600/10 text-primary-400"
                : "border-foreground/[0.08] text-muted-foreground hover:text-foreground"
            }`}
            style={{ transitionDuration: "var(--duration-fast)" }}
            aria-pressed={on}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
