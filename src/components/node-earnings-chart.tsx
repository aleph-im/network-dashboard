"use client";

import { DualLineChart } from "@/components/dual-line-chart";
import type { NodeEarningsBucket } from "@/hooks/use-node-earnings";

type Props = {
  buckets: NodeEarningsBucket[];
  primaryLabel: string;
  secondaryLabel: string;
  height?: number;
  emptyHint?: string;
};

export function NodeEarningsChart({
  buckets,
  primaryLabel,
  secondaryLabel,
  height = 120,
  emptyHint,
}: Props) {
  const hasData = buckets.some((b) => b.aleph > 0 || b.secondaryCount > 0);
  if (!hasData || buckets.length < 2) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground"
        style={{ height }}
      >
        <span>No accrued earnings in this window</span>
        {emptyHint && <span className="text-xs italic">{emptyHint}</span>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-3 bg-success-500"
          />
          {primaryLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-3 bg-primary-500"
          />
          {secondaryLabel}
        </span>
      </div>
      <DualLineChart buckets={buckets} height={height} />
    </div>
  );
}
