---
status: done
branch: feature/wallet-revenue-history
date: 2026-07-02
note: implemented subagent-driven; final review applied (transient-error fix); awaiting preview + ship
---

# Wallet Revenue History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Node revenue history" card to the Wallet page showing per-address reward accrual as stacked monthly bars split by source (Credits / Holder / Wage subsidy), so operators can see a jump came from a source shift (e.g. the holder-tier subsidy ramp) rather than their own workload.

**Architecture:** One `1mo`-bucketed rewards query (reusing the existing `getRewardsTimeSeries` via `useRewards`) → a thin `useOwnerRewardsHistory` hook that maps buckets to labeled months → a local bespoke SVG `RewardHistoryChart` → a DS-`Card` composition `WalletRevenueHistoryCard` rendered under the existing `WalletRevenueCard`. No new API surface, no new DS component.

**Tech Stack:** Next 16 (static export), TypeScript strict, React Query v5, Tailwind 4 + `@aleph-front/ds`, Vitest + Testing Library.

**Design spec:** `docs/superpowers/specs/2026-07-02-wallet-revenue-history-design.md`.

## Global Constraints

Every task implicitly includes these (copied from the spec):

- **ALEPH-only** denomination in v1. No USD.
- **Source order (stacked bottom→top):** Credits → Holder → Wage subsidy.
- **Colors from DS tokens only, no raw hex:** `credit_revenue`→`var(--color-success-500)`, `holder_tier`→`var(--color-primary-500)`, `wage_subsidy`→`var(--color-warning-500)` (all three verified declared in the DS `tokens.css`).
- **Label:** the wage source reads **"Wage subsidy"** (never "Min. wage").
- **Container chrome DS-only:** DS `Card` (`@aleph-front/ds/card`) and DS `Skeleton` (`@aleph-front/ds/ui/skeleton`). The only local component is the SVG chart.
- **Data floor:** `DATA_START_SEC` (2026-05-01T00:00:00Z); monthly window `[DATA_START_SEC, now]` at `bucketSize="1mo"`.
- **No chart library.** SVG only. No entrance animation (static bars → `prefers-reduced-motion` is trivially satisfied).
- Repo code-quality limits: ≤100 lines/function, absolute imports (`@/…`), 100-char lines, `noUncheckedIndexedAccess` (index access is `T | undefined` — assert with `!` only where provably safe).
- This branch (`feature/wallet-revenue-history`) is off `main` and does **not** contain the `fix/wage-subsidy-label` relabel. That's fine: `REWARD_SOURCE_META` (Task 3) is a new, self-owned constant that already says "Wage subsidy", so this feature is forward-consistent regardless of merge order.

---

### Task 1: Share `DATA_START_SEC`

Extract the rewards data-floor constant so the new history hook and the existing owner hook use one source of truth (currently private in `use-owner-rewards.ts`).

**Files:**
- Modify: `src/hooks/use-rewards.ts` (add export near top)
- Modify: `src/hooks/use-owner-rewards.ts:4,11-12` (import it, delete the local copy)

**Interfaces:**
- Produces: `export const DATA_START_SEC: number` from `@/hooks/use-rewards`.

This is a pure refactor — its guard is the existing suite staying green (no new behavior to test-drive).

- [ ] **Step 1: Add the export to `use-rewards.ts`**

Insert immediately after the import block (after line 4, before the `getStableHourRange` doc comment):

```ts
/** Data-start floor for the rewards API — credit.aleph.im has no data before
 *  2026-05-01 (credits launched then). Reward windows clamp to this. */
export const DATA_START_SEC = Math.floor(Date.UTC(2026, 4, 1) / 1000); // 2026-05-01
```

- [ ] **Step 2: Rewire `use-owner-rewards.ts` to import it**

Change the import on line 4 from:

```ts
import { useRewards } from "@/hooks/use-rewards";
```
to:
```ts
import { useRewards, DATA_START_SEC } from "@/hooks/use-rewards";
```

Then delete the now-duplicate local declaration (lines 11-12):

```ts
/** Data-start floor for the rewards API. */
const DATA_START_SEC = Math.floor(Date.UTC(2026, 4, 1) / 1000); // 2026-05-01
```

- [ ] **Step 3: Verify existing tests + types still pass**

Run: `pnpm exec vitest run src/hooks/use-owner-rewards.test.tsx && pnpm typecheck`
Expected: tests PASS, `tsc --noEmit` exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-rewards.ts src/hooks/use-owner-rewards.ts
git commit -m "refactor(rewards): share DATA_START_SEC from use-rewards"
```

---

### Task 2: `useOwnerRewardsHistory` hook

**Files:**
- Create: `src/hooks/use-owner-rewards-history.ts`
- Test: `src/hooks/use-owner-rewards-history.test.tsx`

**Interfaces:**
- Consumes: `useRewards`, `DATA_START_SEC` (Task 1); `RewardsBucket`, `BySource` from `@/api/rewards-types`.
- Produces:
  - `export type MonthlyReward = { startSec: number; label: string; bySource: BySource; total: number; partial: boolean }`
  - `export function useOwnerRewardsHistory(address: string): { months: MonthlyReward[]; isLoading: boolean; isError: boolean }`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/use-owner-rewards-history.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOwnerRewardsHistory } from "@/hooks/use-owner-rewards-history";
import * as rc from "@/api/rewards-client";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const ZERO_FULL = {
  credit_revenue: { execution_crn: 0, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 },
  holder_tier: { execution_crn: 0, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 },
  wage_subsidy: { crn: 0, ccn: 0, staker: 0 },
};

function bucket(startISO: string, endISO: string, credit: number, holder: number, wage: number) {
  return {
    startSec: Math.floor(Date.parse(startISO) / 1000),
    endSec: Math.floor(Date.parse(endISO) / 1000),
    aleph: credit + holder + wage,
    bySource: { credit_revenue: credit, holder_tier: holder, wage_subsidy: wage },
    full: ZERO_FULL,
  };
}

describe("useOwnerRewardsHistory", () => {
  it("maps 1mo buckets to labeled months and flags the current month partial", async () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const cur = new Date(Date.UTC(y, m, 1)).toISOString();
    const prev = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const prevPrev = new Date(Date.UTC(y, m - 2, 1)).toISOString();

    vi.spyOn(rc, "getRewardsTimeSeries").mockResolvedValue({
      address: "0xowner",
      totalAleph: 0,
      bySource: { credit_revenue: 0, holder_tier: 0, wage_subsidy: 0 },
      full: ZERO_FULL,
      buckets: [
        bucket(prevPrev, prev, 100, 10, 5),
        bucket(prev, cur, 120, 400, 5),
        bucket(cur, now.toISOString(), 8, 30, 0.3),
      ],
    });

    const { result } = renderHook(() => useOwnerRewardsHistory("0xOWNER"), { wrapper });
    await waitFor(() => expect(result.current.months.length).toBe(3));
    const months = result.current.months;
    expect(months[0]!.total).toBeCloseTo(115);
    expect(months[1]!.bySource.holder_tier).toBeCloseTo(400);
    expect(months[0]!.partial).toBe(false);
    expect(months[2]!.partial).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it("is empty and not loading for an empty address", () => {
    const { result } = renderHook(() => useOwnerRewardsHistory(""), { wrapper });
    expect(result.current.months).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/hooks/use-owner-rewards-history.test.tsx`
Expected: FAIL — cannot resolve `@/hooks/use-owner-rewards-history`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/use-owner-rewards-history.ts`:

```ts
"use client";

import { useMemo } from "react";
import { useRewards, DATA_START_SEC } from "@/hooks/use-rewards";
import type { BySource, RewardsBucket } from "@/api/rewards-types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type MonthlyReward = {
  /** Bucket start (UTC month boundary), epoch seconds. */
  startSec: number;
  /** Short month label; 2-digit year appended when it differs from now. */
  label: string;
  bySource: BySource;
  /** ALEPH accrued in the month. */
  total: number;
  /** True for the in-progress current month (partial data). */
  partial: boolean;
};

/** Hour-aligned "now". The rewards API truncates bounds to whole hours, so an
 *  hour-granular upper bound keeps the query key stable within the hour. */
function hourAlignedNowSec(): number {
  return Math.floor(Date.now() / 3_600_000) * 3600;
}

function toMonthly(b: RewardsBucket, nowSec: number): MonthlyReward {
  const d = new Date(b.startSec * 1000);
  const now = new Date(nowSec * 1000);
  const month = MONTHS[d.getUTCMonth()]!;
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  const label = sameYear ? month : `${month} '${String(d.getUTCFullYear()).slice(2)}`;
  const partial =
    d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  return { startSec: b.startSec, label, bySource: b.bySource, total: b.aleph, partial };
}

/** Per-address reward accrual as one entry per calendar month since DATA_START,
 *  split by source. One `1mo`-bucketed rewards query; reads only each bucket's
 *  `bySource` (no per-role split, no per-node apportionment). */
export function useOwnerRewardsHistory(address: string): {
  months: MonthlyReward[];
  isLoading: boolean;
  isError: boolean;
} {
  const nowSec = hourAlignedNowSec();
  const { data, isLoading, isError } = useRewards(address, DATA_START_SEC, nowSec, "1mo");
  const months = useMemo(
    () => (data?.buckets ?? []).map((b) => toMonthly(b, nowSec)),
    [data, nowSec],
  );
  return { months, isLoading, isError };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/hooks/use-owner-rewards-history.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-owner-rewards-history.ts src/hooks/use-owner-rewards-history.test.tsx
git commit -m "feat(rewards): useOwnerRewardsHistory — monthly by-source accrual"
```

---

### Task 3: Shared source meta + `RewardHistoryChart`

**Files:**
- Create: `src/lib/reward-source-meta.ts`
- Create: `src/components/reward-history-chart.tsx`
- Test: `src/components/reward-history-chart.test.tsx`

**Interfaces:**
- Consumes: `MonthlyReward` (Task 2); `formatAleph` from `@/lib/format`; `RewardSource` from `@/api/rewards-types`.
- Produces:
  - `export const REWARD_SOURCE_META: { key: RewardSource; label: string; cssVar: string; dotClass: string }[]` (ordered Credits, Holder, Wage subsidy)
  - `export function RewardHistoryChart({ months, height? }: { months: MonthlyReward[]; height?: number }): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

Create `src/components/reward-history-chart.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { RewardHistoryChart } from "@/components/reward-history-chart";
import type { MonthlyReward } from "@/hooks/use-owner-rewards-history";

const MONTHS: MonthlyReward[] = [
  { startSec: 1, label: "May", total: 115, partial: false, bySource: { credit_revenue: 100, holder_tier: 10, wage_subsidy: 5 } },
  { startSec: 2, label: "Jun", total: 525, partial: false, bySource: { credit_revenue: 120, holder_tier: 400, wage_subsidy: 5 } },
  { startSec: 3, label: "Jul", total: 38, partial: true, bySource: { credit_revenue: 8, holder_tier: 30, wage_subsidy: 0.3 } },
];

describe("RewardHistoryChart", () => {
  it("renders a month label per bucket and marks the partial month", () => {
    render(<RewardHistoryChart months={MONTHS} />);
    expect(screen.getByText("May")).toBeInTheDocument();
    expect(screen.getByText("Jun")).toBeInTheDocument();
    expect(screen.getByText("Jul")).toBeInTheDocument();
    expect(screen.getByText("MTD")).toBeInTheDocument();
  });

  it("renders stacked source segments as SVG rects", () => {
    const { container } = render(<RewardHistoryChart months={MONTHS} />);
    // 3 source segments + 1 hit overlay per month = 12 rects (no hover bg yet).
    expect(container.querySelectorAll("rect").length).toBe(12);
  });

  it("shows a per-source hover card on pointer enter", () => {
    render(<RewardHistoryChart months={MONTHS} />);
    const hits = screen.getAllByTestId("col-hit");
    fireEvent.pointerEnter(hits[1]!);
    const card = screen.getByTestId("hover-card");
    expect(within(card).getByText("Wage subsidy")).toBeInTheDocument();
    expect(within(card).getByText("Total")).toBeInTheDocument();
  });

  it("renders nothing for an empty month list", () => {
    const { container } = render(<RewardHistoryChart months={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/reward-history-chart.test.tsx`
Expected: FAIL — cannot resolve `@/components/reward-history-chart`.

- [ ] **Step 3: Create the shared source meta**

Create `src/lib/reward-source-meta.ts`:

```ts
import type { RewardSource } from "@/api/rewards-types";

/** Ordered reward-source vocabulary for the revenue-history chart + legend.
 *  Mirrors the wallet RewardSourceBar (Credits / Holder / Wage subsidy) so the
 *  source colors and labels stay consistent. Bars stack bottom→top in this order.
 *  (A future cleanup can have RewardSourceBar import this too — see BACKLOG.) */
export const REWARD_SOURCE_META: {
  key: RewardSource;
  label: string;
  cssVar: string;
  dotClass: string;
}[] = [
  { key: "credit_revenue", label: "Credits", cssVar: "var(--color-success-500)", dotClass: "bg-success-500" },
  { key: "holder_tier", label: "Holder", cssVar: "var(--color-primary-500)", dotClass: "bg-primary-500" },
  { key: "wage_subsidy", label: "Wage subsidy", cssVar: "var(--color-warning-500)", dotClass: "bg-warning-500" },
];
```

- [ ] **Step 4: Implement the chart**

Create `src/components/reward-history-chart.tsx`:

```tsx
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/reward-history-chart.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/reward-source-meta.ts src/components/reward-history-chart.tsx src/components/reward-history-chart.test.tsx
git commit -m "feat(rewards): RewardHistoryChart — stacked monthly by-source SVG"
```

---

### Task 4: `WalletRevenueHistoryCard`

**Files:**
- Create: `src/components/wallet-revenue-history-card.tsx`
- Test: `src/components/wallet-revenue-history-card.test.tsx`

**Interfaces:**
- Consumes: `useOwnerRewardsHistory` (Task 2), `RewardHistoryChart` + `REWARD_SOURCE_META` (Task 3); DS `Card`, DS `Skeleton`.
- Produces: `export function WalletRevenueHistoryCard({ address }: { address: string }): JSX.Element | null`
- Behavior: `isLoading` → skeleton; otherwise if the address earned nothing in any month (`!hasData`) **or** the query errored → render `null` (a non-earning wallet shows neither the revenue card nor this one; a feed outage is already surfaced by the page-level revenue card). Else → chart + legend.

- [ ] **Step 1: Write the failing test**

Create `src/components/wallet-revenue-history-card.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletRevenueHistoryCard } from "@/components/wallet-revenue-history-card";
import * as h from "@/hooks/use-owner-rewards-history";
import type { MonthlyReward } from "@/hooks/use-owner-rewards-history";

afterEach(() => vi.restoreAllMocks());

const MONTHS: MonthlyReward[] = [
  { startSec: 1, label: "May", total: 115, partial: false, bySource: { credit_revenue: 100, holder_tier: 10, wage_subsidy: 5 } },
  { startSec: 2, label: "Jun", total: 525, partial: false, bySource: { credit_revenue: 120, holder_tier: 400, wage_subsidy: 5 } },
  { startSec: 3, label: "Jul", total: 38, partial: true, bySource: { credit_revenue: 8, holder_tier: 30, wage_subsidy: 0.3 } },
];

describe("WalletRevenueHistoryCard", () => {
  it("renders chart, month labels, and legend when there is data", () => {
    vi.spyOn(h, "useOwnerRewardsHistory").mockReturnValue({ months: MONTHS, isLoading: false, isError: false });
    render(<WalletRevenueHistoryCard address="0xowner" />);
    expect(screen.getByText("Node revenue history")).toBeInTheDocument();
    expect(screen.getByText("Jun")).toBeInTheDocument();
    expect(screen.getByText("MTD")).toBeInTheDocument();
    expect(screen.getByText("Wage subsidy")).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    vi.spyOn(h, "useOwnerRewardsHistory").mockReturnValue({ months: [], isLoading: true, isError: false });
    const { container } = render(<WalletRevenueHistoryCard address="0xowner" />);
    expect(screen.queryByText("Jun")).toBeNull();
    expect(container.querySelector(".bg-edge")).not.toBeNull();
  });

  it("renders nothing when the wallet has no reward history", () => {
    vi.spyOn(h, "useOwnerRewardsHistory").mockReturnValue({ months: [], isLoading: false, isError: false });
    const { container } = render(<WalletRevenueHistoryCard address="0xowner" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing on error (page-level revenue card surfaces the outage)", () => {
    vi.spyOn(h, "useOwnerRewardsHistory").mockReturnValue({ months: [], isLoading: false, isError: true });
    const { container } = render(<WalletRevenueHistoryCard address="0xowner" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/wallet-revenue-history-card.test.tsx`
Expected: FAIL — cannot resolve `@/components/wallet-revenue-history-card`.

- [ ] **Step 3: Implement the card**

Create `src/components/wallet-revenue-history-card.tsx`:

```tsx
"use client";

import { Card } from "@aleph-front/ds/card";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { RewardHistoryChart } from "@/components/reward-history-chart";
import { REWARD_SOURCE_META } from "@/lib/reward-source-meta";
import { useOwnerRewardsHistory } from "@/hooks/use-owner-rewards-history";

export function WalletRevenueHistoryCard({ address }: { address: string }) {
  const { months, isLoading, isError } = useOwnerRewardsHistory(address);
  const hasData = months.some((m) => m.total > 0);

  if (isLoading) {
    return (
      <Card padding="md">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Node revenue history
        </h3>
        <Skeleton className="mt-4 h-40 w-full bg-edge" />
      </Card>
    );
  }

  // Non-earning wallet, or an isolated history-feed error the page-level revenue
  // card already reports — render nothing rather than an empty/duplicate card.
  if (isError || !hasData) return null;

  return (
    <Card padding="md">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Node revenue history
      </h3>
      <p className="mb-4 text-[11px] text-muted-foreground opacity-60">
        ALEPH accrued per month by source, since May 2026.
      </p>
      <RewardHistoryChart months={months} />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {REWARD_SOURCE_META.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${s.dotClass}`} />
            {s.label}
          </span>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/wallet-revenue-history-card.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/wallet-revenue-history-card.tsx src/components/wallet-revenue-history-card.test.tsx
git commit -m "feat(wallet): WalletRevenueHistoryCard — by-source monthly history card"
```

---

### Task 5: Wire the card into the Wallet page

**Files:**
- Modify: `src/app/wallet/page.tsx` (add import; render after the Node Revenue block)

No unit test: the repo has no page-level test for `wallet/page.tsx`, the card owns its own tested logic, and the wiring is trivial glue. Its verification is the full-suite + preview in Task 6. The card's query key (`["rewards", …]`) is already covered by `WALLET_QUERY_KEYS`, so the page's Refresh already invalidates it — no other page change needed.

- [ ] **Step 1: Add the import**

After the existing `WalletRevenueCard` import (line 30), add:

```tsx
import { WalletRevenueHistoryCard } from "@/components/wallet-revenue-history-card";
```

- [ ] **Step 2: Render the card after the Node Revenue block**

In `WalletContent`, immediately after the `{/* Node Revenue */}` block closes (the `) : null}` on line 692) and before `{/* Permissions */}`, insert:

```tsx
      {/* Node Revenue History */}
      <WalletRevenueHistoryCard address={address} />
```

- [ ] **Step 3: Verify types, lint, and full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: `tsc` exits 0; `oxlint` 0 warnings/errors; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/wallet/page.tsx
git commit -m "feat(wallet): render revenue history card under revenue card"
```

---

### Task 6: Verify and refine

- [ ] Run full project checks (`pnpm check`)
- [ ] Manual smoke: `preview start feature/wallet-revenue-history`, open `/wallet?address=0x795d67dF35DAa751E73Eca005b54AB0D8769E5f5`, confirm the "Node revenue history" card shows stacked bars for May / Jun / Jul, the June holder segment dominates, the July bar is dimmed with an "MTD" tag, and hovering a bar shows the per-source ALEPH + Total card. Check light + dark themes.
- [ ] Verify on a non-earning wallet the card is absent (renders nothing), and the layout below (Permissions) is unaffected.
- [ ] Fix any issues found
- [ ] Re-run checks until clean

---

### Task 7: Update docs and version

- [ ] `docs/ARCHITECTURE.md` — document the new wallet "Node revenue history" surface: `useOwnerRewardsHistory` (one `1mo`-bucketed `useRewards` query since `DATA_START_SEC`), the local `RewardHistoryChart` SVG (stacked bars, DS-token colors, DS-token hover card), `WalletRevenueHistoryCard`, and the shared `src/lib/reward-source-meta.ts` vocabulary.
- [ ] `docs/DECISIONS.md` — log the design decisions: monthly bars (not a daily range selector), ALEPH-only in v1 (USD deferred), wallet-only (not the Node Earnings tab), and history card renders `null` for non-earning wallets / isolated feed errors.
- [ ] `docs/BACKLOG.md` — move this item to Completed; add deferred ideas: USD lens toggle, per-node-over-time history, a month-over-month delta caption, and having `RewardSourceBar` import the shared `REWARD_SOURCE_META`.
- [ ] `CLAUDE.md` — add the "Node revenue history" card to the Wallet entry in Current Features.
- [ ] `src/changelog.ts` — bump `CURRENT_VERSION` (minor: new feature), add a `VersionEntry` describing the by-source monthly revenue-history card on the wallet page.

- [ ] **Commit**

```bash
git add docs/ CLAUDE.md src/changelog.ts
git commit -m "docs: wallet revenue history — architecture, decisions, changelog"
```
