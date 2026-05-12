# CRN highlights on the network graph

**Date:** 2026-05-12
**Status:** Design approved, ready for implementation planning
**Related decisions:** #80 (pending/understaked trichotomy), #83 (CCN activation thresholds), #84 (warning ring naming)

## Goal

Extend the "warning ring" treatment introduced for understaked CCNs to flag CRNs with operational issues, so a user scanning `/network` sees CRN problems at a glance — not just CCN problems.

Reuse existing visual primitives (warning ring, pending ring) and existing data hooks. No new visual vocabulary; no new API endpoints.

## Scope

**In scope** — flag CRNs whose:
1. **Score is below 0.8.** Score is already in corechannel data (`CRNInfo.score`); the threshold is the only new constant.
2. **Scheduler health check reports `unreachable`.** Joins existing `useNodes()` data into the graph build.

**Out of scope** — explicitly considered and excluded during brainstorming:
- Resource exhaustion (CPU/memory ≥ 90%) — discussed, not selected.
- Scheduling discrepancies (orphaned/duplicated/misplaced/missing VMs) — already surfaced on the Issues page; not adding a parallel graph signal.
- Stale heartbeat, payment validation failures, GPU presence — not selected.
- New visual primitives (red body for unreachable, two-tier severity, stackable cues) — rejected in favor of consistency with the CCN warning ring.

## Data flow

```
useNodeState() -----> NodeState (corechannel CCN + CRN data, score included)
                              \
                               +--> buildGraph(state, layers, ownerBalances, crnStatuses) --> Graph
                              /
useNodes()    -----> Node[] (scheduler health: status = healthy | unreachable | unknown | removed)
   |
   v
Map<crn hash, scheduler status>
```

`useNetworkGraph` calls both `useNodeState()` (corechannel) and `useNodes()` (scheduler), builds a `Map<crnHash, schedulerStatus>` in-memory via `useMemo`, and passes it to `buildGraph` as a new fourth parameter `crnStatuses?: Map<string, string>`.

The `useNodes()` data is already in the React Query cache on every page that has used `/nodes` or the overview hero, so the join is effectively free for users navigating between graph and other pages; otherwise it's one network call with built-in caching.

**Loading-window guard.** If `useNodes()` hasn't resolved yet, the map is empty. The flag predicate treats a missing entry as "unknown — don't enforce the unreachable gate", avoiding a transient flash of warning rings on first paint. Same pattern as the `ownerBalances` guard from Decision #83.

## The `flagged` predicate

New optional boolean on `GraphNode` (CRN-only):

```ts
// CRN-only flag. True when the CRN is operationally connected (linked, not
// inactive, has a parent) but has an issue worth surfacing — low score OR
// scheduler reports it unreachable.
flagged?: boolean;
```

New constant in `network-graph-model.ts`:

```ts
// Below this score (0–1 scale), a CRN is treated as underperforming and
// gets the warning ring on the graph. Threshold chosen for visibility:
// most CRNs score well above 0.8, so the flag stays meaningful.
export const CRN_SCORE_THRESHOLD = 0.8;
```

Predicate in `buildGraph`:

```ts
const crnInactive = r.inactiveSince != null;
const crnPending = r.status === "waiting" && !crnInactive && r.parent == null;
const schedulerStatus = crnStatuses?.get(r.hash) ?? null;
const flagged =
  !crnInactive &&
  !crnPending &&
  (
    r.score < CRN_SCORE_THRESHOLD ||
    schedulerStatus === "unreachable"
  );
```

**Precedence (most → least specific):**
1. Inactive — grey body, no ring change (existing rule).
2. Pending — grey body + pending ring (existing rule).
3. Flagged — kind color body at full opacity + warning ring (new).
4. Operational — kind color body, no ring (existing rule).

Inactive and pending win over flagged: a CRN that's not-yet-adopted and also low-score reads as pending, not warning. Pending is the more fundamental "not operational" signal.

**Naming.** `flagged` is generic and uniform — covers both score and reachability without leaking the cause into the field name. An alternative `degraded` was considered; rejected because the term implies an operational regression specifically, and would be a slight mismatch for the low-score path (where the CRN may never have been higher).

## Visual treatment

Reuses the warning ring from Decision #84. Only the trigger expands. In `src/components/network/network-node.tsx`:

```ts
// Currently:
const dottedRing = pending || understaked;
stroke={understaked ? "var(--color-warning-500)" : color}

// Becomes:
const dottedRing = pending || understaked || flagged;
const showWarningRing = understaked || flagged;
stroke={showWarningRing ? "var(--color-warning-500)" : color}
```

Body opacity rule extends the same way:

```ts
const opacity =
  dimmed ? 0.18
  : inactive ? 0.6
  : pending ? 0.6
  : 1;  // understaked OR flagged
```

So a low-score or unreachable CRN renders **full-opacity green body + amber warning ring** — visually identical to an understaked CCN, just on the smaller CRN radius. One vocabulary, zero new visual primitives. The `flagged` prop is plumbed through `NetworkNode` from `network-graph.tsx` alongside `understaked`.

## Panel messages

The CRN detail panel (`network-detail-panel-crn.tsx`) already renders an italic note for the pending case. Flagged states extend the same pattern. Cascade by severity, mirroring the CCN cascade:

```
if (pending)         → "Registered but not yet adopted by a CCN."         (existing)
else if (unreachable) → "Unreachable — scheduler health check is failing."
else if (lowScore)    → `Low score (${score.toFixed(2)}) — below the 0.8 threshold.`
```

Unreachable wins over low-score when both apply — it's the more actionable signal. The user can resolve a reachability problem; score is a derived metric that recovers on its own.

**Props.** The panel needs the scheduler status passed in (the score is already in `CRNInfo`). Add an `unreachable: boolean` prop, computed at the call site from the same `crnStatuses` map that drives the graph.

**Consistency cues that flow with the new flag:**

- **StatusDot in panel header** — `dotStatusFor` in `network-detail-panel.tsx` currently returns `healthy` (green) for `status === "linked"`. Add a CRN-specific branch: `if (node.kind === "crn" && node.flagged) return "degraded"` so a flagged CRN gets an amber dot instead of green.
- **Status Badge variant** — the `crnChipVariant` helper returns `success` for linked. Add the same branch: flagged → `warning` so the chip is amber-outlined.

These two flips keep the panel and the graph visually aligned: amber ring on the node + amber dot/badge in the panel.

## Files changed

- `src/lib/network-graph-model.ts` — new `CRN_SCORE_THRESHOLD` constant, new `flagged` field on `GraphNode`, `buildGraph` accepts `crnStatuses` and computes the flag.
- `src/lib/network-graph-model.test.ts` — new tests for the predicate (see below).
- `src/hooks/use-network-graph.ts` — calls `useNodes()`, builds `crnStatuses` map, threads into `buildGraph`. Exports it alongside `ownerBalances`.
- `src/components/network/network-node.tsx` — accepts `flagged` prop, extends the ring + opacity rules.
- `src/components/network/network-graph.tsx` — passes `flagged` from GraphNode to NetworkNode.
- `src/components/network/network-detail-panel.tsx` — `dotStatusFor` extended; threads `unreachable` prop to CRN panel.
- `src/components/network/network-detail-panel-crn.tsx` — `crnChipVariant` extended; new `unreachable` prop; new cascade for the italic message.
- `src/components/network/network-detail-panel-crn.test.tsx` — new tests for the messages and chip variants.
- `src/app/network/page.tsx` — passes `crnStatuses` from `useNetworkGraph` to the detail panel.
- `src/changelog.ts` — new VersionEntry for the CRN highlights. Minor bump (new feature: `0.15.0 → 0.16.0`).
- `docs/ARCHITECTURE.md`, `CLAUDE.md`, `docs/DECISIONS.md` — inline doc updates and a new Decision entry referencing this spec.

## Testing

Same patterns as the CCN owner-balance tests — fast vitest model tests for the predicate, RTL tests for the panel messages.

**`network-graph-model.test.ts` — new cases:**
- CRN with `score < 0.8`, scheduler status unknown → flagged (low-score path).
- CRN with `score >= 0.8`, scheduler status `"unreachable"` → flagged (unreachable path).
- CRN with both signals → flagged (boolean, not stackable).
- CRN with `score < 0.8` AND `inactiveSince != null` → not flagged (inactive precedence).
- CRN with `score < 0.8` AND `status === "waiting"` AND `parent == null` → not flagged (pending precedence).
- CRN with `score >= 0.8` and scheduler status `"healthy"` → not flagged.
- CRN with unknown scheduler status (map miss) and score `>= 0.8` → not flagged (loading-window guard).

**`network-detail-panel-crn.test.tsx` — new cases:**
- Renders "Unreachable — scheduler health check is failing." when `unreachable={true}`.
- Renders "Low score (0.65) — below the 0.8 threshold." when score is below and `unreachable={false}`.
- Both at once → shows the unreachable message only (severity cascade).
- StatusDot / Status Badge variant flip to amber when flagged.

## Open questions

None at design approval time. Implementation-time decisions deferred:

- **Score-message wording** — current draft `Low score (0.65) — below the 0.8 threshold.` can be refined during implementation if a shorter or clearer phrasing emerges.
- **Should pending CRNs also surface their score in the panel even when not flagged?** Out of scope here; revisit if it comes up in usage.
- **Should the `/nodes` table get the same warning treatment?** Out of scope here; that table already has its own status pills.
