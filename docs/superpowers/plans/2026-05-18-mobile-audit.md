---
status: done
branch: feature/mobile-audit
date: 2026-05-18
note: awaiting local browser smoke test at 375px (Task 12 step 2 deferred to user)
---

# Mobile Audit & Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-18-mobile-audit-design.md`

**Goal:** Make the dashboard's three primary mobile surfaces (Wallet, Node Earnings tab, Credits) usable on a phone below `md` (< 768px) by fixing four broken-or-painful behaviors: the sidebar that no longer goes off-canvas, the unreadable Credits flow diagram, wide tables that force horizontal scroll, and a chart tooltip that doesn't work on touch.

**Architecture:** Consumer-side responsive wrappers, no DS changes. Mobile and desktop versions of each fix are rendered together with Tailwind's `md:hidden` / `hidden md:block` visibility classes — both render to the DOM, CSS decides which is visible. Sidebar drawer state is a new `useMobileDrawer` hook (separate from the existing `useSidebarCollapse` which stays desktop-only). Tables get a `MobileTableCardRow` helper that consumes the same paginated data as the desktop `<table>`. The Credits flow gets a `CreditFlowList` component that reads the same `DistributionSummary` as `CreditFlowDiagram`.

**Tech Stack:** Next.js 16 App Router · TypeScript (strict, `noUncheckedIndexedAccess`) · Tailwind CSS 4 · `@aleph-front/ds@0.23.1` · React Query · vitest + @testing-library/react · pnpm.

---

## File Structure

**New files (created during implementation):**
- `src/hooks/use-mobile-drawer.ts` — drawer open/closed state + auto-close effects
- `src/hooks/use-mobile-drawer.test.tsx` — hook test
- `src/components/mobile-sidebar-drawer.tsx` — drawer wrapper around children
- `src/components/mobile-sidebar-drawer.test.tsx` — wrapper test
- `src/components/credit-flow-list.tsx` — mobile fallback for the flow diagram
- `src/components/credit-flow-list.test.tsx` — list test
- `src/components/mobile-table-card-row.tsx` — stacked-card row helper
- `src/components/mobile-table-card-row.test.tsx` — helper test

**Modified files:**
- `src/components/app-shell.tsx` — wraps `AppShellSidebar` in `MobileSidebarDrawer`; the `SidebarToggle` dispatches drawer-vs-rail by viewport.
- `src/components/credit-flow-diagram.tsx` — renders `CreditFlowList` below `md`, SVG above.
- `src/app/wallet/page.tsx` — Nodes / VMs sections render `MobileTableCardRow` below `md`.
- `src/components/credit-recipient-table.tsx` — mobile card view alongside the DS Table.
- `src/components/node-earnings-tab.tsx` — per-VM breakdown gets a mobile card view.
- `src/components/node-earnings-chart.tsx` — inline tooltip below the chart on mobile.
- `CLAUDE.md` — fix stale claim about drawer behavior.
- `docs/ARCHITECTURE.md` — add Responsive Layout note on the drawer wrapper + new helpers.
- `docs/DECISIONS.md` — add Decision entry for the consumer-side wrapper choice.
- `docs/BACKLOG.md` — completed entry + any deferred follow-ups.
- `src/changelog.ts` — bump version + add VersionEntry.

---

### Task 1: `useMobileDrawer` hook

**Files:**
- Create: `src/hooks/use-mobile-drawer.ts`
- Test: `src/hooks/use-mobile-drawer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/use-mobile-drawer.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useMobileDrawer } from "./use-mobile-drawer";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

import { usePathname } from "next/navigation";
const usePathnameMock = vi.mocked(usePathname);

describe("useMobileDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue("/");
  });

  it("starts closed", () => {
    const { result } = renderHook(() => useMobileDrawer());
    expect(result.current.open).toBe(false);
  });

  it("openDrawer sets open to true", () => {
    const { result } = renderHook(() => useMobileDrawer());
    act(() => result.current.openDrawer());
    expect(result.current.open).toBe(true);
  });

  it("closeDrawer sets open to false", () => {
    const { result } = renderHook(() => useMobileDrawer());
    act(() => result.current.openDrawer());
    act(() => result.current.closeDrawer());
    expect(result.current.open).toBe(false);
  });

  it("toggle flips open state", () => {
    const { result } = renderHook(() => useMobileDrawer());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });

  it("closes when pathname changes", () => {
    const { result, rerender } = renderHook(() => useMobileDrawer());
    act(() => result.current.openDrawer());
    expect(result.current.open).toBe(true);
    usePathnameMock.mockReturnValue("/nodes");
    rerender();
    expect(result.current.open).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/hooks/use-mobile-drawer.test.tsx
```

Expected: FAIL with "Cannot find module './use-mobile-drawer'" or similar.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/use-mobile-drawer.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const MD_BREAKPOINT = "(min-width: 768px)";

export function useMobileDrawer(): {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggle: () => void;
} {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change so navigating from a nav item collapses the drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close when the viewport crosses up past md (e.g. orientation change),
  // so the drawer doesn't get visually stuck open over the desktop layout.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(MD_BREAKPOINT);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return { open, openDrawer, closeDrawer, toggle };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/hooks/use-mobile-drawer.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-mobile-drawer.ts src/hooks/use-mobile-drawer.test.tsx
git commit -m "feat(mobile): useMobileDrawer hook with auto-close on route + md+ resize"
```

---

### Task 2: `MobileSidebarDrawer` wrapper component

**Files:**
- Create: `src/components/mobile-sidebar-drawer.tsx`
- Test: `src/components/mobile-sidebar-drawer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/mobile-sidebar-drawer.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileSidebarDrawer } from "./mobile-sidebar-drawer";

describe("MobileSidebarDrawer", () => {
  it("renders children regardless of open state", () => {
    render(
      <MobileSidebarDrawer open={false} onClose={() => {}}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    expect(screen.getByText("SIDEBAR")).toBeInTheDocument();
  });

  it("renders backdrop when open=true", () => {
    render(
      <MobileSidebarDrawer open={true} onClose={() => {}}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    expect(screen.getByLabelText("Close sidebar")).toBeInTheDocument();
  });

  it("does not render backdrop when open=false", () => {
    render(
      <MobileSidebarDrawer open={false} onClose={() => {}}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    expect(screen.queryByLabelText("Close sidebar")).not.toBeInTheDocument();
  });

  it("clicking the backdrop triggers onClose", () => {
    const onClose = vi.fn();
    render(
      <MobileSidebarDrawer open={true} onClose={onClose}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    fireEvent.click(screen.getByLabelText("Close sidebar"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("exposes open state via data-state for testing", () => {
    const { rerender, container } = render(
      <MobileSidebarDrawer open={false} onClose={() => {}}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    expect(
      container.querySelector("[data-state]")?.getAttribute("data-state"),
    ).toBe("closed");
    rerender(
      <MobileSidebarDrawer open={true} onClose={() => {}}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    expect(
      container.querySelector("[data-state]")?.getAttribute("data-state"),
    ).toBe("open");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/components/mobile-sidebar-drawer.test.tsx
```

Expected: FAIL with "Cannot find module './mobile-sidebar-drawer'".

- [ ] **Step 3: Implement the component**

Create `src/components/mobile-sidebar-drawer.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Wraps a sidebar so that below `md` it slides in/out as an off-canvas
 * drawer, and above `md` it renders inline as a normal flex child.
 *
 * Visibility / positioning is CSS-driven: `max-md:*` classes only apply
 * below md, so the wrapper is a plain flex child above md. The backdrop
 * carries `md:hidden` so it never shows on desktop even if `open=true`
 * (which can happen mid-resize before the auto-close effect fires).
 */
export function MobileSidebarDrawer({ open, onClose, children }: Props) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}
      <div
        data-state={open ? "open" : "closed"}
        className={`
          max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50
          max-md:transition-transform
          ${open ? "max-md:translate-x-0" : "max-md:-translate-x-full"}
        `}
        style={{ transitionDuration: "var(--duration-default)" }}
      >
        {children}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/components/mobile-sidebar-drawer.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/mobile-sidebar-drawer.tsx src/components/mobile-sidebar-drawer.test.tsx
git commit -m "feat(mobile): MobileSidebarDrawer wrapper — off-canvas below md, passthrough above"
```

---

### Task 3: Wire drawer into `AppShell` + dispatch toggle behavior

**Files:**
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Update imports and inside the component, add drawer state**

Open `src/components/app-shell.tsx`. Add imports near the existing imports:

```tsx
import { MobileSidebarDrawer } from "@/components/mobile-sidebar-drawer";
import { useMobileDrawer } from "@/hooks/use-mobile-drawer";
```

Inside `AppShell`, near the existing `useSidebarCollapse()` line, add:

```tsx
const { open: drawerOpen, closeDrawer, toggle: toggleDrawer } = useMobileDrawer();
```

- [ ] **Step 2: Add a viewport-aware toggle handler**

Below the existing `prefetchCredits` callback, add:

```tsx
const MD_QUERY = "(min-width: 768px)";

const handleSidebarToggle = useCallback(() => {
  if (typeof window !== "undefined" && window.matchMedia(MD_QUERY).matches) {
    toggle();
  } else {
    toggleDrawer();
  }
}, [toggle, toggleDrawer]);
```

(`toggle` here is the existing rail toggle from `useSidebarCollapse()`. The handler dispatches: on desktop it toggles rail/expand, on mobile it toggles drawer open/closed.)

- [ ] **Step 3: Wrap `AppShellSidebar` in `MobileSidebarDrawer`**

Find the `<AppShellSidebar ...>` block (around line 77). Wrap it in `<MobileSidebarDrawer>`:

```tsx
<MobileSidebarDrawer open={drawerOpen} onClose={closeDrawer}>
  <AppShellSidebar
    appMark={<AppMark collapsed={sidebarCollapsed} />}
    collapsed={collapsed}
    onToggle={toggle}
    footer={
      <Link
        href="/changelog"
        className="font-mono text-[11px] tabular-nums text-muted-foreground/40 transition-colors hover:text-muted-foreground"
        style={{ transitionDuration: "var(--duration-fast)" }}
      >
        v{CURRENT_VERSION}
      </Link>
    }
  >
    {NAV_SECTIONS.map((section) => (
      <AccordionSection
        key={section.id}
        title={section.title}
        sectionId={section.id}
        {...(section.id === "operations" ? { defaultOpen: false } : {})}
      >
        {section.items.map((item) => {
          const prefetchProps =
            item.href === "/credits"
              ? {
                  onMouseEnter: prefetchCredits,
                  onFocus: prefetchCredits,
                }
              : {};
          return (
            <NavItem
              key={item.href}
              asChild
              icon={<NavIcon name={item.icon} />}
              active={isActive(item.href)}
              {...prefetchProps}
            >
              <Link href={item.href}>{item.label}</Link>
            </NavItem>
          );
        })}
      </AccordionSection>
    ))}
  </AppShellSidebar>
</MobileSidebarDrawer>
```

- [ ] **Step 4: Point `PageHeader`'s `leading` to the viewport-aware handler**

Replace `<SidebarToggle onClick={toggle} />` with `<SidebarToggle onClick={handleSidebarToggle} />`:

```tsx
<PageHeader
  leading={<SidebarToggle onClick={handleSidebarToggle} />}
  fallbackTitle={routeTitle(pathname)}
  className="bg-transparent [&_.truncate]:text-xs [&_.truncate]:text-muted-foreground"
/>
```

- [ ] **Step 5: Run lint + typecheck + tests**

```bash
pnpm check
```

Expected: PASS (no lint/type errors, all existing tests still pass).

- [ ] **Step 6: Commit**

```bash
git add src/components/app-shell.tsx
git commit -m "feat(mobile): wire drawer into AppShell + viewport-aware sidebar toggle"
```

---

### Task 4: `CreditFlowList` component (mobile flow fallback)

**Files:**
- Create: `src/components/credit-flow-list.tsx`
- Test: `src/components/credit-flow-list.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/credit-flow-list.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CreditFlowList } from "./credit-flow-list";
import type { DistributionSummary } from "@/api/credit-types";

const SUMMARY: DistributionSummary = {
  totalAleph: 100,
  storageAleph: 40,
  executionAleph: 60,
  devFundAleph: 5,
  distributedAleph: 95,
  expenseCount: 10,
  recipients: [],
  expenses: [],
  perVm: new Map(),
  perNode: new Map(),
};

describe("CreditFlowList", () => {
  it("renders Storage and Execution section headers when both totals > 0", () => {
    render(<CreditFlowList summary={SUMMARY} />);
    expect(screen.getByText(/Storage/)).toBeInTheDocument();
    expect(screen.getByText(/Execution/)).toBeInTheDocument();
  });

  it("renders three rows under Storage (CCN 75% / Stakers 20% / Dev fund 5%)", () => {
    const { container } = render(<CreditFlowList summary={SUMMARY} />);
    const storageSection = container.querySelector("[data-section='storage']");
    expect(storageSection).toBeTruthy();
    const rows = storageSection!.querySelectorAll("[data-row]");
    expect(rows).toHaveLength(3);
  });

  it("renders four rows under Execution (CRN 60% / Stakers 20% / CCN 15% / Dev fund 5%)", () => {
    const { container } = render(<CreditFlowList summary={SUMMARY} />);
    const executionSection = container.querySelector("[data-section='execution']");
    expect(executionSection).toBeTruthy();
    const rows = executionSection!.querySelectorAll("[data-row]");
    expect(rows).toHaveLength(4);
  });

  it("hides empty sections silently", () => {
    const onlyExecution: DistributionSummary = { ...SUMMARY, storageAleph: 0 };
    const { container } = render(<CreditFlowList summary={onlyExecution} />);
    expect(container.querySelector("[data-section='storage']")).toBeNull();
    expect(container.querySelector("[data-section='execution']")).toBeTruthy();
  });

  it("renders a loading skeleton when summary is undefined", () => {
    const { container } = render(<CreditFlowList summary={undefined} />);
    expect(
      container.querySelector("[data-slot='skeleton'], .animate-pulse"),
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/components/credit-flow-list.test.tsx
```

Expected: FAIL with "Cannot find module './credit-flow-list'".

- [ ] **Step 3: Implement the component**

Create `src/components/credit-flow-list.tsx`:

```tsx
"use client";

import { Card } from "@aleph-front/ds/card";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { formatAleph } from "@/lib/format";
import type { DistributionSummary } from "@/api/credit-types";

// Mirror the desktop diagram's color tokens (see credit-flow-diagram.tsx).
const COLORS = {
  storage: "var(--color-accent-500)",
  execution: "var(--color-success-500)",
  crn: "var(--color-success-500)",
  ccn: "var(--color-primary-400)",
  staker: "var(--color-warning-400)",
  devFund: "var(--color-error-400)",
};

type Row = {
  label: string;
  percent: number;
  color: string;
};

const STORAGE_ROWS: Row[] = [
  { label: "CCN", percent: 0.75, color: COLORS.ccn },
  { label: "Stakers", percent: 0.2, color: COLORS.staker },
  { label: "Dev fund", percent: 0.05, color: COLORS.devFund },
];

const EXECUTION_ROWS: Row[] = [
  { label: "CRN", percent: 0.6, color: COLORS.crn },
  { label: "Stakers", percent: 0.2, color: COLORS.staker },
  { label: "CCN", percent: 0.15, color: COLORS.ccn },
  { label: "Dev fund", percent: 0.05, color: COLORS.devFund },
];

type Props = {
  summary: DistributionSummary | undefined;
};

export function CreditFlowList({ summary }: Props) {
  if (!summary) {
    return (
      <Card padding="md" className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
      </Card>
    );
  }

  return (
    <Card padding="md" className="space-y-6">
      {summary.storageAleph > 0 && (
        <FlowSection
          id="storage"
          title="Storage"
          total={summary.storageAleph}
          accent={COLORS.storage}
          rows={STORAGE_ROWS}
        />
      )}
      {summary.executionAleph > 0 && (
        <FlowSection
          id="execution"
          title="Execution"
          total={summary.executionAleph}
          accent={COLORS.execution}
          rows={EXECUTION_ROWS}
        />
      )}
    </Card>
  );
}

function FlowSection({
  id,
  title,
  total,
  accent,
  rows,
}: {
  id: string;
  title: string;
  total: number;
  accent: string;
  rows: Row[];
}) {
  return (
    <section data-section={id} className="space-y-2">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ background: accent }}
          />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
        </div>
        <span className="font-mono text-xs tabular-nums">
          {formatAleph(total)}
        </span>
      </header>
      <ul className="space-y-1.5 pl-4">
        {rows.map((row) => (
          <li
            key={row.label}
            data-row
            className="flex items-center justify-between text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: row.color }}
              />
              <span>{row.label}</span>
              <span className="text-xs text-muted-foreground">
                {Math.round(row.percent * 100)}%
              </span>
            </span>
            <span className="font-mono text-xs tabular-nums">
              {formatAleph(total * row.percent)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/components/credit-flow-list.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/credit-flow-list.tsx src/components/credit-flow-list.test.tsx
git commit -m "feat(mobile): CreditFlowList — vertical breakdown of storage/execution flows"
```

---

### Task 5: Wire `CreditFlowList` into `CreditFlowDiagram`

**Files:**
- Modify: `src/components/credit-flow-diagram.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/components/credit-flow-diagram.tsx`, add:

```tsx
import { CreditFlowList } from "@/components/credit-flow-list";
```

- [ ] **Step 2: Wrap the SVG output and render the list alongside**

Find the top-level `return` in `CreditFlowDiagram` (around line 526–530). Wrap it in a fragment with the list version visible below `md` and the SVG version visible above `md`:

```tsx
return (
  <>
    <div className="md:hidden">
      <CreditFlowList summary={summary} />
    </div>
    <div className="hidden md:block">
      {/* existing SVG <Card> ... </Card> block */}
    </div>
  </>
);
```

(Apply this to **both** the loaded path and the loading-placeholder path — there are two `return` statements in this component for the empty/loading state and the data state. The list handles its own `summary={undefined}` skeleton, so the same wrapper works for both.)

- [ ] **Step 3: Run lint + typecheck + tests**

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/credit-flow-diagram.tsx
git commit -m "feat(mobile): CreditFlowDiagram renders list below md, SVG above"
```

---

### Task 6: `MobileTableCardRow` helper

**Files:**
- Create: `src/components/mobile-table-card-row.tsx`
- Test: `src/components/mobile-table-card-row.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/mobile-table-card-row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileTableCardRow } from "./mobile-table-card-row";

describe("MobileTableCardRow", () => {
  it("renders the primary slot and label/value pairs", () => {
    render(
      <MobileTableCardRow
        primary={<span>0xABCD…1234</span>}
        fields={[
          { label: "Status", value: "active" },
          { label: "VMs", value: "3" },
        ]}
      />,
    );
    expect(screen.getByText("0xABCD…1234")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("VMs")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("wraps in a link when href is provided", () => {
    render(
      <MobileTableCardRow
        href="/wallet?address=0xABCD"
        primary={<span>0xABCD</span>}
        fields={[]}
      />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/wallet?address=0xABCD");
  });

  it("does not wrap in a link when href is omitted", () => {
    render(
      <MobileTableCardRow primary={<span>0xABCD</span>} fields={[]} />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/components/mobile-table-card-row.test.tsx
```

Expected: FAIL with "Cannot find module './mobile-table-card-row'".

- [ ] **Step 3: Implement the helper**

Create `src/components/mobile-table-card-row.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type MobileCardField = {
  label: string;
  value: ReactNode;
};

type Props = {
  primary: ReactNode;
  fields: MobileCardField[];
  href?: string;
};

/**
 * Stacked-card replacement for wide `<table>` rows below `md`. Primary
 * identifier on top, supporting fields as label/value pairs underneath.
 * Wraps in a `<Link>` when href is provided; otherwise renders as a div.
 */
export function MobileTableCardRow({ primary, fields, href }: Props) {
  const body = (
    <div className="space-y-2 rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] p-3">
      <div>{primary}</div>
      {fields.length > 0 && (
        <dl className="space-y-1">
          {fields.map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center justify-between text-xs"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block">
      {body}
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/components/mobile-table-card-row.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/mobile-table-card-row.tsx src/components/mobile-table-card-row.test.tsx
git commit -m "feat(mobile): MobileTableCardRow helper for stacked-card row pattern"
```

---

### Task 7: Wallet Nodes table → stacked cards below `md`

**Files:**
- Modify: `src/app/wallet/page.tsx` (the `NodesSection` component)

- [ ] **Step 1: Add the import**

At the top of `src/app/wallet/page.tsx`, add:

```tsx
import { MobileTableCardRow } from "@/components/mobile-table-card-row";
```

- [ ] **Step 2: Wrap the table and add the mobile card render**

In `NodesSection`, find the `<div className="overflow-x-auto"><table>…</table></div>` block. Wrap the existing table in `hidden md:block` and add a mobile-only card list alongside:

```tsx
function NodesSection({ nodes }: { nodes: Node[] }) {
  if (nodes.length === 0) return null;
  return (
    <Card padding="md">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Nodes ({nodes.length})
      </h3>
      {/* Mobile: stacked cards */}
      <div className="space-y-3 md:hidden">
        {nodes.map((node) => (
          <MobileTableCardRow
            key={node.hash}
            href={`/nodes?view=${node.hash}`}
            primary={
              <CopyableText
                text={node.hash}
                startChars={8}
                endChars={8}
                size="sm"
              />
            }
            fields={[
              { label: "Name", value: node.name ?? "—" },
              {
                label: "Status",
                value: (
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot
                      status={nodeStatusToDot(node.status)}
                      size="sm"
                    />
                    <Badge
                      fill="outline"
                      variant={NODE_STATUS_VARIANT[node.status]}
                      size="sm"
                    >
                      {node.status}
                    </Badge>
                  </span>
                ),
              },
              { label: "VMs", value: <span className="tabular-nums">{node.vmCount}</span> },
              {
                label: "Updated",
                value: (
                  <span className="text-muted-foreground tabular-nums">
                    {relativeTime(node.updatedAt)}
                  </span>
                ),
              },
            ]}
          />
        ))}
      </div>
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          {/* ... existing thead + tbody, unchanged ... */}
        </table>
      </div>
    </Card>
  );
}
```

(Keep the existing `<table>` markup exactly as it is; only the wrapping `<div>` gets the new `hidden md:block` classes.)

- [ ] **Step 3: Run lint + typecheck**

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/wallet/page.tsx
git commit -m "feat(mobile): Wallet Nodes section renders stacked cards below md"
```

---

### Task 8: Wallet VMs table → stacked cards below `md`

**Files:**
- Modify: `src/app/wallet/page.tsx` (the `VMsSection` component)

- [ ] **Step 1: Wrap the table and add the mobile card render**

In `VMsSection`, mirror Task 7's pattern. Find the `<div className="overflow-x-auto"><table>…</table></div>` block and change to:

```tsx
function VMsSection({ vms }: { vms: WalletVM[] }) {
  if (vms.length === 0) return null;
  return (
    <Card padding="md">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Virtual Machines ({vms.length})
      </h3>
      {/* Mobile: stacked cards */}
      <div className="space-y-3 md:hidden">
        {vms.map((vm) => (
          <MobileTableCardRow
            key={vm.hash}
            {...(vm.schedulerStatus ? { href: `/vms?view=${vm.hash}` } : {})}
            primary={
              <CopyableText
                text={vm.hash}
                startChars={8}
                endChars={8}
                size="sm"
              />
            }
            fields={[
              { label: "Name", value: vm.name ?? "—" },
              {
                label: "Type",
                value: (
                  <Badge fill="outline" variant="default" size="sm">
                    {vm.type}
                  </Badge>
                ),
              },
              {
                label: "Status",
                value: vm.schedulerStatus ? (
                  <Badge
                    fill="outline"
                    variant={VM_STATUS_VARIANT[vm.schedulerStatus]}
                    size="sm"
                  >
                    {vm.schedulerStatus}
                  </Badge>
                ) : (
                  <Badge fill="outline" variant="default" size="sm">
                    not tracked
                  </Badge>
                ),
              },
              {
                label: "Created",
                value: (
                  <span className="text-muted-foreground tabular-nums">
                    {relativeTimeFromUnix(vm.createdAt)}
                  </span>
                ),
              },
            ]}
          />
        ))}
      </div>
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          {/* ... existing thead + tbody, unchanged ... */}
        </table>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Run lint + typecheck**

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/wallet/page.tsx
git commit -m "feat(mobile): Wallet VMs section renders stacked cards below md"
```

---

### Task 9: `CreditRecipientTable` → stacked cards below `md`

**Files:**
- Modify: `src/components/credit-recipient-table.tsx`

This table uses the DS `<Table>` component (not raw `<table>` markup), so the desktop Table can't be hidden via a class on a wrapping `<table>`. Instead, wrap the **entire DS Table** in a `hidden md:block` div, and render a mobile card list alongside that consumes the same `pageItems`.

- [ ] **Step 1: Add the import**

Near the top of `src/components/credit-recipient-table.tsx`, add:

```tsx
import { MobileTableCardRow } from "@/components/mobile-table-card-row";
```

- [ ] **Step 2: Restructure the return JSX**

In `CreditRecipientTable`, find the existing JSX that renders `<Table .../>` followed by `<TablePagination .../>`. Restructure to render mobile and desktop versions of the data area while keeping the FilterToolbar and TablePagination above/below shared:

```tsx
return (
  <div>
    <FilterToolbar
      /* ... existing props unchanged ... */
    />

    {/* Desktop: DS Table with sort + click-row */}
    <div className="hidden md:block">
      <Table
        columns={columns}
        data={pageItems}
        keyExtractor={(r) => r.address}
        emptyState="No recipients found"
        onRowClick={(r) => router.push(`/wallet?address=${r.address}`)}
        {...(sortColumn ? { sortColumn } : {})}
        sortDirection={sortDirection}
        onSortChange={(col, dir) => {
          setSortColumn(col);
          setSortDirection(dir);
        }}
      />
    </div>

    {/* Mobile: stacked cards over the same pageItems */}
    <div className="space-y-3 md:hidden">
      {pageItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recipients found</p>
      ) : (
        pageItems.map((r) => (
          <MobileTableCardRow
            key={r.address}
            href={`/wallet?address=${r.address}`}
            primary={
              <CopyableText
                text={r.address}
                startChars={8}
                endChars={8}
                size="sm"
              />
            }
            fields={[
              {
                label: "Sources",
                value: (
                  <SourcesCell
                    recipient={r}
                    nodeIndex={nodeIndex}
                    matchedNodeNames={
                      matchedNodeNamesByAddress.get(r.address) ?? []
                    }
                  />
                ),
              },
              { label: "CRN", value: <AlephCell amount={r.crnAleph} /> },
              { label: "CCN", value: <AlephCell amount={r.ccnAleph} /> },
              { label: "Staking", value: <AlephCell amount={r.stakerAleph} /> },
              { label: "Total", value: <AlephCell amount={r.totalAleph} bold /> },
              {
                label: "% of pool",
                value: (
                  <span className="tabular-nums">
                    {((r.totalAleph / summary.distributedAleph) * 100).toFixed(1)}%
                  </span>
                ),
              },
            ]}
          />
        ))
      )}
    </div>

    <TablePagination
      page={page}
      pageSize={pageSize}
      totalPages={totalPages}
      totalItems={totalItems}
      startItem={startItem}
      endItem={endItem}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    />
  </div>
);
```

The `SourcesCell` and `AlephCell` components mentioned above are likely already defined inline in the file (look at how `columns` are built earlier in `buildColumns`). If they're inlined in column renderers, extract them as named components at module scope so both the DS Table and the mobile card list can reuse them. If they don't exist as separate components yet:

- Extract the Sources cell rendering (the `Badge` chips for CRN/CCN/Staker + matched-node-name chips) into a `<SourcesCell>` component near the top of the file.
- Extract the ALEPH-amount formatting cell into a `<AlephCell>` component near the top of the file.

Then update `buildColumns` to use these named components in the row renderers. Both desktop and mobile then reference the same component.

- [ ] **Step 3: Run lint + typecheck + tests**

```bash
pnpm check
```

Expected: PASS (no test regressions; this component has no existing tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/credit-recipient-table.tsx
git commit -m "feat(mobile): CreditRecipientTable renders stacked cards below md"
```

---

### Task 10: Earnings per-VM breakdown → stacked cards below `md`

**Files:**
- Modify: `src/components/node-earnings-tab.tsx`

- [ ] **Step 1: Add the import**

Near the top of `src/components/node-earnings-tab.tsx`, add:

```tsx
import { MobileTableCardRow } from "@/components/mobile-table-card-row";
```

- [ ] **Step 2: Wrap the per-VM table and add the mobile card list**

Find the per-VM breakdown block. The current structure is:

```tsx
{perVm.length > 0 && (
  <Card padding="md">
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      Hosted VMs — earnings breakdown
    </div>
    <table className="w-full text-sm">
      {/* thead + tbody */}
    </table>
    {/* + N more / Show less toggle */}
  </Card>
)}
```

Restructure to:

```tsx
{perVm.length > 0 && (
  <Card padding="md">
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      Hosted VMs — earnings breakdown
    </div>
    {/* Mobile: stacked cards */}
    <div className="space-y-3 md:hidden">
      {visibleVms.map((v) => (
        <MobileTableCardRow
          key={v.vmHash}
          href={`/vms?view=${v.vmHash}`}
          primary={
            <CopyableText
              text={v.vmHash}
              startChars={8}
              endChars={8}
              size="sm"
            />
          }
          fields={[
            {
              label: "Payment",
              value: (
                <Badge
                  fill="outline"
                  variant={v.source === "hold" ? "info" : "default"}
                  size="sm"
                >
                  {v.source === "hold" ? "Hold" : "Credits"}
                </Badge>
              ),
            },
            {
              label: "ALEPH",
              value: (
                <span className="font-mono tabular-nums">
                  {formatAleph(v.aleph)}
                </span>
              ),
            },
          ]}
        />
      ))}
    </div>
    {/* Desktop: table — existing markup, just wrapped */}
    <div className="hidden md:block">
      <table className="w-full text-sm">
        {/* existing thead + tbody — unchanged */}
      </table>
    </div>
    {/* + N more / Show less toggle — keep below both views */}
    {rest.length > 0 && (
      <button
        type="button"
        onClick={() => setExpandedBreakdown((v) => !v)}
        className="mt-3 text-xs text-primary-400 hover:text-primary-300"
      >
        {/* existing toggle text */}
      </button>
    )}
  </Card>
)}
```

(Keep the existing desktop `<table>` markup, the `+N more` toggle, and all the existing state — just split the renderers by viewport.)

- [ ] **Step 3: Run lint + typecheck + tests**

```bash
pnpm check
```

Expected: PASS — the existing earnings-tab test (`node-earnings-tab.test.tsx`) covers the `+N more` collapse/expand behavior; verify those assertions still pass since `visibleVms` is the same source of truth for both renderers.

- [ ] **Step 4: Commit**

```bash
git add src/components/node-earnings-tab.tsx
git commit -m "feat(mobile): Earnings per-VM breakdown renders stacked cards below md"
```

---

### Task 11: `NodeEarningsChart` inline tooltip below `md`

**Files:**
- Modify: `src/components/node-earnings-chart.tsx`

The current chart renders a floating `HoverCard` that side-anchors via `translate` offsets. Below `md`, the tooltip should be an inline read-out *below* the chart that shows the currently-highlighted bucket. The chart itself stays unchanged — only the tooltip rendering branches by viewport.

- [ ] **Step 1: Add an always-rendered inline read-out below the chart**

In `NodeEarningsChart`, after the chart's `<DualLineChart .../>` invocation and before the floating HoverCard, add an inline read-out wrapper:

```tsx
{/* Mobile: inline read-out below the chart, hidden above md (where the
    floating HoverCard takes over). */}
<div className="mt-2 md:hidden">
  {hoverIndex != null && buckets[hoverIndex] ? (
    <InlineReadOut
      bucket={buckets[hoverIndex]}
      primaryLabel={primaryLabel}
      secondaryLabel={secondaryLabel}
    />
  ) : (
    <p className="text-xs text-muted-foreground">
      Tap chart to inspect
    </p>
  )}
</div>
```

- [ ] **Step 2: Hide the floating HoverCard below `md`**

Find the existing floating HoverCard render block (the `<div data-testid="hover-card" ...>` inside `NodeEarningsChart`) and add `hidden md:block` to its outermost class so it only shows above `md`:

```tsx
<div
  data-testid="hover-card"
  data-side={xPct < 0.5 ? "right" : "left"}
  className="hidden md:block absolute z-10 ..."  // ← prepend hidden md:block to the existing classes
  style={{ ... }}
>
  {/* existing card content */}
</div>
```

- [ ] **Step 3: Add the `InlineReadOut` helper**

At module scope (near the other helpers in this file), add:

```tsx
function InlineReadOut({
  bucket,
  primaryLabel,
  secondaryLabel,
}: {
  bucket: NodeEarningsBucket;
  primaryLabel: string;
  secondaryLabel: string;
}) {
  const time = formatBucketTime(bucket.time);
  return (
    <div className="flex items-center justify-between rounded-md border border-foreground/[0.06] bg-foreground/[0.03] px-3 py-2 text-xs">
      <span className="text-muted-foreground tabular-nums">{time}</span>
      <span className="flex items-center gap-3">
        <span>
          <span className="text-muted-foreground">{primaryLabel}:</span>{" "}
          <span className="font-mono tabular-nums">{bucket.aleph.toFixed(2)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">{secondaryLabel}:</span>{" "}
          <span className="font-mono tabular-nums">{bucket.secondaryCount}</span>
        </span>
      </span>
    </div>
  );
}
```

(`formatBucketTime` is the same helper the floating HoverCard already uses to format the bucket time — see existing code in this file. If it's inlined, extract it to a module-scope function so both renderers use the same format.)

- [ ] **Step 4: Add a test for the inline read-out**

Open `src/components/node-earnings-chart.test.tsx` and add a new test:

```tsx
it("renders the mobile inline read-out below the chart (always in DOM)", () => {
  const buckets = Array.from({ length: 24 }, (_, i) => ({
    time: i * 3600,
    aleph: 0.5,
    secondaryCount: 3,
  }));
  const { container } = render(
    <NodeEarningsChart
      buckets={buckets}
      primaryLabel="ALEPH"
      secondaryLabel="VMs"
    />,
  );
  // The mobile read-out container is rendered with md:hidden — assert it exists.
  expect(container.querySelector(".md\\:hidden")).toBeTruthy();
});
```

- [ ] **Step 5: Run lint + typecheck + tests**

```bash
pnpm check
```

Expected: PASS (existing 3 tests + 1 new = 4 in `node-earnings-chart.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add src/components/node-earnings-chart.tsx src/components/node-earnings-chart.test.tsx
git commit -m "feat(mobile): NodeEarningsChart shows inline read-out below md"
```

---

### Task 12: Verify and refine

**Files:** none (manual verification)

- [ ] **Step 1: Run full project checks**

```bash
pnpm check
```

Expected: PASS — all tests pass, no lint/type warnings.

- [ ] **Step 2: Start dev server and smoke-test on a 375px viewport**

```bash
pnpm dev
```

Open `http://localhost:3000` in a browser and use DevTools responsive mode at **375px width**. Walk through:

1. **Shell chrome:** sidebar is hidden by default. Tap ☰ in the page header → drawer slides in from the left over a dimmed backdrop. Tap a nav item → drawer closes and route changes. Tap the backdrop → drawer closes. Resize past 768px → drawer auto-closes if open, and the inline desktop sidebar reappears.
2. **`/credits`:** SVG flow diagram is replaced by the `CreditFlowList` (Storage and Execution sections, three / four rows each, color swatches matching the desktop diagram, ALEPH amounts via `formatAleph`).
3. **`/wallet?address=<known-wallet>`:** Nodes and VMs sections render as stacked cards (one card per row, primary identifier on top, label/value pairs beneath, whole card is tappable to navigate to detail view).
4. **`/credits` recipient table:** stacked card view with all six fields (Sources, CRN, CCN, Staking, Total, % of pool); pagination still works.
5. **`/nodes?view=<hash>&tab=earnings`:** per-VM breakdown renders as stacked cards; the chart's tooltip is inline below the chart and updates as you tap on different x positions; `+ N more` / `Show less` still toggles.

- [ ] **Step 3: Check the `ProductStrip` at 375px**

In the same DevTools session, verify the cross-app tabs render. If they overflow visibly (text clipped, logo overlaps tabs), capture the issue and add it to `docs/BACKLOG.md` under Needs planning rather than fixing here — DS-owned, out of scope.

- [ ] **Step 4: Fix any issues found**

If a smoke-test step surfaces a regression, fix the relevant component file and re-run `pnpm check` until clean. Commit each fix as its own `fix(mobile): ...` commit.

---

### Task 13: Update docs and version

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/BACKLOG.md`
- Modify: `src/changelog.ts`

- [ ] **Step 1: Update `CLAUDE.md`**

Find the line on L288 that claims "off-canvas sidebar drawer on mobile":

```
- Responsive layout: off-canvas sidebar drawer on mobile, inline on desktop; detail panels as slide-in overlays on mobile, inline on desktop; adaptive column hiding when detail panel is open (lower-priority columns hidden to prevent table squeeze, restored when panel closes)
```

Update to reflect the new, correct drawer behavior:

```
- Responsive layout: off-canvas sidebar drawer below `md` (via `MobileSidebarDrawer` wrapping `AppShellSidebar`; drawer state from new `useMobileDrawer` hook in `src/hooks/use-mobile-drawer.ts`, auto-closes on route change and `md+` resize); inline expanded ↔ icon-rail sidebar above `md` (via DS `useSidebarCollapse`). PageHeader's ☰ button dispatches: tap on mobile opens/closes the drawer, tap on desktop toggles rail/expand. Detail panels as slide-in overlays on mobile, inline on desktop; adaptive column hiding when detail panel is open. Wide tables (Wallet Nodes/VMs, Credit Recipients, Earnings per-VM) render as stacked cards via `MobileTableCardRow` below `md`. Credits flow diagram swaps to `CreditFlowList` below `md`. NodeEarningsChart tooltip is inline-below-chart on mobile, floating side-anchored on desktop.
```

- [ ] **Step 2: Update `docs/ARCHITECTURE.md`**

In the **Responsive Layout** section (around L410), append a paragraph describing the new wrappers and the helpers' file paths:

```
**Mobile sidebar drawer (below `md`):** the DS `AppShellSidebar` provides expanded ↔ icon-rail collapse only, not an off-canvas drawer. To restore the off-canvas behavior that regressed during the May 2026 shell redesign, `AppShellSidebar` is wrapped in a consumer-side `MobileSidebarDrawer` (`src/components/mobile-sidebar-drawer.tsx`) that applies `max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:transition-transform` with `max-md:translate-x-0` / `max-md:-translate-x-full` based on a new `useMobileDrawer` hook (`src/hooks/use-mobile-drawer.ts`). Above `md`, the wrapper's `max-md:*` classes are no-ops and the sidebar renders inline as a regular flex child. Drawer auto-closes on route change (`usePathname` effect) and on `md+` resize (`matchMedia` listener). PageHeader's ☰ button uses a viewport-aware handler (`handleSidebarToggle`) that calls `toggleDrawer()` below `md` and `toggle()` (rail/expand from `useSidebarCollapse`) above. Decision #97.

**Wide tables → stacked cards (below `md`):** `MobileTableCardRow` (`src/components/mobile-table-card-row.tsx`) takes a `primary` slot and a `fields: { label, value }[]` array, renders a bordered card with the primary identifier on top and label/value pairs below, optionally wrapping in a `<Link>` when an `href` is supplied. Surfaces using it: Wallet Nodes and VMs (`src/app/wallet/page.tsx`), CreditRecipientTable (`src/components/credit-recipient-table.tsx`), Earnings per-VM breakdown (`src/components/node-earnings-tab.tsx`). Each surface renders both the desktop `<table>` and the mobile card list, gated by `md:hidden` / `hidden md:block` — both in the DOM, CSS picks one.

**Credits flow mobile fallback:** `CreditFlowList` (`src/components/credit-flow-list.tsx`) consumes the same `DistributionSummary` prop as `CreditFlowDiagram` and renders a vertical list with Storage and Execution sections, each with their constituent destination rows (CCN 75% / Stakers 20% / Dev fund 5% for storage; CRN 60% / Stakers 20% / CCN 15% / Dev fund 5% for execution). Empty sources collapse silently. The wrapper component (`CreditFlowDiagram`) renders the list inside `md:hidden` and the SVG inside `hidden md:block`.

**Earnings chart tooltip:** `NodeEarningsChart`'s floating `HoverCard` carries `hidden md:block` so it only shows above `md`; below `md`, an inline read-out renders directly under the chart, showing the highlighted bucket's time / ALEPH / secondary count, with a "Tap chart to inspect" empty state. The chart's pointer-capture rect (in `DualLineChart`) already handles touch via `onPointerMove`, so no changes to the chart primitive.
```

- [ ] **Step 3: Update `docs/DECISIONS.md`**

Add a new Decision #97 entry at the top (above the current #96), following the existing format:

```
## Decision #97 - 2026-05-18
**Context:** The May 2026 shell redesign (Decision #94) replaced the custom `AppSidebar` with the DS `AppShellSidebar`, which provides only expanded ↔ icon-rail collapse — no off-canvas drawer mode. The previous mobile drawer behavior silently regressed, and CLAUDE.md L288 carried a stale claim that the drawer still existed. A node-owner-on-mobile audit (spec `docs/superpowers/specs/2026-05-18-mobile-audit-design.md`) found this was the single highest-impact mobile regression — on a 375px viewport, even the DS icon rail eats 60–80px and expanded mode blocks content entirely.
**Decision:** Implement the mobile drawer **consumer-side** rather than waiting on a DS feature. New `MobileSidebarDrawer` wrapper (`src/components/mobile-sidebar-drawer.tsx`) applies `max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:transition-transform` with translate-X open/closed states; new `useMobileDrawer` hook (`src/hooks/use-mobile-drawer.ts`) manages open state with auto-close on route change and `md+` resize. PageHeader's ☰ button dispatches by viewport: drawer on mobile, rail/expand on desktop. Above `md`, the wrapper is invisible to layout (no positioning, no transforms) and the sidebar renders inline as a flex child.
**Rationale:** Cross-repo DS work would block this PR on a DS release cycle. The consumer-side wrapper is small enough to live in the dashboard without leaking concerns into the DS, and it can be promoted to a proper DS feature later. The `max-md:` Tailwind variant approach keeps the wrapper's positioning logic confined to mobile — no JS-driven conditional rendering, no double-mount of the sidebar tree. Drawer state is intentionally separate from `useSidebarCollapse` because the rail/expand semantic is desktop-only and persisting "drawer last-open" would be confusing across reloads. The audit also flagged a stale CLAUDE.md claim about drawer behavior, which is corrected as part of this PR.
**Alternatives considered:** Patch DS to add a `drawer?` prop — rejected for this PR (cross-repo, blocks on release) but flagged as a follow-up. Render two parallel sidebar trees (one mobile, one desktop) gated by responsive classes — rejected because it double-mounts the entire nav tree and creates split React state for collapse / accordion sections. Hide the sidebar entirely below `md` with no drawer (use ProductStrip tabs only) — rejected because the dashboard has 7 nav entries and operators need a navigation surface on mobile.
```

- [ ] **Step 4: Update `docs/BACKLOG.md`**

Append a Completed entry above the existing `2026-05-18 - DS dependency bump` row:

```
- ✅ 2026-05-18 - Mobile audit pass — restored off-canvas sidebar drawer below `md` (consumer-side wrapper around DS `AppShellSidebar`, see Decision #97); replaced the unreadable Credits flow SVG with a vertical `CreditFlowList` showing Storage and Execution distribution rows; wide tables (Wallet Nodes/VMs, Credit Recipients, Earnings per-VM) now render as stacked cards via the new `MobileTableCardRow` helper below `md`; the Earnings chart tooltip moves inline below the chart on mobile so touch users can read the highlighted bucket. Scope was the node-owner-on-mobile flow (Wallet / Node Earnings tab / Credits); other pages (Network graph, Issues, Health) keep their current responsive state. Out of scope: filter UI mobile adaptation (existing entry under Needs planning), ProductStrip overflow if visibly broken at 375px (DS-owned, log a DS issue).
```

If Task 12's smoke test surfaced a ProductStrip overflow issue, add a separate Needs-planning entry as well:

```
### 2026-05-18 - ProductStrip mobile overflow handling
**Source:** Identified during the mobile audit pass.
**Description:** At 375px width, the DS `ProductStrip` (4 product tabs + logomark + theme toggle, 54px height) overflows / clips. Likely needs a DS-side fix (horizontal scroll, collapse to a menu, or adjust spacing). File a DS issue and adopt the fix when available.
**Priority:** Low
```

- [ ] **Step 5: Update `src/changelog.ts`**

Bump `CURRENT_VERSION` from `"0.26.1"` to `"0.27.0"` and add a new version entry at the top of the `CHANGELOG` array:

```ts
export const CURRENT_VERSION = "0.27.0";

export const CHANGELOG: VersionEntry[] = [
  {
    version: "0.27.0",
    date: "2026-05-18",
    changes: [
      {
        type: "fix",
        text: "Sidebar is now an off-canvas drawer on phones — tap ☰ in the header to slide it in, tap the dimmed backdrop or pick a nav item to close. The drawer regressed during the May shell redesign; this restores it.",
      },
      {
        type: "ui",
        text: "Credits page: on phones, the flow diagram is replaced by a vertical breakdown of Storage and Execution flows (CCN / CRN / Stakers / Dev fund) so the percentages and ALEPH amounts are actually readable. Desktop keeps the SVG diagram.",
      },
      {
        type: "ui",
        text: "Wide tables on Wallet, Credits, and the Earnings tab now stack as cards on phones — each row becomes a card with the primary identifier on top and supporting fields below. Desktop keeps the full table.",
      },
      {
        type: "ui",
        text: "Earnings chart on phones now shows the bucket details inline below the chart instead of as a floating tooltip that could fall off the screen.",
      },
    ],
  },
  // ... existing 0.26.1 entry stays as-is, etc.
];
```

- [ ] **Step 6: Final check + commit**

```bash
pnpm check
```

Expected: PASS.

```bash
git add CLAUDE.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md src/changelog.ts
git commit -m "docs(mobile): update docs, log Decision #97, bump to 0.27.0"
```

Mark the plan complete: add a status frontmatter block to the top of this plan file:

```
---
status: done
branch: feature/mobile-audit
date: 2026-05-18
---
```

Commit:

```bash
git add docs/superpowers/plans/2026-05-18-mobile-audit.md
git commit -m "docs(plan): mark mobile-audit plan done"
```

---

## Self-review notes

- **Spec coverage:** all five spec findings have a task. #1 (drawer) → Tasks 1–3. #2 (flow list) → Tasks 4–5. #3 (tables → cards) → Tasks 6–10. #4 (chart tooltip) → Task 11. #5 (ProductStrip) → Task 12 step 3 (verify + log if broken). Verify + docs → Tasks 12–13.
- **Placeholder scan:** no "TODO", "TBD", "implement later", or "add appropriate error handling" markers. Every code step shows complete code.
- **Type / API consistency:** `useMobileDrawer` exposes `{ open, openDrawer, closeDrawer, toggle }` and that's the exact destructure used in Task 3. `MobileSidebarDrawer` props are `{ open, onClose, children }` and that's how Task 3 wires it. `MobileTableCardRow` props are `{ primary, fields, href? }` and that matches Tasks 7–10.
- **Out-of-order safety:** each task's "Files" header lists the exact paths; each code block is self-contained.
