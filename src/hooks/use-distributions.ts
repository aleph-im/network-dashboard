"use client";

import { useQuery } from "@tanstack/react-query";
import { getDistributions } from "@/api/rewards-client";

/** Latest credit-rewards-distribution cycle. Polled — re-fetch resets the
 *  owner view's accrual window when a new distribution publishes. */
export function useDistributions() {
  return useQuery({
    queryKey: ["distributions"],
    queryFn: getDistributions,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
