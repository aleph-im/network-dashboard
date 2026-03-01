import { useQuery } from "@tanstack/react-query";
import { getNode, getNodes } from "@/api/client";
import type { NodeFilters } from "@/api/types";

export function useNodes(filters?: NodeFilters) {
  return useQuery({
    queryKey: ["nodes", filters],
    queryFn: () => getNodes(filters),
    refetchInterval: 30_000,
  });
}

export function useNode(hash: string) {
  return useQuery({
    queryKey: ["node", hash],
    queryFn: () => getNode(hash),
    refetchInterval: 15_000,
    enabled: hash.length > 0,
  });
}
