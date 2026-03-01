import { useQuery } from "@tanstack/react-query";
import { getEvents } from "@/api/client";
import type { EventFilters } from "@/api/types";

export function useEvents(filters?: EventFilters) {
  return useQuery({
    queryKey: ["events", filters],
    queryFn: () => getEvents(filters),
    refetchInterval: 10_000,
  });
}
