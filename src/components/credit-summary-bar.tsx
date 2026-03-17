"use client";

import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { formatAleph } from "@/lib/format";
import type { DistributionSummary } from "@/api/credit-types";

type CardProps = {
  label: string;
  value: number | undefined;
  color?: string;
  isLoading: boolean;
};

function CreditStatCard({ label, value, color, isLoading }: CardProps) {
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
      <p className="mt-auto pt-2 text-xs text-muted-foreground/60">ALEPH</p>
    </div>
  );
}

type Props = {
  summary: DistributionSummary | undefined;
  isLoading: boolean;
};

export function CreditSummaryBar({ summary, isLoading }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <CreditStatCard
        label="Total Revenue"
        value={summary?.totalAleph}
        isLoading={isLoading}
      />
      <CreditStatCard
        label="Storage"
        value={summary?.storageAleph}
        color="var(--color-info-400)"
        isLoading={isLoading}
      />
      <CreditStatCard
        label="Execution"
        value={summary?.executionAleph}
        color="var(--color-success-500)"
        isLoading={isLoading}
      />
      <CreditStatCard
        label="Dev Fund (5%)"
        value={summary?.devFundAleph}
        color="var(--color-muted-foreground)"
        isLoading={isLoading}
      />
    </div>
  );
}
