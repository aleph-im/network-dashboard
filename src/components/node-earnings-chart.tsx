"use client";

import { useState } from "react";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { DualLineChart } from "@/components/dual-line-chart";
import type { NodeEarningsBucket } from "@/hooks/use-node-earnings";

type Props = {
  buckets: NodeEarningsBucket[];
  primaryLabel: string;
  secondaryLabel: string;
  height?: number;
  emptyHint?: string;
  loading?: boolean;
};

const HOURLY_BUCKET_MAX_SEC = 3600 + 60;

function bucketDurationSec(buckets: NodeEarningsBucket[]): number {
  const first = buckets[0];
  const second = buckets[1];
  if (!first || !second) return 3600;
  return second.time - first.time;
}

function formatBucketTime(epochSec: number, durationSec: number): string {
  const d = new Date(epochSec * 1000);
  const isHourly = durationSec <= HOURLY_BUCKET_MAX_SEC;
  if (isHourly) {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
}

type HoverCardProps = {
  bucket: NodeEarningsBucket;
  primaryLabel: string;
  secondaryLabel: string;
  durationSec: number;
  xPct: number;
};

function HoverCard({
  bucket,
  primaryLabel,
  secondaryLabel,
  durationSec,
  xPct,
}: HoverCardProps) {
  const label = formatBucketTime(bucket.time, durationSec);
  // Anchor to the side of the crosshair so the line + dots stay visible.
  // Right side when the cursor is in the left half; left side otherwise.
  const onLeftHalf = xPct < 0.5;
  const transform = onLeftHalf
    ? "translate(8px, 0)"
    : "translate(calc(-100% - 8px), 0)";

  return (
    <div
      data-testid="hover-card"
      data-side={onLeftHalf ? "right" : "left"}
      className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-md border border-edge bg-surface px-2.5 py-2 text-xs shadow-lg"
      style={{ left: `${xPct * 100}%`, transform }}
    >
      <div className="mb-1 text-[10px] text-muted-foreground">{label}</div>
      <div className="flex justify-between gap-3 font-mono">
        <span className="text-muted-foreground">{primaryLabel}</span>
        <span style={{ color: "var(--color-success-500)" }}>
          {bucket.aleph.toFixed(2)}
        </span>
      </div>
      <div className="flex justify-between gap-3 font-mono">
        <span className="text-muted-foreground">{secondaryLabel}</span>
        <span style={{ color: "var(--color-primary-500)" }}>
          {bucket.secondaryCount}
        </span>
      </div>
    </div>
  );
}

export function NodeEarningsChart({
  buckets,
  primaryLabel,
  secondaryLabel,
  height = 120,
  emptyHint,
  loading = false,
}: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (loading) {
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
        <Skeleton style={{ height }} className="w-full" />
      </div>
    );
  }

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

  const durationSec = bucketDurationSec(buckets);
  const xPct =
    hoverIndex != null ? hoverIndex / (buckets.length - 1) : 0;

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
      <div className="relative">
        <DualLineChart
          buckets={buckets}
          height={height}
          highlightedIndex={hoverIndex}
          onHoverIndex={setHoverIndex}
          onHoverEnd={() => setHoverIndex(null)}
        />
        {hoverIndex != null && buckets[hoverIndex] && (
          <HoverCard
            bucket={buckets[hoverIndex]}
            primaryLabel={primaryLabel}
            secondaryLabel={secondaryLabel}
            durationSec={durationSec}
            xPct={xPct}
          />
        )}
      </div>
    </div>
  );
}
