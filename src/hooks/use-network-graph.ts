"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useNodeState } from "@/hooks/use-node-state";
import {
  buildGraph,
  type Graph,
  type GraphLayer,
} from "@/lib/network-graph-model";
import { egoSubgraph } from "@/lib/network-focus";

const DEFAULT_LAYERS: Set<GraphLayer> = new Set(["structural"]);
const ALL_LAYERS: GraphLayer[] = ["structural", "owner", "staker", "reward"];

export function parseLayers(raw: string | null): Set<GraphLayer> {
  if (!raw) return new Set(DEFAULT_LAYERS);
  const parts = raw.split(",").filter((p): p is GraphLayer =>
    (ALL_LAYERS as string[]).includes(p),
  );
  return parts.length > 0 ? new Set(parts) : new Set(DEFAULT_LAYERS);
}

export type UseNetworkGraphResult = {
  fullGraph: Graph;
  visibleGraph: Graph;
  layers: Set<GraphLayer>;
  focusId: string | null;
  isLoading: boolean;
};

export function useNetworkGraph(): UseNetworkGraphResult {
  const searchParams = useSearchParams();
  const { data: state, isLoading } = useNodeState();

  const layers = useMemo(
    () => parseLayers(searchParams.get("layers")),
    [searchParams],
  );
  const focusId = searchParams.get("focus");

  const fullGraph = useMemo<Graph>(() => {
    if (!state) return { nodes: [], edges: [] };
    return buildGraph(state, layers);
  }, [state, layers]);

  const visibleGraph = useMemo<Graph>(() => {
    if (!focusId) return fullGraph;
    return egoSubgraph(fullGraph, focusId);
  }, [fullGraph, focusId]);

  return { fullGraph, visibleGraph, layers, focusId, isLoading };
}
