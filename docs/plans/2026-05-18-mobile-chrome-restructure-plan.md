# Mobile Chrome Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On mobile (`< md`), collapse the chrome to a single right-anchored hamburger header, move per-page actions inline above page content, and replace the side drawer with a full-screen menu that drops from the top edge.

**Architecture:** Single feature branch, no DS changes. Replace `MobileSidebarDrawer` with a new `MobileMenu` component (drop-from-top, full-screen, with app-nav body + cross-product footer band). Rename `useMobileDrawer` → `useMobileMenu` and add Escape-key + body-scroll-lock side effects. `AppShell` orchestrates: hides `ProductStrip` below `md`, renders the hamburger on the right on mobile (left on desktop), and renders `MobileMenu` below `md`. Each page that registers header actions wraps the action JSX in `hidden md:inline-flex` (header slot stays empty on mobile) and renders the same JSX in an `md:hidden` row at the top of its body.

**Tech Stack:** React 19, TypeScript (strict + `exactOptionalPropertyTypes`), Tailwind CSS 4, `@aleph-front/ds` (no changes), React Query 5, Next.js 16 (static export), Vitest, Phosphor Icons.

**Spec:** [`docs/superpowers/specs/2026-05-18-mobile-chrome-restructure-design.md`](../superpowers/specs/2026-05-18-mobile-chrome-restructure-design.md)

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/hooks/use-mobile-menu.ts` | Mobile menu open/close state with route auto-close, md+ resize auto-close, Escape-key close, body scroll lock while open | Create (renamed from `use-mobile-drawer.ts`) |
| `src/hooks/use-mobile-menu.test.tsx` | Tests for the renamed hook | Create (renamed) |
| `src/hooks/use-mobile-drawer.ts` | — | Delete |
| `src/hooks/use-mobile-drawer.test.tsx` | — | Delete |
| `src/components/mobile-menu.tsx` | Full-screen drop-from-top menu: header (app name + ×), nav children slot, fixed footer band (product tabs + theme toggle + version link) | Create |
| `src/components/mobile-menu.test.tsx` | Tests: open/closed render, close-via-× , close-via-backdrop, footer content present | Create |
| `src/app/globals.css` | Add `mobile-menu-backdrop-in` and `mobile-menu-panel-in` keyframes (existing convention — all keyframes live here) | Modify |
| `src/components/mobile-sidebar-drawer.tsx` | — | Delete |
| `src/components/mobile-sidebar-drawer.test.tsx` | — | Delete |
| `src/components/app-shell.tsx` | Hide `ProductStrip` below `md`, render `MobileMenu` below `md`, position `SidebarToggle` right on mobile / left on desktop | Modify |
| `src/app/nodes/page.tsx` | Wrap Refresh action in `hidden md:inline-flex`; render same button in `md:hidden` inline row at top of body | Modify |
| `src/app/vms/page.tsx` | Same as above | Modify |
| `src/app/wallet/page.tsx` | Same as above | Modify |
| `src/app/status/page.tsx` | Same as above (Network Health) | Modify |
| `src/app/issues/page.tsx` | Same as above | Modify |
| `src/changelog.ts` | Bump `CURRENT_VERSION` 0.27.0 → 0.28.0 (minor); add VersionEntry | Modify |
| `docs/ARCHITECTURE.md` | Update mobile chrome section, swap "MobileSidebarDrawer" → "MobileMenu" | Modify |
| `docs/DECISIONS.md` | Decision #98 — mobile chrome restructure | Modify |
| `docs/BACKLOG.md` | Move this plan from Ready → Completed | Modify |
| `CLAUDE.md` | Update Current Features (responsive layout entry) | Modify |

---

## Task 1: Rename hook → `useMobileMenu`, tighten API, add Escape-key + body scroll lock

**Files:**
- Create: `src/hooks/use-mobile-menu.ts`
- Create: `src/hooks/use-mobile-menu.test.tsx`
- Delete (at end): `src/hooks/use-mobile-drawer.ts`, `src/hooks/use-mobile-drawer.test.tsx`

The old hook exposed `{ open, openDrawer, closeDrawer, toggle }`. `openDrawer` is unused. The new shape drops it and renames `closeDrawer` → `close`. Two new side effects: pressing `Escape` while open calls `close()`, and `document.body.style.overflow` is set to `hidden` while open (restored on close/unmount).

- [ ] **Step 1.1: Write the failing test file**

Create `src/hooks/use-mobile-menu.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useMobileMenu } from "./use-mobile-menu";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

import { usePathname } from "next/navigation";
const usePathnameMock = vi.mocked(usePathname);

describe("useMobileMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue("/");
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("starts closed", () => {
    const { result } = renderHook(() => useMobileMenu());
    expect(result.current.open).toBe(false);
  });

  it("toggle flips open state", () => {
    const { result } = renderHook(() => useMobileMenu());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });

  it("close sets open to false", () => {
    const { result } = renderHook(() => useMobileMenu());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });

  it("closes when pathname changes", () => {
    const { result, rerender } = renderHook(() => useMobileMenu());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    usePathnameMock.mockReturnValue("/nodes");
    rerender();
    expect(result.current.open).toBe(false);
  });

  it("Escape key closes the menu while open", () => {
    const { result } = renderHook(() => useMobileMenu());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.open).toBe(false);
  });

  it("Escape key is ignored while closed", () => {
    const { result } = renderHook(() => useMobileMenu());
    expect(result.current.open).toBe(false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.open).toBe(false);
  });

  it("locks body scroll while open", () => {
    const { result } = renderHook(() => useMobileMenu());
    expect(document.body.style.overflow).toBe("");
    act(() => result.current.toggle());
    expect(document.body.style.overflow).toBe("hidden");
    act(() => result.current.close());
    expect(document.body.style.overflow).toBe("");
  });

  it("restores body scroll on unmount", () => {
    const { result, unmount } = renderHook(() => useMobileMenu());
    act(() => result.current.toggle());
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
```

- [ ] **Step 1.2: Run tests, confirm they fail**

Run:
```bash
pnpm exec vitest run src/hooks/use-mobile-menu.test.tsx
```
Expected: FAIL — `Failed to resolve import "./use-mobile-menu"`.

- [ ] **Step 1.3: Implement the hook**

Create `src/hooks/use-mobile-menu.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const MD_BREAKPOINT = "(min-width: 768px)";

export function useMobileMenu(): {
  open: boolean;
  close: () => void;
  toggle: () => void;
} {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(MD_BREAKPOINT);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return { open, close, toggle };
}
```

- [ ] **Step 1.4: Run tests, confirm pass**

Run:
```bash
pnpm exec vitest run src/hooks/use-mobile-menu.test.tsx
```
Expected: PASS — 8 tests passing.

- [ ] **Step 1.5: Delete the old hook + test**

Run:
```bash
trash src/hooks/use-mobile-drawer.ts src/hooks/use-mobile-drawer.test.tsx
```

- [ ] **Step 1.6: Update `app-shell.tsx` consumer to the new hook API**

In `src/components/app-shell.tsx`:

Replace the import:
```ts
import { useMobileDrawer } from "@/hooks/use-mobile-drawer";
```
with:
```ts
import { useMobileMenu } from "@/hooks/use-mobile-menu";
```

Replace the destructure:
```ts
  const {
    open: drawerOpen,
    closeDrawer,
    toggle: toggleDrawer,
  } = useMobileDrawer();
```
with:
```ts
  const {
    open: menuOpen,
    close: closeMenu,
    toggle: toggleMenu,
  } = useMobileMenu();
```

Replace all in-file references:
- `drawerOpen` → `menuOpen`
- `closeDrawer` → `closeMenu`
- `toggleDrawer` → `toggleMenu`

`handleSidebarToggle` should still call `toggleMenu()` on the mobile branch.

- [ ] **Step 1.7: Verify the project still typechecks**

Run:
```bash
pnpm typecheck
```
Expected: PASS (no errors).

- [ ] **Step 1.8: Commit**

```bash
git add src/hooks/use-mobile-menu.ts src/hooks/use-mobile-menu.test.tsx \
        src/hooks/use-mobile-drawer.ts src/hooks/use-mobile-drawer.test.tsx \
        src/components/app-shell.tsx
git commit -m "refactor(mobile): rename useMobileDrawer to useMobileMenu + add Escape + scroll lock"
```

---

## Task 2: Create `MobileMenu` component (drop-from-top, full-screen)

**Files:**
- Create: `src/components/mobile-menu.tsx`
- Create: `src/components/mobile-menu.test.tsx`

The component receives `{ open, onClose, appName, children }`. It renders a backdrop + a full-screen panel. The panel has three regions:
- **Header**: `appName` (left) + `×` close button (right).
- **Body**: `children` slot, vertically scrollable.
- **Footer band**: product tabs (compact inline list, externals get an `↗`), theme toggle row + version link.

The component does not own `NAV_SECTIONS` or `APPS` data — `AppShell` passes nav children and the footer reads `APPS` + the active id directly (it's static config).

- [ ] **Step 2.1: Write the failing test file**

Create `src/components/mobile-menu.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileMenu } from "./mobile-menu";

describe("MobileMenu", () => {
  it("does not render the panel when closed", () => {
    render(
      <MobileMenu open={false} onClose={() => {}} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    expect(screen.queryByText("NAV")).not.toBeInTheDocument();
  });

  it("renders header, children, and footer when open", () => {
    render(
      <MobileMenu open={true} onClose={() => {}} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("NAV")).toBeInTheDocument();
    expect(screen.getByLabelText("Close menu")).toBeInTheDocument();
  });

  it("× button triggers onClose", () => {
    const onClose = vi.fn();
    render(
      <MobileMenu open={true} onClose={onClose} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    fireEvent.click(screen.getByLabelText("Close menu"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("backdrop click triggers onClose", () => {
    const onClose = vi.fn();
    render(
      <MobileMenu open={true} onClose={onClose} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    fireEvent.click(screen.getByLabelText("Close menu backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders all product tabs in the footer", () => {
    render(
      <MobileMenu open={true} onClose={() => {}} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    expect(screen.getByText("Cloud")).toBeInTheDocument();
    expect(screen.getAllByText("Network").length).toBeGreaterThan(0);
    expect(screen.getByText("Explorer")).toBeInTheDocument();
    expect(screen.getByText("Swap")).toBeInTheDocument();
  });

  it("renders the version link", () => {
    render(
      <MobileMenu open={true} onClose={() => {}} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.2: Run tests, confirm they fail**

Run:
```bash
pnpm exec vitest run src/components/mobile-menu.test.tsx
```
Expected: FAIL — `Failed to resolve import "./mobile-menu"`.

- [ ] **Step 2.3: Add keyframes to `src/app/globals.css`**

The project keeps all keyframes in `globals.css` (see `poll-ring`, `flow-draw`, `card-entrance`). Append to that file:

```css
@keyframes mobile-menu-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes mobile-menu-panel-in {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-menu-animated {
    animation: none !important;
  }
}
```

- [ ] **Step 2.4: Implement the component**

Create `src/components/mobile-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import { ThemeToggle } from "@/components/theme-toggle";
import { ACTIVE_APP_ID, APPS } from "@/config/apps";
import { CURRENT_VERSION } from "@/changelog";

type Props = {
  open: boolean;
  onClose: () => void;
  appName: string;
  children: ReactNode;
};

export function MobileMenu({ open, onClose, appName, children }: Props) {
  if (!open) return null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Close menu backdrop"
        onClick={onClose}
        className="mobile-menu-animated fixed inset-0 z-40 bg-black/40"
        style={{
          animation: "mobile-menu-backdrop-in var(--duration-default) ease-out",
        }}
      />
      <div
        className="mobile-menu-animated fixed inset-0 z-50 flex flex-col bg-background"
        style={{
          animation:
            "mobile-menu-panel-in var(--duration-default) ease-out forwards",
        }}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold">{appName}</div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            style={{ transitionDuration: "var(--duration-fast)" }}
          >
            <X className="size-5" />
          </button>
        </header>
        <nav className="flex-1 overflow-y-auto px-4 py-4">{children}</nav>
        <footer className="border-t border-border bg-muted/40 px-4 py-3 dark:bg-surface">
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {APPS.map((app) => {
              const isActive = app.id === ACTIVE_APP_ID;
              const className = isActive
                ? "font-semibold"
                : "text-muted-foreground";
              if (app.external) {
                return (
                  <a
                    key={app.id}
                    href={app.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={className}
                  >
                    {app.label} ↗
                  </a>
                );
              }
              return (
                <span key={app.id} className={className}>
                  {app.label}
                </span>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <Link
              href="/changelog"
              className="font-mono text-[11px] tabular-nums text-muted-foreground"
            >
              v{CURRENT_VERSION}
            </Link>
            <ThemeToggle />
          </div>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2.5: Run tests, confirm pass**

Run:
```bash
pnpm exec vitest run src/components/mobile-menu.test.tsx
```
Expected: PASS — 6 tests passing.

- [ ] **Step 2.6: Commit**

```bash
git add src/components/mobile-menu.tsx src/components/mobile-menu.test.tsx src/app/globals.css
git commit -m "feat(mobile): MobileMenu component — drop-from-top full-screen menu"
```

---

## Task 3: Wire `MobileMenu` into `AppShell`, hide `ProductStrip` below md, move hamburger to right on mobile

**Files:**
- Modify: `src/components/app-shell.tsx`
- Delete: `src/components/mobile-sidebar-drawer.tsx`, `src/components/mobile-sidebar-drawer.test.tsx`

`AppShell` today renders `ProductStrip` always, then wraps `AppShellSidebar` inside `MobileSidebarDrawer`. We swap to: `ProductStrip` wrapped in `hidden md:flex` (so it disappears below `md`), `AppShellSidebar` wrapped in `hidden md:flex` (desktop only), and a sibling `MobileMenu` that renders only below `md` with the same `NAV_SECTIONS` content. The `SidebarToggle` is rendered in two places — left (desktop) and right (mobile) — each gated by Tailwind responsive classes, since `PageHeader` exposes only a `leading` slot.

- [ ] **Step 3.1: Modify `app-shell.tsx` — replace drawer with menu and reposition toggle**

Replace the import:
```ts
import { MobileSidebarDrawer } from "@/components/mobile-sidebar-drawer";
```
with:
```ts
import { MobileMenu } from "@/components/mobile-menu";
```

Replace the body of the JSX `return` with the structure below. The full file should end up like this (keep the existing handlers, prefetch, `isActive`, and `SidebarToggle` definition):

```tsx
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ProductStrip
        apps={APPS}
        activeId={ACTIVE_APP_ID}
        logoHref="https://aleph.cloud"
        right={<ThemeToggle />}
        className="hidden border-b-0 md:flex"
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex">
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
            {renderNav()}
          </AppShellSidebar>
        </div>
        <MobileMenu open={menuOpen} onClose={closeMenu} appName="Network">
          {renderNav()}
        </MobileMenu>
        <div className="flex flex-1 flex-col overflow-hidden bg-muted/40 dark:bg-surface">
          <div className="main-glow relative flex flex-1 flex-col overflow-hidden rounded-tl-2xl bg-background">
            <PageHeader
              leading={
                <SidebarToggle
                  onClick={handleSidebarToggle}
                  className="hidden md:inline-flex"
                />
              }
              fallbackTitle={routeTitle(pathname)}
              className="bg-transparent [&_.truncate]:text-xs [&_.truncate]:text-muted-foreground"
            />
            <SidebarToggle
              onClick={handleSidebarToggle}
              className="fixed right-3 top-3 z-30 md:hidden"
            />
            <main
              ref={mainRef}
              className="relative flex-1 overflow-x-clip overflow-y-auto p-4 md:p-6"
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
```

Extract the accordion section loop into a helper inside the same file so `AppShellSidebar` and `MobileMenu` share it without duplication. Add this just above the `return` statement, after `const sidebarCollapsed = collapsed === true;`:

```tsx
  const renderNav = (): ReactNode =>
    NAV_SECTIONS.map((section) => (
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
    ));
```

Update `SidebarToggle` to accept a `className`:

```tsx
function SidebarToggle({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Toggle sidebar"
      className={`rounded p-1 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors ${className}`}
      style={{ transitionDuration: "var(--duration-fast)" }}
    >
      <svg
        className="size-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    </button>
  );
}
```

- [ ] **Step 3.2: Delete the old drawer files**

Run:
```bash
trash src/components/mobile-sidebar-drawer.tsx src/components/mobile-sidebar-drawer.test.tsx
```

- [ ] **Step 3.3: Run typecheck + tests**

Run:
```bash
pnpm typecheck
pnpm test
```
Expected: typecheck clean. Tests pass (`use-mobile-menu`, `mobile-menu`, existing suites). No references to `mobile-sidebar-drawer` or `use-mobile-drawer` left.

If `pnpm test` reports `mobile-sidebar-drawer.test.tsx not found` — ignore, that file is deleted.

- [ ] **Step 3.4: Commit**

```bash
git add src/components/app-shell.tsx \
        src/components/mobile-sidebar-drawer.tsx \
        src/components/mobile-sidebar-drawer.test.tsx
git commit -m "feat(mobile): wire MobileMenu into AppShell, hide ProductStrip + reposition hamburger below md"
```

---

## Task 4: Move per-page Refresh actions inline on mobile

**Files:**
- Modify: `src/app/nodes/page.tsx`
- Modify: `src/app/vms/page.tsx`
- Modify: `src/app/wallet/page.tsx`
- Modify: `src/app/status/page.tsx`
- Modify: `src/app/issues/page.tsx`

Each page registers its action with `usePageHeader({ actions: <Button .../> })`. On mobile we want the action OUT of the header (the right slot is contested by the hamburger) and INTO an inline row at the top of the page body. The cleanest non-DS path: extract the button JSX into a variable, wrap the header-registered copy in `hidden md:inline-flex`, and render the same node in an `md:hidden` row at the top of the page body.

The pattern below is identical for all five pages — only the button content differs slightly (Wallet adds an "Open in Explorer" link beside Refresh).

- [ ] **Step 4.1: `src/app/nodes/page.tsx` — extract Refresh JSX and render in both surfaces**

Find the `usePageHeader({ ... })` call. Above it, extract the action into a local:

```tsx
  const refreshButton = (
    <Button
      variant="text"
      size="xs"
      iconLeft={<ArrowClockwise />}
      onClick={() => { void refetch(); }}
      disabled={isFetching}
    >
      {isFetching ? "Refreshing…" : "Refresh"}
    </Button>
  );

  usePageHeader({
    title: total > 0 ? `Nodes · ${total} total` : "Nodes",
    actions: <span className="hidden md:inline-flex">{refreshButton}</span>,
  });
```

Then, at the very top of the page's returned JSX (above the existing first child), add the mobile-only inline row:

```tsx
      <div className="mb-3 flex justify-end md:hidden">{refreshButton}</div>
```

Place this as the first child inside the page's outer wrapper (typically the first `<div>` returned).

- [ ] **Step 4.2: `src/app/vms/page.tsx`**

Same shape as Nodes. The existing action is a single `<Button>` referencing `refetch` + `isFetching`. Extract:

```tsx
  const refreshButton = (
    <Button
      variant="text"
      size="xs"
      iconLeft={<ArrowClockwise />}
      onClick={() => { void refetch(); }}
      disabled={isFetching}
    >
      {isFetching ? "Refreshing…" : "Refresh"}
    </Button>
  );

  usePageHeader({
    title: total > 0 ? `VMs · ${total} total` : "VMs",
    actions: <span className="hidden md:inline-flex">{refreshButton}</span>,
  });
```

Add the inline row at the top of the returned JSX:

```tsx
      <div className="mb-3 flex justify-end md:hidden">{refreshButton}</div>
```

- [ ] **Step 4.3: `src/app/wallet/page.tsx`**

Wallet's action is a fragment with `Refresh` + an `Open in Explorer →` link. Capture the existing JSX (Refresh button + explorer link) into a single variable, then reuse it in both surfaces:

```tsx
  const headerActions = (
    <>
      <Button
        variant="text"
        size="xs"
        iconLeft={<ArrowClockwise />}
        onClick={refetchAll}
        disabled={isFetching}
      >
        {isFetching ? "Refreshing…" : "Refresh"}
      </Button>
      {/* preserve the existing "Open in Explorer →" anchor exactly as it appears today */}
      {explorerLink}
    </>
  );

  usePageHeader({
    title: headerTitle,
    actions: (
      <span className="hidden items-center gap-2 md:inline-flex">
        {headerActions}
      </span>
    ),
  });
```

Inline row:

```tsx
      <div className="mb-3 flex items-center justify-end gap-2 md:hidden">
        {headerActions}
      </div>
```

If the explorer link in the existing file isn't already in a variable, extract it the same way as `refreshButton` so it can be reused.

- [ ] **Step 4.4: `src/app/status/page.tsx`**

This page uses "Recheck" (not "Refresh") and a different handler:

```tsx
  const recheckButton = (
    <Button
      variant="text"
      size="xs"
      iconLeft={<ArrowClockwise />}
      onClick={runChecks}
      disabled={checking}
    >
      {checking ? "Checking…" : "Recheck"}
    </Button>
  );

  usePageHeader({
    title: "Network Health",
    actions: <span className="hidden md:inline-flex">{recheckButton}</span>,
  });
```

Inline row:

```tsx
      <div className="mb-3 flex justify-end md:hidden">{recheckButton}</div>
```

- [ ] **Step 4.5: `src/app/issues/page.tsx`**

Same shape as Nodes/VMs:

```tsx
  const refreshButton = (
    <Button
      variant="text"
      size="xs"
      iconLeft={<ArrowClockwise />}
      onClick={() => { void refetch(); }}
      disabled={isFetching}
    >
      {isFetching ? "Refreshing…" : "Refresh"}
    </Button>
  );

  usePageHeader({
    title: "Issues",
    actions: <span className="hidden md:inline-flex">{refreshButton}</span>,
  });
```

Inline row:

```tsx
      <div className="mb-3 flex justify-end md:hidden">{refreshButton}</div>
```

- [ ] **Step 4.6: Run typecheck + tests**

Run:
```bash
pnpm typecheck
pnpm test
```
Expected: PASS.

- [ ] **Step 4.7: Commit**

```bash
git add src/app/nodes/page.tsx src/app/vms/page.tsx src/app/wallet/page.tsx \
        src/app/status/page.tsx src/app/issues/page.tsx
git commit -m "feat(mobile): move per-page Refresh actions inline at top of content"
```

---

## Task 5: Verify and refine

- [ ] **Step 5.1: Run full project checks**

Run:
```bash
pnpm check
```
Expected: lint + typecheck + tests all green. Fix anything that surfaces.

- [ ] **Step 5.2: Manual smoke — closed-state chrome**

Start the dev server:
```bash
pnpm dev
```
Open `http://localhost:3000`. Resize the window to <768px (or use Chrome devtools mobile viewport, e.g. iPhone SE 375×667).
Verify:
- No `ProductStrip` visible at the top.
- `PageHeader` is a single row; title left, hamburger top-right.
- On pages with Refresh (`/nodes`, `/vms`, `/wallet`, `/status`, `/issues`) — Refresh button appears as a right-aligned row above the page content, not in the header.

- [ ] **Step 5.3: Manual smoke — menu open/close behavior**

Still on mobile viewport:
- Tap the hamburger. Menu drops down from the top, covers the whole viewport.
- Confirm header shows app name "Network" + × button.
- Tap a nav item — menu closes and route changes.
- Tap hamburger again → tap backdrop (any area outside the menu panel? — since it's full-screen, backdrop is hidden behind the panel; this is expected). Verify × button closes.
- Press `Escape` (laptop keyboard while in mobile viewport) → menu closes.
- Tap hamburger → confirm body scroll is locked (try to scroll the page underneath; it should not move). Close → scrolling restored.

- [ ] **Step 5.4: Manual smoke — desktop chrome unchanged**

Resize to ≥768px:
- `ProductStrip` visible at top.
- `AppShellSidebar` visible on the left (rail collapse still works).
- `PageHeader` hamburger is on the left (rail toggle).
- Refresh appears in the right slot of `PageHeader`, NOT inline above content.

- [ ] **Step 5.5: Manual smoke — reduced-motion**

Toggle "Reduce motion" in System Preferences (macOS) or set `prefers-reduced-motion: reduce` via devtools rendering. Reopen the menu — animation should be skipped (no slide-down). Backdrop fade and panel position should snap immediately.

- [ ] **Step 5.6: Fix any issues found**

If anything fails, fix and re-run `pnpm check` until clean.

- [ ] **Step 5.7: Commit any fixes**

```bash
git add <files>
git commit -m "fix(mobile): <description>"
```

---

## Task 6: Update docs and version

- [ ] **Step 6.1: Update `CLAUDE.md` — Current Features**

Find the "Responsive layout" entry under `## Current Features`. Replace the mobile chrome description so it reads:

> Responsive layout: full-screen drop-down menu below `md` (via `MobileMenu` rendering `NAV_SECTIONS` + cross-product footer band; menu state from `useMobileMenu` in `src/hooks/use-mobile-menu.ts`, auto-closes on route change, `md+` resize, and `Escape`; body scroll locked while open); inline expanded ↔ icon-rail sidebar above `md` (via DS `useSidebarCollapse`). On mobile, the hamburger sits in the top-right and morphs into ×; `ProductStrip` is hidden and lives inside the menu footer. Per-page actions (Refresh on Nodes/VMs/Wallet/Network Health/Issues) move from `PageHeader` to an inline `md:hidden` row above page content. Detail panels as slide-in overlays on mobile, inline on desktop; adaptive column hiding when detail panel is open. Wide tables (Wallet Nodes/VMs, Credit Recipients, Earnings per-VM) render as stacked cards via `MobileTableCardRow` below `md`. Credits flow diagram swaps to `CreditFlowList` below `md`. NodeEarningsChart tooltip is inline-below-chart on mobile, floating side-anchored on desktop.

- [ ] **Step 6.2: Update `docs/ARCHITECTURE.md` — Mobile chrome**

Find the section that describes the mobile sidebar drawer. Replace references to `MobileSidebarDrawer` / `useMobileDrawer` with `MobileMenu` / `useMobileMenu`, and add a short description of the drop-from-top + full-screen + cross-product footer band structure. Note that `AppShell` uses `hidden md:flex` to gate `ProductStrip` and the desktop sidebar, and renders the hamburger twice (left for desktop, right for mobile).

- [ ] **Step 6.3: Update `docs/DECISIONS.md` — Decision #98**

Append:

```markdown
## Decision #98 - 2026-05-18
**Context:** Mobile audit (PR through 2026-05-17) made every page survive below `md` but kept the desktop chrome stack intact: `ProductStrip` (54px) + `PageHeader` (~48px) + left-sliding `MobileSidebarDrawer`. ~100px of chrome above the fold on phones, with the lowest-priority navigation (cross-product tabs) taking the most space.
**Decision:** Single-row mobile header (title left, hamburger right). `ProductStrip` is hidden below `md` and relocates into the footer band of a new `MobileMenu`, which is full-screen and drops down from the top edge. Per-page Refresh actions move inline above page content on mobile.
**Rationale:** Mobile operators are checking the current network, not jumping across Aleph apps. Cross-product nav and theme toggle remain reachable inside the menu without consuming above-the-fold space. Page actions still surface (now adjacent to the content they affect) instead of contesting the right slot with the hamburger.
**Alternatives considered:** (a) Keep `ProductStrip` always visible and only flip the hamburger to the right — preserves cross-product anchor but doesn't reclaim vertical space. (b) Add a `usePageHeader({ inlineOnMobile })` flag in the DS — over-engineered for five pages with one action each. (c) Reuse `AppShellSidebar` inside a top-drop wrapper — its rail-collapse logic and single `footer` slot don't fit the menu's richer footer band.
```

- [ ] **Step 6.4: Update `docs/BACKLOG.md`**

If `Mobile chrome restructure` (or equivalent) was in Ready/Needs planning, move it to Completed:
```markdown
- 2026-05-18 — Mobile chrome restructure (PR #N). Single-row header, full-screen drop menu, inline page actions below `md`.
```

If it wasn't in the backlog, just add the Completed line.

- [ ] **Step 6.5: Update `src/changelog.ts` — bump version + add entry**

Bump:
```ts
export const CURRENT_VERSION = "0.28.0";
```

Add the new VersionEntry at the top of the array:
```ts
  {
    version: "0.28.0",
    date: "2026-05-18",
    changes: [
      { kind: "ui", text: "Mobile: full-screen drop-down menu replaces the side drawer; hamburger moves to the top-right; ProductStrip lives inside the menu footer." },
      { kind: "ui", text: "Mobile: per-page Refresh actions move inline above page content on Nodes, VMs, Wallet, Network Health, and Issues." },
      { kind: "feature", text: "Menu close behaviors: × button, backdrop, route change, Escape key, md+ resize. Body scroll is locked while the menu is open." },
    ],
  },
```

Confirm the exact field names by looking at adjacent entries in `src/changelog.ts` — match them.

- [ ] **Step 6.6: Run `pnpm check` one more time**

Run:
```bash
pnpm check
```
Expected: clean.

- [ ] **Step 6.7: Commit docs and version**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md src/changelog.ts
git commit -m "docs(mobile): document chrome restructure, log Decision #98, bump to 0.28.0"
```

---

## Done

Branch is ready for the preview/ship sequence. Per CLAUDE.md, use `/dio:ship` to run the catch-up + doc audit + `pnpm check` + preview gate + push + PR + squash-merge end-to-end.
