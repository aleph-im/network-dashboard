"use client";

import { memo } from "react";
import type { GraphNodeKind } from "@/lib/network-graph-model";

type Props = {
  id: string;
  x: number;
  y: number;
  kind: GraphNodeKind;
  status: string;
  selected: boolean;
  highlighted: boolean;
  inactive: boolean;
  dimmed: boolean;
  sizeScale: number;
};

export const RADIUS: Record<GraphNodeKind, number> = {
  ccn: 16,
  crn: 11,
  staker: 5,
  reward: 6,
  country: 22,
};

const DEAD_STATUSES = new Set(["removed", "unlinked", "decommissioned"]);

function nodeColor(kind: GraphNodeKind, status: string, inactive: boolean): string {
  if (kind === "country") return "var(--network-country)";
  if (inactive || DEAD_STATUSES.has(status)) {
    return "var(--color-neutral-500)";
  }
  if (status === "unreachable") {
    return "var(--color-error-500)";
  }
  if (kind === "ccn") return "var(--color-primary-500)";
  if (kind === "crn") return "var(--color-success-500)";
  if (kind === "staker") return "var(--color-warning-500)";
  return "var(--network-edge-reward)";
}

export const NetworkNode = memo(function NetworkNode({
  id, x, y, kind, status, selected, highlighted, inactive, dimmed, sizeScale,
}: Props) {
  const r = RADIUS[kind] * sizeScale;
  const color = nodeColor(kind, status, inactive);
  const opacity = dimmed ? 0.18 : inactive ? 0.6 : 1;

  if (kind === "reward") {
    return (
      <g
        data-id={id}
        opacity={opacity}
        role="img"
        aria-label={`${kind.toUpperCase()} ${status}`}
      >
        {selected && (
          <rect
            x={x - r - 8}
            y={y - r - 8}
            width={(r + 8) * 2}
            height={(r + 8) * 2}
            fill={color}
            fillOpacity={0.25}
          />
        )}
        <rect
          x={x - r}
          y={y - r}
          width={r * 2}
          height={r * 2}
          fill="var(--color-background)"
        />
        <rect
          x={x - r}
          y={y - r}
          width={r * 2}
          height={r * 2}
          fill={color}
          fillOpacity={0.18}
          stroke={color}
          strokeWidth={1}
        />
      </g>
    );
  }

  if (kind === "country") {
    return (
      <g
        data-id={id}
        opacity={dimmed ? 0.18 : 1}
        role="img"
        aria-label={`Country ${id.replace("country:", "")}`}
        style={{ cursor: "default" }}
      >
        {selected && (
          <circle cx={x} cy={y} r={r + 8} fill={color} fillOpacity={0.25} />
        )}
        <circle cx={x} cy={y} r={r} fill="var(--color-background)" />
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={color}
          fillOpacity={0.18}
          stroke={color}
          strokeWidth={0.75}
        />
        <circle
          cx={x}
          cy={y}
          r={r + 3}
          fill="none"
          stroke={color}
          strokeOpacity={0.3}
          strokeWidth={0.75}
        />
      </g>
    );
  }

  return (
    <g
      data-id={id}
      opacity={opacity}
      role="img"
      aria-label={`${kind.toUpperCase()} ${status}`}
      style={{ cursor: "default" }}
    >
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={r + 8}
          fill={color}
          fillOpacity={0.25}
        />
      )}
      {highlighted && (
        <circle
          cx={x}
          cy={y}
          r={r * 1.5}
          fill="none"
          stroke="var(--color-primary-500)"
          strokeOpacity={0.5}
          strokeWidth={1.5}
          className="network-node-pulse"
        />
      )}
      <circle cx={x} cy={y} r={r} fill="var(--color-background)" />
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={color}
        fillOpacity={0.18}
        stroke={color}
        strokeWidth={0.75}
      />
      {kind === "ccn" && (
        <circle
          cx={x}
          cy={y}
          r={r + 2}
          fill="none"
          stroke={color}
          strokeOpacity={0.3}
          strokeWidth={0.75}
        />
      )}
    </g>
  );
});
