"use client";

import { useMemo } from "react";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { formatAleph } from "@/lib/format";
import type { CreditExpense, DistributionSummary } from "@/api/credit-types";
import {
  buildCumulativeSeries,
  type SparklinePoint,
} from "@/lib/sparkline-data";
import { Sparkline } from "@/components/sparkline";

type Range = "24h" | "7d" | "30d";

const BUCKET_SECONDS: Record<Range, number> = {
  "24h": 3600,
  "7d": 6 * 3600,
  "30d": 86400,
};

type CardProps = {
  label: string;
  value: number | undefined;
  color?: string;
  isLoading: boolean;
  sparklineData: SparklinePoint[] | undefined;
};

function CreditStatCard({ label, value, color, isLoading, sparklineData }: CardProps) {
  return (
    <div
      className="stat-card flex flex-col border border-edge bg-muted/30 p-6"
      style={
        color
          ? ({ "--stat-tint": color } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        {color ? (
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          {label}
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="mt-3 h-11 w-24" />
      ) : (
        <p
          className="mt-3 font-heading text-4xl font-extrabold tabular-nums tracking-tight"
          {...(color ? { style: { color } } : {})}
        >
          {formatAleph(value ?? 0)}
        </p>
      )}
      {sparklineData && sparklineData.length >= 2 && !isLoading ? (
        <div className="-mx-6 -mb-6 mt-3 overflow-hidden rounded-b-[inherit]">
          <Sparkline
            data={sparklineData}
            height={48}
            color="var(--color-primary-400)"
          />
        </div>
      ) : (
        <p className="mt-auto pt-2 text-xs text-muted-foreground/60">ALEPH</p>
      )}
    </div>
  );
}

type Props = {
  summary: DistributionSummary | undefined;
  expenses: CreditExpense[] | undefined;
  range: Range;
  isLoading: boolean;
};

export function CreditSummaryBar({ summary, expenses, range, isLoading }: Props) {
  const sparklineData = useMemo(() => {
    if (!Array.isArray(expenses) || expenses.length === 0) return undefined;
    return buildCumulativeSeries(expenses, BUCKET_SECONDS[range]);
  }, [expenses, range]);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <CreditStatCard
        label="Total Revenue"
        value={summary?.totalAleph}
        isLoading={isLoading}
        sparklineData={sparklineData}
      />
      <CreditStatCard
        label="Storage"
        value={summary?.storageAleph}
        color="var(--color-accent-500)"
        isLoading={isLoading}
        sparklineData={undefined}
      />
      <CreditStatCard
        label="Execution"
        value={summary?.executionAleph}
        color="var(--color-success-500)"
        isLoading={isLoading}
        sparklineData={undefined}
      />
      <CreditStatCard
        label="Dev Fund (5%)"
        value={summary?.devFundAleph}
        color="var(--color-error-400)"
        isLoading={isLoading}
        sparklineData={undefined}
      />
    </div>
  );
}
