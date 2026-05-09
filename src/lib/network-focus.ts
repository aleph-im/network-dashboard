import type { Graph } from "./network-graph-model";

export function egoSubgraph(graph: Graph, focusId: string): Graph {
  const focus = graph.nodes.find((n) => n.id === focusId);
  if (!focus) return { nodes: [], edges: [] };

  const keep = new Set<string>([focusId]);
  for (const e of graph.edges) {
    if (e.source === focusId) keep.add(e.target);
    if (e.target === focusId) keep.add(e.source);
  }

  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}
