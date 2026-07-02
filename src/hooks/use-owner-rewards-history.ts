"use client";

import { useMemo } from "react";
import { useRewards, DATA_START_SEC } from "@/hooks/use-rewards";
import type { BySource, RewardsBucket } from "@/api/rewards-types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type MonthlyReward = {
  /** Bucket start (UTC month boundary), epoch seconds. */
  startSec: number;
  /** Short month label; 2-digit year appended when it differs from now. */
  label: string;
  bySource: BySource;
  /** ALEPH accrued in the month. */
  total: number;
  /** True for the in-progress current month (partial data). */
  partial: boolean;
};

/** Hour-aligned "now". The rewards API truncates bounds to whole hours, so an
 *  hour-granular upper bound keeps the query key stable within the hour. */
function hourAlignedNowSec(): number {
  return Math.floor(Date.now() / 3_600_000) * 3600;
}

function toMonthly(b: RewardsBucket, nowSec: number): MonthlyReward {
  const d = new Date(b.startSec * 1000);
  const now = new Date(nowSec * 1000);
  const month = MONTHS[d.getUTCMonth()]!;
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  const label = sameYear ? month : `${month} '${String(d.getUTCFullYear()).slice(2)}`;
  const partial =
    d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  return { startSec: b.startSec, label, bySource: b.bySource, total: b.aleph, partial };
}

/** Per-address reward accrual as one entry per calendar month since DATA_START,
 *  split by source. One `1mo`-bucketed rewards query; reads only each bucket's
 *  `bySource` (no per-role split, no per-node apportionment). */
export function useOwnerRewardsHistory(address: string): {
  months: MonthlyReward[];
  isLoading: boolean;
  isError: boolean;
} {
  const nowSec = hourAlignedNowSec();
  const { data, isLoading, isError } = useRewards(address, DATA_START_SEC, nowSec, "1mo");
  const months = useMemo(
    () => (data?.buckets ?? []).map((b) => toMonthly(b, nowSec)),
    [data, nowSec],
  );
  return { months, isLoading, isError };
}
