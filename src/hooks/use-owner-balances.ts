"use client";

import { useQuery } from "@tanstack/react-query";
import { getOwnerBalances } from "@/api/client";
import type { NodeState } from "@/api/credit-types";

// Fetches the on-chain ALEPH balance for every unique CCN owner address in
// `state`. Cached by the sorted owner-list signature so a corechannel refetch
// that doesn't add/remove owners reuses the cached balances. Returns an empty
// map until the first fetch resolves — callers must tolerate missing entries
// (treat as "unknown", not zero).
export function useOwnerBalances(state: NodeState | undefined) {
  const owners = state
    ? [...new Set([...state.ccns.values()].map((c) => c.owner))]
    : [];
  owners.sort();
  const signature = owners.join(",");

  return useQuery({
    queryKey: ["owner-balances", signature],
    queryFn: () => getOwnerBalances(owners),
    enabled: owners.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}
