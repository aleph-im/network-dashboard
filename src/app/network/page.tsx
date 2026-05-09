"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "@aleph-front/ds/button";
import { Spinner } from "@aleph-front/ds/ui/spinner";
import type { GraphNode } from "@/lib/network-graph-model";
import { useNetworkGraph } from "@/hooks/use-network-graph";
import { NetworkGraph } from "@/components/network/network-graph";
import { NetworkLayerToggles } from "@/components/network/network-layer-toggles";
import { NetworkSearch } from "@/components/network/network-search";
import { NetworkDetailPanel } from "@/components/network/network-detail-panel";
import { NetworkFocusPill } from "@/components/network/network-focus-pill";
import { NetworkLegend } from "@/components/network/network-legend";

const SETTLE_MS = 500;

function NetworkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    fullGraph,
    visibleGraph,
    focusId,
    isLoading,
    isFetching,
    nodeState,
  } = useNetworkGraph();
  const [resetKey, setResetKey] = useState(0);
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    setIsSettling(true);
    const t = setTimeout(() => setIsSettling(false), SETTLE_MS);
    return () => clearTimeout(t);
  }, [visibleGraph, resetKey]);

  const onResetView = useCallback(() => {
    setResetKey((k) => k + 1);
  }, []);

  const selectedId = searchParams.get("selected");
  const address = searchParams.get("address")?.toLowerCase() ?? null;
  const layersParam = searchParams.get("layers") ?? "";
  const refitKey = `${layersParam}|${focusId ?? ""}|${address ?? ""}`;

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
    params.set("selected", id);
    router.push(`/network?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const selectedNode = useMemo(
    () => visibleGraph.nodes.find((n) => n.id === selectedId) ?? null,
    [visibleGraph, selectedId],
  );

  const focusNode = useMemo(
    () => fullGraph.nodes.find((n) => n.id === focusId) ?? null,
    [fullGraph, focusId],
  );

  const onClearFocus = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    router.replace(`/network?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return (
    <div className="relative h-full md:-m-6 md:h-[calc(100%+3rem)] md:overflow-hidden">
      {/* Mobile fallback */}
      <div className="flex h-full flex-col md:hidden">
        <header className="px-6 py-4">
          <h1 className="text-2xl font-semibold">Network</h1>
          <p className="text-sm text-muted-foreground">
            Aleph node topology — CCNs, CRNs, and their links.
          </p>
        </header>
        <div className="flex-1 overflow-auto p-6">
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
      </div>

      {/* Desktop full-bleed graph */}
      <div className="absolute inset-0 hidden md:block">
        {isLoading ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Loading network…
          </div>
        ) : (
          <NetworkGraph
            key={resetKey}
            graph={visibleGraph}
            selectedId={selectedId}
            highlightedIds={highlightedIds}
            refitKey={refitKey}
            onNodeClick={onNodeClick}
          />
        )}
        <NetworkLegend />
      </div>

      {/* Desktop chrome overlay */}
      <div className="pointer-events-none relative z-10 hidden md:block">
        <header className="pointer-events-auto px-6 py-4">
          <h1 className="text-2xl font-semibold">Network</h1>
          <p className="text-sm text-muted-foreground">
            Aleph node topology — CCNs, CRNs, and their links.
          </p>
        </header>
        <div className="pointer-events-auto flex flex-wrap items-center gap-4 px-6 pb-3">
          <NetworkLayerToggles />
          <Button
            size="xs"
            variant="outline"
            onClick={onResetView}
            title="Reset view to fit all nodes"
            iconLeft={<ArrowsClockwise weight="bold" />}
          >
            Reset view
          </Button>
          {focusNode && !selectedNode && (
            <NetworkFocusPill
              focusNode={focusNode}
              onStepBack={() => router.back()}
              onClearFocus={onClearFocus}
            />
          )}
          {(isFetching || isSettling) && (
            <span
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              aria-live="polite"
            >
              <Spinner className="size-3.5" />
              {isFetching ? "Fetching" : "Updating"}…
            </span>
          )}
          <NetworkSearch />
        </div>
      </div>

      {/* Detail panel — floating card */}
      {selectedNode && (
        <aside className="pointer-events-auto absolute right-4 top-32 z-20 hidden w-[280px] max-h-[calc(100%-9rem)] overflow-hidden rounded-xl border border-foreground/[0.06] bg-muted/40 dark:bg-surface shadow-md md:block">
          <NetworkDetailPanel
            node={selectedNode}
            nodeState={nodeState}
            visibleGraph={visibleGraph}
            focusNode={focusNode}
            onClose={onClosePanel}
            onFocus={onFocus}
            onStepBackFocus={() => router.back()}
            onClearFocus={onClearFocus}
          />
        </aside>
      )}
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
