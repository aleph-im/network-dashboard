# Stat Card Sparklines Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Recharts area sparklines to the 6 overview stat cards, showing 24h trend data beneath each metric.

**Architecture:** New `StatsSnapshot` type extends `OverviewStats` with a timestamp. Mock layer generates 24 hourly data points with realistic trends. A new React Query hook fetches the history. `StatCard` renders a tiny Recharts `<AreaChart>` at the bottom of each card with color-coded fills.

**Tech Stack:** Recharts 2.15.1 (already installed), React Query, TypeScript

---

### Task 1: Add `StatsSnapshot` type

**Files:**
- Modify: `src/api/types.ts`

**Step 1: Add the type**

Append to the end of `src/api/types.ts`:

```ts
export type StatsSnapshot = OverviewStats & {
  timestamp: string;
};
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no existing code references this type yet)

**Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat: add StatsSnapshot type for time-series stats"
```

---

### Task 2: Add mock stats history data

**Files:**
- Modify: `src/api/mock.ts`

**Step 1: Add `mockStatsHistory` to mock.ts**

Add after the `mockOverviewStats` constant (around line 888). Generate 24 hourly data points going back from "now" (2026-03-01T14:00:00Z to match existing mock timestamps). Use a helper function to create the array with realistic trends:

```ts
function generateStatsHistory(): StatsSnapshot[] {
  const baseTime = new Date("2026-03-01T14:00:00Z");
  const points: StatsSnapshot[] = [];

  // Trend patterns over 24 hours (index 0 = 24h ago, index 23 = now)
  const totalNodesPattern = [
    14, 14, 14, 14, 15, 15, 15, 15, 15, 15, 14, 13,
    13, 13, 14, 14, 15, 15, 15, 15, 15, 15, 15, 15,
  ];
  const healthyPattern = [
    11, 11, 11, 11, 12, 12, 12, 12, 12, 11, 10, 9,
    8, 9, 10, 11, 12, 12, 11, 10, 10, 9, 9, 9,
  ];
  const totalVMsPattern = [
    30, 30, 31, 31, 32, 32, 33, 34, 34, 35, 35, 35,
    36, 36, 37, 37, 38, 38, 38, 39, 39, 39, 40, 40,
  ];
  const orphanedPattern = [
    0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 2, 2,
    3, 3, 2, 2, 1, 1, 2, 2, 3, 3, 3, 3,
  ];
  const missingPattern = [
    1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 2, 3,
    3, 4, 3, 2, 2, 1, 1, 2, 3, 3, 4, 4,
  ];
  const unschedulablePattern = [
    0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 2, 2,
    2, 2, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3,
  ];

  for (let i = 0; i < 24; i++) {
    const timestamp = new Date(
      baseTime.getTime() - (23 - i) * 60 * 60 * 1000,
    );
    const totalNodes = totalNodesPattern[i]!;
    const healthy = healthyPattern[i]!;
    const degraded = Math.max(0, totalNodes - healthy - (totalNodes > healthy + 2 ? 2 : totalNodes > healthy ? 1 : 0));
    const offline = totalNodes - healthy - degraded;
    const totalVMs = totalVMsPattern[i]!;
    const orphaned = orphanedPattern[i]!;
    const missing = missingPattern[i]!;
    const unschedulable = unschedulablePattern[i]!;
    const scheduled = totalVMs - orphaned - missing - unschedulable;
    const observed = scheduled - Math.floor(scheduled * 0.15);

    points.push({
      timestamp: timestamp.toISOString(),
      totalNodes,
      healthyNodes: healthy,
      degradedNodes: degraded,
      offlineNodes: offline,
      totalVMs,
      scheduledVMs: scheduled,
      observedVMs: observed,
      orphanedVMs: orphaned,
      missingVMs: missing,
      unschedulableVMs: unschedulable,
    });
  }

  return points;
}

export const mockStatsHistory: StatsSnapshot[] = generateStatsHistory();
```

Add the `StatsSnapshot` import at the top of `src/api/mock.ts`:

```ts
import type { ..., StatsSnapshot } from "@/api/types";
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/api/mock.ts
git commit -m "feat: add mock stats history with 24h trend data"
```

---

### Task 3: Add `getStatsHistory()` API function

**Files:**
- Modify: `src/api/client.ts`

**Step 1: Add the function**

Add import of `StatsSnapshot` to the existing import block, then append function:

```ts
export async function getStatsHistory(): Promise<StatsSnapshot[]> {
  if (useMocks()) {
    const { mockStatsHistory } = await import("@/api/mock");
    return mockStatsHistory;
  }
  return fetchApi<StatsSnapshot[]>("/stats/history");
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/api/client.ts
git commit -m "feat: add getStatsHistory API function"
```

---

### Task 4: Add `useStatsHistory` hook

**Files:**
- Create: `src/hooks/use-stats-history.ts`

**Step 1: Write the hook**

```ts
import { useQuery } from "@tanstack/react-query";
import { getStatsHistory } from "@/api/client";

export function useStatsHistory() {
  return useQuery({
    queryKey: ["stats-history"],
    queryFn: getStatsHistory,
    refetchInterval: 30_000,
  });
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/hooks/use-stats-history.ts
git commit -m "feat: add useStatsHistory hook"
```

---

### Task 5: Add sparklines to `StatsBar`

**Files:**
- Modify: `src/components/stats-bar.tsx`

**Step 1: Update StatCard to accept and render sparkline data**

Replace the entire `stats-bar.tsx` with the updated version. Key changes:

1. Import Recharts: `AreaChart`, `Area`, `ResponsiveContainer` from `"recharts"`
2. Import `useStatsHistory` hook
3. Add `history` (array of `{ value: number }`) and `color` (string) props to `StatCardProps`
4. Render a `<ResponsiveContainer>` with `<AreaChart>` below the number
5. Use `useStatsHistory` in `StatsBar` to extract per-card history arrays

Updated `StatCard` component:

```tsx
"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Card } from "@aleph-front/ds/card";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useOverviewStats } from "@/hooks/use-overview-stats";
import { useStatsHistory } from "@/hooks/use-stats-history";
import type { StatsSnapshot } from "@/api/types";

type StatCardProps = {
  label: string;
  value: number | undefined;
  detail?: string | undefined;
  isLoading: boolean;
  history?: { value: number }[];
  color?: string | undefined;
};

function StatCard({
  label,
  value,
  detail,
  isLoading,
  history,
  color = "var(--color-primary)",
}: StatCardProps) {
  return (
    <Card padding="sm" className="flex-1 min-w-[140px] overflow-hidden">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {isLoading ? (
        <Skeleton className="mt-1 h-8 w-16" />
      ) : (
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {value ?? 0}
        </p>
      )}
      {detail && !isLoading && (
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      )}
      {history && history.length > 0 && (
        <div className="-mx-3 -mb-2 mt-2">
          <ResponsiveContainer width="100%" height={40}>
            <AreaChart data={history}>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fill={color}
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
```

Updated `StatsBar` function — extract per-card history from the `StatsSnapshot[]`:

```tsx
function extractHistory(
  snapshots: StatsSnapshot[],
  key: keyof StatsSnapshot,
): { value: number }[] {
  return snapshots.map((s) => ({ value: s[key] as number }));
}

const COLORS = {
  primary: "var(--color-primary)",
  success: "oklch(0.72 0.19 142)",
  warning: "oklch(0.75 0.18 85)",
  destructive: "var(--color-destructive)",
} as const;

export function StatsBar() {
  const { data: stats, isLoading } = useOverviewStats();
  const { data: history } = useStatsHistory();

  return (
    <div className="flex flex-wrap gap-3">
      <StatCard
        label="Total Nodes"
        value={stats?.totalNodes}
        detail={
          stats
            ? `${stats.healthyNodes} healthy, ${stats.degradedNodes + stats.offlineNodes} unhealthy`
            : undefined
        }
        isLoading={isLoading}
        history={history ? extractHistory(history, "totalNodes") : undefined}
        color={COLORS.primary}
      />
      <StatCard
        label="Healthy Nodes"
        value={stats?.healthyNodes}
        isLoading={isLoading}
        history={
          history ? extractHistory(history, "healthyNodes") : undefined
        }
        color={COLORS.success}
      />
      <StatCard
        label="Total VMs"
        value={stats?.totalVMs}
        detail={
          stats
            ? `${stats.scheduledVMs} scheduled, ${stats.observedVMs} observed`
            : undefined
        }
        isLoading={isLoading}
        history={history ? extractHistory(history, "totalVMs") : undefined}
        color={COLORS.primary}
      />
      <StatCard
        label="Orphaned"
        value={stats?.orphanedVMs}
        isLoading={isLoading}
        history={
          history ? extractHistory(history, "orphanedVMs") : undefined
        }
        color={COLORS.warning}
      />
      <StatCard
        label="Missing"
        value={stats?.missingVMs}
        isLoading={isLoading}
        history={
          history ? extractHistory(history, "missingVMs") : undefined
        }
        color={COLORS.destructive}
      />
      <StatCard
        label="Unschedulable"
        value={stats?.unschedulableVMs}
        isLoading={isLoading}
        history={
          history
            ? extractHistory(history, "unschedulableVMs")
            : undefined
        }
        color={COLORS.destructive}
      />
    </div>
  );
}
```

**Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Run dev server and verify visually**

Run: `pnpm dev`
Check: Navigate to http://localhost:3000, verify sparklines appear in all 6 stat cards with correct colors and trend shapes.

**Step 4: Commit**

```bash
git add src/components/stats-bar.tsx
git commit -m "feat: add area sparklines to overview stat cards"
```

---

### Task 6: Add tests for stats history

**Files:**
- Create: `src/api/mock.test.ts`
- Create: `src/components/stats-bar.test.tsx`

**Step 1: Write mock data tests**

Create `src/api/mock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockStatsHistory } from "@/api/mock";

describe("mockStatsHistory", () => {
  it("contains 24 hourly data points", () => {
    expect(mockStatsHistory).toHaveLength(24);
  });

  it("has timestamps in chronological order", () => {
    for (let i = 1; i < mockStatsHistory.length; i++) {
      const prev = new Date(mockStatsHistory[i - 1]!.timestamp);
      const curr = new Date(mockStatsHistory[i]!.timestamp);
      expect(curr.getTime()).toBeGreaterThan(prev.getTime());
    }
  });

  it("has internally consistent counts", () => {
    for (const snapshot of mockStatsHistory) {
      expect(snapshot.totalNodes).toBe(
        snapshot.healthyNodes +
          snapshot.degradedNodes +
          snapshot.offlineNodes,
      );
    }
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (3 tests)

**Step 3: Write StatsBar render test**

Create `src/components/stats-bar.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsBar } from "@/components/stats-bar";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("StatsBar", () => {
  it("renders all stat card labels", () => {
    renderWithQuery(<StatsBar />);
    expect(screen.getByText("Total Nodes")).toBeInTheDocument();
    expect(screen.getByText("Healthy Nodes")).toBeInTheDocument();
    expect(screen.getByText("Total VMs")).toBeInTheDocument();
    expect(screen.getByText("Orphaned")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("Unschedulable")).toBeInTheDocument();
  });
});
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/api/mock.test.ts src/components/stats-bar.test.tsx
git commit -m "test: add stats history and stats bar tests"
```

---

### Task 7: Run full checks and verify

**Step 1: Run full check suite**

Run: `pnpm check`
Expected: lint, typecheck, and tests all PASS

**Step 2: Run build**

Run: `pnpm build`
Expected: Static export succeeds

---

### Task 8: Update docs

- [ ] ARCHITECTURE.md — add sparkline pattern entry
- [ ] DECISIONS.md — log decision about mock time-series approach
- [ ] BACKLOG.md — add "Resource usage charts" note about Recharts now being used
- [ ] CLAUDE.md — update Current Features to mention sparkline charts
