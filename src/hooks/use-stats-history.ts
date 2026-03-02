import { useQuery } from "@tanstack/react-query";
import { getStatsHistory } from "@/api/client";

export function useStatsHistory() {
  return useQuery({
    queryKey: ["stats-history"],
    queryFn: getStatsHistory,
    refetchInterval: 30_000,
  });
}
