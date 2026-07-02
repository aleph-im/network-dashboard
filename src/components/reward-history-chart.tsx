"use client";

import { useState } from "react";
import { formatAleph } from "@/lib/format";
import { REWARD_SOURCE_META } from "@/lib/reward-source-meta";
import type { MonthlyReward } from "@/hooks/use-owner-rewards-history";

type Props = { months: MonthlyReward[]; height?: number };

const VIEW_W = 600;
const DEFAULT_HEIGHT = 160;
const BAR_FRACTION = 0.5;
const EPSILON = 0.0001;

type Segment = { key: string; y: number; h: number; cssVar: string };

/** Stacked-segment rects for one month, bottom→top in source order. */
function stackSegments(m: MonthlyReward, maxTotal: number, height: number): Segment[] {
  let yBottom = height;
  const segs: Segment[] = [];
  for (const s of REWARD_SOURCE_META) {
    const v = m.bySource[s.key];
    if (v <= 0) continue;
    const h = (v / maxTotal) * height;
    const y = yBottom - h;
    yBottom = y;
    segs.push({ key: s.key, y, h, cssVar: s.cssVar });
  }
  return segs;
}

export function RewardHistoryChart({ months, height = DEFAULT_HEIGHT }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const n = months.length;
  if (n === 0) return null;

  const maxTotal = Math.max(...months.map((m) => m.total), EPSILON);
  const columnW = VIEW_W / n;
  const barW = columnW * BAR_FRACTION;
  const active = hoverIndex != null ? (months[hoverIndex] ?? null) : null;

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          className="block overflow-visible"
          aria-hidden="true"
        >
          {months.map((m, i) => {
            const x = i * columnW + (columnW - barW) / 2;
            const opacity = m.partial ? 0.4 : 1;
            return (
              <g key={m.startSec}>
                {hoverIndex === i && (
                  <rect x={i * columnW} y={0} width={columnW} height={height} fill="currentColor" opacity={0.05} />
                )}
                {stackSegments(m, maxTotal, height).map((s) => (
                  <rect key={s.key} x={x} y={s.y} width={barW} height={s.h} fill={s.cssVar} fillOpacity={opacity} />
                ))}
                <rect
                  data-testid="col-hit"
                  x={i * columnW}
                  y={0}
                  width={columnW}
                  height={height}
                  fill="transparent"
                  onPointerEnter={() => setHoverIndex(i)}
                  onPointerMove={() => setHoverIndex(i)}
                  onPointerLeave={() => setHoverIndex(null)}
                />
              </g>
            );
          })}
        </svg>
        {hoverIndex != null && active && (
          <HoverCard month={active} xPct={(hoverIndex + 0.5) / n} />
        )}
      </div>

      <div className="mt-1.5 flex text-center text-[10px] text-muted-foreground">
        {months.map((m) => (
          <div key={m.startSec} className="flex-1">
            <span className="tabular-nums">{m.label}</span>
            {m.partial && (
              <span className="ml-1 rounded bg-warning-500/15 px-1 text-[9px] uppercase tracking-wide text-warning-500">
                MTD
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 md:hidden">
        {active ? <InlineReadOut month={active} /> : <p className="text-xs text-muted-foreground">Tap a bar to inspect</p>}
      </div>
    </div>
  );
}

function HoverCard({ month, xPct }: { month: MonthlyReward; xPct: number }) {
  const onLeftHalf = xPct < 0.5;
  const transform = onLeftHalf ? "translate(8px, 0)" : "translate(calc(-100% - 8px), 0)";
  return (
    <div
      data-testid="hover-card"
      className="pointer-events-none absolute top-1 z-10 hidden min-w-[160px] rounded-md border border-edge bg-surface px-2.5 py-2 text-xs shadow-lg md:block"
      style={{ left: `${xPct * 100}%`, transform }}
    >
      <div className="mb-1 text-[10px] text-muted-foreground">
        {month.label}
        {month.partial ? " · MTD" : ""}
      </div>
      {REWARD_SOURCE_META.map((s) => (
        <div key={s.key} className="flex justify-between gap-3 font-mono">
          <span className="text-muted-foreground">{s.label}</span>
          <span style={{ color: s.cssVar }}>{formatAleph(month.bySource[s.key])}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-3 border-t border-edge pt-1 font-mono">
        <span className="text-muted-foreground">Total</span>
        <span>{formatAleph(month.total)}</span>
      </div>
    </div>
  );
}

function InlineReadOut({ month }: { month: MonthlyReward }) {
  return (
    <div className="rounded-md border border-foreground/[0.06] bg-foreground/[0.03] px-3 py-2 text-xs">
      <div className="mb-1 text-muted-foreground tabular-nums">
        {month.label}
        {month.partial ? " · MTD" : ""}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono">
        {REWARD_SOURCE_META.map((s) => (
          <span key={s.key}>
            <span className="text-muted-foreground">{s.label}:</span>{" "}
            <span style={{ color: s.cssVar }}>{formatAleph(month.bySource[s.key])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
