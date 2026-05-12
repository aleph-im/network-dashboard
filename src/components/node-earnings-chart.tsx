"use client";

import type { NodeEarningsBucket } from "@/hooks/use-node-earnings";

type Props = {
  buckets: NodeEarningsBucket[];
  primaryLabel: string;
  secondaryLabel: string;
  height?: number;
  /** Optional role-specific hint shown below the empty-state heading. */
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

  const width = 600;
  const maxAleph = Math.max(...buckets.map((b) => b.aleph), 0.0001);
  const maxSecondary = Math.max(
    ...buckets.map((b) => b.secondaryCount),
    0.0001,
  );

  const n = buckets.length;
  const xFor = (i: number) => (i / (n - 1)) * width;
  const yForAleph = (v: number) => height - (v / maxAleph) * height;
  const yForSecondary = (v: number) => height - (v / maxSecondary) * height;

  const alephPoints = buckets
    .map((b, i) => `${xFor(i).toFixed(1)},${yForAleph(b.aleph).toFixed(1)}`)
    .join(" ");
  const secondaryPoints = buckets
    .map(
      (b, i) =>
        `${xFor(i).toFixed(1)},${yForSecondary(b.secondaryCount).toFixed(1)}`,
    )
    .join(" ");

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
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="block"
        aria-hidden="true"
      >
        <polyline
          points={secondaryPoints}
          fill="none"
          stroke="var(--color-primary-500)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.7}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={alephPoints}
          fill="none"
          stroke="var(--color-success-500)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
