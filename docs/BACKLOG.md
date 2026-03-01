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

### 2026-03-01 - Real API integration
**Source:** Initial scaffolding (mock data layer is a placeholder)
**Description:** Replace mock data with real scheduler API calls. Update `src/api/client.ts` functions to hit actual endpoints. Remove `NEXT_PUBLIC_USE_MOCKS` env var.
**Priority:** High

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

### 2026-03-01 - DS npm publishing
**Source:** Design doc
**Description:** Publish `@aleph-front/ds` to npm instead of using `file:` protocol linking. Would enable version pinning and CI/CD without local repo dependency.
**Priority:** Low

### 2026-03-01 - Resource usage charts (Recharts)
**Source:** Design doc
**Description:** Add time-series charts for CPU/memory/disk usage history on node detail views. Recharts is already a dependency but not yet used.
**Priority:** Medium

---

## Completed / Rejected

<details>
<summary>Archived items</summary>

<!-- Completed items moved here with checkmark and date -->

</details>
