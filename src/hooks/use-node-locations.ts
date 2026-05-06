"use client";

import { useMemo } from "react";
import { useNodeState } from "@/hooks/use-node-state";
import locationsJson from "@/data/node-locations.json";
import centroidsJson from "@/data/country-centroids.json";
import { project, scatter } from "@/lib/world-map-projection";

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
  width: number;
  height: number;
}): NodeDot[] {
  const { ccns, crns, locations, centroids, width, height } = args;
  const dots: NodeDot[] = [];
  for (const node of [...ccns, ...crns]) {
    if (node.inactiveSince != null) continue;
    const loc = locations[node.hash];
    if (!loc) continue;
    const centroid = centroids[loc.country];
    if (!centroid) continue;
    const offset = scatter(node.hash);
    const { x, y } = project(
      centroid.lat + offset.dLat,
      centroid.lng + offset.dLng,
      width,
      height,
    );
    dots.push({ hash: node.hash, country: loc.country, x, y });
  }
  return dots;
}

export function useNodeLocations(width: number, height: number): NodeDot[] {
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
      width,
      height,
    });
  }, [data, width, height]);
}
