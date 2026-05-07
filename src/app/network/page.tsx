"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { GraphNode } from "@/lib/network-graph-model";
import { useNetworkGraph } from "@/hooks/use-network-graph";
import { NetworkGraph } from "@/components/network/network-graph";
import { NetworkLayerToggles } from "@/components/network/network-layer-toggles";
import { NetworkSearch } from "@/components/network/network-search";
import { NetworkDetailPanel } from "@/components/network/network-detail-panel";
import { NetworkFocusBanner } from "@/components/network/network-focus-banner";
import { NetworkLegend } from "@/components/network/network-legend";

function NetworkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { fullGraph, visibleGraph, focusId, isLoading } = useNetworkGraph();
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  const selectedId = searchParams.get("selected");
  const address = searchParams.get("address")?.toLowerCase() ?? null;

  const highlightedIds = useMemo(() => {
    if (!address) return new Set<string>();
    return new Set(
      visibleGraph.nodes
        .filter((n) => n.owner?.toLowerCase() === address)
        .map((n) => n.id),
    );
  }, [visibleGraph, address]);

  const onNodeClick = useCallback((node: GraphNode) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("selected", node.id);
    router.replace(`/network?${next.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const onClosePanel = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("selected");
    router.replace(`/network?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const onFocus = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("focus", id);
    params.delete("selected");
    router.replace(`/network?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const selectedNode = useMemo(
    () => visibleGraph.nodes.find((n) => n.id === selectedId) ?? null,
    [visibleGraph, selectedId],
  );

  const focusNode = useMemo(
    () => fullGraph.nodes.find((n) => n.id === focusId) ?? null,
    [fullGraph, focusId],
  );
  const focusConnections = focusNode
    ? Math.max(0, visibleGraph.nodes.length - 1)
    : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="px-6 py-4">
        <h1 className="text-2xl font-semibold">Network</h1>
        <p className="text-sm text-muted-foreground">
          Aleph node topology — CCNs, CRNs, and their links.
        </p>
      </header>

      <div className="hidden md:block">
        <NetworkLayerToggles />
        <NetworkSearch />
        <NetworkFocusBanner
          focusNode={focusNode}
          connectionCount={focusConnections}
        />
      </div>

      {/* Mobile fallback */}
      <div className="flex-1 overflow-auto p-6 md:hidden">
        <p className="mb-4 text-sm text-muted-foreground">
          Network graph is best on a larger screen. Pick a CCN to inspect:
        </p>
        <ul className="space-y-2">
          {fullGraph.nodes
            .filter((n) => n.kind === "ccn")
            .slice(0, 50)
            .map((n) => (
              <li key={n.id}>
                <Link
                  href={`/network?focus=${n.id}`}
                  className="block rounded-md border border-foreground/[0.06] px-3 py-2 text-sm"
                >
                  {n.label}
                </Link>
              </li>
            ))}
        </ul>
      </div>

      {/* Desktop graph layout */}
      <div className="relative hidden flex-1 md:flex">
        <div className="relative flex-1">
          {isLoading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Loading network…
            </div>
          ) : (
            <NetworkGraph
              graph={visibleGraph}
              selectedId={selectedId}
              highlightedIds={highlightedIds}
              onNodeHover={setHovered}
              onNodeClick={onNodeClick}
            />
          )}
          {hovered && (
            <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-foreground/[0.08] bg-surface/90 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
              <div className="font-medium">{hovered.label}</div>
              <div className="text-muted-foreground">
                {hovered.kind.toUpperCase()} · {hovered.status}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {hovered.id.slice(0, 12)}…
              </div>
            </div>
          )}
          <NetworkLegend />
        </div>

        {selectedNode && (
          <aside className="w-[400px] shrink-0 overflow-y-auto border-l border-foreground/[0.06]">
            <NetworkDetailPanel
              node={selectedNode}
              onClose={onClosePanel}
              onFocus={onFocus}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default function NetworkPage() {
  return (
    <Suspense>
      <NetworkContent />
    </Suspense>
  );
}
