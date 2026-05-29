---
status: done
branch: feature/vm-retention-window
date: 2026-05-29
note: all 7 tasks implemented, pnpm check green (332 tests); awaiting preview verification before ship
---

# VM Retention Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the status-based VM cull (`ACTIVE_VM_STATUSES` + "Show inactive VMs" toggle) with a selectable time-based retention window (7d/30d/90d/All), applied everywhere VMs are counted.

**Architecture:** A pure `applyRetentionWindow(vms, window, now)` helper in `src/lib/filters.ts` keys "alive" on `max(lastObservedAt, updatedAt, allocatedAt) >= now − window`. The VMs page gets a pill selector (default 7d) in the FilterToolbar `leading` slot; the window is the always-on lens, status pills slice within it, and explicit lookups (search/owner) bypass it. The Overview "Total VMs" headline counts the default 7d window; the Issues page counts a 30d window. Phase 1 is client-side only — the scheduler-side `active_since` param is tracked separately (aleph-vm-scheduler#179).

**Tech Stack:** Next.js 16, TypeScript (strict), React Query, `@aleph-front/ds` (Tabs pill variant), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-29-vm-retention-window-design.md`

---

## File Structure

- `src/lib/filters.ts` — **modify**: remove `ACTIVE_VM_STATUSES` + `applyInactiveVmFilter`; add `RetentionWindow`, `DEFAULT_RETENTION`, `ISSUES_RETENTION`, `RETENTION_WINDOWS`, `applyRetentionWindow`. Remove `showInactive` from `VmAdvancedFilters`.
- `src/lib/filters.test.ts` — **modify**: replace the `applyInactiveVmFilter` describe block with an `applyRetentionWindow` block.
- `src/api/client.ts` — **modify**: `getOverviewStats` `totalVMs` uses `applyRetentionWindow(vms, DEFAULT_RETENTION, Date.now())`.
- `src/api/client.transform.test.ts` — **modify**: add a `totalVMs` window test.
- `src/hooks/use-issues.ts` — **modify**: apply `applyRetentionWindow(vms, ISSUES_RETENTION, Date.now())` before deriving discrepancies.
- `src/hooks/use-issues.test.tsx` — **create**: window-scoping test.
- `src/components/vm-table.tsx` — **modify**: pipeline applies the window; `formatCount` rewritten; window pills in `leading`; remove the "Show inactive VMs" checkbox; `?retention=` URL persistence; `initialRetention` prop replaces `initialShowInactive`.
- `src/components/vm-table.test.tsx` — **modify**: replace the Decision #109 search-bypass test with window-aware tests.
- `src/app/vms/page.tsx` — **modify**: read/validate `?retention=`, pass `initialRetention`; drop `?showInactive=`.
- `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`, `src/changelog.ts` — **modify**: docs + version (final task).

---

## Task 1: Retention helper in `src/lib/filters.ts`

**Files:**
- Modify: `src/lib/filters.ts` (replace lines 281–311 region; `VmAdvancedFilters` at 181–190)
- Test: `src/lib/filters.test.ts` (imports at 7,10; describe block at 576+)

- [ ] **Step 1: Write the failing test**

In `src/lib/filters.test.ts`, change the import block (currently importing `applyInactiveVmFilter` and `ACTIVE_VM_STATUSES`) to import `applyRetentionWindow` instead, and **replace the entire `describe("applyInactiveVmFilter", …)` block** (and its trailing `ACTIVE_VM_STATUSES` assertion) with:

```typescript
describe("applyRetentionWindow", () => {
  // Fixed clock: 2026-05-29T00:00:00Z
  const NOW = new Date("2026-05-29T00:00:00Z").getTime();
  const daysAgo = (n: number) =>
    new Date(NOW - n * 86_400_000).toISOString();

  it("returns identity for window 'all'", () => {
    const vms = [
      makeVm({ hash: "v1", updatedAt: daysAgo(400) }),
      makeVm({ hash: "v2", updatedAt: daysAgo(1) }),
    ];
    expect(applyRetentionWindow(vms, "all", NOW)).toEqual(vms);
  });

  it("keeps VMs observed within the window, drops older ones", () => {
    const vms = [
      makeVm({ hash: "recent", lastObservedAt: daysAgo(2), updatedAt: daysAgo(2) }),
      makeVm({ hash: "stale", lastObservedAt: daysAgo(20), updatedAt: daysAgo(20) }),
    ];
    const result = applyRetentionWindow(vms, "7d", NOW);
    expect(result.map((v) => v.hash)).toEqual(["recent"]);
  });

  it("uses the most-recent of lastObservedAt / updatedAt / allocatedAt", () => {
    // last observed long ago, but updatedAt is fresh (e.g. just unscheduled)
    const vm = makeVm({
      hash: "fresh-update",
      lastObservedAt: daysAgo(60),
      updatedAt: daysAgo(3),
      allocatedAt: null,
    });
    expect(applyRetentionWindow([vm], "7d", NOW).map((v) => v.hash)).toEqual([
      "fresh-update",
    ]);
  });

  it("keeps a never-observed but recently-allocated VM (scheduled, no observation yet)", () => {
    const vm = makeVm({
      hash: "scheduled-fresh",
      status: "scheduled",
      lastObservedAt: null,
      allocatedAt: daysAgo(1),
      updatedAt: daysAgo(1),
    });
    expect(applyRetentionWindow([vm], "7d", NOW).map((v) => v.hash)).toEqual([
      "scheduled-fresh",
    ]);
  });

  it("includes a VM exactly at the cutoff boundary", () => {
    const vm = makeVm({ hash: "boundary", lastObservedAt: daysAgo(7), updatedAt: daysAgo(7) });
    expect(applyRetentionWindow([vm], "7d", NOW).map((v) => v.hash)).toEqual([
      "boundary",
    ]);
  });

  it("widens with the window length (30d keeps what 7d drops)", () => {
    const vms = [makeVm({ hash: "v", lastObservedAt: daysAgo(20), updatedAt: daysAgo(20) })];
    expect(applyRetentionWindow(vms, "7d", NOW)).toHaveLength(0);
    expect(applyRetentionWindow(vms, "30d", NOW)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/filters.test.ts`
Expected: FAIL — `applyRetentionWindow` is not exported (import error).

- [ ] **Step 3: Implement the helper and remove the old cull**

In `src/lib/filters.ts`, **delete** the `ACTIVE_VM_STATUSES` constant and the `applyInactiveVmFilter` function (the block currently at ~281–311), and **replace** it with:

```typescript
/** Selectable retention window for the VMs view. `all` disables the window. */
export type RetentionWindow = "7d" | "30d" | "90d" | "all";

/** Ordered set of window options for the pill selector + URL validation. */
export const RETENTION_WINDOWS: readonly RetentionWindow[] = [
  "7d",
  "30d",
  "90d",
  "all",
] as const;

/** Default window on the VMs page and the Overview headline. */
export const DEFAULT_RETENTION: RetentionWindow = "7d";

/** Wider default for the Issues page so recent-but-not-this-week issues show. */
export const ISSUES_RETENTION: RetentionWindow = "30d";

const RETENTION_MS: Record<Exclude<RetentionWindow, "all">, number> = {
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

function lastActivityMs(v: VM): number {
  const t = (s: string | null) =>
    s ? new Date(s).getTime() : Number.NEGATIVE_INFINITY;
  return Math.max(t(v.lastObservedAt), t(v.updatedAt), t(v.allocatedAt));
}

/**
 * Keep VMs whose most-recent activity is within `window` of `now`.
 *
 * "Activity" is the max of `lastObservedAt` (a node still sees it),
 * `updatedAt` (any projection change), and `allocatedAt` (covers a freshly
 * scheduled VM not yet observed). `window === "all"` returns the input
 * unchanged. `now` is injected so callers can pass `Date.now()` and tests can
 * pin a fixed clock.
 */
export function applyRetentionWindow(
  vms: VM[],
  window: RetentionWindow,
  now: number,
): VM[] {
  if (window === "all") return vms;
  const cutoff = now - RETENTION_MS[window];
  return vms.filter((v) => lastActivityMs(v) >= cutoff);
}
```

Then remove `showInactive?: boolean;` from the `VmAdvancedFilters` type (line 189).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/filters.test.ts`
Expected: PASS (the `applyRetentionWindow` block passes; no references to the removed symbols remain in this file). Note: removing the shared exports breaks their consumers (`client.ts`, `vm-table.tsx`) — the project typecheck stays red until Tasks 2–4 migrate them. That's the expected mid-migration state; each consumer task turns its slice green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/filters.ts src/lib/filters.test.ts
git commit -m "feat(filters): add applyRetentionWindow, remove status-based cull"
```

---

## Task 2: Overview "Total VMs" counts the default window

**Files:**
- Modify: `src/api/client.ts` (import at line 23; `getOverviewStats` at 277)
- Test: `src/api/client.transform.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/api/client.transform.test.ts` (it already exercises transforms; if it lacks a VM-row helper, add a minimal one inline as shown). This test imports `getOverviewStats` is heavy (it fetches) — instead test the counting rule directly via `applyRetentionWindow`, which is the unit that changed:

```typescript
import { applyRetentionWindow } from "@/lib/filters";
import type { VM } from "@/api/types";

describe("overview totalVMs window rule", () => {
  const NOW = new Date("2026-05-29T00:00:00Z").getTime();
  const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
  const vm = (over: Partial<VM>): VM =>
    ({
      hash: "h", type: "instance", allocatedNode: null, observedNodes: [],
      status: "dispatched", requirements: { vcpus: 1, memoryMb: 1, diskMb: 1 },
      paymentStatus: null, updatedAt: daysAgo(1), allocatedAt: null,
      lastObservedAt: daysAgo(1), paymentType: null, gpuRequirements: [],
      requiresConfidential: false, schedulingStatus: null, migrationTarget: null,
      migrationStartedAt: null, owner: null, ...over,
    }) as VM;

  it("counts only VMs active within 7d", () => {
    const vms = [
      vm({ hash: "live", lastObservedAt: daysAgo(1), updatedAt: daysAgo(1) }),
      vm({ hash: "dead", status: "unscheduled", lastObservedAt: daysAgo(40), updatedAt: daysAgo(40) }),
    ];
    expect(applyRetentionWindow(vms, "7d", NOW)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify the file fails to compile**

Run: `pnpm vitest run src/api/client.transform.test.ts`
Expected: FAIL — the file imports `@/api/client`, which still imports the now-removed `ACTIVE_VM_STATUSES` (Task 1), so the whole test file fails to compile (`"ACTIVE_VM_STATUSES" is not exported`). The new rule test only exercises `applyRetentionWindow`, but it can't run until `client.ts` is fixed in Step 3. This test guards the counting *rule*; the wiring is additionally covered by Step 4's typecheck + manual smoke.

- [ ] **Step 3: Wire `getOverviewStats`**

In `src/api/client.ts`, change the import on line 23 from:

```typescript
import { ACTIVE_VM_STATUSES } from "@/lib/filters";
```
to:
```typescript
import { applyRetentionWindow, DEFAULT_RETENTION } from "@/lib/filters";
```

Then in `getOverviewStats`, replace the `totalVMs` line (277–278):

```typescript
    totalVMs: applyRetentionWindow(vms, DEFAULT_RETENTION, Date.now()).length,
```

(Leave `dispatchedVMs` / `missingVMs` / `unschedulableVMs` as-is — they're per-status counts; active statuses are always in-window so they're unaffected.)

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/api/client.transform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/api/client.transform.test.ts
git commit -m "feat(overview): Total VMs counts the 7d retention window"
```

---

## Task 3: Issues page scopes to a 30d window

**Files:**
- Modify: `src/hooks/use-issues.ts` (imports at 1–4; useMemo body at 87–90)
- Test: `src/hooks/use-issues.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/hooks/use-issues.test.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import type { VM } from "@/api/types";

const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const vm = (over: Partial<VM>): VM =>
  ({
    hash: "h", type: "instance", allocatedNode: null, observedNodes: [],
    status: "orphaned", requirements: { vcpus: 1, memoryMb: 1, diskMb: 1 },
    paymentStatus: null, updatedAt: daysAgo(1), allocatedAt: null,
    lastObservedAt: daysAgo(1), paymentType: null, gpuRequirements: [],
    requiresConfidential: false, schedulingStatus: null, migrationTarget: null,
    migrationStartedAt: null, owner: null, ...over,
  }) as VM;

const useVMsMock = vi.fn();
vi.mock("@/hooks/use-vms", () => ({ useVMs: () => useVMsMock() }));
vi.mock("@/hooks/use-nodes", () => ({
  useNodes: () => ({ data: [], isLoading: false, isFetching: false, refetch: vi.fn() }),
}));

import { useIssues } from "@/hooks/use-issues";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useIssues retention window", () => {
  it("excludes discrepancy VMs whose last activity is older than 30d", () => {
    useVMsMock.mockReturnValue({
      data: [
        vm({ hash: "recent-orphan", status: "orphaned", lastObservedAt: daysAgo(5), updatedAt: daysAgo(5) }),
        vm({ hash: "old-orphan", status: "orphaned", lastObservedAt: daysAgo(120), updatedAt: daysAgo(120) }),
      ],
      isLoading: false, isFetching: false, refetch: vi.fn(),
    });
    const { result } = renderHook(() => useIssues(), { wrapper });
    expect(result.current.issueVMs.map((v) => v.hash)).toEqual(["recent-orphan"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/hooks/use-issues.test.tsx`
Expected: FAIL — both orphans returned (window not yet applied).

- [ ] **Step 3: Apply the window in `useIssues`**

In `src/hooks/use-issues.ts`, add to the imports (line 2–4 area):

```typescript
import { applyRetentionWindow, ISSUES_RETENTION } from "@/lib/filters";
```

Then in the `useMemo` body, change the first line (currently `const vms = allVMs ?? [];` at line 88):

```typescript
    const vms = applyRetentionWindow(allVMs ?? [], ISSUES_RETENTION, Date.now());
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/hooks/use-issues.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-issues.ts src/hooks/use-issues.test.tsx
git commit -m "feat(issues): scope discrepancies to a 30d retention window"
```

---

## Task 4: VMs page — window pills, pipeline, counts, URL

**Files:**
- Modify: `src/components/vm-table.tsx` (imports 14,17,26–34; props 226–246; advanced-state 276–278; pipeline 315–355; `formatCount` 401–438; `sumActive` 395–399; `hasNonStatusFilters` 392–393; `clearAdvanced` 498–508; FilterToolbar `leading` 522; checkbox 677–704; page-reset effect 372–374)
- Modify: `src/app/vms/page.tsx` (line 39, 99)
- Test: `src/components/vm-table.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/vm-table.test.tsx`, **replace** the entire
`describe("VMTable — search bypasses the inactive-VM filter", …)` block with:

```typescript
describe("VMTable — retention window", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    replaceMock.mockReset();
    useVMsMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString();

  it("default 7d window hides a VM whose last activity is older than 7 days", () => {
    const stale = makeVm({
      hash: "stalehash00000000",
      status: "unscheduled",
      lastObservedAt: daysAgo(40),
      updatedAt: daysAgo(40),
    });
    useVMsMock.mockReturnValue({ data: [stale], isLoading: false });
    renderWithQuery(<VMTable onSelectVM={() => {}} />);
    // No row → its status badge is absent.
    expect(screen.queryByText("unscheduled")).toBeNull();
  });

  it("a hash search surfaces an out-of-window VM (lookup bypasses the window)", async () => {
    const stale = makeVm({
      hash: "needlehash0000000000000000000000000000000000000000000000needle",
      status: "unscheduled",
      lastObservedAt: daysAgo(40),
      updatedAt: daysAgo(40),
    });
    useVMsMock.mockReturnValue({ data: [stale], isLoading: false });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithQuery(<VMTable onSelectVM={() => {}} />);

    expect(screen.queryByText("unscheduled")).toBeNull();
    const search = screen.getByPlaceholderText("Search hash, name, node...");
    await user.type(search, stale.hash);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("unscheduled")).toBeInTheDocument();
  });

  it("seeds the window from initialRetention=all and shows everything", () => {
    const stale = makeVm({
      hash: "stalehash11111111",
      status: "unscheduled",
      lastObservedAt: daysAgo(400),
      updatedAt: daysAgo(400),
    });
    useVMsMock.mockReturnValue({ data: [stale], isLoading: false });
    renderWithQuery(<VMTable onSelectVM={() => {}} initialRetention="all" />);
    expect(screen.getByText("unscheduled")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/components/vm-table.test.tsx`
Expected: FAIL — `initialRetention` is not a prop; the window isn't applied (stale VM still shows).

- [ ] **Step 3: Update imports**

In `src/components/vm-table.tsx`:
- Add to the DS imports: `import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";`
- Change the `@/lib/filters` import block (26–34): remove `applyInactiveVmFilter` and `ACTIVE_VM_STATUSES`; add `applyRetentionWindow`, `DEFAULT_RETENTION`, `RETENTION_WINDOWS`, and `type RetentionWindow`. Result:

```typescript
import {
  textSearch,
  countByStatus,
  applyRetentionWindow,
  applyVmAdvancedFilters,
  computeVmFilterMaxes,
  DEFAULT_RETENTION,
  RETENTION_WINDOWS,
  type RetentionWindow,
  type VmAdvancedFilters,
} from "@/lib/filters";
```

- [ ] **Step 4: Swap the prop and add window state**

Change the props type (231) and destructure (242): replace `initialShowInactive?: boolean;` with `initialRetention?: RetentionWindow;` and `initialShowInactive,` with `initialRetention,`.

Replace the advanced-filter init (276–278) — drop the `showInactive` seeding:

```typescript
  const [advanced, setAdvanced] = useState<VmAdvancedFilters>({});
```

Add window state directly below the `statusFilter` state (after line 267):

```typescript
  // Retention window — the primary "how far back" lens.
  const [retention, setRetention] = useState<RetentionWindow>(
    initialRetention ?? DEFAULT_RETENTION,
  );
```

Remove the now-orphaned `showInactive` entry from the `activeAdvancedCount` array (line 310) — `advanced.showInactive` no longer exists on the type:

```typescript
    advanced.showInactive === true,   // ← DELETE this line
```

(Keep `validOwner !== "",` — the owner filter still counts as an active advanced filter.)

- [ ] **Step 5: Lift `hasLookupQuery` and rewrite the pipeline**

Replace `hasNonStatusFilters` (392–393) and add `hasLookupQuery` at component scope:

```typescript
  const hasLookupQuery =
    debouncedQuery.trim() !== "" || validOwner !== "";
```

In the pipeline `useMemo` (315–355), replace the body from `const showInactive …` through the `afterStatus` assignment with:

```typescript
      const all = allVms ?? [];
      const uCounts = countByStatus(all, (v) => v.status);

      const vmSearchFields = (v: VM) => [
        ...VM_BASE_SEARCH_FIELDS(v),
        messageInfo?.get(v.hash)?.name,
      ];
      const afterSearch = textSearch(all, debouncedQuery, vmSearchFields);
      const afterAdvanced = applyVmAdvancedFilters(
        afterSearch,
        advanced,
        filterMaxes,
      );

      // The window is the always-on lens — unless an explicit lookup
      // (search/owner) is active, which shows matches regardless of age.
      const afterWindow = hasLookupQuery
        ? afterAdvanced
        : applyRetentionWindow(afterAdvanced, retention, Date.now());

      const fCounts = countByStatus(afterWindow, (v) => v.status);

      const afterStatus = statusFilter
        ? afterWindow.filter((v) => v.status === statusFilter)
        : afterWindow;

      return {
        displayedRows: afterStatus,
        filteredCounts: fCounts,
        unfilteredCounts: uCounts,
      };
```

Update the `useMemo` dependency array to:

```typescript
    }, [allVms, debouncedQuery, validOwner, hasLookupQuery, retention, advanced, statusFilter, messageInfo, filterMaxes]);
```

- [ ] **Step 6: Rewrite `formatCount` and delete `sumActive`**

Delete the `sumActive` function (395–399). Replace `formatCount` (401–438) with:

```typescript
  function formatCount(status: VmStatus | undefined): string {
    if (status !== undefined) {
      const filtered = filteredCounts[status] ?? 0;
      if (hasLookupQuery) {
        // Lookup bypasses the window → compare against the all-time count.
        const unfiltered = unfilteredCounts[status] ?? 0;
        return filtered !== unfiltered ? `${filtered}/${unfiltered}` : `${unfiltered}`;
      }
      return `${filtered}`;
    }

    const filteredAll = Object.values(filteredCounts).reduce((a, b) => a + b, 0);
    if (hasLookupQuery) {
      const unfilteredAll = Object.values(unfilteredCounts).reduce((a, b) => a + b, 0);
      return filteredAll !== unfilteredAll ? `${filteredAll}/${unfilteredAll}` : `${unfilteredAll}`;
    }
    return `${filteredAll}`;
  }
```

- [ ] **Step 7: Add the window pills + reset-page effect, remove the checkbox**

Add a window-change handler near `clearAdvanced` (498):

```typescript
  function setRetentionAndUrl(w: RetentionWindow) {
    startTransition(() => setRetention(w));
    const params = new URLSearchParams(searchParams.toString());
    if (w === DEFAULT_RETENTION) {
      params.delete("retention");
    } else {
      params.set("retention", w);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }
```

In `clearAdvanced` (498–508), remove the `params.delete("showInactive");` line (retention is a primary lens, not an advanced filter, so Reset leaves it alone).

Add `retention` to the page-reset effect deps (372–374):

```typescript
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, advanced, statusFilter, validOwner, retention, setPage]);
```

Pass the pills into the toolbar `leading` slot — add the prop to the `<FilterToolbar …>` (after line 543, before the closing `/>`):

```tsx
        leading={
          <Tabs
            value={retention}
            onValueChange={(v) => setRetentionAndUrl(v as RetentionWindow)}
          >
            <TabsList variant="pill" size="sm">
              {RETENTION_WINDOWS.map((w) => (
                <TabsTrigger key={w} value={w}>
                  {w === "all" ? "All" : w}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
```

Delete the entire "Show inactive VMs" `<label>…</label>` block (677–704) from the FilterPanel.

- [ ] **Step 8: Update the VMs page param**

In `src/app/vms/page.tsx`:
- Add to the filters import: `import type { RetentionWindow } from "@/lib/filters";` and `import { RETENTION_WINDOWS } from "@/lib/filters";`
- Replace line 39 (`const showInactiveParam = …`) with:

```typescript
  const retentionParam = searchParams.get("retention");
  const initialRetention = RETENTION_WINDOWS.includes(
    retentionParam as RetentionWindow,
  )
    ? (retentionParam as RetentionWindow)
    : undefined;
```

- Replace line 99 (`{...(showInactiveParam ? { initialShowInactive: true } : {})}`) with:

```tsx
      {...(initialRetention ? { initialRetention } : {})}
```

- [ ] **Step 9: Run the tests**

Run: `pnpm vitest run src/components/vm-table.test.tsx`
Expected: PASS (all four owner-filter tests + the three retention tests).

- [ ] **Step 10: Typecheck the whole project (catches stragglers)**

Run: `pnpm typecheck`
Expected: PASS — no remaining references to `ACTIVE_VM_STATUSES`, `applyInactiveVmFilter`, `showInactive`, or `initialShowInactive`. Fix any that surface.

- [ ] **Step 11: Commit**

```bash
git add src/components/vm-table.tsx src/components/vm-table.test.tsx src/app/vms/page.tsx
git commit -m "feat(vms): retention-window pills replace the inactive-VM toggle"
```

---

## Task 5: Wording sweep

**Files:**
- Modify: `src/components/stats-bar.tsx` (Total VMs label/tooltip around 220–234)

- [ ] **Step 1: Inspect the Overview Total VMs copy**

Run: `rg -n "active|Total|scheduled across" src/components/stats-bar.tsx`
Read the matched lines.

- [ ] **Step 2: Update any "active" wording to reflect the window**

If the Total VMs subtitle/tooltip says "active" VMs, change it to reflect "active in the last 7 days" (or similar). Example — if a tooltip reads `Virtual machines currently active`, change to `Virtual machines active in the last 7 days`. Apply the minimal edit that makes the copy truthful; if no such wording exists, this task is a no-op (note it in the commit).

- [ ] **Step 3: Run lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit (skip if no change)**

```bash
git add src/components/stats-bar.tsx
git commit -m "docs(overview): Total VMs copy reflects the retention window"
```

---

## Task 6: Verify and refine

- [ ] Run full project checks: `pnpm check`
- [ ] Manual smoke (`pnpm dev`, real API via `.env.local`):
  - VMs page loads with the `7d` pill active; switching to `30d`/`90d`/`All` changes the row set and updates `?retention=`; reload restores the window.
  - The All-tab and per-status badges show in-window counts; with `All`, the badges jump to the cumulative-ever totals.
  - A hash search surfaces an out-of-window VM regardless of the pill (lookup bypass), and the count shows the `matched/all-time` slash.
  - The "Show inactive VMs" checkbox is gone; Reset clears advanced filters but leaves the window pill untouched.
  - Overview "Total VMs" reads the 7d window; Issues lists only discrepancies from the last 30 days.
- [ ] Fix any issues found; re-run `pnpm check` until clean.

---

## Task 7: Update docs and version

- [ ] **`docs/DECISIONS.md`** — add Decision #110: time-based retention window replaces status-based culling (7d VMs/Overview, 30d Issues); window always-on, status pills slice within it, lookups bypass; supersedes #65/#67/#68 and the implementation half of #109. Include rationale + alternatives (per the spec's "Decisions to log").
- [ ] **`CLAUDE.md`** — in the VMs page feature bullet, replace the "Show inactive VMs … ACTIVE_VM_STATUSES … bypassed when a specific status pill is selected" description with the retention-window model (pills 7d/30d/90d/All default 7d, `?retention=`, always-on lens, lookup bypass). Update the Overview "Total VMs" definition (no longer "active statuses" — now the 7d window) and the Issues bullet (30d window). Remove the trailing "All-tab count is plain / slash" sentence's reference to the inactive-hide and restate for the window.
- [ ] **`docs/ARCHITECTURE.md`** — replace the "Inactive-VM filter (default on)" paragraph (§334) with a "Retention window" paragraph: `applyRetentionWindow` in `src/lib/filters.ts`, the `max(lastObservedAt, updatedAt, allocatedAt)` predicate, the always-on pills, the lookup bypass, and the Overview/Issues windows. Update the `vm-table.test.tsx` coverage note (§81) to mention retention.
- [ ] **`docs/BACKLOG.md`** — move/add a Completed entry for this feature (Decision #110); add a "Ready to execute / Needs planning" entry for **Phase 2: scheduler `active_since` param** linking aleph-vm-scheduler#179 and `docs/briefs/2026-05-29-scheduler-vms-time-filter.md` (when the param lands, drop the client-side window filter and request the window server-side).
- [ ] **`src/changelog.ts`** — bump `CURRENT_VERSION` to `0.33.0` (minor — user-facing feature) and add a `VersionEntry` describing the retention-window pills replacing the inactive toggle, the 7d default, and the Overview/Issues windowing.
- [ ] Run `pnpm check` once more; commit docs + version:

```bash
git add docs/ CLAUDE.md src/changelog.ts
git commit -m "docs: retention window — Decision #110, features, changelog 0.33.0"
```

---

## Notes for the implementer

- **`now` injection:** the pure helper takes `now`; callers pass `Date.now()`. Don't call `Date.now()` inside the helper — tests pin a fixed clock.
- **Why no slash without a lookup:** the window is the view, so per-pill badges are plain in-window counts. The `matched/all-time` slash only appears during a lookup (window bypassed), preserving the Decision #109 UX where a search reports how much it narrowed.
- **Don't reintroduce `ACTIVE_VM_STATUSES`.** If a later reference surfaces during typecheck, migrate it to the window model rather than re-adding the constant (Replace, don't deprecate).
- **`removed` status** is out of scope — don't add handling for it here.
