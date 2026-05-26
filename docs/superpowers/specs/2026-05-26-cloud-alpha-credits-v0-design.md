# Cloud Alpha — Credits v0 Design

**Date:** 2026-05-26
**Status:** Design approved, pending plan
**Source:** Brainstorming session on porting the old `front-aleph-cloud-page` console into a new chrome built on `@aleph-front/ds`, starting with credits as the only payment vehicle.

---

## Context

The old `front-aleph-cloud-page` (Next 13 Pages Router + twin.macro + `@aleph-front/core`) needs to be rebuilt on the modern chrome family established by this repo: Next 16 + App Router + `@aleph-front/ds` + Tailwind 4 + TanStack Query. The new app — **Cloud Alpha** — will replace the old console over time, starting with credits because:

**Source-of-truth branch for design reference:** `feat/credits-ui` on `aleph-im/front-aleph-cloud-page` — NOT `main`. The main branch still ships all three payment vehicles (credits + hold + PAYG) and reflects the old console as it exists today. `feat/credits-ui` is the work-in-progress that strips the design down to credits-only, matching v0's payment constraint exactly. When Phase 2–4 plans need design intent (top-up flow shape, currency picker UX, balance card layout, etc.), reference `feat/credits-ui`, not `main`. Direct link: `https://github.com/aleph-im/front-aleph-cloud-page/tree/feat/credits-ui`.

1. **Credits-only payment vehicle is the new constraint.** No ALEPH-token holder tier (hold), no Superfluid pay-as-you-go streams (PAYG). Every product area in the eventual full console will charge via credits, so credits is the foundational piece every other surface will depend on.
2. **The chrome was built for cross-app reuse.** Decision #94 in this repo's `DECISIONS.md` explicitly says: *"Building the primitives in DS rather than in-app means `app.aleph.cloud` and other consumer apps can adopt the same chrome later without a port."* Cloud Alpha cashes in that investment.
3. **The old console's surface is large.** A full lift-and-shift would be a multi-month effort with no shippable intermediate. Credits-only v0 is the smallest valuable thing.

This document is the design. The implementation plan is a separate deliverable produced by `writing-plans` after this spec is reviewed.

---

## Goals

- Stand up a new app, **`aleph-cloud-app`**, that uses the same chrome primitives this repo uses, hosted at its own URL.
- Ship **balance + top-up only** in v0. No history, no transfer, no charts.
- Support **Privy** as the primary login method (embedded wallets via email / social / passkey, **email mode configured for OTP code** not magic link), with **Reown** as the backup for users bringing an external wallet.
- Charge in **credits only** — no hold-tier, no PAYG — on Ethereum mainnet, payable in ALEPH or USDC.
- Wire smoke testing from day one with a real mainnet wallet and a $1-floor top-up flow.
- Treat documentation as a first-class deliverable: docs are part of every PR, enforced by CI.

## Non-goals (v0)

- Computing / hosting / storage / domain / permissions / settings — these ship after credits.
- Multi-chain (Avalanche / Base / Solana / Superfluid) — Ethereum only.
- Credit history, recent purchases, service costs reference, expiring balances, charts — deferred to v0.5+.
- Credit transfer (wallet-to-wallet) — deferred to v0.5.
- Cross-app WalletConnect session sharing — deferred indefinitely; each ProductStrip app handles its own wallet.

---

## §1 — Repo & naming

**New repo:** `~/repos/aleph-cloud-app` (suggested name; user may rename pre-bootstrap). Independent git history; not a fork of the old console.

**Identity contrast:**

| | scheduler-dashboard (this repo) | aleph-cloud-app (new) |
|---|---|---|
| Identity | Network — operator dashboard | Cloud — consumer app |
| Audience | Node operators, researchers | Authenticated Aleph customers |
| Auth | None — address from URL | Wallet-connected (Privy primary, Reown fallback) |
| Writes | None — read-only | Top-up signs EVM tx |
| Deploy | IPFS static export | IPFS static export, separate URL |

**ProductStrip evolution.** When Cloud Alpha is deployable, both repos add a new `Cloud Alpha` entry to `src/config/apps.ts` between Network and Explorer, `external: true`, pointing at the new URL. The existing `Cloud` tab (pointing at `app.aleph.im`) is left untouched in v0 — old users keep their current experience while the new app validates with early testers. Once Cloud Alpha reaches parity, the old `Cloud` tab retires and `Cloud Alpha` is renamed to `Cloud`.

---

## §2 — Stack

Mirror this repo unless flagged as a deviation:

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16, App Router, static export, `trailingSlash: true` | Same as this repo |
| Language | TypeScript strict, ESM only | Same |
| Styling | Tailwind CSS 4 + `@aleph-front/ds` | Same DS, pinned npm version |
| Data | TanStack React Query + persisted localStorage cache | Same |
| Lint / format | oxlint + oxfmt | Same |
| Tests | Vitest + `@testing-library/react` | Same |
| Deploy | IPFS via GitHub Actions, ported from `scripts/deploy-ipfs.py` | Same workflow shape |
| **Wallet (primary)** | **`@privy-io/react-auth`** | NEW — embedded wallet + social/email/passkey login |
| **Wallet (backup)** | **`@reown/appkit` + `@reown/appkit-adapter-ethers5`** | NEW — external wallets (MetaMask, WalletConnect) |
| **Signer** | **ethers v5** | Both providers normalize to `ethers.providers.Web3Provider` |
| **Big-number math** | **`bn.js`** | Ported from source's `domain/credit.ts` |

**Why both wallet providers in v0:** Privy alone alienates crypto-native users who don't want a Privy-managed embedded wallet. Reown alone shuts out consumer customers without a wallet at all. Building both in from day one avoids a wallet-adapter refactor later. The unified `useWallet()` hook is the abstraction; provider-specific code never leaks past `src/wallet/`.

---

## §3 — Surface architecture

```
aleph-cloud-app/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Providers: Privy, Reown, QueryClient, Theme, PageHeader
│   │   ├── page.tsx                  # / → redirect to /credits (or simple landing)
│   │   └── credits/
│   │       └── page.tsx              # /credits — the only real route in v0
│   ├── api/
│   │   ├── credit-client.ts          # credit.aleph.im REST client
│   │   ├── credit-types.ts           # Balance, TokenEstimation, PaymentRequest types
│   │   └── credit-client.test.ts
│   ├── hooks/
│   │   ├── use-credit-balance.ts     # GET balance, 30s poll, depends on useWallet
│   │   ├── use-credit-balance.test.tsx
│   │   └── use-token-estimation.ts   # POST estimation, 300ms debounce
│   ├── wallet/
│   │   ├── privy-config.ts           # PrivyProvider config (Ethereum mainnet, embedded wallets, OTP email)
│   │   ├── reown-config.ts           # AppKit config (Ethereum mainnet only)
│   │   ├── wallet-adapter.ts         # Internal normalization → { address, signer, chainId }
│   │   ├── wallet-adapter.test.ts
│   │   ├── use-wallet.ts             # Unified hook consumed everywhere downstream
│   │   ├── connect-button.tsx        # Primary CTA opens Privy; secondary link opens Reown
│   │   └── connect-button.test.tsx
│   ├── components/
│   │   ├── app-shell.tsx             # Port from scheduler-dashboard (DS chrome composition)
│   │   ├── app-mark.tsx              # "Cloud Alpha" wordmark
│   │   ├── credit-stats-header.tsx   # Hero: balance + Top-up CTA
│   │   ├── top-up-modal.tsx          # DS Dialog wrapper, owns open state
│   │   ├── top-up-modal.test.tsx
│   │   └── top-up-form.tsx           # Amount + currency picker + live estimation
│   ├── lib/
│   │   ├── token-units.ts            # toSmallestUnit / fromSmallestUnit (BN math)
│   │   ├── token-units.test.ts
│   │   └── route-title.ts            # /credits → "Credits"
│   └── config/
│       ├── apps.ts                   # ACTIVE_APP_ID = "cloud-alpha"
│       └── nav.ts                    # Single section: "Account" → Credits (room to grow)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── BACKLOG.md
│   ├── plans/
│   ├── superpowers/specs/
│   └── smoke/
│       ├── SMOKE.md                  # Flow definitions for /dio:smoke
│       └── WALLET.md                 # Smoke wallet provisioning + re-seeding process
├── scripts/
│   └── deploy-ipfs.py                # Ported from scheduler-dashboard
├── .github/
│   ├── pull_request_template.md      # Mandatory doc checklist
│   └── workflows/
│       ├── deploy.yml                # IPFS deploy (manual workflow_dispatch)
│       └── doc-diff.yml              # CI check: src/ change requires docs/ or CLAUDE.md change
├── CLAUDE.md
└── README.md
```

**Layering rules baked into v0:**

- No `domain/` directory. The source's Manager/Entity pattern is overkill for one surface. Re-evaluate when a second surface (e.g. computing) is added.
- No global Redux/Context state machine. TanStack Query + page-local `useState` is sufficient.
- No multi-chain abstraction. Ethereum is hardcoded; abstract when chain #2 actually lands.
- `wallet/` is its own folder from day one because every future surface depends on it.

---

## §4 — Auth model

**Three connection states, progressive disclosure** — no app-level auth wall.

1. **Disconnected**
   - Hero card body: *"Connect to see your credit balance and top up."*
   - Primary CTA: `Sign in / Connect` → opens Privy modal. Privy is configured for **email login with OTP code** (not magic link), plus social and passkey options.
   - Secondary link below the primary CTA: `Use crypto wallet directly →` → opens Reown modal
   - Rationale: Privy is the default because the v0 audience skews toward customers without an installed wallet; Reown is one click away for the crypto-native minority. OTP-by-email is chosen over magic-link because OTP is materially easier to automate in smoke (read 6 digits from an inbox vs. follow a single-use URL inside a Playwright context).

2. **Connected, wrong chain (not Ethereum mainnet)**
   - Hero card body: *"Switch to Ethereum to continue."*
   - Primary CTA: `Switch to Ethereum` → provider-agnostic switchChain prompt

3. **Connected, Ethereum mainnet**
   - Hero card body: live balance + monthly run-rate (run-rate is `consumed_credits_30d / 30 × 30` — same formula as source)
   - Primary CTA: `Top up credits` → opens top-up modal

**Session priority.** On mount, `useWallet()` checks Privy's `authenticated` state first. If `true` → return Privy wallet. If `false` → check Reown's session. If both empty → disconnected. Both providers never run active simultaneously; the user is in exactly one connection mode at any time.

**Session persistence.** Both providers handle their own localStorage. No custom session layer in `aleph-cloud-app`.

---

## §5 — Data flow (top-up happy path)

```
User clicks "Top up credits"
  → top-up-modal opens with default values { amount: 100 credits, currency: 'ALEPH', chain: 'ethereum' }
  → useTokenEstimation(amount, currency) debounces 300ms
  → POST credit.aleph.im/api/v0/estimation/credit-to-token { credits: 100, currency, chain }
  → response: { tokenAmount: "5.20", tokenAmountSmallestUnit: "5200000000000000000", txPayload: {...} }
  → "Pay 5.20 ALEPH" button enabled
  → user clicks
  → signer = useWallet().signer
  → signer.sendTransaction(txPayload) → returns txHash
  → localStorage.setItem('pendingTxHash', txHash) for resume
  → POST credit.aleph.im/api/v0/payment { txHash, chain, currency }
  → poll status: GET credit.aleph.im/api/v0/payment/{txHash} every 3s, max 60s
  → on confirmed: toast success, modal closes, useCreditBalance invalidates, hero refreshes
  → localStorage.removeItem('pendingTxHash')
```

**Failure paths (all surface as in-modal error states, not console errors):**

- **Wallet rejected** (user closes Privy/Reown confirm sheet) — toast "Top-up canceled", modal stays open with form intact.
- **Insufficient token balance** — estimation succeeds, `sendTransaction` reverts — toast "Not enough ALEPH/USDC in wallet", link to a faucet/exchange in the error toast.
- **credit.aleph.im 5xx** — exponential backoff retry (1s → 2s → 4s, 3 attempts), then "We received your payment but couldn't confirm yet — refresh in a minute" with txHash visible.
- **Page reload mid-flow** — on next mount, check `localStorage.pendingTxHash`; if present, restart polling silently. Surface a banner: *"Resuming your last top-up — checking status…"*

---

## §6 — Testing & smoke

### Unit + hook tests (vitest)

- `credit-client.test.ts` — URL construction, snake/camel transform, error paths
- `token-units.test.ts` — BN math, ALEPH (18 decimals) vs USDC (6 decimals), ceiling rounding
- `use-credit-balance.test.tsx` — disconnected / connecting / connected / error states
- `wallet-adapter.test.ts` — Privy + Reown normalization with both providers mocked

### Component tests (vitest + @testing-library/react)

- `top-up-modal.test.tsx` — validation, debounce, submit-enabled gating, `MIN_CREDITS_TOPUP` enforcement
- `connect-button.test.tsx` — Privy primary visible, Reown link visible, three connection states render correctly

### E2E smoke (`/dio:smoke`, day one)

Skill driver: the globally-installed `/dio:smoke` skill dispatches a Playwright MCP subagent against the deployed app, reading `docs/smoke/SMOKE.md` for flow definitions. The new repo ships `SMOKE.md` from the first PR.

Five flows — only `topup-min-amount` burns credits:

| Flow | What it verifies | Credit cost |
|---|---|---|
| `disconnected-hero` | Page loads, hero shows Connect CTA, no balance leaks | $0 |
| `connect-privy` | Privy modal opens, email/passkey login completes, address resolves, balance loads | $0 |
| `connect-reown-fallback` | "Use crypto wallet" link opens Reown modal (no actual connect) | $0 |
| `open-topup-estimation` | Top-up modal opens, default values populated, estimation fires within 500ms, valid token amount returned | $0 |
| `topup-min-amount` | Full happy path at $1 minimum: sign tx, payment confirmed by credit.aleph.im, balance increases | ~$1 |

**Wallet provisioning:**

- **Email account:** dedicated Gmail (e.g. `aleph-cloud-smoke@gmail.com`) with 2FA enabled and a 16-char **App Password** generated via `myaccount.google.com/apppasswords`. Used for both Privy login and as the IMAP inbox the smoke skill polls.
- **Privy login mode:** OTP code (6-digit), not magic link. Configured in `src/wallet/privy-config.ts` via Privy's `loginMethods` / `email` options. OTP is materially more reliable to automate than chasing magic-link URLs in a Playwright-driven context.
- **Wallet:** Privy-managed embedded wallet on Ethereum mainnet, seeded with real ALEPH/USDC ahead of v0. Approximate cost: $1 per `topup-min-amount` run × frequency of smoke. At 10 runs/day = $10/day. Replenishable on demand.
- **Credentials location:** `~/.config/aleph-cloud-smoke/email.env` with `SMOKE_EMAIL=...` and `SMOKE_EMAIL_APP_PASSWORD=...`. Living under `~/.config/` rather than inside the new repo lets the same creds be reused from worktrees. Gitignored either way.
- **Smoke skill IMAP flow:** during `connect-privy`, the skill (1) submits the email to the Privy modal, (2) opens an IMAP connection to `imap.gmail.com:993` using the env-var creds, (3) polls the inbox every 2s for up to 60s for a message from Privy's noreply address, (4) extracts the 6-digit code from the message body via regex, (5) types it into the OTP field. No second browser tab needed.
- **Re-seeding process** documented in `docs/smoke/WALLET.md` so the test wallet isn't a single-point-of-failure on the user. Includes: where to top up ALEPH/USDC on the mainnet wallet, how to rotate the Gmail app password, what to do if Privy locks the account.

**When smoke runs:**

- On-demand via `/dio:smoke`.
- **Mandatory step in `/dio:ship`** (ported from this repo). A smoke gate sits between `pnpm check` and the push step. No merge without smoke pass.
- Not automated in CI for v0 — real wallet + real network state makes CI orchestration brittle. Revisit in v0.5.

---

## §7 — Parked items (BACKLOG seed)

Items deliberately out of v0, logged in the new repo's `docs/BACKLOG.md` on day one:

**Needs planning:**
- CreditHistory, RecentPurchases, ServiceCosts (v0.5)
- CreditTransfer modal (v0.5)
- Multi-chain support (Avalanche, Base, Solana, Superfluid streams when PAYG returns)
- Computing / hosting / storage / domain / permissions / settings ports (v1+)
- Cross-app WalletConnect session sharing across ProductStrip apps
- Landing page (`/`) — does Cloud Alpha need one, or `/` → `/credits` redirect?
- CI-automated smoke (currently on-demand only)

**Roadmap ideations:**
- ExpiringBalances surface — only re-enters scope if hold tier ever returns
- Recharts-based usage charts — likely replaced by the SVG primitives this repo already owns

---

## §8 — Documentation as a first-class constraint

Docs serve two audiences in parallel: human developers onboarding, and AI agents working through tasks across sessions. Both need docs that are accurate or they actively mislead. **Treat docs like tests — if the doc is wrong, the change is not done.**

### Doc set (mirrors this repo, plus smoke)

| File | Purpose | Primary audience |
|---|---|---|
| `README.md` | Quick start, run commands, deploy | Humans |
| `CLAUDE.md` | Working habits, current features, finishing flow, project context | Agents (primarily) |
| `docs/ARCHITECTURE.md` | Patterns, component structure, recipes — answers "how does X work?" | Both |
| `docs/DECISIONS.md` | Decisions with rationale — answers "why did we do X?" | Both |
| `docs/BACKLOG.md` | Deferred ideas, triaged (Ready / Needs planning / Roadmap / Completed) | Both |
| `docs/plans/` | Per-feature implementation plans — handoff artifacts between sessions | Agents |
| `docs/superpowers/specs/` | Design specs from brainstorming | Both |
| `docs/smoke/SMOKE.md` | Flow definitions for `/dio:smoke` | Agents (primarily) |
| `docs/smoke/WALLET.md` | Smoke wallet provisioning, top-up procedure | Humans |

### Enforcement — mandatory, not aspirational

1. **PR template** (`.github/pull_request_template.md`) with explicit doc-update checklist (ARCHITECTURE / CLAUDE / DECISIONS / BACKLOG / SMOKE). PR cannot be marked ready without ticks.
2. **CI doc-diff check** (`.github/workflows/doc-diff.yml`) — if any file under `src/` changed AND no file under `docs/` OR `CLAUDE.md` changed, the job fails. Opt-out via `[no-doc]` in the PR title for trivial changes (typos, lockfile bumps, dependency-only updates).
3. **CI smoke-coverage check** — extension of the doc-diff workflow: if any file under `src/app/` or `src/components/` changed and `docs/smoke/SMOKE.md` didn't, the job fails. Same `[no-doc]` opt-out.
4. **`/dio:ship` skill ported** to the new repo. Runs the same doc audit against `git diff main...HEAD` before push/PR. Catches drift even when CI is green (outdated lines about removed features).
5. **Per-file isolation docstring** — every exported component / hook / lib module starts with a 4–8 line JSDoc block answering: *what does it do, how do you use it, what does it depend on*. This is the brainstorming skill's "design for isolation" principle codified as a file convention. Makes the codebase agent-navigable: 200 LOC of headers tells you the system.
6. **Decisions logged on-the-spot** via Claude's auto-detection of trigger phrases ("decided", "rejected", "let's go with", "actually, let's") — same pattern as scheduler-dashboard's CLAUDE.md.

### What this buys concretely

- New agents (or contributors) can `sync up` from cold start.
- Plan files in `docs/plans/` survive session compaction; a fresh session can resume implementation.
- The decisions log prevents going in circles.
- Cross-references work: "this implements `docs/superpowers/specs/2026-05-26-cloud-alpha-credits-v0-design.md`" is a real link.

### Anti-patterns banned from day one

- Code comments explaining WHAT (delete; names + isolation docstring carry it)
- Sprawling README sections that drift from CLAUDE.md — CLAUDE.md is canonical, README points to it
- Multiple sources of truth for the same fact (ARCHITECTURE → patterns, DECISIONS → why; never both)
- Docs added "later" in a cleanup PR — they're part of the original PR or the PR doesn't merge

---

## Roadmap

Six phases, mostly sequential because each builds on the previous. ~10–12 days of focused work for v0.

### Phase 0 — Bootstrap (1–2 days, no dependencies)

- Create `~/repos/aleph-cloud-app` via `bootstrap-project` skill (reads `~/repos/claude-project-template/`)
- Port `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config`, `vitest.config.ts`, `oxlint` config from scheduler-dashboard
- Initialize `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md` (seed with the parked items above), `docs/plans/`, `docs/superpowers/specs/`, `docs/smoke/SMOKE.md` (empty stub), `docs/smoke/WALLET.md` (documents the Gmail + IMAP + app-password + OTP setup)
- Add a small IMAP helper for the smoke skill (`scripts/smoke-imap-fetch.ts` or similar) that connects to `imap.gmail.com:993` using `SMOKE_EMAIL` / `SMOKE_EMAIL_APP_PASSWORD` env vars from `~/.config/aleph-cloud-smoke/email.env`, polls for the most recent Privy noreply message, and prints the extracted 6-digit OTP code. The smoke skill's Playwright subagent shells out to this helper during `connect-privy`.
- Create `.github/pull_request_template.md` with mandatory doc checklist
- Create `.github/workflows/doc-diff.yml` (src/ → docs/ enforcement)
- Port `scripts/deploy-ipfs.py` and `.github/workflows/deploy.yml`
- Wire `/dio:smoke` skill to read this new repo's `docs/smoke/SMOKE.md`
- First commit + push to GitHub

**Exit gate:** repo exists, `pnpm dev` runs an empty Next 16 app, `pnpm check` passes (lint + typecheck + test all green on zero LOC).

### Phase 1 — Chrome integration (1 day, depends on Phase 0)

- Add `app-shell.tsx`, `app-mark.tsx` (ported from scheduler-dashboard with `Cloud Alpha` wordmark)
- Add `ProductStrip` + `AppShellSidebar` + `PageHeader` from `@aleph-front/ds`
- `src/config/apps.ts` — all four ProductStrip entries; `ACTIVE_APP_ID = "cloud-alpha"`
- `src/config/nav.ts` — one section ("Account") with one entry ("Credits")
- `theme-toggle.tsx` (port)
- Empty `/credits` page rendering placeholder hero card
- Smoke flow #1 (`disconnected-hero`) added to `SMOKE.md` and passes
- Docs in same PR: ARCHITECTURE adds "App Shell" section, DECISIONS logs stack choices

**Exit gate:** deployed app shows chrome + empty credits page; smoke flow 1 passes.

### Phase 2 — Wallet adapter (3–4 days, depends on Phase 1)

- `src/wallet/privy-config.ts` + `PrivyProvider` wrapped in `app/layout.tsx`. Configured for OTP-by-email (not magic link), plus social and passkey login methods.
- `src/wallet/reown-config.ts` + Reown AppKit init
- `src/wallet/wallet-adapter.ts` — internal normalization
- `src/wallet/use-wallet.ts` — unified hook, Privy-first session priority
- `src/wallet/connect-button.tsx` — Primary Privy + secondary Reown link
- Tests: `wallet-adapter.test.ts` (mocked providers, both paths)
- Smoke flows #2, #3 (`connect-privy`, `connect-reown-fallback`) added and passing
- Docs: ARCHITECTURE adds "Wallet Adapter" pattern, DECISIONS logs Privy-primary choice

**Exit gate:** real Privy login works end-to-end; Reown link opens its modal; smoke flows 2+3 pass.

### Phase 3 — Credit backend + balance (2 days, depends on Phase 2)

- `src/api/credit-client.ts` — REST client for credit.aleph.im
- `src/api/credit-types.ts` — Balance, TokenEstimation, PaymentRequest types
- `src/lib/token-units.ts` — BN math ported from source's `domain/credit.ts`
- `src/hooks/use-credit-balance.ts` — depends on `useWallet`, 30s poll
- `src/components/credit-stats-header.tsx` — hero card with balance display (Top-up CTA disabled this phase)
- Tests: `credit-client.test.ts`, `token-units.test.ts`, `use-credit-balance.test.tsx`
- Smoke: balance display verified inside `connect-privy` flow
- Docs: ARCHITECTURE adds "Credit Backend" section

**Exit gate:** logged-in user sees their real ALEPH/USDC credit balance; smoke flow 2 now also verifies balance render.

### Phase 4 — Top-up modal (3–4 days, depends on Phase 3)

- `src/components/top-up-modal.tsx` — DS Dialog wrapper, owns open state
- `src/components/top-up-form.tsx` — amount input, currency picker, live estimation
- `src/hooks/use-token-estimation.ts` — debounced POST
- localStorage `pendingTxHash` resume on mount
- Tests: `top-up-modal.test.tsx`, `top-up-form.test.tsx`
- Smoke flows #4, #5 (`open-topup-estimation`, `topup-min-amount`) added and passing
- Docs: ARCHITECTURE adds "Top-up Flow" section, DECISIONS logs the resume strategy

**Exit gate:** real $1 mainnet top-up completes end-to-end; balance increases by 1,000,000 credits; smoke flows 4+5 pass.

### Phase 5 — ProductStrip integration into Network (0.5 day, depends on Phase 4 deployed)

- In **this repo**: add `Cloud Alpha` entry to `src/config/apps.ts` (external link to deployed new app URL)
- This repo's `CLAUDE.md` Current Features updated
- Single small PR through `/dio:ship`

**Exit gate:** ProductStrip in scheduler-dashboard now shows five tabs (Cloud · Network · Cloud Alpha · Explorer · Swap); clicking Cloud Alpha lands on the new app.

### Phase 6 — Smoke verification + open-question triage (0.5 day, depends on Phase 5)

- Run `/dio:smoke` end-to-end against deployed Cloud Alpha
- Fix any flow that breaks
- Triage open questions surfaced during phases 1–5; either log to BACKLOG or fix
- Update DECISIONS with anything load-bearing learned during implementation

**Exit gate:** full smoke pass; v0 declared done; v0.5 planning starts.

### Dependencies graph

```
Phase 0 ── Phase 1 ── Phase 2 ── Phase 3 ── Phase 4 ── Phase 5 ── Phase 6
```

Strictly sequential. The only parallelism opportunity: Phase 5 (this repo) can be drafted as a PR while Phase 4 is being finalized in the new repo, as long as the deployed URL is locked.

### Priorities

| Priority | Phases | Rationale |
|---|---|---|
| **P0 — must ship v0** | 0, 1, 2, 3, 4 | Everything needed to top up credits |
| **P1 — completes v0** | 5, 6 | ProductStrip integration + smoke verification; finishes the loop |
| **P2 — v0.5 candidates** | CreditHistory, RecentPurchases, ServiceCosts, CreditTransfer | First batch of read-only surfaces + transfer |
| **P3 — v1+** | Computing, hosting, storage, domain, permissions, settings | Full console parity |
| **P4 — long horizon** | Multi-chain, cross-app sessions, CI-automated smoke | Strategic, not blocking |

---

## Open questions

These do not block the spec or the plan, but should be tracked in `docs/BACKLOG.md` once the new repo exists:

1. **Repo name** — `aleph-cloud-app` is the suggested working name. User may prefer `cloud.aleph` / `aleph-cloud-v2` / something else.
2. **Deployed URL** — placeholder for now; needs to be locked before Phase 5.
3. **Landing page (`/`)** — redirect to `/credits` when disconnected? Or a marketing-style intro? Affects Phase 1 scope minimally.
4. **`MIN_CREDITS_TOPUP`** — defaults to $1 per the source; confirm whether the new credit backend has the same floor.
5. **CSS variable token enforcement** — port `scripts/check-css-tokens.ts` from this repo (Decision #100) so `pnpm check` catches phantom token references on day one.
6. **Smoke Gmail account** — needs to be created by user before Phase 0 wraps. App password generated, creds written to `~/.config/aleph-cloud-smoke/email.env`. Account also funded with mainnet ALEPH/USDC for Phase 4's `topup-min-amount` smoke flow.

---

## Out of scope explicitly

To prevent scope creep:

- Anything from the old `front-aleph-cloud-page` not listed in this doc
- Anything that requires a third payment method (hold or PAYG) to function
- Anything that requires a chain other than Ethereum mainnet
- Any cross-repo coordination beyond Phase 5's ProductStrip edit

---

## Glossary

- **Cloud Alpha** — working name of the new app being built. Renamed to "Cloud" once parity is reached.
- **`@aleph-front/ds`** — the design system used by this repo and the new app. Different from `@aleph-front/core` (used by the old `front-aleph-cloud-page`).
- **`feat/credits-ui` branch** — the credits-only WIP branch on `aleph-im/front-aleph-cloud-page`. Reference for design intent in Phase 2–4. NOT `main`, which still has hold-tier and PAYG code paths.
- **Credits** — Aleph's unit of paid usage. 1 credit = $0.000001 (10⁻⁶ USD). `MIN_CREDITS_TOPUP = 1,000,000` = $1.
- **Privy** — embedded-wallet provider supporting email / social / passkey login.
- **Reown** — WalletConnect-derived provider for external wallets (MetaMask, etc.).
- **`/dio:smoke`** — globally-installed Claude Code skill that runs Playwright MCP against a deployed app, driven by `docs/smoke/SMOKE.md`.
- **`/dio:ship`** — globally-installed skill that runs the end-to-end ship sequence (doc audit → `pnpm check` → smoke → push → PR → squash-merge → cleanup).
