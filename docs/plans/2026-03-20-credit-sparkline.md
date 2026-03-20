# Credit Revenue Sparkline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small cumulative-revenue sparkline (pure SVG) inside the "Total Revenue" stat card on the credits page.

**Architecture:** The existing `CreditExpense[]` array (already fetched and time-sorted) is bucketed into hourly or daily intervals and reduced into a cumulative series. A new `Sparkline` component renders this as an SVG `<polyline>` with a gradient fill area. The sparkline slots into the existing `CreditStatCard` via an optional `sparkline` prop.

**Tech Stack:** React, SVG, TypeScript. Zero new dependencies.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/sparkline-data.ts` | `buildCumulativeSeries()` — buckets expenses by time, returns `{x, y}[]` |
| Create | `src/lib/sparkline-data.test.ts` | Tests for bucketing + cumulation logic |
| Create | `src/components/sparkline.tsx` | Pure SVG sparkline component (polyline + gradient fill) |
| Modify | `src/components/credit-summary-bar.tsx` | Pass sparkline data to the Total Revenue card |

---

### Task 1: `buildCumulativeSeries` — data transform

**Files:**
- Create: `src/lib/sparkline-data.ts`
- Create: `src/lib/sparkline-data.test.ts`

The function takes the `CreditExpense[]` array (already sorted ascending by `time`) and a bucket size, groups expenses into time buckets, and returns a cumulative `{ t: number; value: number }[]` series suitable for charting.

Bucketing strategy:
- 24h range (~48 expenses) → 1-hour buckets → ~24 points
- 7d range (~336 expenses) → 6-hour buckets → ~28 points
- 30d range (~1440 expenses) → 1-day buckets → ~30 points

The caller picks the bucket size based on the selected range (this keeps the function generic).

- [ ] **Step 1: Write the test file**

```ts
// src/lib/sparkline-data.test.ts
import { describe, expect, it } from "vitest";
import { buildCumulativeSeries } from "./sparkline-data";
import type { CreditExpense } from "@/api/credit-types";

function expense(time: number, totalAleph: number): CreditExpense {
  return {
    hash: `h-${time}`,
    time,
    type: "execution",
    totalAleph,
    creditCount: 1,
    creditPriceAleph: 0.00005,
    credits: [],
  };
}

describe("buildCumulativeSeries", () => {
  it("returns empty array for empty input", () => {
    expect(buildCumulativeSeries([], 3600)).toEqual([]);
  });

  it("buckets expenses into hourly intervals with cumulative sum", () => {
    const base = 1_000_000;
    const expenses = [
      expense(base + 100, 10), // hour 0
      expense(base + 200, 5), // hour 0
      expense(base + 3700, 20), // hour 1
    ];
    const series = buildCumulativeSeries(expenses, 3600);

    // Two buckets: hour 0 cumulative = 15, hour 1 cumulative = 35
    expect(series).toHaveLength(2);
    expect(series[0]!.value).toBeCloseTo(15);
    expect(series[1]!.value).toBeCloseTo(35);
  });

  it("fills gaps between buckets with the last cumulative value", () => {
    const base = 1_000_000;
    const expenses = [
      expense(base + 100, 10), // hour 0
      expense(base + 7300, 5), // hour 2 (gap at hour 1)
    ];
    const series = buildCumulativeSeries(expenses, 3600);

    // 3 buckets: hour 0 = 10, hour 1 (fill) = 10, hour 2 = 15
    expect(series).toHaveLength(3);
    expect(series[0]!.value).toBeCloseTo(10);
    expect(series[1]!.value).toBeCloseTo(10);
    expect(series[2]!.value).toBeCloseTo(15);
  });

  it("handles single expense", () => {
    const series = buildCumulativeSeries([expense(1_000_000, 42)], 3600);
    expect(series).toHaveLength(1);
    expect(series[0]!.value).toBeCloseTo(42);
  });

  it("uses daily buckets correctly", () => {
    const base = 1_000_000;
    const DAY = 86400;
    const expenses = [
      expense(base + 100, 10),
      expense(base + DAY + 100, 20),
      expense(base + 2 * DAY + 100, 30),
    ];
    const series = buildCumulativeSeries(expenses, DAY);

    expect(series).toHaveLength(3);
    expect(series[0]!.value).toBeCloseTo(10);
    expect(series[1]!.value).toBeCloseTo(30);
    expect(series[2]!.value).toBeCloseTo(60);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `pnpm vitest run src/lib/sparkline-data.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `buildCumulativeSeries`**

```ts
// src/lib/sparkline-data.ts
import type { CreditExpense } from "@/api/credit-types";

export type SparklinePoint = {
  /** Bucket start timestamp (seconds) */
  t: number;
  /** Cumulative ALEPH total up to this bucket */
  value: number;
};

/**
 * Bucket sorted expenses into time intervals and return a cumulative series.
 * @param expenses — CreditExpense[] sorted ascending by `time`
 * @param bucketSec — bucket width in seconds (3600 = hourly, 86400 = daily)
 */
export function buildCumulativeSeries(
  expenses: CreditExpense[],
  bucketSec: number,
): SparklinePoint[] {
  if (expenses.length === 0) return [];

  const firstTime = expenses[0]!.time;
  const lastTime = expenses[expenses.length - 1]!.time;

  const firstBucket = Math.floor(firstTime / bucketSec);
  const lastBucket = Math.floor(lastTime / bucketSec);

  // Sum each bucket
  const buckets = new Map<number, number>();
  for (const e of expenses) {
    const b = Math.floor(e.time / bucketSec);
    buckets.set(b, (buckets.get(b) ?? 0) + e.totalAleph);
  }

  // Build cumulative series, filling gaps
  const points: SparklinePoint[] = [];
  let cumulative = 0;
  for (let b = firstBucket; b <= lastBucket; b++) {
    cumulative += buckets.get(b) ?? 0;
    points.push({ t: b * bucketSec, value: cumulative });
  }

  return points;
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `pnpm vitest run src/lib/sparkline-data.test.ts`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sparkline-data.ts src/lib/sparkline-data.test.ts
git commit -m "feat(credits): add buildCumulativeSeries for sparkline data"
```

---

### Task 2: `Sparkline` SVG component

**Files:**
- Create: `src/components/sparkline.tsx`

A minimal, reusable SVG sparkline. Accepts `data: { value: number }[]`, `width`, `height`, and an optional `color`. Renders a `<polyline>` stroke + a `<polygon>` fill with a vertical gradient (color at top → transparent at bottom). No axes, no labels, no interactivity.

- [ ] **Step 1: Create the component**

```tsx
// src/components/sparkline.tsx
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
```

Key design notes for the implementer:
- `useId()` + colon-stripping generates a safe gradient ID (SSR-safe, no `CSS.escape` needed, no collisions)
- `preserveAspectRatio="none"` lets the SVG stretch to fill the card width
- `vectorEffect="non-scaling-stroke"` keeps the stroke width consistent regardless of viewBox scaling
- `aria-hidden="true"` because the chart is decorative — the number already conveys the value
- Returns `null` for <2 data points (can't draw a line)

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/sparkline.tsx
git commit -m "feat(credits): add pure SVG Sparkline component"
```

---

### Task 3: Integrate sparkline into Total Revenue card

**Files:**
- Modify: `src/components/credit-summary-bar.tsx`

Wire the sparkline into the existing summary bar. Only the "Total Revenue" card gets the sparkline — it's the one without a color, and Jonathan specifically mentioned "the total revenue box."

Changes to `CreditSummaryBar`:
1. Accept `expenses: CreditExpense[]` and `range: Range` as additional props
2. Compute the cumulative series via `buildCumulativeSeries` with the right bucket size
3. Pass it to a modified `CreditStatCard` that renders the `Sparkline` at the bottom

Changes to `CreditStatCard`:
1. Accept an optional `sparklineData: SparklinePoint[]` prop
2. When present, render `<Sparkline>` below the value, using negative horizontal margin so it bleeds to the card edges

- [ ] **Step 1: Update `CreditStatCard` to accept sparkline data**

In `src/components/credit-summary-bar.tsx`, update the `CardProps` type and component:

```tsx
// Add imports at top:
import { useMemo } from "react";
import type { CreditExpense } from "@/api/credit-types";
import { buildCumulativeSeries } from "@/lib/sparkline-data";
import type { SparklinePoint } from "@/lib/sparkline-data";
import { Sparkline } from "@/components/sparkline";

// Update CardProps — use explicit `| undefined` instead of `?` to avoid
// exactOptionalPropertyTypes issues when callers pass `undefined` directly:
type CardProps = {
  label: string;
  value: number | undefined;
  color?: string;
  isLoading: boolean;
  sparklineData: SparklinePoint[] | undefined;
};
```

Update the `CreditStatCard` body — insert the sparkline between the value and the "ALEPH" label. The sparkline uses negative horizontal margins to bleed to card edges, and a small top margin:

```tsx
function CreditStatCard({ label, value, color, isLoading, sparklineData }: CardProps) {
  return (
    <div
      className="stat-card flex flex-col border border-edge bg-muted/30 p-6"
      style={
        color
          ? ({ "--stat-tint": color } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        {color ? (
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          {label}
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="mt-3 h-11 w-24" />
      ) : (
        <p
          className="mt-3 font-heading text-4xl font-extrabold tabular-nums tracking-tight"
          {...(color ? { style: { color } } : {})}
        >
          {formatAleph(value ?? 0)}
        </p>
      )}
      {sparklineData && sparklineData.length >= 2 && !isLoading ? (
        <div className="-mx-6 -mb-6 mt-3 overflow-hidden rounded-b-[inherit]">
          <Sparkline
            data={sparklineData}
            height={48}
            color="var(--color-primary-400)"
          />
        </div>
      ) : (
        <p className="mt-auto pt-2 text-xs text-muted-foreground/60">ALEPH</p>
      )}
    </div>
  );
}
```

Note: when the sparkline is shown, we drop the "ALEPH" label to avoid visual clutter — the sparkline replaces it. The negative margins (`-mx-6 -mb-6`) cancel the card's `p-6` padding so the chart bleeds to the edges. `rounded-b-[inherit]` clips the sparkline to the card's border radius.

- [ ] **Step 2: Update `CreditSummaryBar` to compute and pass sparkline data**

```tsx
// Share the Range type with credits/page.tsx — export from there or
// redeclare here. Using the same literal union keeps BUCKET_SECONDS
// fully typed with no fallback needed.
type Range = "24h" | "7d" | "30d";

const BUCKET_SECONDS: Record<Range, number> = {
  "24h": 3600,      // 1-hour buckets
  "7d": 6 * 3600,   // 6-hour buckets
  "30d": 86400,     // 1-day buckets
};

type Props = {
  summary: DistributionSummary | undefined;
  expenses: CreditExpense[] | undefined;
  range: Range;
  isLoading: boolean;
};

export function CreditSummaryBar({ summary, expenses, range, isLoading }: Props) {
  const sparklineData = useMemo(() => {
    if (!expenses || expenses.length === 0) return undefined;
    return buildCumulativeSeries(expenses, BUCKET_SECONDS[range]);
  }, [expenses, range]);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <CreditStatCard
        label="Total Revenue"
        value={summary?.totalAleph}
        isLoading={isLoading}
        sparklineData={sparklineData}
      />
      {/* Other 3 cards pass sparklineData={undefined} since the prop is required */}
    </div>
  );
}
```

- [ ] **Step 3: Update `CreditsContent` in `src/app/credits/page.tsx` to pass new props**

The `CreditSummaryBar` now needs `expenses` and `range`. Update the call site:

```tsx
<CreditSummaryBar
  summary={summary}
  expenses={expenses}
  range={range}
  isLoading={isLoading}
/>
```

- [ ] **Step 4: Run full checks**

Run: `pnpm check`
Expected: lint + typecheck + tests all pass

- [ ] **Step 5: Commit**

```bash
git add src/components/credit-summary-bar.tsx src/app/credits/page.tsx
git commit -m "feat(credits): add cumulative revenue sparkline to Total Revenue card"
```

---

### Task 4: Update docs and version

- [ ] ARCHITECTURE.md — mention sparkline in credits page section (pure SVG approach, no charting library)
- [ ] DECISIONS.md — log decision: pure SVG sparkline over Recharts (zero-dependency, small surface area, only need polyline+gradient)
- [ ] BACKLOG.md — completed items moved, add potential ideas: sparklines on other cards, tooltip on hover showing exact value
- [ ] CLAUDE.md — update Current Features list: add sparkline mention in credits page entry
- [ ] `src/changelog.ts` — bump CURRENT_VERSION (minor: new feature), add VersionEntry
