"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useNodeState } from "@/hooks/use-node-state";
import { useOwnerBalances } from "@/hooks/use-owner-balances";
import {
  buildGraph,
  type Graph,
  type GraphLayer,
} from "@/lib/network-graph-model";
import { egoSubgraph } from "@/lib/network-focus";
import type { NodeState } from "@/api/credit-types";

const DEFAULT_LAYERS: Set<GraphLayer> = new Set(["structural"]);
const ALL_LAYERS: GraphLayer[] = [
  "structural", "owner", "staker", "reward", "geo",
];

export function parseLayers(raw: string | null): Set<GraphLayer> {
  if (!raw) return new Set(DEFAULT_LAYERS);
  const parts = raw.split(",").filter((p): p is GraphLayer =>
    (ALL_LAYERS as string[]).includes(p),
  );
  return parts.length > 0 ? new Set(parts) : new Set(DEFAULT_LAYERS);
}

export function parseFocusStack(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").filter(Boolean);
}

export type UseNetworkGraphResult = {
  fullGraph: Graph;
  visibleGraph: Graph;
  layers: Set<GraphLayer>;
  focusId: string | null;
  focusStack: string[];
  isLoading: boolean;
  isFetching: boolean;
  nodeState: NodeState | undefined;
  ownerBalances: Map<string, number> | undefined;
};

export function useNetworkGraph(): UseNetworkGraphResult {
  const searchParams = useSearchParams();
  const { data: state, isLoading, isFetching } = useNodeState();
  const { data: ownerBalances } = useOwnerBalances(state);

  const layersParam = searchParams.get("layers");
  const layers = useMemo(() => parseLayers(layersParam), [layersParam]);
  const focusParam = searchParams.get("focus");
  const focusStack = useMemo(() => parseFocusStack(focusParam), [focusParam]);
  const focusId = focusStack[focusStack.length - 1] ?? null;

  const fullGraph = useMemo<Graph>(() => {
    if (!state) return { nodes: [], edges: [] };
    return buildGraph(state, layers, ownerBalances);
  }, [state, layers, ownerBalances]);

  const visibleGraph = useMemo<Graph>(() => {
    if (!focusId) return fullGraph;
    return egoSubgraph(fullGraph, focusId);
  }, [fullGraph, focusId]);

  return {
    fullGraph,
    visibleGraph,
    layers,
    focusId,
    focusStack,
    isLoading,
    isFetching,
    nodeState: state,
    ownerBalances,
  };
}
