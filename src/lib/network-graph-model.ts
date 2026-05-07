import type { NodeState } from "@/api/credit-types";

export type GraphLayer = "structural" | "owner" | "staker" | "reward";

export type GraphNodeKind = "ccn" | "crn" | "staker" | "reward";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  status: string;
  owner: string | null;
  reward: string | null;
  inactive: boolean;
};

export type GraphEdge = {
  source: string;
  target: string;
  type: GraphLayer;
};

export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export function buildGraph(
  state: NodeState,
  layers: Set<GraphLayer>,
): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const c of state.ccns.values()) {
    nodes.push({
      id: c.hash,
      kind: "ccn",
      label: c.name,
      status: c.status,
      owner: c.owner,
      reward: c.reward,
      inactive: c.inactiveSince != null,
    });
  }
  for (const r of state.crns.values()) {
    nodes.push({
      id: r.hash,
      kind: "crn",
      label: r.name,
      status: r.status,
      owner: r.owner,
      reward: r.reward,
      inactive: r.inactiveSince != null,
    });
  }

  if (layers.has("structural")) {
    for (const r of state.crns.values()) {
      if (r.parent != null) {
        edges.push({ source: r.parent, target: r.hash, type: "structural" });
      }
    }
  }

  if (layers.has("owner")) {
    pushClusterEdges(nodes, "owner", (n) => n.owner, edges);
  }

  if (layers.has("reward")) {
    pushClusterEdges(nodes, "reward", (n) => n.reward, edges);
  }

  if (layers.has("staker")) {
    const stakerHashes = new Set<string>();
    for (const c of state.ccns.values()) {
      for (const stakerAddr of Object.keys(c.stakers)) {
        if (!stakerHashes.has(stakerAddr)) {
          stakerHashes.add(stakerAddr);
          nodes.push({
            id: stakerAddr,
            kind: "staker",
            label: stakerAddr,
            status: "active",
            owner: null,
            reward: null,
            inactive: false,
          });
        }
        edges.push({ source: stakerAddr, target: c.hash, type: "staker" });
      }
    }
  }

  return { nodes, edges };
}

function pushClusterEdges(
  nodes: GraphNode[],
  layer: GraphLayer,
  keyFn: (n: GraphNode) => string | null,
  out: GraphEdge[],
): void {
  const groups = new Map<string, string[]>();
  for (const n of nodes) {
    const k = keyFn(n);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(n.id);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        out.push({ source: ids[i]!, target: ids[j]!, type: layer });
      }
    }
  }
}
