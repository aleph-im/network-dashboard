"use client";

import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import type { DistributionSummary } from "@/api/credit-types";

type InsightProps = {
  label: string;
  value: string | number;
};

function Insight({ label, value }: InsightProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-foreground/[0.06] py-2 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

type Props = {
  summary: DistributionSummary | undefined;
  isLoading: boolean;
};

export function CreditInsightsRow({ summary, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const priceDisplay = summary.creditPriceAleph > 0
    ? summary.creditPriceAleph.toExponential(2)
    : "—";

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-0 rounded-lg border border-edge bg-muted/20 px-5 py-2 lg:grid-cols-4">
      <Insight label="Credit Price" value={`${priceDisplay} ALEPH`} />
      <Insight label="Unique Payers" value={summary.uniquePayers} />
      <Insight label="Active VMs" value={summary.uniqueVms} />
      <Insight label="Active CRNs" value={summary.uniqueCrns} />
    </div>
  );
}
