"use client";

import { useMemo } from "react";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { formatAleph, formatUsd } from "@/lib/format";
import { buildRevenueSeries } from "@/lib/revenue-series";
import { Sparkline } from "@/components/sparkline";
import type { SparklinePoint } from "@/lib/sparkline-data";
import type { BuyflowData } from "@/api/buyflow-types";

type CardProps = {
  label: string;
  display: string | undefined;
  subtitle: string;
  color?: string;
  isLoading: boolean;
  sparklineData?: SparklinePoint[] | undefined;
};

function RevenueStatCard({
  label,
  display,
  subtitle,
  color,
  isLoading,
  sparklineData,
}: CardProps) {
  return (
    <div
      className="stat-card flex flex-col border border-edge bg-muted/30 p-4 md:p-6"
      style={color ? ({ "--stat-tint": color } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-2">
        {color ? (
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          {label}
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="mt-3 h-11 w-24" />
      ) : (
        <p
          className="mt-3 font-heading text-3xl font-extrabold tabular-nums tracking-tight md:text-4xl"
          {...(color ? { style: { color } } : {})}
        >
          {display ?? "—"}
        </p>
      )}
      {sparklineData && sparklineData.length >= 2 && !isLoading ? (
        <div className="-mx-4 -mb-4 mt-3 overflow-hidden rounded-b-[inherit] md:-mx-6 md:-mb-6">
          <Sparkline
            data={sparklineData}
            height={48}
            color="var(--color-primary-400)"
          />
        </div>
      ) : (
        <p className="mt-auto pt-2 text-xs text-muted-foreground/60">{subtitle}</p>
      )}
    </div>
  );
}

type Props = {
  data: BuyflowData | undefined;
  isLoading: boolean;
};

export function RevenueSummaryBar({ data, isLoading }: Props) {
  const sparklineData = useMemo(() => {
    if (!data || data.monthly.length === 0) return undefined;
    return buildRevenueSeries(data.monthly);
  }, [data]);

  const credits = data?.credits;
  const chain = data?.chain;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <RevenueStatCard
        label="Total Revenue"
        display={
          data ? formatUsd(data.revenue?.totalUsd ?? data.credits.totalUsd) : undefined
        }
        subtitle="all payments processed on-chain"
        isLoading={isLoading}
        sparklineData={sparklineData}
      />
      <RevenueStatCard
        label="Credit Purchases"
        display={credits ? formatUsd(credits.totalUsd) : undefined}
        subtitle={
          credits
            ? `${credits.completedPurchases.toLocaleString("en-US")} completed via Credit API`
            : "completed via Credit API"
        }
        color="var(--color-accent-500)"
        isLoading={isLoading}
      />
      <RevenueStatCard
        label="ALEPH Distributed"
        display={chain ? formatAleph(chain.alephDistributed) : undefined}
        subtitle="to CRNs · CCNs · stakers"
        color="var(--color-success-500)"
        isLoading={isLoading}
      />
      <RevenueStatCard
        label="ALEPH Market-Bought"
        display={chain ? formatAleph(chain.alephMarketBought) : undefined}
        subtitle="from stable-coin payments"
        color="var(--color-primary-400)"
        isLoading={isLoading}
      />
    </div>
  );
}
