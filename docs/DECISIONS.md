# Decisions Log

Key decisions made during development. When you wonder "why did we do X?", the answer should be here.

---

## How Decisions Are Logged

Decisions are captured when these phrases appear:
- "decided" / "let's go with" / "rejected"
- "choosing X because" / "not doing X because"
- "actually, let's" / "changed my mind"

Each entry includes:
- Context (what we were working on)
- Decision (what was chosen)
- Rationale (why - the most important part)

---

## Decision #7 - 2026-03-01
**Context:** DS renamed `--card` token to `--surface`
**Decision:** Replace all `bg-card` with `bg-surface` across the dashboard
**Rationale:** The DS changed the token name. Tailwind's `bg-card` generates `background-color: var(--color-card)` which no longer resolves, causing transparent backgrounds. Silent failure — builds pass but visuals break.

## Decision #6 - 2026-03-01
**Context:** Making the dashboard responsive for mobile and tablet
**Decision:** Off-canvas sidebar drawer on mobile (`md` breakpoint), slide-in detail panel overlays (`lg` breakpoint)
**Rationale:** Sidebar at 256px + detail panel at 384px = 640px of fixed-width chrome, which overflows on anything below ~1100px. Mobile drawer with backdrop is the standard pattern for persistent navigation. Detail panels become full-width overlays below `lg` since there isn't enough room for table + panel side-by-side.
**Alternatives considered:** Bottom navigation for mobile (too few nav items to justify), responsive table with column hiding (table already has overflow-x-auto which is sufficient).

## Decision #5 - 2026-03-01
**Context:** DS components use `@ac/*` path alias internally
**Decision:** Map `@ac/*` to `node_modules/@aleph-front/ds/src/*` in dashboard tsconfig
**Rationale:** Since we transpile raw `.tsx` source from the DS via `transpilePackages`, the DS's internal path aliases aren't available in the consumer's build context. Adding the alias to the dashboard's tsconfig resolves the imports without modifying the DS.
**Alternatives considered:** Could have changed the DS to use relative imports, but that would break the DS's own build and tests.

## Decision #4 - 2026-03-01
**Context:** Choosing default theme for the dashboard
**Decision:** Dark theme by default, with toggle to switch
**Rationale:** User directive. Operations dashboards are typically viewed in dark environments (server rooms, NOCs). Dark theme reduces eye strain during extended monitoring.

## Decision #3 - 2026-03-01
**Context:** Where to put UI components
**Decision:** DS-first component policy — all reusable UI primitives go in `@aleph-front/ds`, dashboard-specific compositions stay local
**Rationale:** Prevents duplicate components across projects. The DS is the single source of truth for brand-consistent UI. Dashboard components are domain-specific compositions that wire DS primitives to scheduler data.

## Decision #2 - 2026-03-01
**Context:** How to fetch data in a static-exported app
**Decision:** React Query with `refetchInterval` polling over server components
**Rationale:** `output: "export"` disables server components with data fetching. React Query provides caching, deduplication, and automatic polling. Mock data layer swappable via env flag for development without a live API.
**Alternatives considered:** Server components (incompatible with static export), SWR (less feature-rich), manual fetch+useState (no caching/deduplication).

## Decision #1 - 2026-03-01
**Context:** Deployment target for the scheduler dashboard
**Decision:** Static export (`output: "export"`) for IPFS hosting
**Rationale:** Aleph Cloud infrastructure is decentralized. Hosting on IPFS aligns with the platform philosophy — no centralized server dependency. Static export means no server runtime, all data fetching client-side.
**Alternatives considered:** Vercel/Cloudflare deployment (centralized), SSR (requires server runtime).
