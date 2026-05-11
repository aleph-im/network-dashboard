"use client";

import { useCallback, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info } from "@phosphor-icons/react";
import { Button } from "@aleph-front/ds/button";
import { Input } from "@aleph-front/ds/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@aleph-front/ds/tooltip";
import { useNetworkGraph } from "@/hooks/use-network-graph";

type Props = {
  q: string;
  onChange: (value: string) => void;
  onSearchFit: (id: string) => void;
};

export function NetworkSearch({ q, onChange, onSearchFit }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { fullGraph } = useNetworkGraph();

  const onSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const needle = q.trim().toLowerCase();
    if (!needle) return;

    if (needle.startsWith("0x") && needle.length >= 6) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("address", needle);
      params.delete("selected");
      router.replace(`/network?${params.toString()}`, { scroll: false });
      return;
    }

    const match = fullGraph.nodes.find((n) =>
      n.id.toLowerCase().includes(needle) ||
      n.label.toLowerCase().includes(needle),
    );
    if (match) {
      const params = new URLSearchParams(searchParams.toString());
      if (match.kind === "country") {
        params.set("focus", match.id);
        params.set("selected", match.id);
      } else {
        params.set("selected", match.id);
        // Country uses focus, which already refits the camera on the ego
        // subgraph. For other kinds, ask the page to zoom on the match.
        onSearchFit(match.id);
      }
      router.replace(`/network?${params.toString()}`, { scroll: false });
    }
  }, [q, fullGraph, router, searchParams, onSearchFit]);

  return (
    <form
      onSubmit={onSubmit}
      className="ml-auto flex w-full max-w-[280px] items-center gap-0.5"
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="text"
              size="xs"
              aria-label="Search help"
              className="!size-7 !p-0"
            >
              <Info weight="regular" className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-[320px]">
            <div className="space-y-2 text-xs">
              <p className="font-semibold text-foreground">Search supports</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">
                    Node hash
                  </span>{" "}
                  — paste any CCN/CRN hash (partial works)
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Node name
                  </span>{" "}
                  — e.g. <code>aleph-crn-fr-01</code>
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    0x address
                  </span>{" "}
                  — owner / staker / reward wallet, highlights all related
                  nodes
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Country
                  </span>{" "}
                  — name (<code>France</code>) or ISO (<code>FR</code>),
                  focuses that country's subgraph.{" "}
                  <span className="italic">
                    Requires the Geo layer to be enabled.
                  </span>
                </li>
              </ul>
              <p className="pt-1 text-[11px] text-muted-foreground/80">
                Press Enter to apply.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="relative min-w-0 flex-1">
        <Input
          size="sm"
          placeholder="Search hash, name, country, or 0x address…"
          value={q}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        {q && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}
