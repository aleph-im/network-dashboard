# Backlog

Ideas and scope creep captured for later consideration.

---

## How Items Get Here

- Scope drift detected during focused work (active interrupt)
- Ideas that come up but aren't current priority
- "We should also..." moments
- Features identified but deferred

---

## Open Items

### 2026-03-04 - Stats sparklines via client-side accumulation
**Source:** Identified while working on real API migration (Decision #14)
**Description:** The API has no `/stats/history` endpoint. Sparklines were removed during migration. Could accumulate stats snapshots client-side in React Query cache (or a simple in-memory ring buffer) to rebuild 24h trend data. Better solution: request a `/stats/history` endpoint from the backend team.
**Priority:** Medium

### 2026-03-04 - DS StatusDot variants for unreachable/removed
**Source:** Identified while working on real API migration
**Description:** The DS `StatusDot` only accepts `"healthy" | "degraded" | "error" | "offline" | "unknown"`. API node statuses include `"unreachable"` and `"removed"` which we map to `"error"` and `"offline"` respectively via `nodeStatusToDot()`. Consider adding native `"unreachable"` and `"removed"` variants to the DS for semantic accuracy.
**Priority:** Low

### 2026-03-01 - WebSocket migration
**Source:** Design doc
**Description:** Replace polling with WebSocket connections for real-time event streaming. Would reduce latency and server load compared to 10-30s polling intervals.
**Priority:** Medium

### 2026-03-01 - Sidebar component in DS
**Source:** App shell implementation
**Description:** The AppSidebar is currently a local component. If other Aleph projects need similar navigation, consider promoting it to the DS with configurable nav items.
**Priority:** Low

### 2026-03-01 - E2E tests
**Source:** Implementation plan
**Description:** Add Playwright E2E tests for critical user flows: navigate pages, filter tables, open detail panels, toggle theme.
**Priority:** Medium

### 2026-03-01 - Resource usage charts
**Source:** Design doc
**Description:** Add time-series charts for CPU/memory/disk usage history on node detail views. Recharts was removed during API migration — would need to re-add or use a lighter charting library.
**Priority:** Medium

### 2026-03-03 - Automated IPFS deployment via Aleph CLI
**Source:** Manual deployment friction
**Description:** Investigate using the Aleph CLI to automatically push the `out/` directory to IPFS after build. Could be integrated into a GitHub Actions workflow or a local deploy script.
**Priority:** Medium

---

## Completed / Rejected

<details>
<summary>Archived items</summary>

- ✅ 2026-03-02 - Align DS color tokens with Tailwind conventions — resolved by Decision #11 (dashboard uses `--color-error-*` tokens directly)
- ✅ 2026-03-03 - IPFS page refresh: add trailingSlash — fixed by adding `trailingSlash: true` to `next.config.ts`
- ✅ 2026-03-04 - DS npm publishing — migrated from `file:` link to npm `0.0.3`
- ✅ 2026-03-04 - Real API integration — full type rewrite, client with `/api/v0` prefix, snake→camel transform layer, mock fallback preserved
- ✅ 2026-03-04 - Verify real API integration end-to-end — addressed by API status page + v0→v1 switch (all 12 integration tests pass against v1)
- ✅ 2026-03-04 - Top Nodes card on overview page — implemented with hasVms filter, sort params, checkbox UI, useTransition
- ✅ 2026-03-04 - Latest VMs card on overview page — progressive loading from scheduler + api2.aleph.im

</details>
