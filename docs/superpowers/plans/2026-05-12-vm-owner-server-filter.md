---
status: in-progress
branch: feature/vm-owner-server-filter
date: 2026-05-12
reservedDecision: 88
note: Wave 2 of scheduler v1 API surface; rebases on Wave 1 (PRs #107 + #109 + #111)
---

# VM Owner Server-Side Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plumb the scheduler's new `?owners=` and `?scheduling_status=` filter params through `VmFilters` and `getVMs()`, then wire one concrete consumer — an "Owner address" text input on the VMs page that fires a debounced server query for VMs matching the entered wallet address.

**Architecture:** `VmFilters` gains two optional fields (`owner`, `schedulingStatus`); `getVMs()` appends `owners=` and `scheduling_status=` to its URL when set. The VMs page adds an "Owner address" input to its existing `FilterPanel`; raw input is local state, debounced 500ms via the existing `useDebounce` hook, validated against `/^0x[0-9a-fA-F]{40}$/`, and — only when valid — passed as `{ owner }` to `useVMs(filters)`. `?owner=` persists the value in the URL. The filter-panel Reset clears it; the toolbar's active-filter dot lights up when owner is set. Everything else stays client-side.

**Tech Stack:** Next.js 16 (App Router, static export), TypeScript (strict), Tailwind CSS 4, React Query, `@aleph-front/ds`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-12-vm-owner-server-filter-design.md`

**Depends on:** Spec A (`2026-05-12-vm-fields-migrating-status-design.md`) adds the `owner` field to the `VM` type. This plan does **not** require `VM.owner` to be present in the response payload — `?owners=` filters server-side regardless of whether the field is surfaced in the row. If Spec A is merged first, no extra work; if it's still in flight when this plan runs, no defensive type change is needed here because the filter consumes the query param only. (Cross-checked against the spec — only `VmFilters` needs touching for this work.)

---

## File Structure

**Modify:**
- `src/api/types.ts` — extend `VmFilters` with `owner?` and `schedulingStatus?`.
- `src/api/client.ts` — extend `getVMs()` to append `owners=` and `scheduling_status=`.
- `src/app/vms/page.tsx` — read `?owner=` from the URL, pass through to `VMTable`.
- `src/components/vm-table.tsx` — owner input in `FilterPanel`, debounce + regex validation, `?owner=` URL persistence, `useVMs({ owner })` wiring, Reset clears, active-filter dot.
- `src/changelog.ts` — bump `CURRENT_VERSION` 0.16.0 → 0.17.0; new `VersionEntry`.
- `CLAUDE.md`, `docs/ARCHITECTURE.md` — note the selective server-side filter strategy + owner input.
- `docs/DECISIONS.md` — new Decision #86 (selective server-side filtering).
- `docs/BACKLOG.md` — move any matching items to Completed; add two new "Needs planning" entries (wallet view parallel scheduler fetch + Issues page `?scheduling_status=` divergence detection).

**Create:**
- `src/api/client.url.test.ts` — unit test for `getVMs()` URL construction (fetch-mocked).
- `src/components/vm-table.test.tsx` — smoke test for the owner-input debounce + URL persistence.

---

## Task 1: Extend `VmFilters` with `owner` and `schedulingStatus` (TDD)

**Files:**
- Modify: `src/api/types.ts`

- [ ] **Step 1: Update the `VmFilters` type**

In `src/api/types.ts`, replace the current `VmFilters` block (lines 97-100):

```ts
export type VmFilters = {
  status?: VmStatus;
  node?: string;
};
```

With:

```ts
export type VmFilters = {
  status?: VmStatus;
  node?: string;
  // 0x-prefixed wallet address. Filters server-side via `?owners=`.
  owner?: string;
  // Raw scheduler value. Plumbing only — no UI consumer yet (see Backlog).
  schedulingStatus?: VmStatus;
};
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: passes. The new fields are optional, so existing `VmFilters` constructions remain valid.

- [ ] **Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(api): extend VmFilters with owner + schedulingStatus"
```

---

## Task 2: Append `owners=` and `scheduling_status=` in `getVMs` (TDD)

**Files:**
- Create: `src/api/client.url.test.ts`
- Modify: `src/api/client.ts`

- [ ] **Step 1: Write a failing fetch-mocked test**

The existing `src/api/client.test.ts` is a `RUN_API_TESTS=true`-gated live integration suite, not a unit test. A new file isolates URL construction with a stubbed `fetch`.

Create `src/api/client.url.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getVMs } from "@/api/client";
import type { PaginatedResponse, ApiVmRow } from "@/api/types";

function emptyPage(): PaginatedResponse<ApiVmRow> {
  return {
    items: [],
    pagination: {
      page: 1,
      page_size: 200,
      total_items: 0,
      total_pages: 1,
    },
  };
}

describe("getVMs URL construction", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(emptyPage()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    // Pin the base URL so we don't depend on env state.
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function lastUrl(): string {
    const call = fetchSpy.mock.calls.at(-1);
    if (!call) throw new Error("fetch not called");
    return String(call[0]);
  }

  it("hits /api/v1/vms with no query string when no filters set", async () => {
    await getVMs();
    expect(lastUrl()).toBe(
      "http://api.test/api/v1/vms?page=1&page_size=200",
    );
  });

  it("appends owners= when owner is set", async () => {
    await getVMs({ owner: "0xabc" });
    const url = new URL(lastUrl());
    expect(url.pathname).toBe("/api/v1/vms");
    expect(url.searchParams.get("owners")).toBe("0xabc");
  });

  it("appends scheduling_status= when schedulingStatus is set", async () => {
    await getVMs({ schedulingStatus: "dispatched" });
    const url = new URL(lastUrl());
    expect(url.searchParams.get("scheduling_status")).toBe("dispatched");
  });

  it("appends status= when status is set", async () => {
    await getVMs({ status: "missing" });
    const url = new URL(lastUrl());
    expect(url.searchParams.get("status")).toBe("missing");
  });

  it("combines owner + status + schedulingStatus", async () => {
    await getVMs({
      owner: "0xdeadbeef",
      status: "missing",
      schedulingStatus: "dispatched",
    });
    const url = new URL(lastUrl());
    expect(url.searchParams.get("owners")).toBe("0xdeadbeef");
    expect(url.searchParams.get("status")).toBe("missing");
    expect(url.searchParams.get("scheduling_status")).toBe("dispatched");
  });

  it("does not append owners= when owner is empty string", async () => {
    await getVMs({ owner: "" });
    const url = new URL(lastUrl());
    expect(url.searchParams.has("owners")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests, expect failures**

Run: `pnpm test --run src/api/client.url.test.ts`
Expected: the `owners=` and `scheduling_status=` cases fail (current code only sets `status` and `node`).

- [ ] **Step 3: Extend `getVMs`**

In `src/api/client.ts`, replace the current `getVMs` body (around line 227-236):

```ts
export async function getVMs(filters?: VmFilters): Promise<VM[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.node) params.set("node", filters.node);
  const qs = params.toString();
  const raw = await fetchAllPages<ApiVmRow>(
    `/api/v1/vms${qs ? `?${qs}` : ""}`,
  );
  return raw.map(transformVm);
}
```

With:

```ts
export async function getVMs(filters?: VmFilters): Promise<VM[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.node) params.set("node", filters.node);
  if (filters?.owner) params.set("owners", filters.owner);
  if (filters?.schedulingStatus) {
    params.set("scheduling_status", filters.schedulingStatus);
  }
  const qs = params.toString();
  const raw = await fetchAllPages<ApiVmRow>(
    `/api/v1/vms${qs ? `?${qs}` : ""}`,
  );
  return raw.map(transformVm);
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test --run src/api/client.url.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/api/client.url.test.ts
git commit -m "feat(api): getVMs appends owners + scheduling_status params

URL params are skipped when the corresponding filter field is unset or
empty, so existing call sites and queryKeys are unaffected."
```

---

## Task 3: Read `?owner=` from the URL on the VMs page

**Files:**
- Modify: `src/app/vms/page.tsx`

- [ ] **Step 1: Add the URL read and pass through**

In `src/app/vms/page.tsx`, the existing `VMsContent` reads several URL params and forwards them to `VMTable`. Add `ownerParam` alongside the others.

After the existing `showInactiveParam` line (line 34), add:

```tsx
  const ownerParam = searchParams.get("owner") ?? "";
```

In the `<VMTable />` JSX, add `initialOwner={ownerParam}` to the prop list. The block becomes:

```tsx
      <VMTable
      onSelectVM={setSelectedVM}
      {...(initialStatus ? { initialStatus } : {})}
      initialQuery={queryParam}
      initialOwner={ownerParam}
      {...(showInactiveParam ? { initialShowInactive: true } : {})}
      {...(selectedVM ? { selectedKey: selectedVM } : {})}
      compact={!!selectedVM}
      sidePanel={
```

- [ ] **Step 2: Run typecheck — expect a failure**

Run: `pnpm typecheck`
Expected: fails because `VMTable` doesn't accept `initialOwner` yet. Task 4 closes the loop.

> Don't commit yet — wait for Task 4.

---

## Task 4: Owner input in `VMTable` — debounce, validate, persist, query

**Files:**
- Modify: `src/components/vm-table.tsx`

- [ ] **Step 1: Add `initialOwner` to props + state**

Open `src/components/vm-table.tsx`. Update the `VMTableProps` type (line 224) to include `initialOwner`:

```ts
type VMTableProps = {
  onSelectVM: (hash: string) => void;
  initialStatus?: VmStatus;
  initialQuery?: string;
  initialOwner?: string;
  initialShowInactive?: boolean;
  selectedKey?: string;
  compact?: boolean;
  sidePanel?: React.ReactNode;
};
```

Update the destructure (line 234):

```ts
export function VMTable({
  onSelectVM,
  initialStatus,
  initialQuery,
  initialOwner,
  initialShowInactive,
  selectedKey,
  compact,
  sidePanel,
}: VMTableProps) {
```

- [ ] **Step 2: Add owner input state + debounced derived value**

After the existing `debouncedQuery` declaration (line 250):

```ts
  const debouncedQuery = useDebounce(searchInput, 300);
```

Add:

```ts
  // Owner address filter — server-side via ?owners=.
  // Raw input is local; passed to the query only when valid + debounced.
  const [ownerInput, setOwnerInput] = useState(initialOwner ?? "");
  const debouncedOwner = useDebounce(ownerInput, 500);
  const validOwner = /^0x[0-9a-fA-F]{40}$/.test(debouncedOwner)
    ? debouncedOwner
    : "";
```

- [ ] **Step 3: Pass `owner` into `useVMs`**

Replace the existing `useVMs()` call (line 269):

```ts
  const { data: allVms, isLoading } = useVMs();
```

With:

```ts
  const { data: allVms, isLoading } = useVMs(
    validOwner ? { owner: validOwner } : undefined,
  );
```

(Empty-object filters would still change the queryKey identity vs. `undefined`. Passing `undefined` when there's no owner keeps the existing cache entry shared with every other VM consumer.)

- [ ] **Step 4: Persist `?owner=` in the URL**

The `ownerInput` is the user's intent; the URL should reflect whatever they've typed so reload preserves it. Add a URL-sync effect after the `useEffect(() => { setPage(1); ... })` (around line 357):

```tsx
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (ownerInput.trim() === "") {
      params.delete("owner");
    } else {
      params.set("owner", ownerInput);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    // searchParams is read live via .toString(); excluded from deps to avoid
    // ping-pong updates when other params change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerInput, router, pathname]);
```

- [ ] **Step 5: Include owner in `activeAdvancedCount` so the toolbar dot lights up**

The `activeAdvancedCount` computation (lines 280-297) is a `[...].filter(Boolean).length`. Add one entry — the owner is "active" when the debounced value is valid (i.e., something is actually filtering):

```ts
  const activeAdvancedCount = [
    advanced.vmTypes != null &&
      advanced.vmTypes.size > 0 &&
      advanced.vmTypes.size < ALL_VM_TYPES.length,
    advanced.paymentStatuses != null &&
      advanced.paymentStatuses.size > 0 &&
      advanced.paymentStatuses.size < ALL_PAYMENT_STATUSES.length,
    advanced.hasAllocatedNode,
    advanced.requiresGpu,
    advanced.requiresConfidential,
    advanced.vcpusRange != null &&
      (advanced.vcpusRange[0] > 0 ||
        advanced.vcpusRange[1] < filterMaxes.vcpus),
    advanced.memoryGbRange != null &&
      (advanced.memoryGbRange[0] > 0 ||
        advanced.memoryGbRange[1] < filterMaxes.memoryGb),
    advanced.showInactive === true,
    validOwner !== "",
  ].filter(Boolean).length;
```

- [ ] **Step 6: Clear owner from `clearAdvanced`**

In `clearAdvanced()` (line 454):

```ts
  function clearAdvanced() {
    startTransition(() => setAdvanced({}));
    const params = new URLSearchParams(searchParams.toString());
    params.delete("showInactive");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }
```

Becomes:

```ts
  function clearAdvanced() {
    startTransition(() => {
      setAdvanced({});
      setOwnerInput("");
    });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("showInactive");
    params.delete("owner");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }
```

- [ ] **Step 7: Reset page when owner changes**

The existing page-reset effect (line 357) depends on `debouncedQuery`, `advanced`, `statusFilter`. Add `validOwner`:

```tsx
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, advanced, statusFilter, validOwner, setPage]);
```

- [ ] **Step 8: Add the Input import**

At the top of the file, add to the existing DS imports:

```ts
import { Input } from "@aleph-front/ds/input";
```

- [ ] **Step 9: Add the "Owner address" field to the FilterPanel grid**

The `FilterPanel` body is a `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` of three filter groups (VM Type, Payment & Allocation, Requirements). Add a fourth group between "Payment & Allocation" and "Requirements", containing the Owner input. Replace the closing `</div>` of the Payment & Allocation block (just before `{/* Requirements */}` on line 650) with — first close the Payment block, then insert the new Owner block:

```tsx
            </div>

            {/* Owner */}
            <div>
              <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                Owner address
              </span>
              <Input
                size="sm"
                placeholder="0x…"
                value={ownerInput}
                onChange={(e) => setOwnerInput(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <p className="mt-2 text-xs text-muted-foreground/50">
                Filters server-side. Loads when a complete address is entered.
              </p>
            </div>

            {/* Requirements */}
```

The grid's `lg:grid-cols-3` will reflow to four cards on `lg` screens via the implicit row break — verify in the smoke test. If the visual feels cramped, bump the grid to `lg:grid-cols-4` in the same change.

- [ ] **Step 10: Run typecheck**

Run: `pnpm typecheck`
Expected: passes (Task 3's prop change is now satisfied).

- [ ] **Step 11: Commit Tasks 3 + 4 together**

```bash
git add src/app/vms/page.tsx src/components/vm-table.tsx
git commit -m "feat(vms): owner-address filter input (server-side)

Adds an Owner address input to the advanced filter panel. The value is
debounced 500ms, validated against /^0x[0-9a-fA-F]{40}\$/, and only
passed to useVMs as { owner } when valid — mid-typing keeps the full
fleet visible. Value persists via ?owner=; Reset clears it; active-filter
dot lights up when the filter is on."
```

---

## Task 5: Smoke test — debounce + URL persistence (TDD)

**Files:**
- Create: `src/components/vm-table.test.tsx`

- [ ] **Step 1: Write the test**

A small smoke test that mounts `VMTable` with a query-client wrapper, simulates typing a valid address, advances the debounce timer, and asserts that:
1. The URL was updated (via `router.replace` mock) with `?owner=…`.
2. `useVMs` received `{ owner: <address> }`.

Create `src/components/vm-table.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ReactElement } from "react";

import { VMTable } from "@/components/vm-table";

// Stub router so we can observe URL writes without a real Next.js runtime.
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => "/vms",
  useSearchParams: () => new URLSearchParams(),
}));

// Stub the VM-fetching hook so we can assert filter shape without network.
const useVMsMock = vi.fn(() => ({ data: [], isLoading: false }));
vi.mock("@/hooks/use-vms", () => ({
  useVMs: (filters?: unknown) => useVMsMock(filters),
}));

// useVMMessageInfo would otherwise try to fetch — stub it inert.
vi.mock("@/hooks/use-vm-creation-times", () => ({
  useVMMessageInfo: () => ({ data: undefined }),
}));

function renderWithQuery(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

describe("VMTable — owner filter", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    replaceMock.mockReset();
    useVMsMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not pass owner to useVMs while the input is invalid mid-typing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithQuery(<VMTable onSelectVM={() => {}} />);

    // Open advanced filters so the Owner input is visible.
    const filtersToggle = screen.getByRole("button", { name: /filter/i });
    await user.click(filtersToggle);

    const owner = screen.getByPlaceholderText("0x…");
    await user.type(owner, "0xabc"); // incomplete

    // Flush the debounce.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // useVMs was called, but never with an owner filter — the value is
    // still invalid.
    const lastCall = useVMsMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toBeUndefined();
  });

  it("passes owner to useVMs and writes ?owner= once the address is valid", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithQuery(<VMTable onSelectVM={() => {}} />);

    const filtersToggle = screen.getByRole("button", { name: /filter/i });
    await user.click(filtersToggle);

    const owner = screen.getByPlaceholderText("0x…");
    const validAddress = "0x" + "ab".repeat(20); // 40 hex chars
    await user.type(owner, validAddress);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const lastCall = useVMsMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({ owner: validAddress });

    // URL was updated with the raw value (URL persistence is not gated on
    // validity; only the query is).
    const replaceCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(replaceCall).toContain(
      `owner=${encodeURIComponent(validAddress)}`,
    );
  });

  it("seeds the input from initialOwner and queries immediately when valid", () => {
    const validAddress = "0x" + "cd".repeat(20);
    renderWithQuery(
      <VMTable onSelectVM={() => {}} initialOwner={validAddress} />,
    );

    const lastCall = useVMsMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({ owner: validAddress });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test --run src/components/vm-table.test.tsx`
Expected: all 3 tests pass.

If the third case fails because `useDebounce` returns the initial value with a one-tick delay on mount, switch the assertion to call `vi.advanceTimersByTime(500)` before reading the last `useVMsMock` call. The initial-value branch in `useDebounce` returns the seed synchronously (`useState(value)`), so the assertion should already hold without the timer flush.

- [ ] **Step 3: Run full check**

Run: `pnpm check`
Expected: lint + typecheck + tests all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/vm-table.test.tsx
git commit -m "test(vms): smoke test for owner filter debounce + URL persistence"
```

---

## Task 6: Verify and refine

- [ ] Run full project checks (`pnpm check`)
- [ ] Manual testing / smoke test the feature in `pnpm dev`
  - Open `/vms`, expand "Filters".
  - Type `0x` — table still shows full fleet, no loading state.
  - Paste a known owner address (40 hex chars). After ~500ms the table reloads and shows only that owner's VMs. Status tab counts reflect the filtered set.
  - Refresh the page — URL still has `?owner=…`, the input is pre-filled, results are the same.
  - Click "Reset" in the filter panel — owner clears, URL `?owner=` is gone, table returns to full fleet.
  - Type a malformed address (e.g. drop a hex digit). After 500ms the table returns to full fleet without a visible error.
  - Verify the active-filter dot on the toolbar lights up only when a valid address is in the input.
- [ ] Fix any issues found
- [ ] Re-run checks until clean

---

## Task 7: Update docs and version

- [ ] **Step 1: ARCHITECTURE.md** — new patterns, new files, or changed structure

Add a short note in the section that discusses VM filtering (or near the "API client" section) explaining the selective server-side filter strategy:

> **Server-side filters (selective).** `getVMs()` forwards `owner` → `?owners=` and `schedulingStatus` → `?scheduling_status=` to the scheduler. Other filters (`vmTypes`, `requiresGpu`, ranges, etc.) stay client-side — the dashboard fetches the whole VM list anyway and in-memory filtering is instant. Server-side is reserved for filters where the payload reduction is dramatic (owner = thousands → tens) and the user enters a deliberate query (vs. rapid toggles where a refetch + loading state would degrade UX).

Also add the two new files (`src/api/client.url.test.ts`, `src/components/vm-table.test.tsx`) to whatever file inventory ARCHITECTURE keeps, if any.

- [ ] **Step 2: DECISIONS.md** — Decision #86

Insert above the existing Decision #85:

```markdown
## Decision #86 - 2026-05-12
**Context:** The scheduler added server-side filter params (`?owners=`, `?scheduling_status=`, plus several others). The dashboard already fetches the full VM list and filters in memory — moving filters server-side trades instant in-memory toggles for a refetch + loading state. The question: which filters justify that trade?
**Decision:** Adopt server-side filtering selectively. `owner` → `?owners=` ships as a real consumer (owner input on the VMs page); `schedulingStatus` → `?scheduling_status=` ships as plumbing only (no UI consumer yet). All other server-supported filters (`cpu_architecture`, `has_gpu`, `requires_confidential`, `cpu_vendor`, `supports_ipv6`, `confidential_computing_enabled`, and range filters for vCPUs / memory) stay client-side. The owner input is debounced 500ms and validated against `/^0x[0-9a-fA-F]{40}\$/`; only valid addresses are passed to the query.
**Rationale:** Owner is the one filter where the payload reduction is dramatic — a wallet address narrows ~thousands of VMs to ~tens — and the user types a deliberate query rather than rapidly toggling, so the loading state is acceptable. Range filters and checkboxes are toggled rapidly; a server roundtrip on every tick degrades UX. `schedulingStatus` ships as plumbing because the spec calls for it as cheap groundwork — adding the URL param alongside `?owners=` costs one line, keeps the data-layer surface consistent, and avoids a second PR when a consumer (Issues page divergence detection) lands.
**Alternatives considered:** Move every supported filter server-side (rejected — degrades the rapid-toggle UX with no payload benefit on the toggle filters). Skip `schedulingStatus` until a consumer exists (rejected — the marginal cost of one URL param is below the cost of a second PR threading the same plumbing). Validate the owner input with an inline error (rejected — the user is mid-typing; pattern errors mid-stroke are noise).
```

- [ ] **Step 3: BACKLOG.md** — move completed + add deferred items

Skim Ready / Needs Planning / Roadmap for any item matching "owner filter", "server-side VM filter", or similar. Move matches to Completed.

Then add the two deferred consumers under **Needs planning**:

```markdown
### 2026-05-12 — Wallet view: scheduler-vs-api2 divergence detection
**Source:** Identified during VM owner server-side filter design (spec 2026-05-12-vm-owner-server-filter-design.md).
**Description:** In `useWalletVMs(address)`, call `useVMs({ owner: address })` alongside the existing api2 INSTANCE/PROGRAM message fetch. Cross-check the two sets to flag VMs in the scheduler that lack a message (and vice versa). Needs design pass for merge logic + UX (which source wins, how to display divergence).
**Priority:** Medium

### 2026-05-12 — Issues page: scheduling_status divergence detection
**Source:** Identified during VM owner server-side filter design (spec 2026-05-12-vm-owner-server-filter-design.md).
**Description:** Fire a thin `useVMs({ schedulingStatus: "dispatched" })` query and cross-check against the main `useVMs()` to flag VMs whose derived status disagrees with the scheduler's raw status. Concrete diagnostic value beyond Spec A's Schedule-vs-Reality row. Needs care — Issues already needs the full dataset for the node-perspective view; this is additive, not replacement.
**Priority:** Medium
```

- [ ] **Step 4: CLAUDE.md** — Current Features list

Find the VMs page bullet in the "Current Features" list and extend the advanced-filters section to mention the new Owner address input. Suggested addition (near where it lists VM Type / Payment & Allocation / Requirements):

> Advanced filters now include an **Owner address** input (0x-prefixed, validated against `/^0x[0-9a-fA-F]{40}$/`, debounced 500ms) that filters server-side via `?owners=` — the one filter where moving server-side pays off (massive payload reduction, deliberate user input). Persisted via `?owner=`. Other filters remain client-side for instant toggles.

- [ ] **Step 5: src/changelog.ts** — bump version + add VersionEntry

Update `CURRENT_VERSION` from `"0.16.0"` to `"0.17.0"`. Insert a new entry at the top of `CHANGELOG`:

```ts
  {
    version: "0.17.0",
    date: "2026-05-12",
    changes: [
      {
        type: "feature",
        text: "VMs page: new **Owner address** filter in the advanced filter panel. Paste a 0x-prefixed wallet address to see only that owner's VMs — the query goes server-side (`?owners=`) so the payload shrinks from thousands to tens. Debounced 500ms, validated mid-typing without an inline error, persists via `?owner=`, and the active-filter dot on the toolbar lights up when set.",
      },
    ],
  },
```

- [ ] **Step 6: Run final check**

Run: `pnpm check`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md src/changelog.ts docs/superpowers/specs/2026-05-12-vm-owner-server-filter-design.md docs/superpowers/plans/2026-05-12-vm-owner-server-filter.md
git commit -m "docs: VM owner server-side filter — Decision #86, CLAUDE.md, changelog v0.17.0"
```

---

## Done

After Task 7:
- Branch has the full feature + tests + docs.
- The plan's status frontmatter at the top should be updated to `status: done` before invoking the ship sequence.
- Run `/dio:ship` (or invoke the ship skill directly) to push, open the PR, run the CI gate, squash-merge, and clean up local state.
