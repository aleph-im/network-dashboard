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
  pending: boolean;
  understaked: boolean;
  flagged: boolean;
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

function nodeColor(
  kind: GraphNodeKind,
  status: string,
  inactive: boolean,
  pending: boolean,
): string {
  if (kind === "country") return "var(--network-country)";
  if (inactive || DEAD_STATUSES.has(status)) {
    return "var(--color-neutral-500)";
  }
  if (status === "unreachable") return "var(--color-error-500)";
  // Pending — registered but not yet operational. Same grey as inactive; the
  // dotted outer ring (rendered below) is what distinguishes them visually.
  if (pending) return "var(--color-neutral-500)";
  if (kind === "ccn") return "var(--color-primary-500)";
  if (kind === "crn") return "var(--network-crn)";
  if (kind === "staker") return "var(--color-warning-500)";
  return "var(--network-edge-reward)";
}

export const NetworkNode = memo(function NetworkNode({
  id, x, y, kind, status, selected, highlighted, inactive, pending, understaked, flagged, dimmed, sizeScale,
}: Props) {
  const r = RADIUS[kind] * sizeScale;
  const color = nodeColor(kind, status, inactive, pending);
  const dottedRing = pending || understaked || flagged;
  // Understaked CCNs and flagged CRNs get the warning ring (amber) at full
  // body opacity — the previous 0.6 dim hid the cue. Pending and inactive
  // still dim because their separate visual (grey body + grey pending ring)
  // carries the signal.
  const opacity = dimmed
    ? 0.18
    : inactive
      ? 0.6
      : pending
        ? 0.6
        : 1;

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
      {kind === "ccn" && !dottedRing && (
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
      {dottedRing && (
        <circle
          cx={x}
          cy={y}
          r={r + 3}
          fill="none"
          stroke={understaked || flagged ? "var(--color-warning-500)" : color}
          strokeOpacity={0.6}
          strokeWidth={0.75}
          strokeDasharray="2 2"
          strokeLinecap="round"
        />
      )}
    </g>
  );
});
