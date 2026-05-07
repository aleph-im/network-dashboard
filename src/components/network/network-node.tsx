"use client";

import { memo } from "react";
import type { GraphNodeKind } from "@/lib/network-graph-model";

type Props = {
  x: number;
  y: number;
  kind: GraphNodeKind;
  status: string;
  selected: boolean;
  highlighted: boolean;
  inactive: boolean;
};

const RADIUS: Record<GraphNodeKind, number> = {
  ccn: 9,
  crn: 5,
  staker: 2,
  reward: 3,
};

const STATUS_FILL: Record<string, string> = {
  active: "var(--color-success-500)",
  unreachable: "var(--color-error-500)",
  removed: "var(--color-neutral-500)",
};

export const NetworkNode = memo(function NetworkNode({
  x, y, kind, status, selected, highlighted, inactive,
}: Props) {
  const r = RADIUS[kind];
  const fill = STATUS_FILL[status] ?? "var(--color-neutral-400)";
  const opacity = inactive ? 0.5 : 1;

  if (kind === "reward") {
    return (
      <g
        opacity={opacity}
        role="img"
        aria-label={`${kind.toUpperCase()} ${status}`}
      >
        <rect
          x={x - r}
          y={y - r}
          width={r * 2}
          height={r * 2}
          fill={fill}
        />
        {selected && (
          <rect
            x={x - r - 3}
            y={y - r - 3}
            width={(r + 3) * 2}
            height={(r + 3) * 2}
            fill="none"
            stroke="var(--color-primary-500)"
            strokeWidth={2}
          />
        )}
      </g>
    );
  }

  return (
    <g
      opacity={opacity}
      role="img"
      aria-label={`${kind.toUpperCase()} ${status}`}
    >
      {highlighted && (
        <circle
          cx={x}
          cy={y}
          r={r * 1.5}
          fill="none"
          stroke="var(--color-primary-500)"
          strokeOpacity={0.5}
          strokeWidth={2}
          className="network-node-pulse"
        />
      )}
      <circle cx={x} cy={y} r={r} fill={fill} />
      {kind === "ccn" && (
        <circle
          cx={x}
          cy={y}
          r={r + 2}
          fill="none"
          stroke={fill}
          strokeOpacity={0.4}
          strokeWidth={1.5}
        />
      )}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={r + 4}
          fill="none"
          stroke="var(--color-primary-500)"
          strokeWidth={2}
        />
      )}
    </g>
  );
});
