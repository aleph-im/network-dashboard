"use client";

import { useMemo } from "react";
import { useRewards } from "@/hooks/use-rewards";
import { useDistributions } from "@/hooks/use-distributions";
import { useCreditExpenses } from "@/hooks/use-credit-expenses";
import { useNodeState } from "@/hooks/use-node-state";
import { apportionOwnerRewards } from "@/lib/reward-apportionment";
import type { OwnerRewards } from "@/api/rewards-types";

/** Data-start floor for the rewards API. */
const DATA_START_SEC = Math.floor(Date.UTC(2026, 4, 1) / 1000); // 2026-05-01

export function useOwnerRewards(address: string): {
  data: OwnerRewards | undefined;
  isLoading: boolean;
  isBreakdownLoading: boolean;
} {
  const { data: cycle, isLoading: cycleLoading } = useDistributions();

  const nowSec = useMemo(() => Math.floor(Date.now() / 300_000) * 300, []); // 5-min rounded
  // While the cycle is still loading, use a degenerate window (from === to) so
  // useRewards / useCreditExpenses stay disabled and we don't fire a throwaway
  // DATA_START-wide fetch that gets replaced once the real cycle window is known.
  const fromSec = cycleLoading ? nowSec : (cycle?.endSec ?? DATA_START_SEC);

  const { data: rewards, isLoading: rewardsLoading } = useRewards(address, fromSec, nowSec);
  const { data: expenses, isLoading: expLoading } = useCreditExpenses(fromSec, nowSec);
  const { data: nodeState, isLoading: nsLoading } = useNodeState();

  const data = useMemo<OwnerRewards | undefined>(() => {
    if (!rewards || !nodeState) return undefined;
    const lower = address.toLowerCase();
    const { byNode, stakingAleph, unattributedAleph } = apportionOwnerRewards({
      address, rewards, expenses: expenses ?? [], nodeState,
    });
    const paidAleph = cycle?.rewards.get(lower);
    const oc = cycle?.onChain.get(lower);
    return {
      address: lower,
      cycleStartSec: fromSec,
      cycleEndSec: cycle?.endSec ?? null,
      totalAleph: rewards.totalAleph,
      bySource: rewards.bySource,
      byNode,
      stakingAleph,
      unattributedAleph,
      lastPaid:
        cycle && paidAleph !== undefined
          ? { aleph: paidAleph, timeSec: cycle.endSec, txHash: oc?.txHash ?? null, status: oc?.status ?? "pending" }
          : null,
    };
  }, [address, rewards, expenses, nodeState, cycle, fromSec]);

  return {
    data,
    isLoading: cycleLoading || rewardsLoading || nsLoading,
    isBreakdownLoading: expLoading,
  };
}
