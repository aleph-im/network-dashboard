# Stats Dashboard Integration — Design Spec

Dashboard-side integration for consuming stats history from the indexer and rendering sparkline trends on the overview stat cards.

**Depends on:** `2026-03-13-stats-indexer-design.md` (the indexer must be running and publishing POST messages)

---

## Architecture

```
┌──────────────────┐   query by channel    ┌──────────────────┐
│  Aleph Network    │◄─────────────────────│  Dashboard        │
│  (api2.aleph.im)  │                      │  (Next.js / IPFS) │
│                    │────────────────────►│                    │
│  POST messages     │   sorted snapshots   │  useStatsHistory  │
│  per tier channel  │                      │  + sparklines     │
└──────────────────┘                      └──────────────────┘
```

The dashboard reads from api2 only. It has no direct connection to the indexer service.

---

## Data Flow

1. User opens the overview page (or switches time window)
2. `useStatsHistory(window)` maps the window to a channel + time range
3. React Query fetches `api2.aleph.im/api/v0/posts.json?channels=<channel>&start_date=<since>&post_types=scheduler-stats`
4. Response is transformed into a sorted array of `StatsSnapshot` objects
5. Each `StatCard` receives its relevant field as a `trend` number array
6. A sparkline SVG renders the trend behind the stat number

---

## Query Mapping

| Chart Window | Channel | Time Filter | Expected Points | Poll Interval |
|---|---|---|---|---|
| 1h | `scheduler-stats-5m` | last 60 min | ~12 | 5 min |
| 1d | `scheduler-stats-5m` | last 24h | ~288 | 5 min |
| 1w | `scheduler-stats-1h` | last 7 days | ~168 | 1h |
| 1m | `scheduler-stats-1d` | last 30 days | ~30 | 1h |
| 1y | `scheduler-stats-1w` | last 52 weeks | ~52 | 6h |

`staleTime` is set to half the poll interval for each tier to keep data fresh without excessive requests.

---

## New Files

### `src/api/client.ts` — additions

```typescript
type StatsSnapshot = {
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

type StatsWindow = "1h" | "1d" | "1w" | "1m" | "1y";
```

`getStatsHistory(window: StatsWindow): Promise<StatsSnapshot[]>` — maps window to channel + `start_date`, queries api2 posts endpoint, extracts `content` from each post, sorts by timestamp ascending.

### API Query Details

The api2 posts endpoint is paginated. `getStatsHistory` must fetch all pages to avoid truncated results (the `1d` window on the `5m` channel returns ~288 posts). Use the existing `fetchAllPages` pattern from `client.ts` adapted for the posts endpoint, requesting `pagination=200` per page.

**Sender filtering:** All queries include `addresses=<INDEXER_ADDRESS>` to ensure only the trusted indexer's posts are returned. The indexer wallet address is configured via `NEXT_PUBLIC_STATS_INDEXER_ADDRESS` env var. If unset, sender filtering is skipped (development/testing convenience).

**Sort order:** api2 returns posts in reverse chronological order by default. Backfilled messages (published after an api2 outage) arrive out of order. The client sorts by `content.timestamp` ascending after fetching all pages and filters to the exact requested time window client-side, rather than relying solely on api2's `start_date` parameter for precise boundaries.

### `src/hooks/use-stats-history.ts`

```typescript
function useStatsHistory(window: StatsWindow) {
  const pollInterval = {
    "1h": 300_000,    // 5 min
    "1d": 300_000,    // 5 min
    "1w": 3_600_000,  // 1 hour
    "1m": 3_600_000,  // 1 hour
    "1y": 21_600_000, // 6 hours
  }[window];

  return useQuery({
    queryKey: ["stats-history", window],
    queryFn: () => getStatsHistory(window),
    refetchInterval: pollInterval,
    staleTime: pollInterval / 2,
  });
}
```

---

## Sparkline Rendering

Pure inline SVG — no charting library. Each sparkline is a filled area path.

**Props on `StatCard`:**

```typescript
trend?: number[];  // array of values over time, oldest first
```

**Rendering:**
- SVG viewBox sized to fit the card (e.g. `viewBox="0 0 120 40"`)
- Polyline/path computed from the `trend` array, normalized per-card to its own min/max. If min == max (flat data), render a flat line at 50% height
- Filled area below the line at ~15% opacity of the stat's color
- Line stroke at ~40% opacity
- No axes, labels, or interactivity — purely decorative
- Positioned absolutely behind the stat number (`absolute inset-0`, `z-0`)

This replaces the old Recharts approach (Decision #10) with zero dependencies.

---

## Time Window Selector

A small button group on the overview page header, next to the page title or subtitle area.

Options: `1h` | `1d` | `1w` | `1m` | `1y`

- Default: `1d`
- Stored in component state (not URL — display preference, not a filter)
- Switching windows triggers a new `useStatsHistory` query
- Skeleton shown while loading a new window

---

## Component Changes

### `stats-bar.tsx`

- `StatsBar` accepts a `statsHistory: StatsSnapshot[] | undefined` prop
- Each `Stat` / `StatCard` receives `trend={history?.map(s => s.fieldName)}`
- `StatCard` renders the sparkline SVG when `trend` is provided

### `src/app/page.tsx` (overview)

- Adds `useStatsHistory(window)` hook call
- Adds time window state + selector UI
- Passes history data to `StatsBar`

---

## Graceful Degradation

If the indexer isn't running or has no data yet:
- `useStatsHistory` returns `undefined` / empty array
- `StatCard` renders without sparklines (current behavior, unchanged)
- No error state — sparklines are an enhancement, not a requirement

---

## Dependencies

No new npm dependencies. The sparkline is pure SVG. The api2 query uses the existing `fetch` + React Query pattern.

---

## Update docs

- [ ] ARCHITECTURE.md — new pattern for stats history consumption, sparkline rendering
- [ ] DECISIONS.md — design decisions made during this feature
- [ ] BACKLOG.md — move stats sparklines item to Completed
- [ ] CLAUDE.md — update Current Features list with sparkline trends
