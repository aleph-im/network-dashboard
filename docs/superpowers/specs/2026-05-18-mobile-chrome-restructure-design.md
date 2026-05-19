# Mobile chrome restructure — design

## Background

The mobile audit (PR-merged 2026-05-17, plan `docs/plans/2026-05-18-mobile-audit-plan.md`) made every page survive below `md`, but it kept the desktop chrome stack intact. On mobile that stack is heavier than it needs to be:

- **`ProductStrip`** at the top (54px) — Aleph logomark, four product tabs (`Cloud · Network · Explorer · Swap`), theme toggle in the right slot.
- **`PageHeader`** below it (~48px) — hamburger on the left (`leading`), page title centered, per-page actions on the right.
- **`MobileSidebarDrawer`** — slides in from the left, ~70% screen width, with a backdrop. Hosts the same `AppShellSidebar` used on desktop.

Total fixed chrome above the fold on mobile is ~100px before the page even renders. The cross-product tabs are also the lowest-frequency action on mobile — operators on phones are checking the network they're already inside, not jumping between Aleph apps.

## Goal

Reclaim vertical space and align the mobile experience with mobile conventions:

- **Single header** below `md`: title left, hamburger right.
- **Full-screen drop menu** that slides down from the top edge, replacing the side drawer.
- **Cross-product nav lives inside the menu**, not above the fold.
- **Page actions move inline** above page content on mobile.

Desktop chrome (`≥ md`) is unchanged.

## Layout structure

### Desktop (`≥ md`) — unchanged

```
<ProductStrip />
<div flex>
  <AppShellSidebar />
  <main>
    <PageHeader leading={<SidebarToggle/>} title actions />
    <content />
  </main>
</div>
```

### Mobile (`< md`)

```
<MobileMenu open={...} onClose={...}>
  ...nav structure...
</MobileMenu>
<main>
  <PageHeader title leading=null trailing={<SidebarToggle/>} />
  <content>
    <InlinePageActions /> {/* if page has actions */}
    {children}
  </content>
</main>
```

Key differences vs today:

| Element | Today (mobile) | Proposed |
|--------|----------------|----------|
| `ProductStrip` | Always rendered above PageHeader | Hidden below `md`; lives inside `MobileMenu` footer |
| `PageHeader.leading` (hamburger) | Left | Moved to the right (new `trailing` slot or via conditional render) |
| Page actions (Refresh) | Right slot of `PageHeader` | Inline row at the top of page content |
| Drawer | `MobileSidebarDrawer` — slides from left, ~70% width, hosts `AppShellSidebar` | `MobileMenu` — drops from top, full-screen, custom content |
| `MobileSidebarDrawer` component | Used | Removed |
| `useMobileDrawer` hook | Used | Renamed to `useMobileMenu`, same API |

## MobileMenu structure

The menu is its own component, not `AppShellSidebar` inside a different wrapper. Reuse would force awkward slot work: `AppShellSidebar` carries rail-collapse state and a single `footer` slot that's used for the version link. The mobile menu needs a richer footer band (product tabs + theme toggle + version) and no rail concept at all.

```
<MobileMenu>
  <header>
    {currentAppName /* "Network" */}
    <CloseButton /> {/* × icon */}
  </header>
  <nav>
    {NAV_SECTIONS.map(section => (
      <AccordionSection ...>
        {section.items.map(item => <NavItem ... />)}
      </AccordionSection>
    ))}
  </nav>
  <footer>
    <ProductTabs />          {/* compact inline list, links out for external apps */}
    <ThemeToggle />
    <VersionLink />          {/* v0.27.0 → /changelog */}
  </footer>
</MobileMenu>
```

**Footer band content:**
- Product tabs render as a compact inline list (Cloud · Network · Explorer · Swap). `Network` is marked active; the three external entries use the same external-link affordance as `ProductStrip` (DS already handles this via `apps[].external`).
- Theme toggle + version link share a row beneath the product tabs.

**Accordion sections behave identically to desktop:** state persists in `localStorage["sidebar.section.<id>"]` via the existing `useAccordionState`. Operations defaults closed.

**Nav items**: same `NavItem asChild` + Next `Link` wrapping as today, including the `/credits` hover/focus prefetch.

## Animation & interactions

- **Open**: `translateY(-100%) → translateY(0)`, ~200ms, `var(--ease-default)`. Backdrop fades from 0 → 0.4 over the same duration.
- **Close**: reverse.
- **`prefers-reduced-motion`**: skip the transform, fade only.
- **Hamburger ↔ ×**: the same button changes its icon based on `open` state. Position is fixed in the top-right of `PageHeader`.
- **Close triggers**: tap `×`, tap backdrop, route change (existing `useMobileMenu` behavior), `Escape` key (new — add to the hook).
- **Body scroll lock**: applied while open (existing pattern from drawers; verify it's already in `useMobileDrawer`, add if not).

## PageHeader changes

`PageHeader` today takes `leading` + `title` + an internal context-driven `actions` slot. To put the hamburger on the right below `md` without touching the DS, the cleanest path is:

- Keep passing `leading={<SidebarToggle/>}` as today.
- Style the toggle responsively in `AppShell`: `md:order-first` on desktop, on mobile use absolute positioning or render two instances behind a `md:hidden` / `max-md:hidden` pair. (Decide in implementation; both work.)
- If the DS needs a real `trailing` slot for this, raise it as a small DS PR alongside the consumer change — but only if the consumer-only approach gets ugly.

Page actions are no longer registered via `usePageHeader` on mobile. Two implementation paths:

1. **Cheap path**: pages keep calling `usePageHeader({ actions })`. The action slot renders only at `≥ md`. Pages with mobile-only action surface render a small `<InlinePageActions>` wrapper at the top of their body — DOM stays unchanged on desktop, the inline wrapper is `md:hidden`.
2. **Strict path**: `usePageHeader` accepts an `inlineOnMobile` flag, and the shell renders the actions both in the header (desktop) and in an inline row (mobile) automatically.

**Recommend path 1.** Five pages have actions today (Nodes, VMs, Wallet, Network Health, Issues) — fewer than the cost of adding a shell-owned inline-actions slot. Each page renders one extra `md:hidden` row.

## Files & components

### New

- `src/components/mobile-menu.tsx` — the drop-down menu shell (replaces `mobile-sidebar-drawer.tsx`).
- `src/components/mobile-menu.test.tsx` — covers open/close, accordion persistence, route auto-close.

### Renamed

- `src/hooks/use-mobile-drawer.ts` → `src/hooks/use-mobile-menu.ts`. API unchanged (`open`, `toggle`, `closeDrawer` → `close`).

### Modified

- `src/components/app-shell.tsx` — swap `MobileSidebarDrawer` for `MobileMenu`, hide `ProductStrip` below `md`, position `SidebarToggle` on the right below `md`.
- Pages with header actions (`/nodes`, `/vms`, `/wallet`, `/status`, `/issues`) — render the existing action button in an `md:hidden` row at the top of the page body.

### Removed

- `src/components/mobile-sidebar-drawer.tsx` + its test file.

## Out of scope

- Desktop chrome changes.
- Reworking the per-page action API (`usePageHeader`) in the DS.
- Adding new menu entries or restructuring `NAV_SECTIONS`.
- Pull-to-refresh or other gesture-driven interactions.

## Risks

- **PageHeader trailing slot**: if styling the toggle responsively in `AppShell` produces visual jitter or focus-order issues, fall back to absolute positioning on mobile (the toggle is a single button — easy).
- **Body scroll lock**: existing drawer didn't always set it; the full-screen menu makes the omission visible. Add the lock as part of the hook rename.
- **Product tabs in the footer**: if the compact inline list feels cramped, fall back to the same horizontal tab pattern `ProductStrip` uses, just stacked underneath the theme/version row.

## Verification

- Manual: open menu on iPhone-width viewport, navigate, confirm route auto-close. Confirm reduced-motion fallback.
- Manual: every page that registered actions still surfaces a Refresh button below `md`.
- `pnpm check` clean.
- Visual smoke against Decision #97 (mobile audit done) — confirm nothing regresses in the card / list / chart mobile treatments shipped on `feature/mobile-audit`.

## Open questions

None — proceed to implementation plan.
