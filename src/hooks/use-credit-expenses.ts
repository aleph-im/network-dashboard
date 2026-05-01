"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCreditExpenses } from "@/api/client";

export type CreditRange = "24h" | "7d" | "30d";

export const RANGE_SECONDS: Record<CreditRange, number> = {
  "24h": 86400,
  "7d": 7 * 86400,
  "30d": 30 * 86400,
};

/**
 * Round to the nearest 5 minutes so the query key stays stable across
 * mounts. Same rounding used by useWalletRewards — both pages share
 * the same React Query cache entry for 24h windows.
 */
export function getStableExpenseRange(seconds: number): {
  start: number;
  end: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const end = Math.floor(now / 300) * 300;
  return { start: end - seconds, end };
}

export function useCreditExpenses(startDate: number, endDate: number) {
  return useQuery({
    queryKey: ["credit-expenses", startDate, endDate],
    queryFn: () => getCreditExpenses(startDate, endDate),
    staleTime: 5 * 60_000,
    refetchInterval: false,
    enabled: startDate > 0 && endDate > startDate,
    placeholderData: keepPreviousData,
  });
}
