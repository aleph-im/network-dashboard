"use client";

import { useMemo } from "react";
import { useNodeState } from "@/hooks/use-node-state";
import locationsJson from "@/data/node-locations.json";
import centroidsJson from "@/data/country-centroids.json";
import { type Projection, scatter } from "@/lib/world-map-projection";

export type NodeDot = {
  hash: string;
  country: string;
  x: number;
  y: number;
};

type LocationEntry = { country: string };
type Centroid = { lat: number; lng: number; name: string };
type NodeLite = { hash: string; inactiveSince: number | null };

const DEFAULT_LOCATIONS = locationsJson as Record<string, LocationEntry>;
const DEFAULT_CENTROIDS = centroidsJson as Record<string, Centroid>;

export function computeNodeDots(args: {
  ccns: NodeLite[];
  crns: NodeLite[];
  locations: Record<string, LocationEntry>;
  centroids: Record<string, Centroid>;
  project: Projection;
  sampleEvery?: number;
}): NodeDot[] {
  const { ccns, crns, locations, centroids, project, sampleEvery = 1 } = args;

  const byCountry = new Map<string, NodeLite[]>();
  for (const node of [...ccns, ...crns]) {
    if (node.inactiveSince != null) continue;
    const loc = locations[node.hash];
    if (!loc) continue;
    if (!centroids[loc.country]) continue;
    const list = byCountry.get(loc.country) ?? [];
    list.push(node);
    byCountry.set(loc.country, list);
  }

  const dots: NodeDot[] = [];
  for (const [country, nodes] of byCountry) {
    const centroid = centroids[country];
    if (!centroid) continue;
    const sorted = [...nodes].sort((a, b) => a.hash.localeCompare(b.hash));
    const take = Math.max(1, Math.ceil(sorted.length / sampleEvery));
    for (const node of sorted.slice(0, take)) {
      const offset = scatter(node.hash);
      const { x, y } = project(
        centroid.lat + offset.dLat,
        centroid.lng + offset.dLng,
      );
      dots.push({ hash: node.hash, country, x, y });
    }
  }
  return dots;
}

export function useNodeLocations(project: Projection): NodeDot[] {
  const { data } = useNodeState();
  return useMemo(() => {
    if (!data) return [];
    const ccns = [...data.ccns.values()];
    const crns = [...data.crns.values()];
    return computeNodeDots({
      ccns,
      crns,
      locations: DEFAULT_LOCATIONS,
      centroids: DEFAULT_CENTROIDS,
      project,
      sampleEvery: 10,
    });
  }, [data, project]);
}
