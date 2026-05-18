"use client";

import { useId } from "react";
import type React from "react";
import { smoothPath, type Point } from "@/lib/smooth-path";
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
  // useId() can produce colons; strip them to keep url(#id) refs SSR-safe.
  const rawId = useId();
  const gradientId = `dual-line-grad${rawId.replace(/:/g, "")}`;

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

  const alephPoints: Point[] = buckets.map((b, i) => [xFor(i), yForAleph(b.aleph)]);
  const secondaryPoints: Point[] = buckets.map((b, i) => [
    xFor(i),
    yForSecondary(b.secondaryCount),
  ]);
  const alephLineD = smoothPath(alephPoints);
  const secondaryLineD = smoothPath(secondaryPoints);
  const alephAreaD = `${alephLineD} L${width},${height} L0,${height} Z`;

  const hasHighlight =
    highlightedIndex != null && highlightedIndex >= 0 && highlightedIndex < n;
  const highlight = hasHighlight ? buckets[highlightedIndex] : null;

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    if (!onHoverIndex) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onHoverIndex(nearestBucketIndex(x, rect.width, n));
  }

  const highlightXPct =
    hasHighlight ? (highlightedIndex / (n - 1)) * 100 : 0;
  const highlightYPctAleph =
    hasHighlight && highlight ? (yForAleph(highlight.aleph) / height) * 100 : 0;
  const highlightYPctSecondary =
    hasHighlight && highlight
      ? (yForSecondary(highlight.secondaryCount) / height) * 100
      : 0;

  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="block overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-success-500)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-success-500)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={alephAreaD} fill={`url(#${gradientId})`} />
        <path
          data-line
          d={secondaryLineD}
          fill="none"
          stroke="var(--color-primary-500)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.7}
          vectorEffect="non-scaling-stroke"
        />
        <path
          data-line
          d={alephLineD}
          fill="none"
          stroke="var(--color-success-500)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hasHighlight && highlight && (
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
      {hasHighlight && highlight && (
        <>
          <span
            data-testid="crosshair-dot"
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full"
            style={{
              left: `${highlightXPct}%`,
              top: `${highlightYPctAleph}%`,
              width: "7px",
              height: "7px",
              background: "var(--color-success-500)",
              transform: "translate(-50%, -50%)",
            }}
          />
          <span
            data-testid="crosshair-dot"
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full"
            style={{
              left: `${highlightXPct}%`,
              top: `${highlightYPctSecondary}%`,
              width: "6px",
              height: "6px",
              background: "var(--color-primary-500)",
              opacity: 0.9,
              transform: "translate(-50%, -50%)",
            }}
          />
        </>
      )}
    </div>
  );
}
