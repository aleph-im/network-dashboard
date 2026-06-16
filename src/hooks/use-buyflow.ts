"use client";

import { useQuery } from "@tanstack/react-query";
import { getBuyflow } from "@/api/client";

// The buyflow aggregate is refreshed hourly by the buy-flow pipeline, so a
// 5-minute stale window with a matching background refetch is plenty.
export function useBuyflow() {
  return useQuery({
    queryKey: ["buyflow"],
    queryFn: () => getBuyflow(),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
