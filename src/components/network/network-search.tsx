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
    <form onSubmit={onSubmit} className="px-6 pb-3">
      <Input
        size="sm"
        placeholder="Search hash, name, or 0x address…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}
