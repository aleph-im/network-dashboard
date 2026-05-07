"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "@aleph-front/ds/button";
import { Spinner } from "@aleph-front/ds/ui/spinner";
import type { GraphNode } from "@/lib/network-graph-model";
import type { HoverPos } from "@/components/network/network-graph";
import { useNetworkGraph } from "@/hooks/use-network-graph";
import { NetworkGraph } from "@/components/network/network-graph";
import { NetworkLayerToggles } from "@/components/network/network-layer-toggles";
import { NetworkSearch } from "@/components/network/network-search";
import { NetworkDetailPanel } from "@/components/network/network-detail-panel";
import { NetworkFocusBanner } from "@/components/network/network-focus-banner";
import { NetworkLegend } from "@/components/network/network-legend";

const SETTLE_MS = 2200;

function NetworkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    fullGraph,
    visibleGraph,
    focusId,
    isLoading,
    isFetching,
  } = useNetworkGraph();
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [hoverPos, setHoverPos] = useState<HoverPos | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    setIsSettling(true);
    const t = setTimeout(() => setIsSettling(false), SETTLE_MS);
    return () => clearTimeout(t);
  }, [visibleGraph, resetKey]);

  const onHover = useCallback((node: GraphNode | null, pos: HoverPos | null) => {
    setHovered(node);
    setHoverPos(pos);
  }, []);

  const onResetView = useCallback(() => {
    setResetKey((k) => k + 1);
  }, []);

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
        <div className="flex flex-wrap items-center gap-4 px-6 pb-3">
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
              key={resetKey}
              graph={visibleGraph}
              selectedId={selectedId}
              highlightedIds={highlightedIds}
              onNodeHover={onHover}
              onNodeClick={onNodeClick}
            />
          )}
          {hovered && hoverPos && (
            <div
              className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-lg border border-foreground/[0.08] bg-surface/95 p-3 text-xs shadow-lg backdrop-blur-sm"
              style={{
                left: `${hoverPos.clientX}px`,
                top: `${hoverPos.clientY - 16}px`,
              }}
            >
              <div className="mb-1.5 text-sm font-semibold text-foreground">
                {hovered.label}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Role
                </dt>
                <dd className="text-foreground">
                  {hovered.kind.toUpperCase()}
                  {" · "}
                  <span className="text-muted-foreground">{hovered.status}</span>
                </dd>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Address
                </dt>
                <dd className="break-all font-mono text-[11px] text-primary-300">
                  {hovered.id}
                </dd>
                {hovered.owner && (
                  <>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Owner
                    </dt>
                    <dd className="break-all font-mono text-[11px] text-muted-foreground">
                      {hovered.owner}
                    </dd>
                  </>
                )}
                {hovered.reward && hovered.reward !== hovered.owner && (
                  <>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Reward
                    </dt>
                    <dd className="break-all font-mono text-[11px] text-muted-foreground">
                      {hovered.reward}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}
          <NetworkLegend />
        </div>

        {selectedNode && (
          <aside className="w-[400px] shrink-0 overflow-y-auto">
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
