"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getRewardsTimeSeries } from "@/api/rewards-client";

/** Authoritative per-address rewards over [fromSec, toSec]. */
export function useRewards(address: string, fromSec: number, toSec: number) {
  return useQuery({
    queryKey: ["rewards", address.toLowerCase(), fromSec, toSec],
    queryFn: () => getRewardsTimeSeries(address, fromSec, toSec),
    enabled: !!address && toSec > fromSec,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
