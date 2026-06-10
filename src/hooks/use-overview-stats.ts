import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getOverviewStats } from "@/api/client";

export function useOverviewStats() {
  return useQuery({
    queryKey: ["overview-stats"],
    queryFn: getOverviewStats,
    refetchInterval: 30_000,
    // Keep the last-good stats on screen through transient refetch
    // failures instead of dropping back to `undefined` (rendered "0").
    placeholderData: keepPreviousData,
  });
}
