"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "@aleph-front/ds/card";
import { formatAleph } from "@/lib/format";
import type { DistributionSummary } from "@/api/credit-types";

// ── Constants ──────────────────────────────────

const COLORS = {
  storage: "var(--color-accent-500)",
  execution: "var(--color-success-500)",
  crn: "var(--color-success-500)",
  ccn: "var(--color-primary-400)",
  staker: "var(--color-warning-400)",
  devFund: "var(--color-error-400)",
};

const W = 900;
const H = 420;
const SRC_X = 20;
const DEST_X = W - 20;
const BOX_W = 140;
const BOX_H = 50;

// ── Types ──────────────────────────────────────

type PathData = {
  id: string;
  label: string;
  value: number;
  sourceColor: string;
  destColor: string;
  sourceId: string;
  destId: string;
  d: string;
  thickness: number;
  labelX: number;
  labelY: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

// ── Helpers ────────────────────────────────────

function bezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const cx = (x1 + x2) / 2;
  return `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
}

function bezierPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } {
  const cx1 = (x1 + x2) / 2;
  const cx2 = cx1;
  const mt = 1 - t;
  const mx =
    mt * mt * mt * x1 +
    3 * mt * mt * t * cx1 +
    3 * mt * t * t * cx2 +
    t * t * t * x2;
  const my =
    mt * mt * mt * y1 +
    3 * mt * mt * t * y1 +
    3 * mt * t * t * y2 +
    t * t * t * y2;
  return { x: mx, y: my };
}

function seededRandom(pathIdx: number, particleIdx: number): number {
  const x = Math.sin((pathIdx + 1) * 1000 + particleIdx * 137.5) * 10000;
  return x - Math.floor(x);
}


// ── Sub-components ─────────────────────────────

function Arrowhead({
  x,
  y,
  color,
  delay,
}: {
  x: number;
  y: number;
  color: string;
  delay: number;
}) {
  return (
    <polygon
      points={`${x - 9},${y - 4} ${x},${y} ${x - 9},${y + 4}`}
      fill={color}
      fillOpacity={0.6}
      style={{
        opacity: 0,
        animation: `fade-in 0.25s ease ${delay}s forwards`,
      }}
    />
  );
}

function FlowBox({
  x,
  y,
  label,
  value,
  color,
  align = "left",
  isHighlighted = false,
  isDimmed = false,
  entranceDelay = 0,
}: {
  x: number;
  y: number;
  label: string;
  value: string;
  color: string;
  align?: "left" | "right";
  isHighlighted?: boolean;
  isDimmed?: boolean;
  entranceDelay?: number;
}) {
  const rx = align === "right" ? x - BOX_W : x;
  return (
    <g
      style={{
        opacity: 0,
        animation: `fade-in 0.4s ease ${entranceDelay}s forwards`,
      }}
    >
      <g
        style={{
          opacity: isDimmed ? 0.5 : 1,
          transition: "opacity 0.3s ease",
        }}
      >
        {/* Accent bar for source (left) boxes */}
        {align === "left" && (
          <rect
            x={rx}
            y={y - BOX_H / 2 + 6}
            width={3}
            height={BOX_H - 12}
            rx={1.5}
            fill={color}
            opacity={isHighlighted ? 0.9 : 0.5}
            style={{ transition: "opacity 0.3s" }}
          />
        )}
        <rect
          x={rx}
          y={y - BOX_H / 2}
          width={BOX_W}
          height={BOX_H}
          rx={8}
          fill="var(--color-surface)"
          stroke={color}
          strokeWidth={isHighlighted ? 2 : 1.5}
          strokeOpacity={isHighlighted ? 0.7 : 0.3}
          style={{ transition: "stroke-width 0.3s, stroke-opacity 0.3s" }}
        />
        <text
          x={rx + BOX_W / 2}
          y={y - 6}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px] font-semibold uppercase tracking-widest"
        >
          {label}
        </text>
        <text
          x={rx + BOX_W / 2}
          y={y + 14}
          textAnchor="middle"
          className="text-[13px] font-bold tabular-nums"
          fill={color}
        >
          {value}
        </text>
      </g>
    </g>
  );
}

function AnimatedFlow({
  pathData,
  index,
  isHighlighted,
  isDimmed,
  onMouseEnter,
  onMouseLeave,
}: {
  pathData: PathData;
  index: number;
  isHighlighted: boolean;
  isDimmed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const measureRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);

  const { d, destColor, thickness, label, value, labelX, labelY, id } =
    pathData;

  useEffect(() => {
    if (measureRef.current) {
      setPathLength(measureRef.current.getTotalLength());
    }
  }, [d]);

  const strokeW = Math.max(1.5, Math.min(thickness, 8));
  const entranceDelay = 0.1 + 0.08 * index;
  const entranceDuration = 0.5 + (pathLength / 1200) * 0.5;
  const flowDelay = entranceDelay + entranceDuration + 0.1;
  const ready = pathLength > 0;

  const particleCount = Math.max(10, Math.round(thickness * 2.5));
  const baseDur = 4.5 + index * 0.3;
  const baseR = Math.max(1.5, strokeW / 3);

  return (
    <g
      style={{
        opacity: isDimmed ? 0.35 : 1,
        transition: "opacity 0.3s ease",
      }}
      className="cursor-pointer"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Invisible measurement path */}
      <path ref={measureRef} d={d} fill="none" stroke="none" />

      {/* Wider hit area for hover */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(strokeW + 16, 24)}
      />

      {ready && (
        <>
          {/* Gradient background path — entrance draw animation */}
          <path
            d={d}
            fill="none"
            stroke={`url(#grad-${id})`}
            strokeWidth={isHighlighted ? strokeW + 3 : strokeW}
            strokeLinecap="round"
            style={{
              strokeOpacity: isHighlighted ? 0.25 : 0.15,
              strokeDasharray: pathLength,
              strokeDashoffset: pathLength,
              animation: `flow-draw ${entranceDuration}s ease-out ${entranceDelay}s forwards`,
              transition: "stroke-width 0.3s, stroke-opacity 0.3s",
            }}
          />

          {/* Particles — appear after entrance draw completes */}
          {Array.from({ length: particleCount }).map((_, j) => {
            const rng = seededRandom(index, j);
            const dur = baseDur + (rng - 0.5) * 1.2;
            const r = baseR * (0.5 + rng * 0.8);
            const begin =
              flowDelay +
              j * (baseDur / particleCount) +
              (rng - 0.5) * 0.4;
            const opacity = 0.5 + rng * 0.4;
            const hasGlow = seededRandom(index + 50, j) < 0.2;

            return (
              <circle
                key={j}
                r={hasGlow ? r * 1.6 : r}
                fill={destColor}
                opacity={hasGlow ? 0.9 : opacity}
                {...(hasGlow ? { filter: "url(#particle-glow)" } : {})}
              >
                <animateMotion
                  dur={`${dur}s`}
                  repeatCount="indefinite"
                  begin={`${begin}s`}
                  calcMode="linear"
                >
                  <mpath href={`#flow-${id}`} />
                </animateMotion>
              </circle>
            );
          })}

          {/* Percentage pill badge — expands on hover to show ALEPH amount */}
          <g
            style={{
              opacity: 0,
              animation: `fade-in 0.3s ease ${flowDelay}s forwards`,
            }}
          >
            <rect
              x={isHighlighted ? labelX - 40 : labelX - 20}
              y={isHighlighted ? labelY - 15 : labelY - 14}
              width={isHighlighted ? 80 : 40}
              height={isHighlighted ? 33 : 22}
              rx={9}
              fill="var(--color-surface)"
              stroke={destColor}
              strokeWidth={isHighlighted ? 1.5 : 1}
              strokeOpacity={isHighlighted ? 0.6 : 0.4}
              style={{ transition: "all 0.2s ease" }}
            />
            <text
              x={labelX}
              y={isHighlighted ? labelY - 1 : labelY}
              textAnchor="middle"
              className="text-[10px] font-semibold tabular-nums"
              fill={destColor}
            >
              {label}
            </text>
            {isHighlighted && (
              <text
                x={labelX}
                y={labelY + 11}
                textAnchor="middle"
                className="text-[9px] font-bold tabular-nums"
                fill={destColor}
                fillOpacity={0.7}
              >
                {formatAleph(value)}
              </text>
            )}
          </g>
        </>
      )}
    </g>
  );
}

// ── Main ───────────────────────────────────────

type Props = {
  summary: DistributionSummary;
};

export function CreditFlowDiagram({ summary }: Props) {
  const { storageAleph, executionAleph, totalAleph } = summary;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const handleHover = useCallback(
    (idx: number | null) => setHoveredIdx(idx),
    [],
  );

  if (totalAleph === 0) {
    return (
      <Card className="flex h-48 items-center justify-center text-muted-foreground/50">
        No credit expenses in this period
      </Card>
    );
  }

  // Source positions (left)
  const storY = 100;
  const execY = 320;

  // Destination positions (right)
  const crnY = 70;
  const ccnY = 170;
  const stakerY = 270;
  const devY = 370;

  // Compute amounts
  const storCcn = storageAleph * 0.75;
  const storStaker = storageAleph * 0.2;
  const storDev = storageAleph * 0.05;
  const execCrn = executionAleph * 0.6;
  const execCcn = executionAleph * 0.15;
  const execStaker = executionAleph * 0.2;
  const execDev = executionAleph * 0.05;

  const maxAmount = Math.max(
    storCcn, storStaker, storDev,
    execCrn, execCcn, execStaker, execDev,
  );
  const scale = (v: number) =>
    maxAmount > 0 ? (v / maxAmount) * 10 : 1;

  const srcRight = SRC_X + BOX_W;
  const destLeft = DEST_X - BOX_W;

  // Build paths
  const paths: PathData[] = [];
  let idx = 0;

  function makePath(
    label: string, value: number,
    sourceColor: string, destColor: string,
    sourceId: string, destId: string,
    fromY: number, toY: number,
    t = 0.5,
  ): PathData {
    const pt = bezierPoint(srcRight, fromY, destLeft, toY, t);
    return {
      id: `s${idx++}`, label, value,
      sourceColor, destColor, sourceId, destId,
      d: bezierPath(srcRight, fromY, destLeft, toY),
      thickness: scale(value),
      labelX: pt.x, labelY: pt.y,
      fromX: srcRight, fromY, toX: destLeft, toY,
    };
  }

  if (storageAleph > 0) {
    paths.push(makePath("75%", storCcn, COLORS.storage, COLORS.ccn, "storage", "ccn", storY - 10, ccnY, 0.35));
    paths.push(makePath("20%", storStaker, COLORS.storage, COLORS.staker, "storage", "staker", storY + 10, stakerY, 0.45));
    paths.push(makePath("5%", storDev, COLORS.storage, COLORS.devFund, "storage", "dev", storY + 20, devY, 0.3));
  }

  if (executionAleph > 0) {
    paths.push(makePath("60%", execCrn, COLORS.execution, COLORS.crn, "execution", "crn", execY - 20, crnY, 0.65));
    paths.push(makePath("15%", execCcn, COLORS.execution, COLORS.ccn, "execution", "ccn", execY - 5, ccnY, 0.55));
    paths.push(makePath("20%", execStaker, COLORS.execution, COLORS.staker, "execution", "staker", execY + 5, stakerY, 0.55));
    paths.push(makePath("5%", execDev, COLORS.execution, COLORS.devFund, "execution", "dev", execY + 20, devY, 0.7));
  }

  // Derive highlighted box IDs from hovered path
  const hoveredPath = hoveredIdx !== null ? paths[hoveredIdx] : null;
  const highlightedBoxes = hoveredPath
    ? new Set([hoveredPath.sourceId, hoveredPath.destId])
    : new Set<string>();
  const anyHovered = hoveredIdx !== null;

  // Collect unique destination IDs that have at least one path
  const activeDestIds = new Set(paths.map((p) => p.destId));

  // Arrowhead positions keyed by destId
  const destPositions: Record<string, { y: number; color: string }> = {
    crn: { y: crnY, color: COLORS.crn },
    ccn: { y: ccnY, color: COLORS.ccn },
    staker: { y: stakerY, color: COLORS.staker },
    dev: { y: devY, color: COLORS.devFund },
  };

  const maxEntranceEnd = paths.reduce((max, _, i) => {
    const delay = 0.1 + 0.08 * i;
    const dur = 0.5 + 0.4;
    return Math.max(max, delay + dur);
  }, 0);

  return (
    <Card className="overflow-x-auto p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto w-full max-w-[900px]"
        style={{ minWidth: 600 }}
      >
        <defs>
          {/* Gradient definitions: source color → dest color */}
          {paths.map((p) => (
            <linearGradient
              key={`grad-${p.id}`}
              id={`grad-${p.id}`}
              gradientUnits="userSpaceOnUse"
              x1={p.fromX}
              y1={p.fromY}
              x2={p.toX}
              y2={p.toY}
            >
              <stop offset="0%" stopColor={p.sourceColor} />
              <stop offset="100%" stopColor={p.destColor} />
            </linearGradient>
          ))}
          {/* Glow filter for highlight particles */}
          <filter id="particle-glow" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Path definitions for animateMotion particle references */}
          {paths.map((p) => (
            <path key={`def-${p.id}`} id={`flow-${p.id}`} d={p.d} />
          ))}
        </defs>

        {/* Animated flow paths with particles */}
        {paths.map((p, i) => (
          <AnimatedFlow
            key={p.id}
            pathData={p}
            index={i}
            isHighlighted={hoveredIdx === i}
            isDimmed={anyHovered && hoveredIdx !== i}
            onMouseEnter={() => handleHover(i)}
            onMouseLeave={() => handleHover(null)}
          />
        ))}

        {/* Arrowheads at destination ends */}
        {Object.entries(destPositions)
          .filter(([id]) => activeDestIds.has(id))
          .map(([id, { y, color }], i) => (
            <g
              key={id}
              style={{
                opacity: anyHovered && !highlightedBoxes.has(id) ? 0.35 : 1,
                transition: "opacity 0.3s ease",
              }}
            >
              <Arrowhead
                x={destLeft}
                y={y}
                color={color}
                delay={maxEntranceEnd + 0.05 * i}
              />
            </g>
          ))}

        {/* Source boxes (left) */}
        {storageAleph > 0 && (
          <FlowBox
            x={SRC_X}
            y={storY}
            label="Storage"
            value={formatAleph(storageAleph)}
            color={COLORS.storage}
            isHighlighted={highlightedBoxes.has("storage")}
            isDimmed={anyHovered && !highlightedBoxes.has("storage")}
            entranceDelay={0}
          />
        )}
        <FlowBox
          x={SRC_X}
          y={execY}
          label="Execution"
          value={formatAleph(executionAleph)}
          color={COLORS.execution}
          isHighlighted={highlightedBoxes.has("execution")}
          isDimmed={anyHovered && !highlightedBoxes.has("execution")}
          entranceDelay={0.05}
        />

        {/* Destination boxes (right) */}
        <FlowBox
          x={DEST_X}
          y={crnY}
          label="CRN Nodes"
          value={formatAleph(execCrn)}
          color={COLORS.crn}
          align="right"
          isHighlighted={highlightedBoxes.has("crn")}
          isDimmed={anyHovered && !highlightedBoxes.has("crn")}
          entranceDelay={0.3}
        />
        <FlowBox
          x={DEST_X}
          y={ccnY}
          label="CCN Nodes"
          value={formatAleph(storCcn + execCcn)}
          color={COLORS.ccn}
          align="right"
          isHighlighted={highlightedBoxes.has("ccn")}
          isDimmed={anyHovered && !highlightedBoxes.has("ccn")}
          entranceDelay={0.35}
        />
        <FlowBox
          x={DEST_X}
          y={stakerY}
          label="Stakers"
          value={formatAleph(storStaker + execStaker)}
          color={COLORS.staker}
          align="right"
          isHighlighted={highlightedBoxes.has("staker")}
          isDimmed={anyHovered && !highlightedBoxes.has("staker")}
          entranceDelay={0.4}
        />
        <FlowBox
          x={DEST_X}
          y={devY}
          label="Dev Fund"
          value={formatAleph(storDev + execDev)}
          color={COLORS.devFund}
          align="right"
          isHighlighted={highlightedBoxes.has("dev")}
          isDimmed={anyHovered && !highlightedBoxes.has("dev")}
          entranceDelay={0.45}
        />
      </svg>
    </Card>
  );
}
