"use client";

import { useId } from "react";
import type { SparklinePoint } from "@/lib/sparkline-data";

type Props = {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
};

export function Sparkline({
  data,
  width = 200,
  height = 40,
  color = "currentColor",
  className,
}: Props) {
  // useId() produces `:r0:` style IDs — colons are valid in HTML id but
  // need escaping in CSS url(). Strip them to avoid needing CSS.escape
  // (which doesn't exist in Node.js / SSR).
  const rawId = useId();
  const gradientId = `sparkline-grad${rawId.replace(/:/g, "")}`;

  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Padding so the line doesn't clip the stroke at edges
  const pad = 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * innerW;
    const y = pad + innerH - ((d.value - min) / range) * innerH;
    return `${x},${y}`;
  });

  const polylinePoints = points.join(" ");

  // Closed polygon for the fill area: line points + bottom-right + bottom-left
  const fillPoints = [
    ...points,
    `${pad + innerW},${pad + innerH}`,
    `${pad},${pad + innerH}`,
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={fillPoints}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
