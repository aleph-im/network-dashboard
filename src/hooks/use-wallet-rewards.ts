"use client";

import { useMemo } from "react";
import {
  useCreditExpenses,
  getStableExpenseRange,
  RANGE_SECONDS,
} from "@/hooks/use-credit-expenses";
import { useNodeState } from "@/hooks/use-node-state";
import { computeWalletRewards } from "@/lib/credit-distribution";

export function useWalletRewards(address: string) {
  const { start, end } = useMemo(
    () => getStableExpenseRange(RANGE_SECONDS["24h"]),
    [],
  );
  const { data: expenses, isLoading: expensesLoading } = useCreditExpenses(
    start,
    end,
  );
  const { data: nodeState, isLoading: nodeStateLoading } = useNodeState();

  const rewards = useMemo(() => {
    if (!expenses || !nodeState || !address) return undefined;
    return computeWalletRewards(address, expenses, nodeState);
  }, [address, expenses, nodeState]);

  return {
    rewards,
    isLoading: expensesLoading || nodeStateLoading,
  };
}
