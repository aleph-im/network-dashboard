"use client";

import { memo } from "react";
import type { GraphLayer } from "@/lib/network-graph-model";

type Props = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: GraphLayer;
  faded: boolean;
};

const STROKE: Record<GraphLayer, string> = {
  structural: "currentColor",
  owner: "var(--network-edge-owner)",
  staker: "var(--color-warning-500)",
  reward: "var(--network-edge-reward)",
};

const OPACITY: Record<GraphLayer, number> = {
  structural: 0.4,
  owner: 0.25,
  staker: 0.2,
  reward: 0.2,
};

const DASH: Partial<Record<GraphLayer, string>> = {
  owner: "3 3",
  reward: "1 4",
};

export const NetworkEdge = memo(function NetworkEdge({
  x1, y1, x2, y2, type, faded,
}: Props) {
  const opacity = faded ? OPACITY[type] * 0.2 : OPACITY[type];
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={STROKE[type]}
      strokeOpacity={opacity}
      strokeWidth={1}
      {...(DASH[type] ? { strokeDasharray: DASH[type] } : {})}
    />
  );
});
