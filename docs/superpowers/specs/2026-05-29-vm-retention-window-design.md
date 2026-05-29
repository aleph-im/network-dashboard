# VM Retention Window Design

**Date:** 2026-05-29
**Status:** Design approved, pending plan
**Source:** Brainstorming session triggered by Olivier's report that a `scheduled` VM was missing from the All tab (shipped as Decision #109), which surfaced a deeper question: the VMs total is cumulative-ever because the scheduler never prunes VM records.
**Phase 2 (scheduler-side):** [aleph-vm-scheduler#179](https://github.com/aleph-im/aleph-vm-scheduler/issues/179) + `docs/briefs/2026-05-29-scheduler-vms-time-filter.md`

---

## Context

The scheduler's `/api/v1/vms` endpoint returns **every VM it has ever seen**. The backend
`vms` table is append-and-update only — there is no `DELETE`, no TTL, no pruning anywhere
in `scheduler-api` (confirmed against the repo). A deleted VM isn't removed; its row's
status is flipped to `unscheduled`. So the raw VM list grows monotonically and is
dominated, over time, by long-dead tombstones.

The dashboard papers over this today with `ACTIVE_VM_STATUSES` (`src/lib/filters.ts`): a
hardcoded set of "active" statuses (`dispatched`, `migrating`, `duplicated`, `misplaced`,
`missing`, `unschedulable`). The Overview "Total VMs" headline and the VMs page default
view both count only those statuses; a `Show inactive VMs` checkbox reveals the rest
(Decisions #65, #67, #68).

That status-based guess has two problems:
1. **It's binary and hand-curated** — `scheduled` (a normal lifecycle state) is excluded
   while discrepancy states like `missing` are included, which is exactly what confused
   Olivier.
2. **It's timeless** — a VM deleted yesterday and one deleted two years ago are treated
   identically (both hidden as non-active), so "what's been happening on the network
   lately" is unanswerable.

This design replaces the status-based cull with a **time-based retention window**: show
VMs with recent activity, let ancient ones age out, and give the user a selector for how
far back to look.

### Freshness is independent of this (important framing)

Spin-up/wind-down latency is driven by the scheduler's poll intervals (60s message
watcher, 30s CRN poll) and the dashboard's WebSocket invalidation — a VM reflects as
created/dispatched in ~1–2½ min and as wound-down in ~1 min, regardless of the retention
window. The window operates on a *days* timescale and only governs how long a long-dead
VM lingers in the list. The two never interact.

## Goals

- Replace the `ACTIVE_VM_STATUSES` cull and the `Show inactive VMs` toggle with a single
  **retention-window selector** (`7d` / `30d` / `90d` / `All`, default `7d`).
- Apply one consistent definition **everywhere VMs are counted**: VMs page, Overview
  "Total VMs", and the Issues page.
- Keep explicit lookups (hash/name search, owner filter) and the `All` window as escape
  hatches to the full cumulative-ever ledger.
- Ship **client-side only** (Phase 1): filter the already-fetched list. The scheduler-side
  `active_since` param (Phase 2, issue #179) is out of scope here.

## Non-goals

- **Phase 2 / payload reduction.** Phase 1 still fetches the full `/vms` list every poll
  and filters in memory. Shrinking the transfer is the scheduler-side issue, tracked
  separately.
- **Pruning / archival** of dead rows — that's a scheduler data-retention decision, not
  the dashboard's.
- **Modeling the scheduler's `removed` status** — the dashboard doesn't surface it today;
  noted as a minor follow-up, not part of this work.
- **Per-window persistence beyond the URL** — no localStorage; `?retention=` only.

---

## Design

### The recency predicate

A pure helper in `src/lib/filters.ts`, with `now` injected for testability:

```
type RetentionWindow = "7d" | "30d" | "90d" | "all";

applyRetentionWindow(vms: VM[], window: RetentionWindow, now: number): VM[]
```

A VM is in-window when its most-recent activity is within the window:

```
inWindow(vm, N, now) = max(lastObservedAt, updatedAt, allocatedAt) >= now − N
```

- `updatedAt` is always present (the API sets it on every projection write), so the `max`
  is always defined.
- `lastObservedAt` is the truest "alive on the network" signal — a node observing a VM
  bumps it every ~30s, so live VMs (including quiet long-running instances) always stay
  in-window. It freezes the moment a node stops seeing the VM.
- `allocatedAt`/`updatedAt` keep a freshly-`scheduled`-but-not-yet-observed VM in-window
  so brand-new VMs appear immediately rather than waiting for first observation.
- `window === "all"` skips the predicate entirely (returns the input unchanged).

Window→milliseconds mapping lives beside the helper; `DEFAULT_RETENTION = "7d"`.

### The window control (VMs page)

A DS Tabs **pill selector** — `7d · 30d · 90d · All` — mirroring the range pills on the
Credits and Earnings pages. State persists via `?retention=7d|30d|90d|all` (param omitted
when on the default `7d`). It **replaces** the `Show inactive VMs` checkbox and its
`?showInactive=` param, which are removed.

### Two orthogonal axes

The window (*how far back*) and the existing status pills (*which kind*) are independent
lenses that compose:

- **`7d` + All-statuses** (default) → everything active on the network this week.
- **`7d` + Dispatched** → currently-running VMs (dispatched VMs are always recently
  observed, so they're always in-window).
- **`All` + Unscheduled** → every unscheduled VM ever (the full tombstone list for that
  status).

**The window is always the active lens** — including when a status pill is selected
(decided at review). Status pills slice *within* the current window; the `All` window is
how you escape it for any status. Per-status pill count badges therefore reflect the
**in-window** count for that status, not the all-time count. This is a deliberate
departure from today's "pill click bypasses the inactive cull" (Decision #67): under a
time-window model the window stays a real, consistent control rather than going inert
whenever a status pill is active.

### Bypasses

Only **explicit lookups** bypass the window: a non-empty hash/name search or a valid owner
address shows the match regardless of when it was last active. This carries forward the
Decision #109 principle ("an explicit request wins over the default cull") — the
`hasLookupQuery` predicate now bypasses `applyRetentionWindow` instead of
`applyInactiveVmFilter`, and the count logic (`spanAllStatuses`, renamed appropriately)
spans all-time during a lookup so the numerator stays a subset of the denominator.

### Scope — everywhere VMs are counted

- **VMs page** (`src/components/vm-table.tsx`, `src/app/vms/page.tsx`): window pills
  replace the inactive checkbox; the filter pipeline applies `applyRetentionWindow`; the
  All-tab count and per-status badges respect the window; default `7d`.
- **Overview "Total VMs"** (`src/api/client.ts` `getOverviewStats`, `src/components/stats-bar.tsx`):
  `totalVMs` counts the **default 7d window** instead of `ACTIVE_VM_STATUSES`. No pill on
  Overview — it's a headline; the card links to `/vms` where the pills live. Per-status
  Overview cards count within the same window (active statuses are always in-window, so
  their numbers stay stable).
- **Issues page** (`src/hooks/use-issues.ts`, `src/app/issues/page.tsx`): discrepancy
  derivation respects a **30d** window (`ISSUES_RETENTION = "30d"`, wider than the 7d
  fleet view — decided at review) so a discrepancy from a week or two ago still surfaces,
  while 6-month-old orphan tombstones still age out.

### Removals (replace, don't deprecate)

- `ACTIVE_VM_STATUSES` and `applyInactiveVmFilter` deleted from `src/lib/filters.ts` and
  all references (`client.ts`, `vm-table.tsx`, tests).
- `Show inactive VMs` checkbox + `initialShowInactive` prop + `?showInactive=` param
  removed.
- Any "active status" wording in docs migrated to the window definition.

## Data flow

```
/api/v1/vms (full list, every poll)
   → useVMs() React Query cache (unchanged)
   → vm-table pipeline:
        textSearch → advancedFilters
        → applyRetentionWindow(window, now)   [skipped if hasLookupQuery]
        → statusPill filter
        → sort → paginate
   → counts: in-window per status + in-window all-status
             (all-time when hasLookupQuery)

getOverviewStats():
   /vms → applyRetentionWindow(DEFAULT_RETENTION, now) → totalVMs + per-status

useIssues():
   useVMs() + useNodes() → applyRetentionWindow(ISSUES_RETENTION /* 30d */, now) before deriving
```

## Edge cases & error handling

- **Never-observed VM** (`lastObservedAt` null): falls back to `updatedAt`/`allocatedAt`,
  so a fresh `scheduled`/`unschedulable` VM is in-window.
- **Just-deleted VM**: `updatedAt` is bumped to deletion time, so it stays in-window for
  the window length after deletion, then ages out — the intended "recent corpse, then
  gone" behavior. (`lastObservedAt` froze earlier; the `max` keeps it visible via
  `updatedAt`.)
- **Clock/timezone**: timestamps are ISO-8601 UTC from the API; parse to epoch ms, compare
  against `Date.now()`. `now` injected into the pure helper for deterministic tests.
- **Invalid `?retention=` value**: fall back to `DEFAULT_RETENTION` (validate against the
  known set, same pattern as `VALID_VM_STATUSES`).
- **Empty result**: a window with zero matches renders the existing empty state; the `All`
  pill and search remain available to widen.

## Testing

- **Pure helper** (`filters.test.ts`): in-window / out-of-window / boundary (exactly at
  `now − N`); null `lastObservedAt` fallback to `updatedAt`; `allocatedAt`-only; `"all"`
  returns input unchanged; each window length. `now` passed explicitly.
- **vm-table** (`vm-table.test.tsx`): default 7d hides an old `unscheduled` VM and shows a
  recent one; switching to `All` reveals the old one; a hash search surfaces an
  out-of-window VM (bypass); per-status badge reflects in-window count; `?retention=`
  round-trips.
- **Overview** (`client` transform test): `totalVMs` counts the 7d window, not the active
  status set.
- **Issues**: an out-of-window orphan is excluded from the default derivation.
- Break-then-fix each to confirm the test catches the regression.

## Decisions to log

- **New decision**: replace status-based VM culling with a time-based retention window
  (7d/30d/90d/All, default 7d on VMs page + Overview, 30d on Issues); the window is the
  always-on lens, status pills slice within it, explicit lookups bypass. Supersedes
  Decisions #65, #67, #68, and the implementation half of #109 (its principle survives).

## Resolved at review

1. **Status-pill vs window** — window is always-on; status pills slice within it (not a
   bypass). Per-status badges show in-window counts.
2. **Issues default window** — 30d (wider than the 7d fleet view) so recent-but-not-this-
   week discrepancies still surface.
3. **Default-number shift** — accepted: the 7d headline reads higher than today's active
   count because it includes VMs that died within the window. Intended.
