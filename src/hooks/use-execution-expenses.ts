"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getExecutionExpenses } from "@/api/client";

/**
 * Execution-only expense slice for per-bucket weights + the per-VM table.
 * In-memory React Query only — the "execution-expenses" key is deliberately
 * NOT in providers.tsx's PERSISTED_QUERY_PREFIXES (tens of MB don't belong in
 * localStorage). Callers pass hour-stable windows so keys dedupe.
 */
export function useExecutionExpenses(
  startSec: number,
  endSec: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["execution-expenses", startSec, endSec],
    queryFn: () => getExecutionExpenses(startSec, endSec),
    staleTime: 5 * 60_000,
    refetchInterval: false,
    enabled: enabled && startSec > 0 && endSec > startSec,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}
