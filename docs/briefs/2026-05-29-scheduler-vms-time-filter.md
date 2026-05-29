# Brief: a time filter for `/api/v1/vms`

**To:** Scheduler team / CTO
**From:** Network dashboard
**Date:** 2026-05-29
**Repo affected:** `aleph-im/aleph-vm-scheduler` (`scheduler-api`)
**Status:** Filed as [aleph-vm-scheduler#179](https://github.com/aleph-im/aleph-vm-scheduler/issues/179) — feedback wanted before a PR

---

## TL;DR

`/api/v1/vms` returns **every VM the scheduler has ever seen**, and the set only grows.
The dashboard pages through all of it every 30 seconds. We're shipping a client-side
recency filter as a stop-gap, but the real fix is a server-side time filter:

> Add an optional `active_since=<unix_ts>` query param to `/api/v1/vms` that returns
> only VMs with activity at or after that timestamp.

Optional, backward-compatible, ~one WHERE clause. It cuts the payload from "all-time"
to "recent" and lets the dashboard drop its client-side workaround.

## The problem

The `vms` projection table is **append-and-update only** — there is no `DELETE`, no
TTL, no pruning anywhere in `scheduler-api` (confirmed: the only `DELETE`/`TRUNCATE`
on `vms` is in test setup). A VM whose Aleph message is forgotten isn't removed; the
`VmUnscheduled { reason: Deleted }` handler in `projections.rs` just flips its row:

```sql
UPDATE vms SET allocated_node = NULL, status = 'unscheduled', ... WHERE vm_hash = $1
```

So the row count is **cumulative-ever**. `/api/v1/vms` (page size capped at 200)
returns the entire history on every full fetch. The dashboard refetches the whole set
every 30s (and on every relevant WebSocket event), so the cost grows without bound as
the network ages — most of it long-dead `unscheduled` rows nobody is looking at.

## What we're doing on our side (Phase 1)

The dashboard is adding a **recency window** (7d / 30d / 90d / All pills, 7d default):
a VM is shown when

```
max(last_observed_at, updated_at, allocated_at) >= now − window
```

This fixes the *view* (operators stop drowning in ancient tombstones) but **not the
transfer cost** — we still fetch every row and filter client-side. That's the gap
Phase 2 closes.

## The ask (Phase 2)

Add an optional query param to the `/api/v1/vms` route. Proposed name `active_since`,
value a Unix timestamp (seconds):

```
GET /api/v1/vms?active_since=1745000000
```

Semantics: return only VMs whose most-recent activity is at or after `active_since`.
Concretely, a WHERE clause on the existing columns:

```sql
WHERE GREATEST(COALESCE(last_observed_at, 'epoch'), updated_at) >= to_timestamp($active_since)
```

`updated_at` is always set, so `GREATEST` is well-defined; `last_observed_at` is the
truer "still alive on the network" signal (bumped every CRN poll, ~30s) and dominates
for running VMs. The param is **optional** — omitted means today's behavior exactly, so
nothing breaks for existing clients. It composes with the current filters (`status`,
`node`, `owner`, …) and must be reflected in the pagination `total_items` /
`total_pages` so paging stays correct over the filtered set.

This slots cleanly into the existing `VmQueryParams` struct in
`scheduler-api/src/routes/mod.rs` (one more `Option<i64>` field + one WHERE fragment).

## Why this shape

- **Cheap & low-risk:** optional param, one indexed predicate, no schema change,
  no behavior change for callers that don't pass it.
- **The dashboard becomes thin again:** with `active_since` available we delete the
  client-side recency filter and just request the window we're showing.
- **Indexable:** if the filter gets hot, an index on `(last_observed_at)` /
  `(updated_at)` keeps it fast.

## What this is NOT

This is a **read filter**, not a retention/pruning policy. Rows still live forever; the
ledger is intact and `active_since` omitted still returns all of it. Whether the
scheduler should eventually **archive or prune** genuinely-dead rows (table-growth /
storage concern) is a separate, larger decision — flagging it here for visibility, but
the dashboard doesn't need it and isn't asking for it.

## Open questions for the team

1. **Param name & unit** — `active_since` (Unix seconds)? Or an ISO-8601 `since=`, or a
   relative `active_within=7d`? We'll match whatever convention you prefer.
2. **Anchor column** — is `GREATEST(last_observed_at, updated_at)` the right "activity"
   definition on your side, or is there a column that better captures "last real
   signal"? We want the server's notion to match what an operator reads as "active."
3. **Index** — worth adding one up front, or wait until the predicate is measured hot?
4. **Reuse for nodes** — the `nodes` projection likely has the same unbounded-history
   shape; do you want a symmetric `active_since` on `/api/v1/nodes` while we're here, or
   keep this VM-only for now?

## References

- Dashboard cumulative-count finding & Phase 1 design: this repo,
  `docs/superpowers/specs/2026-05-29-vm-retention-window-design.md` (in progress)
- Scheduler no-prune confirmation: `scheduler-api/src/projections.rs`
  (`VmUnscheduled` handler), `VmObserved` handler (refreshes `last_observed_at`),
  `VmQueryParams` in `scheduler-api/src/routes/mod.rs`
