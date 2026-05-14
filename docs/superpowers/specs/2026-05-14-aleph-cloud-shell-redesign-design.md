# Aleph Cloud shell redesign — design

## Background

The dashboard currently uses a fixed-width left sidebar (`AppSidebar`, 256px) and a thin top header (`AppHeader`) that only carries a mobile hamburger and the theme toggle. The structure has three growing pains:

1. **No cross-app context.** The dashboard is becoming part of a wider Aleph product family (`app.aleph.cloud` for cloud/compute, `network.aleph.cloud` for this dashboard, `explorer.aleph.cloud`, `swap.aleph.cloud`). There's no in-product way to jump between them.
2. **Sidebar is rigid.** Always expanded, no collapse. Sections (Dashboard, Resources) are always-open. A bottom "More" popover hides Issues and Network Health, which now justify real top-level entries.
3. **No page-action surface.** Each page reinvents its own toolbar at the top of its body. Common verbs (Refresh, Export) have no dedicated home.

## Goal

A unified shell that:

- Expresses **product-family membership** via a shared top strip listing the Aleph apps as inline tabs.
- Lets the **sidebar collapse to an icon rail** and reorganises into **toggleable accordion sections**.
- Adds a **per-page header tier** owned by the shell, into which pages declare title + actions via a hook.
- Lands first as **DS primitives** so `app.aleph.cloud` and the other Aleph apps can adopt the same chrome on day one.

## Component map

### In `@aleph-front/ds` (built first; this repo consumes via npm)

| Component | Responsibility |
|-----------|----------------|
| `ProductStrip` | Top bar — logomark, product tabs, right slot for utility controls |
| `AppShellSidebar` | Sidebar shell with expanded ↔ icon-rail mode; consumers pass content |
| `AccordionSection` | Subcomponent of the sidebar — chevron + label + children slot, persists open/closed per `sectionId` |
| `NavItem` | Subcomponent — icon + label, active state |
| `PageHeader` | Renderer the shell drops into its chrome row; reads from `PageHeaderContext` |
| `PageHeaderProvider` | Context provider wrapping the shell |
| `usePageHeader` | Hook pages call to fill the header slot |
| `useSidebarCollapse` | Hook for the collapsed/expanded state, localStorage-backed |
| `useAccordionState` | Per-section accordion state, localStorage-backed |

### In `scheduler-dashboard` (consuming code)

- `AppShell` — composes the DS primitives. Replaces today's `AppShell` + `AppSidebar` + `AppHeader`.
- Inline `AppMark` — Aleph logomark + "Network" wordmark; too small to be DS-bound.
- Inline sidebar version footer — current changelog link, unchanged.
- `src/config/apps.ts` — the four-app list.
- `src/config/nav.ts` — the four sidebar sections + items.
- Per-page calls to `usePageHeader({ title, actions })` (PR 2).

## Layout structure & behaviour

### Layout tree (desktop, `≥ md`)

```
<body>
  <PageHeaderProvider>
    <ProductStrip apps={APPS} activeId="network" logoHref="https://aleph.cloud" right={<ThemeToggle/>} />
    <div className="flex flex-1">
      <AppShellSidebar appMark={<AppMark/>} collapsed={...} onToggle={...}>
        {NAV_SECTIONS.map(section => (
          <AccordionSection title={section.title} sectionId={section.id}>
            {section.items.map(item => <NavItem .../>)}
          </AccordionSection>
        ))}
      </AppShellSidebar>
      <main>
        <PageHeader />               {/* renders from PageHeaderContext */}
        <div className="page-body">{children}</div>
      </main>
    </div>
  </PageHeaderProvider>
</body>
```

### Top bar (`ProductStrip`)

- Height 32–36px, full width above sidebar + content.
- **Far left:** logomark only (Aleph A icon), links to `https://aleph.cloud`. No wordmark — avoids the "Aleph Cloud" parent brand colliding with the "Cloud" tab.
- **Middle:** product tabs in order `Cloud · Network · Explorer · Swap`. Each is an `<a>` to its subdomain; full page navigation, no SPA router. Active tab determined by the consumer passing `activeId="network"`; no auto-detection.
- **Right slot:** theme toggle for PR 1. Future controls (Connect wallet, account dropdown) land here later.

### Sidebar (`AppShellSidebar`)

- **Expanded** (default, `≥ md`): ~232px. Narrower than today's 256px because the new top strip eats vertical space; the sidebar can afford to shed width.
- **Icon rail** (user toggle, persisted): ~52px. Icons only, tooltips on hover via DS `Tooltip`. `AppMark` shrinks to logomark only. `AccordionSection` UI hides (chevrons + section titles disappear) but state is preserved for re-expansion. Items render as a flat icon list.
- **Mobile drawer** (`< md`): off-canvas, unchanged from today. The ☰ toggle (rendered inside `PageHeader`, left side) opens the drawer on mobile and toggles expanded↔rail on desktop.

### Sidebar app mark (inline, in this repo)

- Renders inside the sidebar's `appMark` slot.
- Expanded: small Aleph logomark + "Network" wordmark in DS heading style.
- Icon rail: logomark only, centred.

### Accordion sections

- Each `AccordionSection` toggles via chevron click on its title row.
- State persists per-section in `localStorage["sidebar.section.<sectionId>"]`.
- Default on first visit: all expanded.
- In icon-rail mode, accordion UI is hidden but state survives.

### Page header tier (`PageHeader`)

- One row above the page body, sticky to the scroll container top.
- **Left:** ☰ collapse toggle (rendered internally by `PageHeader`, wired to `useSidebarCollapse().toggle` from DS — consumers don't pass it in) + page title (and optional breadcrumb), read from `PageHeaderContext`.
- **Right:** optional search slot + actions (`ReactNode`), read from context.
- Pages that don't call `usePageHeader` get a default title derived from the route via a small `routeTitle(pathname)` helper. `routeTitle("/")` returns `"Overview"`; other routes humanise their leading segment (`"/nodes"` → `"Nodes"`). The helper lives in the consuming app, not DS, so each app can tailor it. No empty state.
- Filter pills, status tabs, range pickers stay in the page body — they're filter state, not page actions. The header carries verbs ("things you do to the page"), not predicates ("things you filter the data by").

## Data flow & state management

### State ownership

| State | Owner | Persistence |
|-------|-------|-------------|
| Sidebar collapsed/expanded | `useSidebarCollapse()` hook (DS) | `localStorage["sidebar.collapsed"]`, boolean |
| Accordion section open/closed | `useAccordionState(sectionId)` hook (DS) | `localStorage["sidebar.section.<id>"]`, boolean |
| Mobile drawer open | `useState` in `AppShell` (consumer) | session only |
| Page header content (title, actions, search) | `PageHeaderContext` (DS) | session only, re-set per route |

All persistence hooks are SSR-safe: they read `localStorage` inside `useEffect` and return `null` until hydrated. AppShellSidebar treats `null` as "expanded" so the first paint matches the static-export HTML.

### Hook signatures

```ts
// Sidebar collapse
function useSidebarCollapse(): {
  collapsed: boolean | null;        // null while hydrating
  setCollapsed: (next: boolean) => void;
  toggle: () => void;
};

// Accordion section
function useAccordionState(sectionId: string, defaultOpen?: boolean): {
  open: boolean | null;
  setOpen: (next: boolean) => void;
  toggle: () => void;
};

// Page header
type PageHeaderConfig = {
  title: ReactNode;            // string or composed (e.g. "Nodes · 542 total")
  actions?: ReactNode;         // right-side content; pages compose Button/Tooltip themselves
  search?: ReactNode;          // optional search slot (rendered before actions)
  breadcrumb?: ReactNode;      // optional left-side context (e.g. "Network ▸ Nodes")
};
function usePageHeader(config: PageHeaderConfig): void;  // sets context on mount, clears on unmount
```

### `usePageHeader` contract

- Pages call it once at the top of the component, declaratively, every render. The hook diffs against context and re-renders the chrome.
- `actions` is a `ReactNode`, not a config array — keeps pages free to compose DS Buttons, Tooltips, etc. exactly as they want.
- Unmount clears the slot so cross-route nav doesn't leak stale chrome. The next route's hook call fills it within the same React commit — no flicker.
- `actions` can be reactive: pages can disable Refresh while `isFetching` is true, change title once data loads, etc. Standard React re-render flow.

### Configs (this repo)

```ts
// src/config/apps.ts
export const APPS: ProductApp[] = [
  { id: "cloud",    label: "Cloud",    href: "https://app.aleph.cloud" },
  { id: "network",  label: "Network",  href: "https://network.aleph.cloud" },
  { id: "explorer", label: "Explorer", href: "https://explorer.aleph.cloud" },
  { id: "swap",     label: "Swap",     href: "https://swap.aleph.cloud" },
];

// src/config/nav.ts — replaces NAV_SECTIONS in app-sidebar.tsx
export const NAV_SECTIONS: NavSection[] = [
  { id: "dashboard",  title: "Dashboard",  items: [{ label: "Overview", href: "/", icon: "grid" }] },
  { id: "resources",  title: "Resources",  items: [
    { label: "Nodes",   href: "/nodes",   icon: "server" },
    { label: "VMs",     href: "/vms",     icon: "cpu" },
    { label: "Credits", href: "/credits", icon: "coins" },
  ]},
  { id: "network",    title: "Network",    items: [
    { label: "Graph",  href: "/network", icon: "network" },
    { label: "Health", href: "/status",  icon: "signal" },
  ]},
  { id: "operations", title: "Operations", items: [
    { label: "Issues", href: "/issues", icon: "warning" },
  ]},
];
```

## Migration — what moves, what goes away

### Removed

- `UtilityMenu` component (the bottom "More" popover with Issues + Network Health). Its items become real top-level sidebar entries.
- Theme toggle from `AppHeader` — moves to `ProductStrip` right slot (shared chrome, not per-app).
- `LogoFull` from sidebar top — replaced by inline `AppMark` (logomark + "Network" wordmark).

### Moved

| Today | New location |
|-------|--------------|
| `/` Overview | Dashboard section (unchanged) |
| `/nodes`, `/vms`, `/credits` | Resources section (unchanged) |
| `/network` (Graph) — no sidebar entry today | Network section (new top-level entry) |
| `/status` Network Health — in More popover | Network section, labelled "Health" |
| `/issues` — in More popover | Operations section |
| `/changelog` — sidebar footer link | Stays in sidebar footer (alongside version) |
| `/wallet?address=…` — no sidebar entry today | No nav entry (still address-required, reached via cross-links) |

### Per-page header content (PR 2)

| Page | Title | Actions |
|------|-------|---------|
| `/` | "Overview" | — |
| `/nodes` | "Nodes · N total" | Refresh |
| `/vms` | "VMs · N total" | Refresh |
| `/credits` | "Credit Expenses" | — (range tabs stay in body) |
| `/network` | "Network Graph" | — (graph chrome stays overlaid) |
| `/status` | "Network Health" | Refresh (replaces the body button) |
| `/issues` | "Issues" | Refresh |
| `/wallet` | address pill | Refresh, "Open in Explorer →" |
| `/changelog` | "Changelog" | — |

## PR breakdown & shipping order

### DS work (in `@aleph-front/ds`)

Each DS PR follows the existing "Adding a New Component" recipe (preview page + verification gate + five-doc updates).

- **DS PR α** — `ProductStrip` (+ `ProductApp` type). Preview page mocks the four-app list with each tab active.
- **DS PR β** — `AppShellSidebar` + `AccordionSection` + `NavItem` + `useSidebarCollapse` + `useAccordionState`. Bundled because they only make sense together. Preview page mocks the four-section layout in both expanded and icon-rail states.
- **DS PR γ** — `PageHeader` + `PageHeaderProvider` + `usePageHeader`. Bundled. Preview page mocks the slot mechanism via a `PageHeaderProvider` wrapping demo content.

### Dashboard work (in `scheduler-dashboard`)

- **PR 1 — Chrome overhaul.** Consumes α + β + γ. Replaces today's `AppShell` / `AppSidebar` / `AppHeader` with the new layout. Theme toggle migrates from `AppHeader` to ProductStrip right slot. Sidebar gets the four-section structure, accordion behaviour, icon-rail collapse. `UtilityMenu` deleted. New config files `src/config/apps.ts` and `src/config/nav.ts`. PageHeader is wired into the shell from day one; pages don't call `usePageHeader` yet — the header shows a default route-derived title via `routeTitle()`. No transitional code.
- **PR 2 — Page action tier.** Each page adds its `usePageHeader({ title, actions })` call. Page titles become data-aware ("Nodes · 542 total"). Refresh wired on `/nodes`, `/vms`, `/status`, `/issues`, `/wallet` using existing React Query `refetch`. Body-level Refresh on `/status` removed.

### Shipping order

DS PR α → DS PR β → DS PR γ → Dashboard PR 1 → Dashboard PR 2.

The dashboard plan declares the DS plan as an explicit dependency in its frontmatter. Dashboard PR 1 cannot start until `@aleph-front/ds` ships a version containing all three DS primitives.

### Blast radius

- **PR 1** touches the shell on every page. Risk: visual regressions, breakpoint bugs. Mitigation: smoke-test every route at sm/md/lg before merging.
- **PR 2** touches every page file (one hook call each). Risk: low — additive, route-derived fallback works if a page forgets to call the hook.

## Testing & edge cases

### Testing (DS side)

- `ProductStrip`: snapshot of rendered tabs with `activeId="network"`; click test that fires `<a>` navigation; preview page renders all four apps with each as active.
- `AppShellSidebar` + subcomponents: unit tests for `useSidebarCollapse` (localStorage round-trip, hydration `null` state); same for `useAccordionState`. Preview page covers expanded + icon-rail states side by side.
- `PageHeader` + `usePageHeader`: unit test that mounting a component with a config sets the context; unmount clears it; route change from page A to page B shows page B's content without flicker.

### Testing (dashboard side)

- Existing route tests still pass — they don't depend on chrome.
- Smoke pass per route at sm/md/lg viewports before merging each PR.
- One new test: `usePageHeader` integration on `/nodes` confirming the title updates from "Nodes" to "Nodes · 542 total" once data loads.

### Edge cases

- **Hydration mismatch** — collapse + accordion hooks return `null` until hydrated. AppShellSidebar treats `null` as "expanded" so the first paint matches the static-export HTML. No layout shift on hydration provided the static export was built with the same default.
- **Route changes** — `usePageHeader` cleanup fires on unmount. If a route renders a Suspense boundary, the boundary's fallback won't have a header config and the chrome falls back to `routeTitle(pathname)`. Acceptable — better than stale header.
- **Mobile drawer + collapse** — On mobile (`< md`), the sidebar is always off-canvas; `collapsed` is meaningless there. AppShellSidebar reads viewport via a CSS media query and renders the drawer mode without consulting `collapsed`. Toggle on mobile = open/close drawer; toggle on desktop = expanded/rail.
- **Active tab on ProductStrip** — `activeId="network"` is hardcoded per app. If the user navigates to a sibling subdomain in the same tab, that app's own ProductStrip picks up its own `activeId`. No cross-app state to coordinate.
- **Pages without `usePageHeader`** — fall back to `routeTitle(pathname)` returning a humanised route segment. Never empty.
- **Long page titles** — "Wallet · 0x1234…5678" can overflow on narrow desktops alongside actions. PageHeader truncates the title with ellipsis; breadcrumb slot doesn't truncate (kept short by design).
- **Theme toggle position change** — PR 1 moves the toggle out of `AppHeader` into ProductStrip. Worth a one-line entry in `src/changelog.ts` so users notice.
