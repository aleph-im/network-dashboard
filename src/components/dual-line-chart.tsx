"use client";

import type React from "react";
import type { NodeEarningsBucket } from "@/hooks/use-node-earnings";

type Props = {
  buckets: NodeEarningsBucket[];
  width?: number;
  height?: number;
  highlightedIndex?: number | null;
  onHoverIndex?: (index: number) => void;
  onHoverEnd?: () => void;
};

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 120;

function nearestBucketIndex(
  pointerX: number,
  overlayWidth: number,
  bucketCount: number,
): number {
  if (bucketCount < 2 || overlayWidth <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, pointerX / overlayWidth));
  return Math.round(ratio * (bucketCount - 1));
}

export function DualLineChart({
  buckets,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  highlightedIndex = null,
  onHoverIndex,
  onHoverEnd,
}: Props) {
  if (buckets.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="block"
        aria-hidden="true"
      />
    );
  }

  const n = buckets.length;
  const maxAleph = Math.max(...buckets.map((b) => b.aleph), 0.0001);
  const maxSecondary = Math.max(...buckets.map((b) => b.secondaryCount), 0.0001);

  const xFor = (i: number) => (i / (n - 1)) * width;
  const yForAleph = (v: number) => height - (v / maxAleph) * height;
  const yForSecondary = (v: number) => height - (v / maxSecondary) * height;

  const alephPoints = buckets
    .map((b, i) => `${xFor(i).toFixed(1)},${yForAleph(b.aleph).toFixed(1)}`)
    .join(" ");
  const secondaryPoints = buckets
    .map((b, i) => `${xFor(i).toFixed(1)},${yForSecondary(b.secondaryCount).toFixed(1)}`)
    .join(" ");

  const hasHighlight =
    highlightedIndex != null && highlightedIndex >= 0 && highlightedIndex < n;
  const highlight = hasHighlight ? buckets[highlightedIndex] : null;

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    if (!onHoverIndex) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onHoverIndex(nearestBucketIndex(x, rect.width, n));
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="block overflow-visible"
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
      {hasHighlight && highlight && (
        <>
          <line
            x1={xFor(highlightedIndex)}
            y1={0}
            x2={xFor(highlightedIndex)}
            y2={height}
            stroke="currentColor"
            strokeOpacity={0.25}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={xFor(highlightedIndex)}
            cy={yForAleph(highlight.aleph)}
            r={3.5}
            fill="var(--color-success-500)"
          />
          <circle
            cx={xFor(highlightedIndex)}
            cy={yForSecondary(highlight.secondaryCount)}
            r={3}
            fill="var(--color-primary-500)"
            opacity={0.9}
          />
        </>
      )}
      {onHoverIndex && (
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={onHoverEnd}
        />
      )}
    </svg>
  );
}
