---
wave: 2026-05-12-scheduler-v1
date: 2026-05-12
status: done
---

# Wave 2026-05-12-scheduler-v1

Scheduler v1 API surface adoption — Wave 1 of 2. This wave lands the new VM-level fields plus the WebSocket cache-invalidation layer. Wave 2 will follow with `?owners=` server-side filtering, which depends on Wave 1's `VM.owner` field.

| Plan | Branch | Worktree | Reserved Decision | Status |
|------|--------|----------|-------------------|--------|
| [vm-fields-migrating-status](../plans/2026-05-12-vm-fields-migrating-status.md) | `feature/vm-fields-migrating-status` | `../scheduler-dashboard--feature-vm-fields-migrating-status` | #86 | done — PR #107 (ed2a963) |
| [scheduler-websocket](../plans/2026-05-12-scheduler-websocket.md) | `feature/scheduler-websocket` | `../scheduler-dashboard--feature-scheduler-websocket` | #87 | done — PR #109 (e43419c) |

## Started

2026-05-12

## Conflict-check notes

- **Primary files disjoint** — the two plans share only `src/api/client.ts`, and on different lines:
  - Plan A (`vm-fields-migrating-status`) extends `transformVm` to map four new VM fields.
  - Plan C (`scheduler-websocket`) exports `getBaseUrl` (currently private) so `getWsUrl()` can derive the WebSocket URL.
  - Both edits are fully additive. Rebase resolves textually.
- **Wiring sites** — no shared importers between Plan A and Plan C primary files.
- **Doc-file overlap** (`docs/BACKLOG.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md`, `src/changelog.ts`) — expected; rebase resolves. Decision numbers reserved up-front (Plan A: #86, Plan C: #87) to pre-empt collisions.

## Notes

- **Wave 2 queued:** Plan B (`feature/vm-owner-server-filter`) is deferred to the next wave. It depends on Plan A's `VM.owner` field and shares `vm-table.tsx` with Plan A. Cleanest to land it after Plan A merges so B's rebase is conflict-free.
- **Order of merge inside this wave:** either order works (the two PRs don't share logical state). Likely Plan C will be smaller and may merge first; that's fine.
- **Changelog bumps:** both PRs target a minor bump. Last to merge will rebase and pick the next minor (e.g. A merges first → 0.17.0; C rebases → 0.18.0).

## Completed

**2026-05-12 14:52 UTC** — wave closed.

- **Duration:** 46m (wave open 14:06 → last ship 14:52 UTC)
- **Ship cadence:** vm-fields → scheduler-ws merges 12m apart
- **Cumulative diff:** +1,349 / −70 across 38 file-change records (PR #107: +560/−56 across 25 files; PR #109: +789/−14 across 13 files)
- **Decisions:** #86 (vm-fields), #87 (scheduler-ws) — both reserved numbers used; none skipped
- **Changelog:** v0.17.0 (vm-fields, merged first) → v0.18.0 (scheduler-ws, rebased onto vm-fields) — bumps landed per plan
- **Wave 2 unblocked:** `feature/vm-owner-server-filter` can now rebase cleanly on `VM.owner` from PR #107
