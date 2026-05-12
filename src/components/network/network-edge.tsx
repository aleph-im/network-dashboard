"use client";

import { memo } from "react";
import type { EdgeType } from "@/lib/network-graph-model";

type Props = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: EdgeType;
  faded: boolean;
  highlightColor?: string;
  withArrow?: boolean;
};

const STROKE: Record<EdgeType, string> = {
  structural: "currentColor",
  owner: "currentColor",
  staker: "var(--color-warning-500)",
  reward: "var(--network-edge-reward)",
  geo: "var(--network-country)",
  migration: "var(--color-warning-500)",
};

const OPACITY: Record<EdgeType, number> = {
  structural: 0.6,
  owner: 0.2,
  staker: 0.2,
  reward: 0.2,
  geo: 0.35,
  migration: 0.9,
};

const DASH: Partial<Record<EdgeType, string>> = {
  owner: "1.5 1",
  reward: "0 0.4",
  geo: "1 2",
};

export const NetworkEdge = memo(function NetworkEdge({
  x1, y1, x2, y2, type, faded, highlightColor, withArrow,
}: Props) {
  const dash = DASH[type];
  const stroke = highlightColor ?? STROKE[type];
  const opacity = highlightColor
    ? type === "staker" ? 1 : 0.9
    : faded ? OPACITY[type] * 0.2 : OPACITY[type];
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={dash ? 0.5 : 1}
      {...(dash ? { strokeDasharray: dash, strokeLinecap: "round" } : {})}
      {...(withArrow ? { markerEnd: "url(#arrow-end)" } : {})}
    />
  );
});
