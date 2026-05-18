"use client";

import { Card } from "@aleph-front/ds/card";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { formatAleph } from "@/lib/format";
import type { DistributionSummary } from "@/api/credit-types";

const COLORS = {
  storage: "var(--color-accent-500)",
  execution: "var(--color-success-500)",
  crn: "var(--color-success-500)",
  ccn: "var(--color-primary-400)",
  staker: "var(--color-warning-400)",
  devFund: "var(--color-error-400)",
};

type Row = {
  label: string;
  percent: number;
  color: string;
};

const STORAGE_ROWS: Row[] = [
  { label: "CCN", percent: 0.75, color: COLORS.ccn },
  { label: "Stakers", percent: 0.2, color: COLORS.staker },
  { label: "Dev fund", percent: 0.05, color: COLORS.devFund },
];

const EXECUTION_ROWS: Row[] = [
  { label: "CRN", percent: 0.6, color: COLORS.crn },
  { label: "Stakers", percent: 0.2, color: COLORS.staker },
  { label: "CCN", percent: 0.15, color: COLORS.ccn },
  { label: "Dev fund", percent: 0.05, color: COLORS.devFund },
];

type Props = {
  summary: DistributionSummary | undefined;
};

export function CreditFlowList({ summary }: Props) {
  if (!summary) {
    return (
      <Card padding="md" className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
      </Card>
    );
  }

  return (
    <Card padding="md" className="space-y-6">
      {summary.storageAleph > 0 && (
        <FlowSection
          id="storage"
          title="Storage"
          total={summary.storageAleph}
          accent={COLORS.storage}
          rows={STORAGE_ROWS}
        />
      )}
      {summary.executionAleph > 0 && (
        <FlowSection
          id="execution"
          title="Execution"
          total={summary.executionAleph}
          accent={COLORS.execution}
          rows={EXECUTION_ROWS}
        />
      )}
    </Card>
  );
}

function FlowSection({
  id,
  title,
  total,
  accent,
  rows,
}: {
  id: string;
  title: string;
  total: number;
  accent: string;
  rows: Row[];
}) {
  return (
    <section data-section={id} className="space-y-2">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ background: accent }}
          />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
        </div>
        <span className="font-mono text-xs tabular-nums">
          {formatAleph(total)}
        </span>
      </header>
      <ul className="space-y-1.5 pl-4">
        {rows.map((row) => (
          <li
            key={row.label}
            data-row
            className="flex items-center justify-between text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: row.color }}
              />
              <span>{row.label}</span>
              <span className="text-xs text-muted-foreground">
                {Math.round(row.percent * 100)}%
              </span>
            </span>
            <span className="font-mono text-xs tabular-nums">
              {formatAleph(total * row.percent)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
