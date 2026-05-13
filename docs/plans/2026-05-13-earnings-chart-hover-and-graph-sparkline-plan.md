---
status: done
branch: feature/earnings-chart-hover-and-spark
date: 2026-05-13
note: awaiting preview + ship
---

# Earnings Chart Hover + Panel Sparkline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bucket-anchored hover tooltip to the Earnings tab chart, and embed a dual-line earnings sparkline in three detail surfaces (network graph CRN panel, network graph CCN panel, `/nodes` side panel), replacing the truncated VMs list on the `/nodes` side panel.

**Architecture:** Extract the existing chart's SVG dual-line rendering into a shared `DualLineChart` primitive that owns geometry + optional pointer-capture rect with hover callbacks. The Earnings tab chart becomes a thin wrapper adding hover state + a presentational tooltip card. A new `NodeEarningsSpark` wrapper consumes the same `useNodeEarnings(hash, "24h")` hook with no hover and a compact caption.

**Tech Stack:** React 19, TypeScript (strict + `exactOptionalPropertyTypes`), Tailwind CSS 4, `@aleph-front/ds`, vitest 4 + Testing Library, React Query 5.

**Spec:** [`docs/plans/2026-05-13-earnings-chart-hover-and-graph-sparkline-design.md`](./2026-05-13-earnings-chart-hover-and-graph-sparkline-design.md)

**Branch:** `feature/earnings-chart-hover-and-spark`

---

## Task 1: `DualLineChart` primitive (TDD)

**Files:**
- Create: `src/components/dual-line-chart.tsx`
- Create: `src/components/dual-line-chart.test.tsx`

- [ ] **Step 1.1: Branch from main**

```bash
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b feature/earnings-chart-hover-and-spark
```

- [ ] **Step 1.2: Write the failing test**

```tsx
// src/components/dual-line-chart.test.tsx
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DualLineChart } from "./dual-line-chart";

const sampleBuckets = Array.from({ length: 24 }, (_, i) => ({
  time: i * 3600,
  aleph: i % 3 === 0 ? 1 : 0.5,
  secondaryCount: i + 1,
}));

describe("DualLineChart", () => {
  it("renders two polylines when given >=2 buckets", () => {
    const { container } = render(<DualLineChart buckets={sampleBuckets} />);
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("renders an empty SVG when given <2 buckets", () => {
    const { container } = render(<DualLineChart buckets={[]} />);
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders no crosshair when highlightedIndex is null", () => {
    const { container } = render(<DualLineChart buckets={sampleBuckets} highlightedIndex={null} />);
    expect(container.querySelector("line")).toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });

  it("renders crosshair line and two emphasis circles when highlightedIndex is set", () => {
    const { container } = render(<DualLineChart buckets={sampleBuckets} highlightedIndex={12} />);
    expect(container.querySelector("line")).toBeTruthy();
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("omits the pointer-capture rect when onHoverIndex is not provided", () => {
    const { container } = render(<DualLineChart buckets={sampleBuckets} />);
    // The only <rect> in the tree should be the overlay rect (if present).
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });

  it("renders a pointer-capture rect and calls onHoverIndex with the snapped bucket on pointermove", () => {
    const onHoverIndex = vi.fn();
    const { container } = render(
      <DualLineChart buckets={sampleBuckets} onHoverIndex={onHoverIndex} />,
    );
    const rect = container.querySelector("rect");
    expect(rect).toBeTruthy();
    // Mock getBoundingClientRect so the snap calculation has a known width.
    rect!.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    // n = 24, so each bucket spans 10px. Pointer at x=125 should snap to bucket 13 (round(12.5)).
    fireEvent.pointerMove(rect!, { clientX: 125, clientY: 60 });
    expect(onHoverIndex).toHaveBeenCalledWith(13);
  });

  it("calls onHoverEnd on pointerleave", () => {
    const onHoverEnd = vi.fn();
    const { container } = render(
      <DualLineChart buckets={sampleBuckets} onHoverIndex={() => {}} onHoverEnd={onHoverEnd} />,
    );
    const rect = container.querySelector("rect")!;
    fireEvent.pointerLeave(rect);
    expect(onHoverEnd).toHaveBeenCalled();
  });

  it("clamps pointer x at the right edge to the last bucket index", () => {
    const onHoverIndex = vi.fn();
    const { container } = render(
      <DualLineChart buckets={sampleBuckets} onHoverIndex={onHoverIndex} />,
    );
    const rect = container.querySelector("rect")!;
    rect.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    fireEvent.pointerMove(rect, { clientX: 999, clientY: 60 });
    expect(onHoverIndex).toHaveBeenLastCalledWith(23);
  });
});
```

- [ ] **Step 1.3: Run the test to verify it fails**

```bash
pnpm vitest run src/components/dual-line-chart.test.tsx
```

Expected: FAIL — `Cannot find module './dual-line-chart'`.

- [ ] **Step 1.4: Implement the primitive**

```tsx
// src/components/dual-line-chart.tsx
"use client";

import type React from "react";
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

  const alephPoints = buckets
    .map((b, i) => `${xFor(i).toFixed(1)},${yForAleph(b.aleph).toFixed(1)}`)
    .join(" ");
  const secondaryPoints = buckets
    .map((b, i) => `${xFor(i).toFixed(1)},${yForSecondary(b.secondaryCount).toFixed(1)}`)
    .join(" ");

  const hasHighlight =
    highlightedIndex != null && highlightedIndex >= 0 && highlightedIndex < n;
  const highlight = hasHighlight ? buckets[highlightedIndex] : null;

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    if (!onHoverIndex) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onHoverIndex(nearestBucketIndex(x, rect.width, n));
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="block"
      aria-hidden="true"
    >
      <polyline
        points={secondaryPoints}
        fill="none"
        stroke="var(--color-primary-500)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.7}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={alephPoints}
        fill="none"
        stroke="var(--color-success-500)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {hasHighlight && highlight && (
        <>
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
          <circle
            cx={xFor(highlightedIndex)}
            cy={yForAleph(highlight.aleph)}
            r={3.5}
            fill="var(--color-success-500)"
          />
          <circle
            cx={xFor(highlightedIndex)}
            cy={yForSecondary(highlight.secondaryCount)}
            r={3}
            fill="var(--color-primary-500)"
            opacity={0.9}
          />
        </>
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
  );
}
```

- [ ] **Step 1.5: Run the test to verify it passes**

```bash
pnpm vitest run src/components/dual-line-chart.test.tsx
```

Expected: PASS (all 8 tests green).

- [ ] **Step 1.6: Commit**

```bash
git add src/components/dual-line-chart.tsx src/components/dual-line-chart.test.tsx
git commit -m "feat(chart): add DualLineChart primitive with optional hover callbacks"
```

---

## Task 2: Refactor `NodeEarningsChart` onto the primitive (no hover yet)

**Files:**
- Modify: `src/components/node-earnings-chart.tsx`
- Keep unchanged: `src/components/node-earnings-chart.test.tsx`

- [ ] **Step 2.1: Refactor the component to delegate SVG rendering to `DualLineChart`**

Replace the entire body of `src/components/node-earnings-chart.tsx` with:

```tsx
"use client";

import { DualLineChart } from "@/components/dual-line-chart";
import type { NodeEarningsBucket } from "@/hooks/use-node-earnings";

type Props = {
  buckets: NodeEarningsBucket[];
  primaryLabel: string;
  secondaryLabel: string;
  height?: number;
  emptyHint?: string;
};

export function NodeEarningsChart({
  buckets,
  primaryLabel,
  secondaryLabel,
  height = 120,
  emptyHint,
}: Props) {
  const hasData = buckets.some((b) => b.aleph > 0 || b.secondaryCount > 0);
  if (!hasData || buckets.length < 2) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground"
        style={{ height }}
      >
        <span>No accrued earnings in this window</span>
        {emptyHint && <span className="text-xs italic">{emptyHint}</span>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-3 bg-success-500"
          />
          {primaryLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-3 bg-primary-500"
          />
          {secondaryLabel}
        </span>
      </div>
      <DualLineChart buckets={buckets} height={height} />
    </div>
  );
}
```

- [ ] **Step 2.2: Run the existing test to verify the refactor preserves behavior**

```bash
pnpm vitest run src/components/node-earnings-chart.test.tsx
```

Expected: PASS (both existing tests still green — two polylines render, empty-state copy still renders).

- [ ] **Step 2.3: Commit**

```bash
git add src/components/node-earnings-chart.tsx
git commit -m "refactor(chart): NodeEarningsChart delegates to DualLineChart primitive"
```

---

## Task 3: Add bucket-anchored hover tooltip to `NodeEarningsChart` (TDD)

**Files:**
- Modify: `src/components/node-earnings-chart.tsx`
- Modify: `src/components/node-earnings-chart.test.tsx`

- [ ] **Step 3.1: Write the failing hover tests**

Append the following to `src/components/node-earnings-chart.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";

describe("NodeEarningsChart hover", () => {
  function renderChart(bucketDurationSec: number) {
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      time: 1_715_000_000 + i * bucketDurationSec,
      aleph: 0.5,
      secondaryCount: 3,
    }));
    return render(
      <NodeEarningsChart
        buckets={buckets}
        primaryLabel="ALEPH"
        secondaryLabel="VMs"
      />,
    );
  }

  it("does not render the tooltip card before pointer interaction", () => {
    renderChart(3600);
    expect(screen.queryByText(/ALEPH/i)).toBeInTheDocument(); // legend
    // No card content yet: look for the bucket value 0.50 (only present in card).
    expect(screen.queryByText("0.50")).not.toBeInTheDocument();
  });

  it("renders the tooltip card after pointermove and hides it on pointerleave", () => {
    const { container } = renderChart(3600);
    const captureRect = container.querySelectorAll("rect")[0]!;
    captureRect.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    fireEvent.pointerMove(captureRect, { clientX: 115, clientY: 60 });
    // ALEPH primary value formatted to 2 decimals
    expect(screen.getByText("0.50")).toBeInTheDocument();
    // Secondary value rendered as integer
    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.pointerLeave(captureRect);
    expect(screen.queryByText("0.50")).not.toBeInTheDocument();
  });

  it("formats the bucket time with date + HH:MM for hourly buckets", () => {
    const { container } = renderChart(3600);
    const captureRect = container.querySelectorAll("rect")[0]!;
    captureRect.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    fireEvent.pointerMove(captureRect, { clientX: 0, clientY: 60 });
    // Bucket 0: time = 1_715_000_000s = 2024-05-06T14:13:20Z. Locale en-US, 24h.
    expect(screen.getByText(/\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("formats the bucket time with date only for daily buckets", () => {
    const { container } = renderChart(86_400);
    const captureRect = container.querySelectorAll("rect")[0]!;
    captureRect.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    fireEvent.pointerMove(captureRect, { clientX: 0, clientY: 60 });
    // Should NOT contain "HH:MM" — only "Mon D".
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3.2: Run the test to verify it fails**

```bash
pnpm vitest run src/components/node-earnings-chart.test.tsx
```

Expected: FAIL — the tooltip card doesn't exist yet (no `0.50` text rendered).

- [ ] **Step 3.3: Add hover state + tooltip card to the chart**

Replace the entire body of `src/components/node-earnings-chart.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { DualLineChart } from "@/components/dual-line-chart";
import type { NodeEarningsBucket } from "@/hooks/use-node-earnings";

type Props = {
  buckets: NodeEarningsBucket[];
  primaryLabel: string;
  secondaryLabel: string;
  height?: number;
  emptyHint?: string;
};

const HOURLY_BUCKET_MAX_SEC = 3600 + 60;

function bucketDurationSec(buckets: NodeEarningsBucket[]): number {
  return buckets.length >= 2 ? buckets[1].time - buckets[0].time : 3600;
}

function formatBucketTime(epochSec: number, durationSec: number): string {
  const d = new Date(epochSec * 1000);
  const isHourly = durationSec <= HOURLY_BUCKET_MAX_SEC;
  if (isHourly) {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
}

type HoverCardProps = {
  bucket: NodeEarningsBucket;
  primaryLabel: string;
  secondaryLabel: string;
  durationSec: number;
  xPct: number;
};

function HoverCard({
  bucket,
  primaryLabel,
  secondaryLabel,
  durationSec,
  xPct,
}: HoverCardProps) {
  const label = formatBucketTime(bucket.time, durationSec);
  const transform =
    xPct < 0.1
      ? "translate(0, 0)"
      : xPct > 0.9
        ? "translate(-100%, 0)"
        : "translate(-50%, 0)";

  return (
    <div
      className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-md border border-edge bg-surface px-2.5 py-2 text-xs shadow-lg"
      style={{ left: `${xPct * 100}%`, transform }}
    >
      <div className="mb-1 text-[10px] text-muted-foreground">{label}</div>
      <div className="flex justify-between gap-3 font-mono">
        <span className="text-muted-foreground">{primaryLabel}</span>
        <span style={{ color: "var(--color-success-500)" }}>
          {bucket.aleph.toFixed(2)}
        </span>
      </div>
      <div className="flex justify-between gap-3 font-mono">
        <span className="text-muted-foreground">{secondaryLabel}</span>
        <span style={{ color: "var(--color-primary-500)" }}>
          {bucket.secondaryCount}
        </span>
      </div>
    </div>
  );
}

export function NodeEarningsChart({
  buckets,
  primaryLabel,
  secondaryLabel,
  height = 120,
  emptyHint,
}: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const hasData = buckets.some((b) => b.aleph > 0 || b.secondaryCount > 0);
  if (!hasData || buckets.length < 2) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground"
        style={{ height }}
      >
        <span>No accrued earnings in this window</span>
        {emptyHint && <span className="text-xs italic">{emptyHint}</span>}
      </div>
    );
  }

  const durationSec = bucketDurationSec(buckets);
  const xPct =
    hoverIndex != null ? hoverIndex / (buckets.length - 1) : 0;

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-3 bg-success-500"
          />
          {primaryLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-3 bg-primary-500"
          />
          {secondaryLabel}
        </span>
      </div>
      <div className="relative">
        <DualLineChart
          buckets={buckets}
          height={height}
          highlightedIndex={hoverIndex}
          onHoverIndex={setHoverIndex}
          onHoverEnd={() => setHoverIndex(null)}
        />
        {hoverIndex != null && (
          <HoverCard
            bucket={buckets[hoverIndex]}
            primaryLabel={primaryLabel}
            secondaryLabel={secondaryLabel}
            durationSec={durationSec}
            xPct={xPct}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3.4: Run the tests to verify they pass**

```bash
pnpm vitest run src/components/node-earnings-chart.test.tsx
```

Expected: PASS (original 2 + new 4 hover tests, 6 total green).

- [ ] **Step 3.5: Commit**

```bash
git add src/components/node-earnings-chart.tsx src/components/node-earnings-chart.test.tsx
git commit -m "feat(chart): bucket-anchored hover tooltip on the Earnings chart"
```

---

## Task 4: `NodeEarningsSpark` wrapper (TDD)

**Files:**
- Create: `src/components/node-earnings-spark.tsx`
- Create: `src/components/node-earnings-spark.test.tsx`

- [ ] **Step 4.1: Write the failing test**

```tsx
// src/components/node-earnings-spark.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NodeEarningsSpark } from "./node-earnings-spark";

vi.mock("@/hooks/use-node-earnings", () => ({
  useNodeEarnings: vi.fn(),
}));

import { useNodeEarnings } from "@/hooks/use-node-earnings";
const useNodeEarningsMock = vi.mocked(useNodeEarnings);

describe("NodeEarningsSpark", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a skeleton while loading", () => {
    useNodeEarningsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isPlaceholderData: false,
    });
    const { container } = render(<NodeEarningsSpark hash="crn1" />);
    expect(
      container.querySelector("[data-slot='skeleton'], .animate-pulse"),
    ).toBeTruthy();
  });

  it("renders nothing when data is undefined and not loading", () => {
    useNodeEarningsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isPlaceholderData: false,
    });
    const { container } = render(<NodeEarningsSpark hash="crn1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the empty line when all buckets are zero", () => {
    useNodeEarningsMock.mockReturnValue({
      data: {
        role: "crn",
        totalAleph: 0,
        delta: { aleph: 0, secondaryCount: 0 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0,
          secondaryCount: 0,
        })),
        perVm: [],
      },
      isLoading: false,
      isPlaceholderData: false,
    });
    render(<NodeEarningsSpark hash="crn1" />);
    expect(screen.getByText(/No earnings · last 24h/i)).toBeInTheDocument();
  });

  it("renders the chart + CRN caption (X.XX ALEPH · N.N VMs avg)", () => {
    useNodeEarningsMock.mockReturnValue({
      data: {
        role: "crn",
        totalAleph: 12.4,
        delta: { aleph: 1, secondaryCount: 0 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.5,
          secondaryCount: i < 12 ? 3 : 4,
        })),
        perVm: [],
      },
      isLoading: false,
      isPlaceholderData: false,
    });
    const { container } = render(<NodeEarningsSpark hash="crn1" />);
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
    expect(screen.getByText(/12\.40 ALEPH/)).toBeInTheDocument();
    expect(screen.getByText(/3\.5 VMs avg/)).toBeInTheDocument();
  });

  it("renders the chart + CCN caption (X.XX ALEPH · N CRNs linked)", () => {
    useNodeEarningsMock.mockReturnValue({
      data: {
        role: "ccn",
        totalAleph: 7.85,
        delta: { aleph: 0, secondaryCount: 0 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.3,
          secondaryCount: 5,
        })),
        linkedCrns: [],
      },
      isLoading: false,
      isPlaceholderData: false,
    });
    render(<NodeEarningsSpark hash="ccn1" />);
    expect(screen.getByText(/7\.85 ALEPH/)).toBeInTheDocument();
    expect(screen.getByText(/5 CRNs linked/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.2: Run the test to verify it fails**

```bash
pnpm vitest run src/components/node-earnings-spark.test.tsx
```

Expected: FAIL — `Cannot find module './node-earnings-spark'`.

- [ ] **Step 4.3: Implement the component**

```tsx
// src/components/node-earnings-spark.tsx
"use client";

import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { DualLineChart } from "@/components/dual-line-chart";
import { useNodeEarnings } from "@/hooks/use-node-earnings";

type Props = {
  hash: string;
  height?: number;
};

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

export function NodeEarningsSpark({ hash, height = 56 }: Props) {
  const { data, isLoading } = useNodeEarnings(hash, "24h");

  if (isLoading) {
    return (
      <Skeleton className="w-full rounded-md" style={{ height }} />
    );
  }
  if (!data) return null;

  const hasEarnings = data.buckets.some((b) => b.aleph > 0);
  if (!hasEarnings) {
    return (
      <p
        className="text-xs italic text-muted-foreground"
        style={{ minHeight: height }}
      >
        No earnings · last 24h
      </p>
    );
  }

  const secondaryLabel = data.role === "crn" ? "VMs avg" : "CRNs linked";
  const secondaryValue =
    data.role === "crn"
      ? avg(data.buckets.map((b) => b.secondaryCount)).toFixed(1)
      : String(data.buckets.at(-1)?.secondaryCount ?? 0);

  return (
    <div className="space-y-1">
      <DualLineChart buckets={data.buckets} width={240} height={height} />
      <p className="font-mono text-xs">
        {data.totalAleph.toFixed(2)} ALEPH
        <span className="text-muted-foreground">
          {" "}
          · {secondaryValue} {secondaryLabel}
        </span>
      </p>
    </div>
  );
}
```

- [ ] **Step 4.4: Run the test to verify it passes**

```bash
pnpm vitest run src/components/node-earnings-spark.test.tsx
```

Expected: PASS (5 tests green).

- [ ] **Step 4.5: Commit**

```bash
git add src/components/node-earnings-spark.tsx src/components/node-earnings-spark.test.tsx
git commit -m "feat(spark): add NodeEarningsSpark wrapper for detail panels"
```

---

## Task 5: Embed spark in network-graph CRN panel (TDD)

**Files:**
- Modify: `src/components/network/network-detail-panel-crn.tsx`
- Modify: `src/components/network/network-detail-panel-crn.test.tsx`

- [ ] **Step 5.1: Write the failing test**

Add the following test inside the existing `describe("NetworkDetailPanelCRN", ...)` block in `src/components/network/network-detail-panel-crn.test.tsx`. Mock `useNodeEarnings` at the top of the file (alongside the existing `useNode` mock):

```tsx
// At the top, beside the existing vi.mock for use-nodes:
vi.mock("@/hooks/use-node-earnings", () => ({
  useNodeEarnings: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isPlaceholderData: false,
  })),
}));

// New test, inside the existing describe block:
it("renders the Earnings · 24h section heading", () => {
  useNodeMock.mockReturnValue({
    data: null,
    isLoading: false,
  } as unknown as ReturnType<typeof useNode>);

  renderWithQuery(
    <NetworkDetailPanelCRN
      info={CRN}
      parent={PARENT}
      unreachable={false}
      onFocusParent={() => {}}
    />,
  );
  expect(screen.getByText(/Earnings · 24h/i)).toBeInTheDocument();
});
```

- [ ] **Step 5.2: Run the test to verify it fails**

```bash
pnpm vitest run src/components/network/network-detail-panel-crn.test.tsx
```

Expected: FAIL — "Earnings · 24h" not in document.

- [ ] **Step 5.3: Add the Earnings section to the CRN panel**

In `src/components/network/network-detail-panel-crn.tsx`, add a new import alongside the existing component imports:

```tsx
import { NodeEarningsSpark } from "@/components/node-earnings-spark";
```

Then insert the following block **between** the existing Resources section (the `{showResources && (...)}` block ending around line 173) and the Owner section (the `<div className="space-y-1 border-t border-edge pt-3">` containing the Owner header, around line 175):

```tsx
<div className="space-y-2 border-t border-edge pt-3">
  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    Earnings · 24h
  </h4>
  <NodeEarningsSpark hash={info.hash} />
</div>
```

- [ ] **Step 5.4: Run the test to verify it passes**

```bash
pnpm vitest run src/components/network/network-detail-panel-crn.test.tsx
```

Expected: PASS (existing tests still green, new heading assertion green).

- [ ] **Step 5.5: Commit**

```bash
git add src/components/network/network-detail-panel-crn.tsx src/components/network/network-detail-panel-crn.test.tsx
git commit -m "feat(network): earnings sparkline on graph CRN panel"
```

---

## Task 6: Embed spark in network-graph CCN panel (TDD)

**Files:**
- Modify: `src/components/network/network-detail-panel-ccn.tsx`
- Modify: `src/components/network/network-detail-panel-ccn.test.tsx`

- [ ] **Step 6.1: Write the failing test**

Add the following at the top of `src/components/network/network-detail-panel-ccn.test.tsx`, after the existing imports:

```tsx
import { vi } from "vitest";

vi.mock("@/hooks/use-node-earnings", () => ({
  useNodeEarnings: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isPlaceholderData: false,
  })),
}));
```

Then add a new test inside the existing `describe("NetworkDetailPanelCCN", ...)` block:

```tsx
it("renders the Earnings · 24h section heading", () => {
  render(<NetworkDetailPanelCCN info={ACTIVE_CCN} ownerBalance={250_000} />);
  expect(screen.getByText(/Earnings · 24h/i)).toBeInTheDocument();
});
```

- [ ] **Step 6.2: Run the test to verify it fails**

```bash
pnpm vitest run src/components/network/network-detail-panel-ccn.test.tsx
```

Expected: FAIL — "Earnings · 24h" not in document.

- [ ] **Step 6.3: Add the Earnings section to the CCN panel**

In `src/components/network/network-detail-panel-ccn.tsx`, add a new import:

```tsx
import { NodeEarningsSpark } from "@/components/node-earnings-spark";
```

Then insert the following block **between** the existing "Total staked" section (`<div className="space-y-1 border-t border-edge pt-3"> <h4>Total staked</h4> ...`) and the Owner section. The result should keep the order: Stakers tiles → Total staked → **Earnings · 24h** → Owner → Reward.

```tsx
<div className="space-y-2 border-t border-edge pt-3">
  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    Earnings · 24h
  </h4>
  <NodeEarningsSpark hash={info.hash} />
</div>
```

- [ ] **Step 6.4: Run the test to verify it passes**

```bash
pnpm vitest run src/components/network/network-detail-panel-ccn.test.tsx
```

Expected: PASS (existing 4 tests still green, new heading assertion green).

- [ ] **Step 6.5: Commit**

```bash
git add src/components/network/network-detail-panel-ccn.tsx src/components/network/network-detail-panel-ccn.test.tsx
git commit -m "feat(network): earnings sparkline on graph CCN panel"
```

---

## Task 7: Embed spark in `/nodes` side panel, remove VMs list (TDD)

**Files:**
- Modify: `src/components/node-detail-panel.tsx`
- Create: `src/components/node-detail-panel.test.tsx` (new file — does not exist today)

- [ ] **Step 7.1: Write the failing test as a new file**

Create `src/components/node-detail-panel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { NodeDetailPanel } from "./node-detail-panel";
import type { Node } from "@/api/types";

vi.mock("@/hooks/use-nodes", () => ({
  useNode: vi.fn(),
}));
vi.mock("@/hooks/use-node-earnings", () => ({
  useNodeEarnings: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isPlaceholderData: false,
  })),
}));

import { useNode } from "@/hooks/use-nodes";
const useNodeMock = vi.mocked(useNode);

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const BUSY_NODE = {
  hash: "crn-hash-1",
  name: "crn-eu-west-04",
  address: "node.example.com",
  status: "healthy",
  staked: true,
  ipv6: null,
  vms: [
    { hash: "vm1", status: "dispatched" },
    { hash: "vm2", status: "dispatched" },
    { hash: "vm3", status: "dispatched" },
    { hash: "vm4", status: "dispatched" },
    { hash: "vm5", status: "dispatched" },
    { hash: "vm6", status: "dispatched" },
    { hash: "vm7", status: "dispatched" },
  ],
  history: [],
  resources: undefined,
  gpus: { used: [], available: [] },
} as unknown as Node;

describe("NodeDetailPanel", () => {
  it("renders the Earnings · 24h section and no longer renders the VMs list block", () => {
    useNodeMock.mockReturnValue({
      data: BUSY_NODE,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(<NodeDetailPanel hash="crn-hash-1" onClose={() => {}} />);

    // Earnings heading is present.
    expect(screen.getByText(/Earnings · 24h/i)).toBeInTheDocument();

    // The "VMs (N)" section heading from the old list block is gone.
    expect(screen.queryByText(/^VMs \(\d+\)$/)).not.toBeInTheDocument();

    // No "+N more" suffix from the truncated list.
    expect(screen.queryByText(/^\+\d+ more$/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 7.2: Run the test to verify it fails**

```bash
pnpm vitest run src/components/node-detail-panel.test.tsx
```

Expected: FAIL — "Earnings · 24h" not in document, and the `VMs (7)` heading is still rendered.

- [ ] **Step 7.3: Remove the VMs list block and add the Earnings section**

In `src/components/node-detail-panel.tsx`:

1. Add the import alongside existing imports:

```tsx
import { NodeEarningsSpark } from "@/components/node-earnings-spark";
```

2. **Remove** the entire `{node.vms.length > 0 && ( ... )}` block (currently lines ~197–227). This is the block whose heading is `VMs ({node.vms.length})`.

3. In its place, insert the Earnings section:

```tsx
{node.vms.length > 0 && (
  <div className="mt-4 space-y-2 border-t border-edge pt-3">
    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      Earnings · 24h
    </h4>
    <NodeEarningsSpark hash={node.hash} />
  </div>
)}
```

> Keep the `node.vms.length > 0` guard — a CRN with zero VMs has no earnings to plot, and the empty state from the spark would still render an unnecessary section heading.

4. **Remove** the now-unused `VM_STATUS_VARIANT` import if it's only referenced by the deleted block. Verify with: `grep -n "VM_STATUS_VARIANT" src/components/node-detail-panel.tsx` — if the result is empty, drop it from the `import { ... } from "@/lib/status-map"` line. The same goes for the `CopyableText` import if it was only used by the VMs list — check `grep -n "CopyableText" src/components/node-detail-panel.tsx`.

- [ ] **Step 7.4: Run the test to verify it passes**

```bash
pnpm vitest run src/components/node-detail-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add src/components/node-detail-panel.tsx src/components/node-detail-panel.test.tsx
git commit -m "feat(nodes): replace VMs list block with earnings spark on /nodes side panel"
```

---

## Task 8: Verify and refine

- [ ] **Step 8.1: Run full project checks**

```bash
pnpm check
```

Expected: PASS — lint clean, tsc no errors, all tests green.

If lint complains about unused imports (likely after Task 7's removal), fix them as flagged and re-run.

- [ ] **Step 8.2: Manual smoke test — start the dev server**

```bash
pnpm dev
```

Open http://localhost:3000 in a browser. The remaining steps verify the feature end-to-end.

- [ ] **Step 8.3: Verify hover tooltip on Earnings tab (CRN)**

1. Navigate to `/nodes`.
2. Pick a CRN that has been earning recently (one with non-zero VMs).
3. Click into the full detail view (`?view=<hash>`).
4. Click the **Earnings** tab.
5. Move the cursor across the chart.
   - Expect: a faint vertical guide line + emphasis dots track the nearest bucket; a small card near the top of the chart shows `MMM D · HH:MM`, the ALEPH value to 2 decimals, and the VM count.
   - Expect: at the left edge the card stays left-anchored; at the right edge it flips to right-anchored.
   - Expect: pointer-leave hides the card immediately.
6. Switch range to **7d** and **30d**.
   - Expect: time format flips to `MMM D` (no `HH:MM`).

- [ ] **Step 8.4: Verify hover tooltip on Earnings tab (CCN)**

1. Navigate to `/network`, click a CCN, click **View full details →** in the panel.
2. Click the Earnings tab.
3. Repeat the same cursor-tracking checks as Step 8.3.
   - Expect: secondary label in the tooltip reads "CRNs linked"; value is the linked-CRN count for that bucket.

- [ ] **Step 8.5: Verify spark on network graph panels**

1. Navigate to `/network`.
2. Click a CRN node.
   - Expect: an `EARNINGS · 24H` section in the panel between Resources and Owner.
   - Expect: a mini dual-line chart + caption like `12.40 ALEPH · 3.2 VMs avg`.
   - Expect: no hover interaction on the spark itself.
3. Click a CCN node.
   - Expect: an `EARNINGS · 24H` section between Total staked and Owner.
   - Expect: caption like `12.40 ALEPH · 2 CRNs linked`.

- [ ] **Step 8.6: Verify spark on `/nodes` side panel + VMs list removal**

1. Navigate to `/nodes`.
2. Pick a CRN with many VMs (e.g. one that previously showed the `+N more` truncation).
3. Click it to open the side panel.
   - Expect: an `EARNINGS · 24H` section with the spark + caption.
   - Expect: **no** `VMs (N)` section heading inside the panel.
   - Expect: the `VMs` count row at the top of the panel still renders (this is the `dl` row, not the removed list block).
   - Expect: the `History` section still renders with its `+N more` truncation.
4. Click `View full details →` in the panel footer.
   - Expect: the full detail view opens and the full VM list is reachable there.

- [ ] **Step 8.7: Verify spark loading/empty states**

1. Pick a CRN that is inactive or has zero earnings in the last 24h.
2. Open the side panel and graph panel for it.
   - Expect: caption "No earnings · last 24h" instead of the chart.
3. Open the panel for a node whose data is still loading.
   - Expect: a Skeleton at the spark's height.

- [ ] **Step 8.8: Verify theme parity**

Toggle between dark and light theme using the sidebar toggle.
- Expect: the spark and tooltip render legibly in both themes (success green for ALEPH line, primary blue for secondary line, neutral chrome).

- [ ] **Step 8.9: Re-run `pnpm check` after any fixes**

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 8.10: Commit any fix-ups**

```bash
git add -A
git commit -m "fix: address manual-verification findings"
```

(Skip if no changes were needed.)

---

## Task 9: Update docs and version

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/BACKLOG.md`
- Modify: `CLAUDE.md`
- Modify: `src/changelog.ts`

- [ ] **Step 9.1: Update `docs/ARCHITECTURE.md`**

Add a paragraph (or a recipe entry, following the file's existing convention) noting:
- `DualLineChart` (`src/components/dual-line-chart.tsx`) is the shared SVG primitive for the dual-line earnings visualization. It owns geometry, the crosshair highlight, and the optional pointer-capture rect that calls back into a wrapper with the snapped bucket index.
- `NodeEarningsChart` is the tab-scale wrapper with hover state + the `HoverCard` overlay.
- `NodeEarningsSpark` is the panel-scale wrapper (no hover, fixed 24h) used by the network graph CRN/CCN panels and the `/nodes` side panel.

Open the file and find the section that currently documents `NodeEarningsChart` / Earnings tab patterns; extend it there. If no such section exists, add a short subsection under the existing component-architecture heading.

- [ ] **Step 9.2: Update `docs/DECISIONS.md`**

Append a new decision entry at the top of the file (above the most recent entry). Use the next decision number after the highest existing one (run `grep "^## Decision #" docs/DECISIONS.md | head -1` to find the latest). Use today's date.

```markdown
## Decision #91 - 2026-05-13
**Context:** Decision #90 shipped the Earnings tab as a static chart and three follow-ups in BACKLOG. Two of them — hover tooltip on the chart, and a sparkline in the network-graph CRN/CCN panels — share infrastructure (the same dual-line rendering) so it made sense to ship them together. During brainstorming we also confirmed the spark belongs on the `/nodes` side panel (where the existing truncated VMs list block was a frequent source of cramped layouts on busy nodes).
**Decision:** Extract a `DualLineChart` primitive that owns geometry + an optional hover-callback pointer-capture rect; refactor `NodeEarningsChart` onto it and add a bucket-anchored crosshair + floating tooltip card (time + ALEPH + secondary, bucket-duration-aware time format); add a new `NodeEarningsSpark` wrapper (static, fixed 24h) embedded in three surfaces: `network-detail-panel-crn.tsx`, `network-detail-panel-ccn.tsx`, and `node-detail-panel.tsx`. The `/nodes` side panel's truncated VMs list block is removed in exchange — the spark conveys "earnings + VM count over 24h", the `VMs` count row at the top of the panel stays, and the panel's "View full details →" link gets users to the full list on the node detail page.
**Rationale:** Sharing the line-and-point math through a primitive prevents the two surfaces from drifting visually. Callbacks-into-primitive (vs. an exported helper) keep all SVG geometry in one place. Static spark over a hover-capable one keeps the 280px panel simple — the Earnings tab is one click away when the user wants exact numbers. Bucket-duration-aware time format (`MMM D · HH:MM` for hourly, `MMM D` for daily) avoids ambiguous bare times across midnight without inventing new precision the data can't back up. Removing the VMs list block from the `/nodes` side panel was a scope expansion accepted during brainstorming because the spark already shows VM count and "+N more" truncation was unfriendly on busy nodes.
**Alternatives considered:** Two independent leaf components without a shared primitive (rejected — line/point math would drift across surfaces). Single component with `variant: "full" | "spark"` prop (rejected — variant-toggled leaf components tend to grow brittle as features stack). Range selector on the spark (deferred — 24h is the default operational window; the tab is the right surface for richer ranges). Hover on the spark itself (deferred — the Earnings tab is one click away, and tooltip-in-panel-in-graph layering adds complexity for marginal value). Exporting a `nearestBucketIndex(...)` helper from the primitive (rejected — callbacks-into-primitive keeps geometry in one file and lets wrappers compute `xPct = i / (n - 1)` directly).
```

- [ ] **Step 9.3: Update `docs/BACKLOG.md`**

In the **Needs planning** section, remove these entries:
- "2026-05-12 - Earnings tab: hover tooltip on dual-line chart"
- "2026-05-12 - Per-CRN sparkline on network graph CRN detail panel"

In the **Completed** section (inside `<details>`), prepend a new line:

```
- ✅ 2026-05-13 - Earnings chart hover tooltip + panel sparkline — `DualLineChart` shared primitive (`src/components/dual-line-chart.tsx`); `NodeEarningsChart` gains bucket-anchored crosshair + floating tooltip card with bucket-duration-aware time format (`MMM D · HH:MM` for hourly, `MMM D` for daily); new `NodeEarningsSpark` (`src/components/node-earnings-spark.tsx`, fixed 24h, static) embedded on the network graph CRN panel, network graph CCN panel, and the `/nodes` side panel — where the truncated VMs list block (lines ~197–227 of `node-detail-panel.tsx`) was removed in exchange. Decision #91.
```

- [ ] **Step 9.4: Update `CLAUDE.md`**

In the **Current Features** list, find the existing entries for the Earnings tab, network graph detail panel, and the `/nodes` side panel. Extend each as follows:

- **Node detail Earnings tab:** add "Hovering the chart shows a bucket-anchored crosshair + floating tooltip card with the bucket time (`MMM D · HH:MM` for hourly 24h, `MMM D` for daily 7d/30d), ALEPH value (2 decimals), and secondary count (VMs for CRN, linked CRNs for CCN). Card stays inside the chart bounds via edge-clamped transform."
- **Network graph detail panels:** add a sentence to the CRN/CCN detail panel descriptions: "An `EARNINGS · 24H` section renders a static dual-line spark (`NodeEarningsSpark`) with ALEPH + secondary count over the last 24h, and a caption (`X.XX ALEPH · Y.Y VMs avg` for CRN, `X.XX ALEPH · N CRNs linked` for CCN)."
- **Nodes page detail panel:** rewrite the existing description of the truncated VMs list to reflect that the `/nodes` side panel now shows an `EARNINGS · 24H` section (same `NodeEarningsSpark` component) in place of the truncated VMs list block. The `VMs` count row at the top of the panel and the History list remain.

- [ ] **Step 9.5: Bump version and add changelog entry in `src/changelog.ts`**

1. Bump `CURRENT_VERSION` by the minor segment (e.g. `0.20.0` → `0.21.0`).

2. Prepend a new `VersionEntry` to the top of the `CHANGELOG` array. Use today's date.

```ts
{
  version: "0.21.0",
  date: "2026-05-13",
  changes: [
    {
      type: "feature",
      text: "Earnings tab chart now supports hover — move the cursor over the chart to see a bucket-anchored crosshair and a tooltip card with the bucket time, ALEPH value, and secondary count (VMs for CRN, linked CRNs for CCN). Time format adapts to bucket granularity: `MMM D · HH:MM` for hourly buckets (24h range), `MMM D` for daily buckets (7d / 30d).",
    },
    {
      type: "feature",
      text: "Network graph CRN/CCN detail panels and the `/nodes` side panel now show a static **Earnings · 24h** sparkline: a mini dual-line chart with ALEPH earned + VM count (CRN) or linked-CRN count (CCN) over the last 24h, plus a caption like `12.40 ALEPH · 3.2 VMs avg`. The `/nodes` side panel drops its truncated VMs list block in exchange — the spark covers the same VM-count signal, and the full VM list is still reachable via `View full details →`.",
    },
  ],
},
```

> **Note:** the exact `text` strings above may diverge from the project's tone — read the previous entries (top of the file) and adjust to match.

- [ ] **Step 9.6: Run `pnpm check` once more**

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 9.7: Update plan status frontmatter**

Add a status block to the top of this plan file (`docs/plans/2026-05-13-earnings-chart-hover-and-graph-sparkline-plan.md`):

```markdown
---
status: done
branch: feature/earnings-chart-hover-and-spark
date: 2026-05-13
note: awaiting preview + ship
---
```

- [ ] **Step 9.8: Commit docs + version**

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md CLAUDE.md src/changelog.ts docs/plans/2026-05-13-earnings-chart-hover-and-graph-sparkline-plan.md
git commit -m "docs: log decision + bump changelog for earnings chart hover and spark"
```

- [ ] **Step 9.9: Hand off to `/dio:ship`**

Once the user is ready, run `/dio:ship` (see CLAUDE.md "Finishing a branch") to execute the preview gate, push, PR, squash-merge, and cleanup.
