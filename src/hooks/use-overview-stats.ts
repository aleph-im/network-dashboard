import { useQuery } from "@tanstack/react-query";
import { getOverviewStats } from "@/api/client";

export function useOverviewStats() {
  return useQuery({
    queryKey: ["overview-stats"],
    queryFn: getOverviewStats,
    refetchInterval: 30_000,
  });
}
