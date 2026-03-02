# Stat Card Sparklines Design

Add Recharts area sparklines to the overview stat cards, showing 24h trend data beneath each metric.

## Data Layer

### New type: `StatsSnapshot`

Timestamped version of `OverviewStats`:

```ts
type StatsSnapshot = OverviewStats & { timestamp: string };
```

### Mock data: 24 hourly data points

Generate `mockStatsHistory: StatsSnapshot[]` with realistic trends:
- Node counts mostly stable (14-15 total), with a dip mid-day (simulating an outage)
- Healthy nodes inversely correlated with degraded/offline
- Total VMs gradually increasing (30 → 40 over 24h)
- Problem metrics (orphaned, missing, unschedulable) fluctuating between 0-5

### API: `getStatsHistory()`

Same mock-fallback pattern as other API functions. Real endpoint: `GET /stats/history`.

### Hook: `useStatsHistory()`

React Query hook with 30s polling, same as `useOverviewStats`.

## Chart Rendering

Each `StatCard` receives an optional `history` array of `{ value: number }` points and a `color` string. When present, renders a Recharts `<ResponsiveContainer>` + `<AreaChart>` + `<Area>`:

- Height: 40px
- No axes, grid, tooltips, or labels
- Area fill with low opacity, stroke with full color
- Positioned at the bottom of the card, bleeding to edges (negative margin)

### Color mapping

| Card | Tailwind token | CSS variable |
|------|---------------|--------------|
| Total Nodes | primary | `--color-primary` |
| Healthy Nodes | success/green | `oklch(0.72 0.19 142)` |
| Total VMs | primary | `--color-primary` |
| Orphaned | warning/amber | `oklch(0.75 0.18 85)` |
| Missing | destructive/red | `--color-destructive` |
| Unschedulable | destructive/red | `--color-destructive` |

Colors resolved via `getComputedStyle` at render time so they respond to theme changes.

## Files Changed

1. `src/api/types.ts` — add `StatsSnapshot`
2. `src/api/mock.ts` — add `mockStatsHistory` (24 data points)
3. `src/api/client.ts` — add `getStatsHistory()`
4. `src/hooks/use-stats-history.ts` — new hook
5. `src/components/stats-bar.tsx` — add sparkline to `StatCard`

## Not In Scope

- Tooltips on hover (can add later)
- Click-to-expand chart
- Client-side accumulation for real API mode (backlog item)
