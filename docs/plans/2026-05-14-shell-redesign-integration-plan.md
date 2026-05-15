---
status: in-progress
branch: feature/shell-chrome-overhaul
date: 2026-05-15
note: PR 1 Tasks 2-7 committed (DS bump, routeTitle, configs, NavIcon, AppMark). Paused on Task 8 — DS NavItem renders bare `<a>` with no Next Link or prefetch support, so sidebar clicks become full page reloads. User opted to patch DS NavItem first (add a Link-slot / asChild prop) and re-publish before resuming Task 8. DS repo (~/repos/aleph-cloud-ds) has unrelated WIP that the user is cleaning up before the patch can land. Also: spec said `LogoMark` (Task 7); the actual DS export is `Logo` — fixed inline.
---

# Shell Redesign Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the new Aleph Cloud shell primitives (`ProductStrip`, `AppShellSidebar`, `PageHeader` from `@aleph-front/ds`) into the scheduler dashboard. Two PRs: PR 1 replaces the existing chrome (top strip, sidebar with collapse + accordion, page header slot); PR 2 wires each page's `usePageHeader` call and adds Refresh actions.

**Architecture:** PR 1 is a self-contained chrome swap — `AppShell` recomposes around the DS primitives, theme toggle migrates from `AppHeader` to ProductStrip's right slot, the bottom "More" popover (`UtilityMenu`) is deleted, and Issues / Network Health move to top-level sidebar sections. PageHeader is wired with a `fallbackTitle` derived via a new `routeTitle()` helper, so pages don't need to call `usePageHeader` until PR 2. PR 2 then adds per-page hook calls and Refresh wiring on table-heavy pages.

**Tech Stack:** React 19, TypeScript (strict + `exactOptionalPropertyTypes`), Tailwind CSS 4, `@aleph-front/ds`, React Query 5, Next.js 16 (static export), Phosphor Icons.

**Spec:** [`docs/superpowers/specs/2026-05-14-aleph-cloud-shell-redesign-design.md`](../superpowers/specs/2026-05-14-aleph-cloud-shell-redesign-design.md)

**Dependencies:** Requires `@aleph-front/ds` published with `ProductStrip`, `AppShellSidebar` (+ hooks), and `PageHeader`. See companion plan in the DS repo: `../aleph-cloud-ds/docs/plans/2026-05-14-aleph-cloud-shell-primitives-plan.md`. **Do not start Task 2 of this plan until that DS plan is `status: done` and a `@aleph-front/ds` version including all three primitives has been published.**

---

## File Structure

### PR 1 — Chrome overhaul

| File | Responsibility | Action |
|------|----------------|--------|
| `package.json` | Bump `@aleph-front/ds` to the version including all three primitives | Modify |
| `src/config/apps.ts` | The four-app list for `ProductStrip` | Create |
| `src/config/nav.ts` | The four sidebar sections + items | Create |
| `src/components/app-mark.tsx` | Inline app identity mark for sidebar top (logomark + "Network") | Create |
| `src/components/nav-icon.tsx` | Icon switcher mapping `IconName` → SVG (lifted out of old app-sidebar.tsx so it can be reused) | Create |
| `src/lib/route-title.ts` | `routeTitle(pathname)` helper for `PageHeader` fallback | Create |
| `src/components/app-shell.tsx` | Rewritten to compose DS primitives | Modify |
| `src/components/app-sidebar.tsx` | Replaced — old monolith deleted, replaced by AppShell composition | Delete |
| `src/components/app-header.tsx` | Replaced — old wrapper deleted, PageHeader is the new chrome row | Delete |
| `src/app/providers.tsx` | Wrap with `PageHeaderProvider` | Modify |
| `src/changelog.ts` | Add VersionEntry, bump CURRENT_VERSION (minor) | Modify |
| `docs/ARCHITECTURE.md` | New shell structure section | Modify |
| `docs/DECISIONS.md` | Decision entry for the shell redesign | Modify |
| `docs/BACKLOG.md` | Move "Sidebar component in DS" roadmap entry → Completed | Modify |
| `CLAUDE.md` | Current Features list updates | Modify |

### PR 2 — Page action tier

| File | Responsibility | Action |
|------|----------------|--------|
| `package.json` | (No bump needed — same DS version covers PageHeader hook) | — |
| `src/app/page.tsx` | Add `usePageHeader({ title: "Overview" })` | Modify |
| `src/app/nodes/page.tsx` | Add `usePageHeader` with data-aware title + Refresh action | Modify |
| `src/app/vms/page.tsx` | Same | Modify |
| `src/app/credits/page.tsx` | Add `usePageHeader({ title: "Credit Expenses" })` | Modify |
| `src/app/network/page.tsx` | Add `usePageHeader({ title: "Network Graph" })` | Modify |
| `src/app/status/page.tsx` | Add `usePageHeader` with Refresh action; remove body-level Refresh button | Modify |
| `src/app/issues/page.tsx` | Add `usePageHeader` with Refresh action | Modify |
| `src/app/wallet/page.tsx` | Add `usePageHeader` with address title + Refresh + "Open in Explorer →" | Modify |
| `src/app/changelog/page.tsx` | Add `usePageHeader({ title: "Changelog" })` | Modify |
| `src/changelog.ts` | Patch bump, VersionEntry for page actions | Modify |
| `CLAUDE.md` | Refresh actions per-page | Modify |

---

# PR 1 — Chrome overhaul

## Task 1: Wait for DS dependency

**Files:** N/A — gate.

- [ ] **Step 1: Confirm DS plan is `status: done`**

Open `../aleph-cloud-ds/docs/plans/2026-05-14-aleph-cloud-shell-primitives-plan.md` and confirm its frontmatter shows `status: done`.

- [ ] **Step 2: Confirm DS version published**

Run: `npm view @aleph-front/ds versions --json | tail -5`
Expected: A new version that bundles all three primitives (the highest version after the three DS PRs landed). Note that version — call it `DS_VERSION`.

- [ ] **Step 3: Confirm subpaths exist**

Run: `npm view @aleph-front/ds@latest exports`
Expected: Output includes `./product-strip`, `./app-shell-sidebar`, `./use-sidebar-collapse`, `./use-accordion-state`, `./page-header`.

If any of these are missing, **stop**. The DS work is incomplete.

## Task 2: Create feature branch

- [ ] **Step 1: Sync main**

```
git fetch origin main
git checkout main
git pull --ff-only origin main
```

- [ ] **Step 2: Create branch**

```
git checkout -b feature/shell-chrome-overhaul
```

## Task 3: Bump @aleph-front/ds

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump to DS_VERSION**

In `package.json`, locate `"@aleph-front/ds": "<old>"` under `dependencies` and replace `<old>` with `DS_VERSION` (note `from Task 1`).

- [ ] **Step 2: Reinstall**

Run: `pnpm install`
Expected: lockfile updates without errors.

- [ ] **Step 3: Verify subpath imports resolve**

Create a one-off scratch file `scratch.ts` (don't commit):

```ts
import { ProductStrip } from "@aleph-front/ds/product-strip";
import { AppShellSidebar, AccordionSection, NavItem } from "@aleph-front/ds/app-shell-sidebar";
import { useSidebarCollapse } from "@aleph-front/ds/use-sidebar-collapse";
import { useAccordionState } from "@aleph-front/ds/use-accordion-state";
import { PageHeader, PageHeaderProvider, usePageHeader } from "@aleph-front/ds/page-header";

console.log(ProductStrip, AppShellSidebar, AccordionSection, NavItem, useSidebarCollapse, useAccordionState, PageHeader, PageHeaderProvider, usePageHeader);
```

Run: `pnpm typecheck`
Expected: PASS (no missing modules).

Delete `scratch.ts` after verifying.

- [ ] **Step 4: Commit**

```
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): bump @aleph-front/ds for shell primitives"
```

## Task 4: Create `routeTitle` helper

**Files:**
- Create: `src/lib/route-title.ts`
- Create: `src/lib/route-title.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/route-title.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { routeTitle } from "./route-title";

describe("routeTitle", () => {
  it.each([
    ["/", "Overview"],
    ["/nodes", "Nodes"],
    ["/vms", "VMs"],
    ["/credits", "Credit Expenses"],
    ["/network", "Network Graph"],
    ["/status", "Network Health"],
    ["/issues", "Issues"],
    ["/wallet", "Wallet"],
    ["/changelog", "Changelog"],
  ])("returns the right title for %s", (path, expected) => {
    expect(routeTitle(path)).toBe(expected);
  });

  it("humanises unknown routes via leading segment", () => {
    expect(routeTitle("/unknown")).toBe("Unknown");
  });

  it("returns 'Overview' for unknown empty/null inputs", () => {
    expect(routeTitle("")).toBe("Overview");
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test -- route-title`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/route-title.ts`:

```ts
const TITLES: Record<string, string> = {
  "/": "Overview",
  "/nodes": "Nodes",
  "/vms": "VMs",
  "/credits": "Credit Expenses",
  "/network": "Network Graph",
  "/status": "Network Health",
  "/issues": "Issues",
  "/wallet": "Wallet",
  "/changelog": "Changelog",
};

export function routeTitle(pathname: string): string {
  if (!pathname) return "Overview";
  const exact = TITLES[pathname];
  if (exact) return exact;
  const segment = pathname.split("/").filter(Boolean)[0] ?? "";
  if (!segment) return "Overview";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}
```

- [ ] **Step 4: Verify test passes**

Run: `pnpm test -- route-title`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/route-title.ts src/lib/route-title.test.ts
git commit -m "feat(shell): add routeTitle helper for PageHeader fallback"
```

## Task 5: Create config files (`apps.ts`, `nav.ts`)

**Files:**
- Create: `src/config/apps.ts`
- Create: `src/config/nav.ts`

- [ ] **Step 1: Create apps config**

Create `src/config/apps.ts`:

```ts
import type { ProductApp } from "@aleph-front/ds/product-strip";

export const APPS: ProductApp[] = [
  { id: "cloud",    label: "Cloud",    href: "https://app.aleph.cloud" },
  { id: "network",  label: "Network",  href: "https://network.aleph.cloud" },
  { id: "explorer", label: "Explorer", href: "https://explorer.aleph.cloud" },
  { id: "swap",     label: "Swap",     href: "https://swap.aleph.cloud" },
];

export const ACTIVE_APP_ID = "network";
```

- [ ] **Step 2: Create nav config**

Create `src/config/nav.ts`:

```ts
export type NavIconName =
  | "grid"
  | "server"
  | "cpu"
  | "coins"
  | "network"
  | "signal"
  | "warning";

export type NavItemConfig = {
  label: string;
  href: string;
  icon: NavIconName;
};

export type NavSectionConfig = {
  id: string;
  title: string;
  items: NavItemConfig[];
};

export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    items: [{ label: "Overview", href: "/", icon: "grid" }],
  },
  {
    id: "resources",
    title: "Resources",
    items: [
      { label: "Nodes",   href: "/nodes",   icon: "server" },
      { label: "VMs",     href: "/vms",     icon: "cpu" },
      { label: "Credits", href: "/credits", icon: "coins" },
    ],
  },
  {
    id: "network",
    title: "Network",
    items: [
      { label: "Graph",  href: "/network", icon: "network" },
      { label: "Health", href: "/status",  icon: "signal" },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    items: [{ label: "Issues", href: "/issues", icon: "warning" }],
  },
];
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add src/config
git commit -m "feat(shell): add APPS and NAV_SECTIONS config"
```

## Task 6: Extract `NavIcon` component

The old `app-sidebar.tsx` has a `NavIcon` switch component for the inline SVGs. We're deleting `app-sidebar.tsx`, so lift `NavIcon` out into its own file first so the new shell can consume it.

**Files:**
- Create: `src/components/nav-icon.tsx`

- [ ] **Step 1: Move NavIcon**

Create `src/components/nav-icon.tsx`. Copy the `NavIcon` component (the switch over `name` rendering the 7 SVGs: grid, server, cpu, warning, coins, network — plus add `signal`) from the old `src/components/app-sidebar.tsx`. Update the `IconName` type to import from `@/config/nav`:

```tsx
"use client";

import type { NavIconName } from "@/config/nav";

export function NavIcon({ name }: { name: NavIconName }) {
  switch (name) {
    case "grid":
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
    case "server":
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      );
    case "cpu":
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      );
    case "coins":
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 6c0 1.657-3.582 3-8 3S4 7.657 4 6m16 0c0-1.657-3.582-3-8-3S4 4.343 4 6m16 0v4c0 1.657-3.582 3-8 3S4 11.657 4 10V6m16 8c0 1.657-3.582 3-8 3s-8-1.343-8-3m16-4v8c0 1.657-3.582 3-8 3s-8-1.343-8-3v-8" />
        </svg>
      );
    case "network":
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="3" />
          <circle cx="5" cy="5" r="2" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="19" r="2" />
          <circle cx="19" cy="19" r="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9.5L6.5 6.5M14.5 9.5L17.5 6.5M9.5 14.5L6.5 17.5M14.5 14.5L17.5 17.5" />
        </svg>
      );
    case "signal":
      // Network Health — concentric arcs
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      );
    case "warning":
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      );
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add src/components/nav-icon.tsx
git commit -m "feat(shell): extract NavIcon into its own file"
```

## Task 7: Create `AppMark` component

**Files:**
- Create: `src/components/app-mark.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/app-mark.tsx`:

```tsx
"use client";

import { LogoMark } from "@aleph-front/ds/logo";

export function AppMark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <LogoMark className="h-4 text-foreground shrink-0" />
      {!collapsed && (
        <span className="font-semibold text-sm text-foreground tracking-tight">
          Network
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add src/components/app-mark.tsx
git commit -m "feat(shell): add AppMark component"
```

## Task 8: Rewrite `AppShell`

**Files:**
- Modify: `src/components/app-shell.tsx`

This is the heart of PR 1. Replace the entire file contents.

- [ ] **Step 1: Replace the file**

Overwrite `src/components/app-shell.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ProductStrip } from "@aleph-front/ds/product-strip";
import {
  AccordionSection,
  AppShellSidebar,
  NavItem,
} from "@aleph-front/ds/app-shell-sidebar";
import { useSidebarCollapse } from "@aleph-front/ds/use-sidebar-collapse";
import { PageHeader } from "@aleph-front/ds/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppMark } from "@/components/app-mark";
import { NavIcon } from "@/components/nav-icon";
import { ACTIVE_APP_ID, APPS } from "@/config/apps";
import { NAV_SECTIONS } from "@/config/nav";
import { routeTitle } from "@/lib/route-title";
import { CURRENT_VERSION } from "@/changelog";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const { collapsed, toggle } = useSidebarCollapse();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  const isActive = useCallback(
    (href: string): boolean => {
      if (href === "/") return pathname === "/";
      return pathname.startsWith(href);
    },
    [pathname],
  );

  const sidebarCollapsed = collapsed === true;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ProductStrip
        apps={APPS}
        activeId={ACTIVE_APP_ID}
        logoHref="https://aleph.cloud"
        right={<ThemeToggle />}
      />
      <div className="flex flex-1 overflow-hidden">
        <AppShellSidebar
          appMark={<AppMark collapsed={sidebarCollapsed} />}
          collapsed={collapsed}
          onToggle={toggle}
        >
          {NAV_SECTIONS.map((section) => (
            <AccordionSection
              key={section.id}
              title={section.title}
              sectionId={section.id}
            >
              {section.items.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={<NavIcon name={item.icon} />}
                  active={isActive(item.href)}
                >
                  {item.label}
                </NavItem>
              ))}
            </AccordionSection>
          ))}
          <SidebarFooter />
        </AppShellSidebar>
        <div className="flex flex-1 flex-col overflow-hidden bg-muted/40 dark:bg-surface">
          <PageHeader
            leading={<SidebarToggle onClick={toggle} />}
            fallbackTitle={routeTitle(pathname)}
          />
          <main
            ref={mainRef}
            className="main-glow relative flex-1 overflow-x-clip overflow-y-auto rounded-tl-2xl bg-background p-4 md:p-6"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Toggle sidebar"
      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
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

function SidebarFooter() {
  return (
    <div className="mt-auto pt-4 pl-2 rail-hide">
      <Link
        href="/changelog"
        className="text-[11px] tabular-nums text-muted-foreground/40 transition-colors hover:text-muted-foreground"
        style={{ transitionDuration: "var(--duration-fast)" }}
      >
        v{CURRENT_VERSION}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add src/components/app-shell.tsx
git commit -m "feat(shell): rewrite AppShell around DS primitives"
```

## Task 9: Wrap providers with `PageHeaderProvider`

**Files:**
- Modify: `src/app/providers.tsx`

- [ ] **Step 1: Read the current file**

Read `src/app/providers.tsx` to identify the inner-most child of the existing providers (likely something like `<ThemeProvider>...</ThemeProvider>`).

- [ ] **Step 2: Add the wrapping**

Add the `PageHeaderProvider` import and wrap the existing children. Example diff (adapt to actual current structure):

```tsx
// Add import:
import { PageHeaderProvider } from "@aleph-front/ds/page-header";

// Inside the providers tree, wrap the deepest children:
<PageHeaderProvider>
  {children}
</PageHeaderProvider>
```

Place the wrap *inside* the React Query and theme providers but *outside* any layout components — the chrome (AppShell) and the pages both need to be descendants.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add src/app/providers.tsx
git commit -m "feat(shell): wrap app with PageHeaderProvider"
```

## Task 10: Delete old chrome files

**Files:**
- Delete: `src/components/app-sidebar.tsx`
- Delete: `src/components/app-header.tsx`

- [ ] **Step 1: Confirm no other consumers**

Run: `rg -l 'app-sidebar|app-header|AppSidebar|AppHeader' src/`
Expected: Only `src/components/app-shell.tsx` references them — and the new AppShell shouldn't reference either. If you see other references, **stop** and resolve them first (likely a missed import).

- [ ] **Step 2: Delete the files**

```
git rm src/components/app-sidebar.tsx src/components/app-header.tsx
```

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```
git commit -m "chore(shell): delete legacy AppSidebar and AppHeader"
```

## Task 11: Smoke test all routes

- [ ] **Step 1: Run dev server**

Run: `pnpm dev`

- [ ] **Step 2: Walk through each route** at three viewport widths (sm < 640px, md ~ 768px, lg ~ 1280px). For each, verify:

  - `/` — Overview renders, title "Overview" visible in chrome row, no console errors.
  - `/nodes` — Title "Nodes" visible. Filter pills + advanced filters still in body.
  - `/vms` — Same.
  - `/credits` — Title "Credit Expenses". Range tabs still in body.
  - `/network` — Title "Network Graph". Full-bleed graph still works inside the recessed panel.
  - `/status` — Title "Network Health". Body still has the Refresh button (removed in PR 2).
  - `/issues` — Title "Issues".
  - `/wallet?address=0xtest` — Title "Wallet".
  - `/changelog` — Title "Changelog".

  Then test cross-cutting behaviour:
  - ProductStrip: clicking a non-active tab opens that subdomain in the same tab (use middle-click to test without leaving).
  - Sidebar collapse: click ☰ → sidebar narrows to ~52px icon rail; click ☰ again → restores. Reload: state persists.
  - Section accordion: click "Resources" section title → items hide; reload → state persists per-section. Toggling the sidebar to rail and back preserves accordion state.
  - Theme toggle in ProductStrip: light/dark switches correctly.
  - At sm viewport: sidebar is off-canvas (drawer). ☰ opens drawer; backdrop click closes.

- [ ] **Step 3: Fix any issues found**

Common issues to watch for:
- Theme toggle wasn't carried over to ProductStrip — re-check Task 8.
- `rail-hide` class missing → labels still visible in rail mode → confirm the DS package version includes the CSS rule.
- `usePathname` returning unexpected values → verify Next.js routing is unaffected.

- [ ] **Step 4: Commit any fixes**

If fixes are needed, commit them as `fix(shell): <description>`.

## Task 12: Verify and refine

- [ ] **Step 1: Run full project checks**

Run: `pnpm check`
Expected: PASS (lint + typecheck + test).

- [ ] **Step 2: Fix any failures**

Re-run until clean.

## Task 13: Update docs and version

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/BACKLOG.md`
- Modify: `CLAUDE.md`
- Modify: `src/changelog.ts`

- [ ] **Step 1: Update ARCHITECTURE.md**

Add a section under "App shell" (or create one) describing the new structure:
- `AppShell` composes `ProductStrip` (top) + `AppShellSidebar` (left) + `PageHeader` (per-page chrome row).
- Configs live in `src/config/apps.ts` and `src/config/nav.ts`.
- `routeTitle()` in `src/lib/route-title.ts` provides PageHeader fallback titles.
- `AppMark` in `src/components/app-mark.tsx` renders the per-app identity.
- Sidebar collapse and accordion state persist in localStorage (handled by DS hooks).

- [ ] **Step 2: Update DECISIONS.md**

Add a new entry (next number in sequence):

```
## Decision #N - 2026-05-14
**Context:** The dashboard's chrome (fixed-width sidebar + thin header + "More" popover) didn't support cross-app navigation, sidebar collapse, accordion sections, or page-level actions. With Aleph evolving into a multi-app product family (Cloud / Network / Explorer / Swap), the dashboard needs to feel like part of that family.
**Decision:** Adopt the new shared shell primitives from `@aleph-front/ds` — `ProductStrip` (shared top bar), `AppShellSidebar` with collapse + accordion, `PageHeader` slot with `usePageHeader` hook. Replaces the existing AppSidebar / AppHeader / UtilityMenu in one chrome-overhaul PR; per-page Refresh actions land in a follow-up PR. Sidebar gets four real sections (Dashboard / Resources / Network / Operations) — the "More" popover is gone.
**Rationale:** Cross-app navigation is the anchor driver — without it, the dashboard can't communicate that it's part of the Aleph product surface. Building primitives in DS means app.aleph.cloud and others can adopt the same chrome later. Splitting into two PRs (chrome vs page actions) keeps each PR's blast radius bounded — PR 1 is a pure shell swap, PR 2 is per-page wiring.
**Alternatives considered:** Apps-grid icon top-right (Google-apps style, rejected during brainstorm — doesn't express the family identity strongly enough); workspace switcher top-left (rejected — workspace model implies one product, but Aleph is a family of separate products); single bundled PR (rejected — too many surfaces touching at once); build in-app first then promote to DS (rejected — the user explicitly chose DS-first because the suite chrome is cross-app glue).
```

- [ ] **Step 3: Update BACKLOG.md**

Move the existing roadmap entry "2026-03-01 - Sidebar component in DS" from the **Roadmap ideations** section to the **Completed** section with the date `2026-05-14`. Reword as:
```
- ✅ 2026-05-14 - Sidebar promoted to DS as `AppShellSidebar` (+ `AccordionSection`, `NavItem`, `useSidebarCollapse`, `useAccordionState`), alongside `ProductStrip` and `PageHeader`. Closed via the shell redesign (Decision #N).
```

- [ ] **Step 4: Update CLAUDE.md**

In the "Current Features" list, replace the entries about the old sidebar/header chrome with new entries. Specifically:

- Find and remove the entry starting with "App shell with borderless sidebar and header…".
- Find and remove any mention of the "More" popover, `UtilityMenu`, or the bottom-of-sidebar Issues + Network Health popover.
- Add these new entries near the top of the list:

```
- Shared product strip (`ProductStrip` from `@aleph-front/ds`) listing the Aleph apps as tabs (Cloud · Network · Explorer · Swap). Logomark on the left links to https://aleph.cloud; theme toggle on the right. Active app = "network".
- Collapsible sidebar (`AppShellSidebar`) with expanded (232px) ↔ icon-rail (52px) mode, toggled via the ☰ button in the page header. Collapse state persists in localStorage. Per-app `AppMark` (Aleph logomark + "Network" wordmark) at the top.
- Sidebar accordion sections (`AccordionSection`) — four sections: Dashboard (Overview) · Resources (Nodes, VMs, Credits) · Network (Graph, Health) · Operations (Issues). Each section is independently toggleable; state persists per-section. The old "More" popover (Issues + Network Health) is gone — Issues + Health are now top-level entries.
- Page header slot (`PageHeader`) — sticky chrome row above page content carrying ☰ toggle, page title (or breadcrumb), search slot, and action slot. Pages declare content via the `usePageHeader` hook (PR 2 wires per-page actions). Without a hook call, falls back to a route-derived title via `routeTitle()`.
```

- [ ] **Step 5: Bump changelog**

In `src/changelog.ts`, bump CURRENT_VERSION using minor semver (this is a feature). Add a `VersionEntry` summarising the changes — feature category, brief description per spec section.

Example shape (read the file's existing entries first to match style):

```ts
{
  version: "X.Y.0",
  date: "2026-05-14",
  changes: [
    { type: "feat", description: "Shared product strip with cross-app navigation (Cloud · Network · Explorer · Swap)" },
    { type: "feat", description: "Collapsible sidebar (icon rail) with toggleable accordion sections; state persists per-section" },
    { type: "ui", description: "Theme toggle moved from header to top product strip (shared chrome)" },
    { type: "ui", description: "Issues + Network Health promoted from 'More' popover to top-level sidebar entries (Operations and Network sections)" },
    { type: "infra", description: "Page header slot (`PageHeader`) wired in shell — page-level actions arrive in next release" },
  ],
}
```

- [ ] **Step 6: Commit docs and version bump**

```
git add docs CLAUDE.md src/changelog.ts
git commit -m "docs(shell): update ARCHITECTURE, DECISIONS, BACKLOG, CLAUDE; bump changelog"
```

## Task 14: Ship PR 1

Use `/dio:ship` (per `CLAUDE.md` § Finishing a branch). Summary of what `/dio:ship` does (documented here for transparency):

1. **Catch up on main** — `git fetch origin main`; rebase only if behind. Stop on conflicts.
2. **Doc audit** — surfaces any docs still referencing the old chrome.
3. **`pnpm check`** — must pass.
4. **Preview gate (mandatory)** — wait for user to run `preview start <branch>` and confirm.
5. **Commit doc/audit changes.**
6. **Push branch.**
7. **Create PR.** Title: `feat(shell): chrome overhaul — product strip + collapsible sidebar + page header slot`. Body summarising the work + spec link + plan link.
8. **Squash-merge** after review: `gh pr merge <number> --squash --delete-branch`.
9. **Sync local main + delete branch.**

- [ ] **Step 1: Invoke ship**

Tell the user: "Ready to ship PR 1 via `/dio:ship`?"

---

# PR 2 — Page action tier

## Task 15: Create feature branch

- [ ] **Step 1: Sync main and branch**

```
git fetch origin main
git checkout main
git pull --ff-only origin main
git checkout -b feature/shell-page-actions
```

## Task 16: Add `usePageHeader` to `/` (Overview)

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read the current file**

Identify the top-level page component (the default export).

- [ ] **Step 2: Add the hook call**

Add at the top of the component body (before any other logic):

```tsx
import { usePageHeader } from "@aleph-front/ds/page-header";

// ... inside the component:
usePageHeader({ title: "Overview" });
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Test in dev**

Run: `pnpm dev`; open `/`; confirm the title in the chrome row shows "Overview".

- [ ] **Step 5: Commit**

```
git add src/app/page.tsx
git commit -m "feat(shell): wire usePageHeader on Overview"
```

## Task 17: Wire `/nodes` with Refresh action

**Files:**
- Modify: `src/app/nodes/page.tsx`

- [ ] **Step 1: Read the file**

Locate where `useNodes()` (or equivalent React Query hook) is called.

- [ ] **Step 2: Wire usePageHeader**

Add at the top of the component:

```tsx
import { usePageHeader } from "@aleph-front/ds/page-header";
import { Button } from "@aleph-front/ds/button";
import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr";

// ... inside the component, after the data hook:
const { data: nodes, isFetching, refetch } = useNodes();
const total = nodes?.length ?? 0;

usePageHeader({
  title: total > 0 ? `Nodes · ${total} total` : "Nodes",
  actions: (
    <Button
      variant="outline"
      size="xs"
      onClick={() => { void refetch(); }}
      disabled={isFetching}
    >
      <ArrowClockwise size={12} className="mr-1" />
      {isFetching ? "Refreshing…" : "Refresh"}
    </Button>
  ),
});
```

(Adjust to actual hook shape — names like `useNodes` may differ. The existing data-fetching shape stays; we're only reading from it.)

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Test in dev**

Open `/nodes`; confirm title shows "Nodes · N total" once loaded. Click Refresh; confirm spinner-equivalent state ("Refreshing…") appears briefly and resolves.

- [ ] **Step 5: Commit**

```
git add src/app/nodes/page.tsx
git commit -m "feat(shell): wire Nodes page header with Refresh action"
```

## Task 18: Wire `/vms` with Refresh action

**Files:**
- Modify: `src/app/vms/page.tsx`

- [ ] **Step 1: Apply the same pattern as Task 17**

Use `useVMs()` (or the project's actual hook) for `isFetching` + `refetch`. Title: ``${total > 0 ? `VMs · ${total} total` : "VMs"}``.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Test in dev**

Open `/vms`; confirm title and Refresh.

- [ ] **Step 4: Commit**

```
git add src/app/vms/page.tsx
git commit -m "feat(shell): wire VMs page header with Refresh action"
```

## Task 19: Wire `/credits`

**Files:**
- Modify: `src/app/credits/page.tsx`

- [ ] **Step 1: Add title only (no actions — range tabs stay in body)**

```tsx
import { usePageHeader } from "@aleph-front/ds/page-header";

// inside the component:
usePageHeader({ title: "Credit Expenses" });
```

- [ ] **Step 2: Verify + test + commit**

```
pnpm typecheck
git add src/app/credits/page.tsx
git commit -m "feat(shell): wire Credits page header"
```

## Task 20: Wire `/network`

**Files:**
- Modify: `src/app/network/page.tsx`

- [ ] **Step 1: Add title only**

The network graph has its own overlay chrome (layer toggles, search, focus pill). Don't move those into the header — they're tightly coupled to the graph canvas.

```tsx
import { usePageHeader } from "@aleph-front/ds/page-header";

// inside the component:
usePageHeader({ title: "Network Graph" });
```

- [ ] **Step 2: Verify + commit**

```
git add src/app/network/page.tsx
git commit -m "feat(shell): wire Network Graph page header"
```

## Task 21: Wire `/status` with Refresh (replacing body-level button)

**Files:**
- Modify: `src/app/status/page.tsx`

- [ ] **Step 1: Identify the existing Refresh button**

Read `src/app/status/page.tsx` and find the body-level Refresh button + last-checked display. Note the click handler (likely calls `refetch` on a `useHealth` or similar hook).

- [ ] **Step 2: Wire usePageHeader with the Refresh action**

```tsx
import { usePageHeader } from "@aleph-front/ds/page-header";
import { Button } from "@aleph-front/ds/button";
import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr";

// inside the component:
const { isFetching, refetch /* and lastChecked timestamp etc. */ } = useHealthStatus();

usePageHeader({
  title: "Network Health",
  actions: (
    <Button
      variant="outline"
      size="xs"
      onClick={() => { void refetch(); }}
      disabled={isFetching}
    >
      <ArrowClockwise size={12} className="mr-1" />
      {isFetching ? "Checking…" : "Recheck"}
    </Button>
  ),
});
```

- [ ] **Step 3: Remove the body-level Refresh button**

Delete the existing Refresh button from the body. The "last checked" timestamp can stay in the body (it's information, not a verb).

- [ ] **Step 4: Verify + test + commit**

```
pnpm typecheck
git add src/app/status/page.tsx
git commit -m "feat(shell): move Network Health Refresh into page header"
```

## Task 22: Wire `/issues` with Refresh

**Files:**
- Modify: `src/app/issues/page.tsx`

- [ ] **Step 1: Same pattern as Task 17**

```tsx
import { usePageHeader } from "@aleph-front/ds/page-header";
import { Button } from "@aleph-front/ds/button";
import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr";

// inside the component:
const { isFetching, refetch } = useIssues();

usePageHeader({
  title: "Issues",
  actions: (
    <Button
      variant="outline"
      size="xs"
      onClick={() => { void refetch(); }}
      disabled={isFetching}
    >
      <ArrowClockwise size={12} className="mr-1" />
      {isFetching ? "Refreshing…" : "Refresh"}
    </Button>
  ),
});
```

(`useIssues` is derived from `useVMs` + `useNodes`. You may need to expose `refetch` and `isFetching` from `useIssues` by chaining the underlying refetches — see `src/hooks/use-issues.ts`.)

- [ ] **Step 2: Verify + test + commit**

```
pnpm typecheck
git add src/app/issues/page.tsx
git commit -m "feat(shell): wire Issues page header with Refresh action"
```

## Task 23: Wire `/wallet` with Refresh + Explorer link

**Files:**
- Modify: `src/app/wallet/page.tsx`

- [ ] **Step 1: Compose the address title + actions**

```tsx
import { usePageHeader } from "@aleph-front/ds/page-header";
import { Button } from "@aleph-front/ds/button";
import { ArrowClockwise, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";

// inside the component, after reading `address` from search params and data hooks:
const truncated = address
  ? `${address.slice(0, 6)}…${address.slice(-4)}`
  : "Wallet";

usePageHeader({
  title: truncated,
  actions: (
    <>
      <Button
        variant="outline"
        size="xs"
        onClick={() => { void refetchAll(); /* whatever the wallet's refresh is */ }}
        disabled={isFetching}
      >
        <ArrowClockwise size={12} className="mr-1" />
        {isFetching ? "Refreshing…" : "Refresh"}
      </Button>
      {address && (
        <a
          href={`https://explorer.aleph.cloud/?address=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary-400 hover:underline"
        >
          Open in Explorer <ArrowUpRight size={12} />
        </a>
      )}
    </>
  ),
});
```

(`refetchAll` is illustrative — wire to whatever combined-refresh path the wallet page already exposes.)

- [ ] **Step 2: Verify + test + commit**

```
pnpm typecheck
git add src/app/wallet/page.tsx
git commit -m "feat(shell): wire Wallet page header with Refresh + Explorer link"
```

## Task 24: Wire `/changelog`

**Files:**
- Modify: `src/app/changelog/page.tsx`

- [ ] **Step 1: Title only**

```tsx
import { usePageHeader } from "@aleph-front/ds/page-header";

usePageHeader({ title: "Changelog" });
```

- [ ] **Step 2: Verify + commit**

```
git add src/app/changelog/page.tsx
git commit -m "feat(shell): wire Changelog page header"
```

## Task 25: Verify and refine

- [ ] **Step 1: Run full project checks**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 2: Smoke test all routes**

Walk through each route at sm/md/lg viewports:
- Title in the chrome row matches the spec table.
- Refresh action on `/nodes`, `/vms`, `/status`, `/issues`, `/wallet` triggers a refetch and disables while in-flight.
- Title becomes data-aware ("Nodes · 542 total") after data loads.
- No body-level Refresh button on `/status`.
- Route changes propagate cleanly (no flicker on title change).

- [ ] **Step 3: Fix any issues**

## Task 26: Update docs and version

**Files:**
- Modify: `CLAUDE.md`
- Modify: `src/changelog.ts`

- [ ] **Step 1: Update CLAUDE.md**

In the "Current Features" list, refine the page-header entry to mention real actions:

```
- Page header slot — sticky chrome row above page content carrying ☰ toggle, page title (route-derived fallback or data-aware via `usePageHeader`), and per-page actions. Refresh actions wired on `/nodes` (`Nodes · N total`), `/vms` (`VMs · N total`), `/status`, `/issues`, `/wallet`. `/status` body-level Refresh button removed in favour of the chrome row. Wallet page also exposes "Open in Explorer →" linking to the address on explorer.aleph.cloud.
```

- [ ] **Step 2: Bump changelog (patch)**

Add a `VersionEntry` (patch bump, e.g. `X.Y.1`):

```ts
{
  version: "X.Y.1",
  date: "2026-05-14",
  changes: [
    { type: "feat", description: "Data-aware page titles (Nodes · N total, VMs · N total)" },
    { type: "feat", description: "Refresh actions in the page header for Nodes / VMs / Status / Issues / Wallet" },
    { type: "ui", description: "Network Health body-level Refresh button moved to page header" },
  ],
}
```

- [ ] **Step 3: Commit**

```
git add CLAUDE.md src/changelog.ts
git commit -m "docs(shell): page action tier — update CLAUDE and changelog"
```

## Task 27: Ship PR 2

- [ ] **Step 1: Invoke ship**

Tell the user: "Ready to ship PR 2 via `/dio:ship`?"

Same flow as Task 14.

---

## Self-review checklist

When both PRs are merged:

- [ ] All routes have correct titles via either `usePageHeader` or the route-derived fallback
- [ ] No imports of the deleted `app-sidebar.tsx` or `app-header.tsx` remain in the codebase
- [ ] `pnpm check` passes on main
- [ ] CLAUDE.md "Current Features" list reflects the new shell
- [ ] DECISIONS.md has the shell-redesign decision entry
- [ ] BACKLOG.md "Sidebar component in DS" entry moved to Completed
- [ ] `src/changelog.ts` has both VersionEntry rows (PR 1 minor, PR 2 patch)
- [ ] All tasks marked `[x]` in this file
