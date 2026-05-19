import type { Graph } from "@/lib/network-graph-model";
import type { NodeState } from "@/api/credit-types";
import centroidsJson from "@/data/country-centroids.json";

type Centroid = { lat: number; lng: number; name: string };
const centroids = centroidsJson as Record<string, Centroid>;

export type CountryAggregate = {
  iso: string;
  name: string;
  total: number;
  ccns: number;
  crns: number;
};

export type RewardAggregate = {
  address: string;
  total: number;
  ccns: number;
  crns: number;
  totalStaked: number;
};

export function aggregateCountries(graph: Graph): CountryAggregate[] {
  const byIso = new Map<string, CountryAggregate>();
  for (const n of graph.nodes) {
    if (n.kind !== "ccn" && n.kind !== "crn") continue;
    if (!n.country) continue;
    const iso = n.country;
    const existing = byIso.get(iso);
    if (existing) {
      existing.total++;
      if (n.kind === "ccn") existing.ccns++;
      else existing.crns++;
    } else {
      byIso.set(iso, {
        iso,
        name: centroids[iso]?.name ?? iso,
        total: 1,
        ccns: n.kind === "ccn" ? 1 : 0,
        crns: n.kind === "crn" ? 1 : 0,
      });
    }
  }
  return [...byIso.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });
}

export function aggregateRewards(
  graph: Graph,
  nodeState: NodeState | undefined,
): RewardAggregate[] {
  if (!nodeState) return [];
  const byAddr = new Map<string, RewardAggregate>();
  for (const n of graph.nodes) {
    if (n.kind !== "ccn" && n.kind !== "crn") continue;
    if (!n.reward) continue;
    const address = n.reward.toLowerCase();
    const staked = n.kind === "ccn"
      ? (nodeState.ccns.get(n.id)?.totalStaked ?? 0)
      : 0;
    const existing = byAddr.get(address);
    if (existing) {
      existing.total++;
      if (n.kind === "ccn") existing.ccns++;
      else existing.crns++;
      existing.totalStaked += staked;
    } else {
      byAddr.set(address, {
        address,
        total: 1,
        ccns: n.kind === "ccn" ? 1 : 0,
        crns: n.kind === "crn" ? 1 : 0,
        totalStaked: staked,
      });
    }
  }
  return [...byAddr.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return b.totalStaked - a.totalStaked;
  });
}
