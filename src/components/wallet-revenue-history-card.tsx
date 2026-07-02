"use client";

import { Card } from "@aleph-front/ds/card";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { RewardHistoryChart } from "@/components/reward-history-chart";
import { REWARD_SOURCE_META } from "@/lib/reward-source-meta";
import { useOwnerRewardsHistory } from "@/hooks/use-owner-rewards-history";

export function WalletRevenueHistoryCard({ address }: { address: string }) {
  const { months, isLoading } = useOwnerRewardsHistory(address);
  const hasData = months.some((m) => m.total > 0);

  if (isLoading) {
    return (
      <Card padding="md">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Node revenue history
        </h3>
        <Skeleton className="mt-4 h-40 w-full bg-edge" />
      </Card>
    );
  }

  // Non-earning wallet, or the feed never loaded (page-level revenue card
  // surfaces that outage) — render nothing rather than an empty/duplicate card.
  // A transient error with retained placeholder data falls through and keeps
  // showing the last-good chart, matching WalletRevenueCard's behavior.
  if (!hasData) return null;

  return (
    <Card padding="md">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Node revenue history
      </h3>
      <p className="mb-4 text-[11px] text-muted-foreground opacity-60">
        ALEPH accrued per month by source, since May 2026.
      </p>
      <RewardHistoryChart months={months} />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {REWARD_SOURCE_META.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${s.dotClass}`} />
            {s.label}
          </span>
        ))}
      </div>
    </Card>
  );
}
