"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getRewardsTimeSeries } from "@/api/rewards-client";

/**
 * Hour-stable window ending at the start of the current hour. The rewards API
 * truncates bounds to whole hours anyway (hour-cache); deriving the window
 * hour-aligned keeps the query key stable for a full hour and the execution
 * -expense window byte-identical to the rewards window.
 */
export function getStableHourRange(seconds: number): {
  start: number;
  end: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const end = Math.floor(now / 3600) * 3600;
  return { start: end - seconds, end };
}

/** Authoritative per-address rewards over [fromSec, toSec]. Optional bucketSize
 *  (`"1h"`/`"1d"`) returns the bucketed series alongside the totals. */
export function useRewards(
  address: string,
  fromSec: number,
  toSec: number,
  bucketSize?: string,
) {
  return useQuery({
    queryKey: ["rewards", address.toLowerCase(), fromSec, toSec, bucketSize ?? "total"],
    queryFn: () => getRewardsTimeSeries(address, fromSec, toSec, bucketSize),
    enabled: !!address && toSec > fromSec,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}
