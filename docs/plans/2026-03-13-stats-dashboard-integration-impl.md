# Stats Dashboard Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sparkline trend lines to overview stat cards by consuming stats history from the indexer's Aleph POST messages, with a time window selector (1h/1d/1w/1m/1y).

**Architecture:** A new `getStatsHistory(window)` client function queries `api2.aleph.im/api/v0/posts.json` by channel + time range, returning sorted `StatsSnapshot[]`. A `useStatsHistory` hook wraps this with React Query polling. Each `StatCard` renders a pure inline SVG sparkline behind the stat number when `trend` data is available. A time window selector on the overview page controls which tier is queried.

**Tech Stack:** TypeScript, React, pure SVG (no charting library), React Query

**Design spec:** `docs/plans/2026-03-13-stats-dashboard-integration-design.md` (read it for full context)

**Repo:** This is the scheduler-dashboard repo (current working directory).

---

## File Structure

```
src/
├── api/
│   ├── types.ts           # Modified: add StatsSnapshot, StatsWindow
│   └── client.ts          # Modified: add getStatsHistory()
├── hooks/
│   └── use-stats-history.ts  # New: useStatsHistory hook
├── components/
│   ├── sparkline.tsx       # New: pure SVG sparkline component
│   ├── stats-bar.tsx       # Modified: accept statsHistory prop, pass trend to StatCard
│   └── time-window-selector.tsx  # New: 1h/1d/1w/1m/1y button group
└── app/
    └── page.tsx            # Modified: add useStatsHistory + time window state
```

---

## Task 1: StatsSnapshot type + getStatsHistory API function

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`
- Create: `src/lib/stats-history.test.ts`

The `getStatsHistory` function queries api2's posts endpoint by channel, extracts snapshot content, sorts by timestamp, and filters to the exact time window.

**Important assumption:** The indexer publishes camelCase field names in the POST message payload (e.g. `totalNodes`, not `total_nodes`). Both the indexer design spec and this dashboard integration use camelCase. No snake-to-camel transform is needed — the JSON is consumed as-is. If the indexer ever changes to snake_case, a transform must be added here.

- [ ] **Step 1: Add types to `src/api/types.ts`**

Add at the end of the file:

```typescript
// --- Stats History (from indexer POST messages on Aleph) ---

export type StatsSnapshot = {
  tier: string;
  timestamp: string;
  totalNodes: number;
  healthyNodes: number;
  unreachableNodes: number;
  unknownNodes: number;
  removedNodes: number;
  totalVMs: number;
  scheduledVMs: number;
  orphanedVMs: number;
  missingVMs: number;
  unschedulableVMs: number;
  totalVcpusAllocated: number;
  totalVcpusCapacity: number;
  affectedNodes: number;
};

export type StatsWindow = "1h" | "1d" | "1w" | "1m" | "1y";
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/stats-history.test.ts
import { describe, expect, it } from "vitest";
import { windowToQuery } from "@/lib/stats-history";

describe("windowToQuery", () => {
  it("maps 1h to scheduler-stats-5m channel", () => {
    const q = windowToQuery("1h");
    expect(q.channel).toBe("scheduler-stats-5m");
  });

  it("maps 1d to scheduler-stats-5m channel", () => {
    const q = windowToQuery("1d");
    expect(q.channel).toBe("scheduler-stats-5m");
  });

  it("maps 1w to scheduler-stats-1h channel", () => {
    const q = windowToQuery("1w");
    expect(q.channel).toBe("scheduler-stats-1h");
  });

  it("maps 1m to scheduler-stats-1d channel", () => {
    const q = windowToQuery("1m");
    expect(q.channel).toBe("scheduler-stats-1d");
  });

  it("maps 1y to scheduler-stats-1w channel", () => {
    const q = windowToQuery("1y");
    expect(q.channel).toBe("scheduler-stats-1w");
  });

  it("returns pollInterval in ms", () => {
    expect(windowToQuery("1h").pollInterval).toBe(300_000);
    expect(windowToQuery("1y").pollInterval).toBe(21_600_000);
  });

  it("returns durationMs matching the window", () => {
    const oneHour = windowToQuery("1h");
    expect(oneHour.durationMs).toBe(60 * 60 * 1000);
    const oneDay = windowToQuery("1d");
    expect(oneDay.durationMs).toBe(24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test -- src/lib/stats-history.test.ts
```

Expected: `Cannot find module '@/lib/stats-history'`

- [ ] **Step 4: Create stats-history.ts helper**

```typescript
// src/lib/stats-history.ts
import type { StatsWindow } from "@/api/types";

type WindowQuery = {
  channel: string;
  durationMs: number;
  pollInterval: number;
};

const WINDOW_CONFIG: Record<StatsWindow, WindowQuery> = {
  "1h": {
    channel: "scheduler-stats-5m",
    durationMs: 60 * 60 * 1000,
    pollInterval: 300_000,
  },
  "1d": {
    channel: "scheduler-stats-5m",
    durationMs: 24 * 60 * 60 * 1000,
    pollInterval: 300_000,
  },
  "1w": {
    channel: "scheduler-stats-1h",
    durationMs: 7 * 24 * 60 * 60 * 1000,
    pollInterval: 3_600_000,
  },
  "1m": {
    channel: "scheduler-stats-1d",
    durationMs: 30 * 24 * 60 * 60 * 1000,
    pollInterval: 3_600_000,
  },
  "1y": {
    channel: "scheduler-stats-1w",
    durationMs: 365 * 24 * 60 * 60 * 1000,
    pollInterval: 21_600_000,
  },
};

export function windowToQuery(window: StatsWindow): WindowQuery {
  return WINDOW_CONFIG[window];
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- src/lib/stats-history.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Add getStatsHistory to client.ts**

Add to the bottom of `src/api/client.ts`, before the closing of the file:

```typescript
// --- Stats History (Aleph POST messages from indexer) ---

type AlephPostItem = {
  content: {
    content: StatsSnapshot;
  };
};

type AlephPostsResponse = {
  posts: AlephPostItem[];
  pagination_total: number;
  pagination_per_page: number;
  pagination_page: number;
};

export async function getStatsHistory(
  window: StatsWindow,
): Promise<StatsSnapshot[]> {
  const { channel, durationMs } = windowToQuery(window);
  const since = new Date(Date.now() - durationMs).toISOString();

  const indexerAddress =
    process.env["NEXT_PUBLIC_STATS_INDEXER_ADDRESS"] ?? "";

  const params = new URLSearchParams({
    channels: channel,
    post_types: "scheduler-stats",
    start_date: since,
    pagination: "200",
  });
  if (indexerAddress) {
    params.set("addresses", indexerAddress);
  }

  const allPosts: AlephPostItem[] = [];
  let page = 1;

  while (true) {
    params.set("page", String(page));
    const url = `${getAlephBaseUrl()}/api/v0/posts.json?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Aleph API error: ${res.status} for posts.json`,
      );
    }
    const data = (await res.json()) as AlephPostsResponse;
    allPosts.push(...data.posts);
    if (
      allPosts.length >= data.pagination_total ||
      data.posts.length < 200
    ) {
      break;
    }
    page++;
  }

  const cutoff = Date.now() - durationMs;
  return allPosts
    .map((p) => p.content.content)
    .filter(
      (s): s is StatsSnapshot =>
        s != null && typeof s.timestamp === "string",
    )
    .filter((s) => new Date(s.timestamp).getTime() >= cutoff)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() -
        new Date(b.timestamp).getTime(),
    );
}
```

Add the required imports at the top of `client.ts`:

```typescript
import type { StatsSnapshot, StatsWindow } from "@/api/types";
import { windowToQuery } from "@/lib/stats-history";
```

- [ ] **Step 7: Verify types compile**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/lib/stats-history.ts src/lib/stats-history.test.ts
git commit -m "feat: add StatsSnapshot types and getStatsHistory API function"
```

---

## Task 2: useStatsHistory hook

**Files:**
- Create: `src/hooks/use-stats-history.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/use-stats-history.ts
import { useQuery } from "@tanstack/react-query";
import { getStatsHistory } from "@/api/client";
import { windowToQuery } from "@/lib/stats-history";
import type { StatsWindow } from "@/api/types";

export function useStatsHistory(timeWindow: StatsWindow) {
  const { pollInterval } = windowToQuery(timeWindow);

  return useQuery({
    queryKey: ["stats-history", timeWindow],
    queryFn: () => getStatsHistory(timeWindow),
    refetchInterval: pollInterval,
    staleTime: pollInterval / 2,
  });
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-stats-history.ts
git commit -m "feat: add useStatsHistory hook with tier-based polling"
```

---

## Task 3: Sparkline SVG component

**Files:**
- Create: `src/components/sparkline.tsx`
- Create: `src/components/sparkline.test.tsx`

Pure inline SVG — no charting library. Filled area path behind the stat number.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/sparkline.test.tsx
import { describe, expect, it } from "vitest";
import { buildSparklinePath } from "@/components/sparkline";

describe("buildSparklinePath", () => {
  it("returns empty string for empty data", () => {
    expect(buildSparklinePath([], 120, 40)).toBe("");
  });

  it("returns empty string for single point", () => {
    expect(buildSparklinePath([5], 120, 40)).toBe("");
  });

  it("returns a flat line for constant data", () => {
    const path = buildSparklinePath([5, 5, 5], 120, 40);
    // All Y values should be at 50% height (20) since min == max
    expect(path).toContain("M 0 20");
    expect(path).toContain("L 60 20");
    expect(path).toContain("L 120 20");
  });

  it("normalizes data to viewbox height", () => {
    const path = buildSparklinePath([0, 100], 120, 40);
    // First point at bottom (y=40-2=38 with 2px padding), second at top (y=2)
    expect(path).toContain("M 0");
    expect(path).toContain("L 120");
  });

  it("includes filled area commands", () => {
    const path = buildSparklinePath([10, 20, 30], 120, 40);
    // Should end with vertical line to bottom and close
    expect(path).toContain("V 40");
    expect(path).toContain("H 0");
    expect(path).toContain("Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- src/components/sparkline.test.tsx
```

Expected: `Cannot find module`

- [ ] **Step 3: Write the implementation**

```typescript
// src/components/sparkline.tsx

const PADDING = 2;

export function buildSparklinePath(
  data: number[],
  width: number,
  height: number,
): string {
  if (data.length < 2) return "";

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const usableHeight = height - PADDING * 2;

  function yPos(value: number): number {
    if (range === 0) return height / 2;
    return PADDING + usableHeight * (1 - (value - min) / range);
  }

  const step = width / (data.length - 1);
  const points = data.map(
    (v, i) => `${i === 0 ? "M" : "L"} ${Math.round(i * step)} ${Math.round(yPos(v))}`,
  );

  // Line path + filled area (drop to bottom, back to start, close)
  return `${points.join(" ")} V ${height} H 0 Z`;
}

export function Sparkline({
  data,
  color,
  className,
}: {
  data: number[];
  color: string;
  className?: string;
}) {
  const width = 120;
  const height = 40;
  const path = buildSparklinePath(data, width, height);

  if (!path) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={path}
        fill={color}
        fillOpacity={0.15}
        stroke={color}
        strokeOpacity={0.4}
        strokeWidth={1.5}
      />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- src/components/sparkline.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/sparkline.tsx src/components/sparkline.test.tsx
git commit -m "feat: add Sparkline SVG component — pure inline, no deps"
```

---

## Task 4: StatCard sparkline integration

**Files:**
- Modify: `src/components/stats-bar.tsx`

Add a `trend` prop to `StatCard` and render the `Sparkline` behind the stat number. `StatsBar` accepts an optional `statsHistory` prop and maps each stat field to its `trend` array.

- [ ] **Step 1: Add trend prop to StatCard**

In `src/components/stats-bar.tsx`, update the `StatProps` type:

```typescript
type StatProps = {
  label: string;
  value: number | undefined;
  total: number | undefined;
  subtitle: string;
  isLoading: boolean;
  color?: string | undefined;
  tint?: string | undefined;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
  trend?: number[];
};
```

- [ ] **Step 2: Render Sparkline in StatCard**

Add the import at the top:

```typescript
import { Sparkline } from "@/components/sparkline";
```

Update the `StatCard` function signature to accept `trend`:

```typescript
function StatCard({
  label,
  value,
  total,
  subtitle,
  isLoading,
  color,
  tint,
  icon,
  trend,
}: Omit<StatProps, "href">) {
```

In the `StatCard` component, add the sparkline after the existing `{showRing ? ... : null}` block (inside the outer `div`, after the donut ring):

```typescript
{trend && trend.length >= 2 ? (
  <Sparkline
    data={trend}
    color={color ?? "var(--color-muted-foreground)"}
    className="absolute inset-0 z-0 opacity-60"
  />
) : null}
```

Add `relative z-10` to the content elements so they sit above the absolute sparkline. The outer `div` already has `relative` (implied by `stat-card` for the donut ring positioning). Apply these exact class changes:

- Label container (the `<div className="flex items-center gap-2">`): change to `<div className="relative z-10 flex items-center gap-2">`
- Stat number `<p>` (the `className="mt-3 font-heading..."` element): add `relative z-10` to its className
- Subtitle `<p>` (the `className="mt-auto pt-2..."` element): add `relative z-10` to its className
- Skeleton: add `relative z-10` to its className

- [ ] **Step 3: Add statsHistory prop to StatsBar**

Update the `StatsBar` export:

```typescript
import type { StatsSnapshot } from "@/api/types";

export function StatsBar({
  statsHistory,
}: {
  statsHistory?: StatsSnapshot[];
}) {
```

For each `<Stat>`, add a `trend` prop mapping the history to the relevant field. For example:

```typescript
<Stat
  label="Total"
  value={stats?.totalNodes}
  total={undefined}
  subtitle="Compute nodes registered with the scheduler"
  isLoading={isLoading}
  href="/nodes"
  trend={statsHistory?.map((s) => s.totalNodes)}
/>
```

Apply the same pattern for each stat card, mapping to the appropriate field:
- Total Nodes → `s.totalNodes`
- Healthy → `s.healthyNodes`
- Total VMs → `s.totalVMs`
- Orphaned → `s.orphanedVMs`
- Affected VMs → `s.orphanedVMs + s.missingVMs + s.unschedulableVMs`
- Unreachable → `s.unreachableNodes`
- Removed → `s.removedNodes`
- Missing → `s.missingVMs`
- Unschedulable → `s.unschedulableVMs`
- Affected Nodes → `s.affectedNodes`

- [ ] **Step 4: Verify types compile**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/stats-bar.tsx
git commit -m "feat: integrate sparkline trends into StatCard and StatsBar"
```

---

## Task 5: Time window selector + overview page wiring

**Files:**
- Create: `src/components/time-window-selector.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the time window selector**

```typescript
// src/components/time-window-selector.tsx
"use client";

import { Button } from "@aleph-front/ds/button";
import type { StatsWindow } from "@/api/types";

const WINDOWS: StatsWindow[] = ["1h", "1d", "1w", "1m", "1y"];

export function TimeWindowSelector({
  value,
  onChange,
}: {
  value: StatsWindow;
  onChange: (w: StatsWindow) => void;
}) {
  return (
    <div className="flex gap-1">
      {WINDOWS.map((w) => (
        <Button
          key={w}
          variant={w === value ? "secondary" : "text"}
          size="xs"
          onClick={() => onChange(w)}
        >
          {w}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire up the overview page**

Update `src/app/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { StatsBar } from "@/components/stats-bar";
import { TopNodesCard } from "@/components/top-nodes-card";
import { LatestVMsCard } from "@/components/latest-vms-card";
import { TimeWindowSelector } from "@/components/time-window-selector";
import { useStatsHistory } from "@/hooks/use-stats-history";
import type { StatsWindow } from "@/api/types";

export default function OverviewPage() {
  const [timeWindow, setTimeWindow] = useState<StatsWindow>("1d");
  const { data: statsHistory, isLoading: isHistoryLoading } =
    useStatsHistory(timeWindow);

  return (
    <div>
      <div className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-4xl">Overview</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Real-time scheduler health and VM allocation
          </p>
        </div>
        <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
      </div>

      <StatsBar
        statsHistory={isHistoryLoading ? undefined : statsHistory}
      />

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <TopNodesCard />
        <LatestVMsCard />
      </div>
    </div>
  );
}
```

When `isHistoryLoading` is true (switching windows), `statsHistory` is passed as `undefined`, so sparklines disappear and re-render with new data — a clean transition without extra skeleton complexity. The stat values themselves remain visible from `useOverviewStats` (independent query).

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: static export succeeds.

- [ ] **Step 4: Verify visual (manual)**

Run `pnpm dev` and open the overview page. With no indexer running, stat cards should render normally without sparklines (graceful degradation). The time window selector should be visible next to the page title.

- [ ] **Step 5: Commit**

```bash
git add src/components/time-window-selector.tsx src/app/page.tsx
git commit -m "feat: add time window selector and wire sparklines to overview page"
```

---

## Task 6: Final checks

- [ ] **Step 1: Run lint + typecheck + tests**

```bash
pnpm check
```

Expected: all pass.

- [ ] **Step 2: Verify graceful degradation**

With no `NEXT_PUBLIC_STATS_INDEXER_ADDRESS` set, `getStatsHistory` should still work (just no sender filter). If the api2 query returns empty results, cards render without sparklines.

---

## Task 7: Update docs

- [ ] **ARCHITECTURE.md** — Add a new "Stats History + Sparklines" pattern section:
  - `getStatsHistory` queries api2 posts endpoint by channel
  - `useStatsHistory` hook with tier-based polling
  - Pure SVG sparkline (no charting library)
  - Time window selector maps to indexer tier channels

- [ ] **DECISIONS.md** — Log decisions made during implementation (sparkline rendering approach, time window UX, etc.)

- [ ] **BACKLOG.md** — Move "Stats sparklines via client-side accumulation" item to Completed section

- [ ] **CLAUDE.md** — Update Current Features list: add "Overview stat card sparkline trends with 1h/1d/1w/1m/1y time window selector (consuming indexer data from Aleph POST messages)"
