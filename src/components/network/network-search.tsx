"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@aleph-front/ds/input";
import { useNetworkGraph } from "@/hooks/use-network-graph";

export function NetworkSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { fullGraph } = useNetworkGraph();
  const [q, setQ] = useState("");

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
      params.set("selected", match.id);
      router.replace(`/network?${params.toString()}`, { scroll: false });
    }
  }, [q, fullGraph, router, searchParams]);

  return (
    <form onSubmit={onSubmit} className="relative ml-auto w-full max-w-sm">
      <Input
        size="sm"
        placeholder="Search hash, name, or 0x address…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="pr-10"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
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
    </form>
  );
}
