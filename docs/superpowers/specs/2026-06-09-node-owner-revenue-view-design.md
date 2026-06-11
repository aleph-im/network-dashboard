# Node Owner Revenue View — Design

**Date:** 2026-06-09
**Status:** Approved (brainstorm complete) — ready for implementation plan
**Author:** Claudio + Claude (brainstorming session)

---

## Goal

Give node owners a complete, source-of-truth revenue view. Today the dashboard
**reconstructs** reward distribution client-side from raw credit-expense messages
using a hardcoded split (60/15/20 execution, 75/20 storage, 5% dev). That
reconstruction:

1. **Omits the wage subsidy entirely** — ~18–22% of node-owner revenue is
   invisible. (Sample address: 44,799 of 254,681 ALEPH; network-wide: 201,644 of
   914,049.)
2. **Can drift** from the protocol's real algorithm, which the backend now owns
   and publishes (`algoVersion: v2`).

This migration re-sources reward numbers from the protocol's authoritative feeds
and adds a payout-cycle-centric owner view: *"this much from the minimum wage,
this node earns this, that node that — totals to X right now; next payment in N
days; the total climbs until payout, then resets."*

## Scope

**Phase 1 (this effort):**
- **① Owner revenue view** — the Wallet page's rewards section, rebuilt as a
  payout-cycle revenue view.
- **② Node Earnings tab** — `/nodes?view=<hash>&tab=earnings`, re-sourced from the
  authoritative feeds (KPI, by-source, and the per-node ALEPH-over-time chart).

**Phase 2 (follow-up, after Phase 1 ships — logged to BACKLOG):**
- **③ Credits page** — recipient table (needs ≤100-address batching), flow
  diagram, summary cards.
- **④ Network detail panels** — CRN/CCN earnings sparklines.

Phases ③/④ keep reading the old reconstruction until migrated; they will look
slightly inconsistent with ①/② in the interim. Accepted.

## Data sources (both verified live)

### A. Rewards time-series API — continuous accrual + by-source + per-role

`GET https://credit.aleph.im/api/v0/rewards/time-series` (swagger:
`https://credit.aleph.im/api/docs/swagger.json`, "Aleph Credit API" v0.1.0,
`algoVersion: v2`).

Params: `from`/`to` (ISO-truncated or epoch, clamped to `DATA_START =
2026-05-01T00:00:00Z`), `bucketSize` (`Nh`/`Nd`/`1w`/`Nmo`/`1y`; day/month/year
buckets are UTC-calendar-aligned; max 10k buckets), `address` (≤100, CSV or
repeated), `detail` (`0`=`{aleph}`, `1`=+`bySource`, `2`=+`full` per-role),
`byAddress` (0/1/2; ignored for single-address), `sources` (CSV filter).

Response (`detail=2`, single address): `total` and per-`buckets` entries each
carry:
- `totals.aleph`
- `bySource`: `{ credit_revenue, holder_tier, wage_subsidy }`
- `full`: per-role split —
  - `credit_revenue` / `holder_tier` → `execution_crn`, `execution_ccn`,
    `execution_staker`, `storage_ccn`, `storage_staker`
  - `wage_subsidy` → `crn`, `ccn`, `staker`

`full` sums to the source total **with no dev-fund deducted** (the 5% dev fund is
not a node-owner reward; correctly absent from this feed).

Three sources map to:
| API source | Old dashboard concept |
|------------|-----------------------|
| `credit_revenue` | `expense.credits[]` (customer-paid) |
| `holder_tier` | `expense.hold[]` (protocol-subsidized legacy holders) |
| `wage_subsidy` | **not modeled today** — the "minimum wage," decaying to zero |

### B. FOUNDATION distribution messages — cycle boundary + last paid + on-chain status

Aleph POST messages on api2: sender+owner
`0x3a5CC6aBd06B601f4654035d125F9DD2FC992C25`, channel `FOUNDATION`,
**`post_type: credit-rewards-distribution`** (the new type — replaces the legacy
`staking-rewards-distribution`; filter on the new one), tags `[distribution,
credits, mainnet]`.

Two streams exist: `calculation` (intermediate computations) and
`status: distribution` (actual payouts). We anchor on **distribution** messages.

Content carries:
- `start_time` / `end_time` — the cycle period. First credit cycle:
  2026-05-01 → 2026-06-01 (a full month, since credits launched 05-01);
  subsequent cycles ~10 days.
- `rewards` — `{ address → total_aleph }` (~347 addresses): the per-address payout
  total (flat number; **no by-source breakdown here** — that comes from the
  time-series API).
- `targets` — on-chain transfer batches (≤200 addresses each), each with `chain`,
  `tx`, `status` (`pending`/confirmed), `success`, `contract_total`, `total`, and
  `targets: { address → amount }`. Source for **last-paid amount + tx status** per
  address.
- `total` — `{ bySource, full, totals }` (same shape as the time-series API; the
  network rollup for the cycle).
- `wage_subsidy` — `{ start_t_months, end_t_months, period_total_aleph,
  split: { ccn, crn, staker }, unallocated_aleph }`. The decay schedule
  (`*_t_months` parameterize how far along the wage decay is); `split` is equal
  thirds across roles.

### C. api2 credit-expense feed — per-node attribution weights (existing)

Sender `0x6aeaEEb08720DEc9d6dae1A8fc49344Dd99391Ac`, `aleph_credit_expense`
POSTs, already consumed via `getCreditExpenses` / `parseCreditMessage`. Used only
to derive **per-node weights** for apportioning the authoritative per-address
role totals:
- **Execution messages** carry `node_id` + `execution_id` on **100%** of
  `credits[]` and `hold[]` entries → CRN execution is **directly per-node** (and
  per-VM), even when one reward address owns many CRNs.
- **Storage messages** carry **no** `node_id` → storage/CCN is a score-weighted
  pool split (corechannel scores via `useNodeState`, as today).

## Architecture — shared data layer

Both Phase-1 surfaces consume one layer, so owner totals and per-node numbers
always reconcile.

### Hooks

- **`useRewards(address, window)`** — wraps the time-series API (`detail=2`) for a
  caller-supplied window. The owner view passes the **current cycle**
  (`from` = latest distribution `end_time`, `to` = now). The Node Earnings tab
  passes its **selected range** (24h/7d/30d). Returns the authoritative
  per-address total, `bySource`, per-role `full`, and a bucketed series
  (bucketSize chosen per window: `1h`×24 for 24h, `1d` for 7d/30d, UTC-aligned).
  The tab resolves its node's **reward address** first (via `nodeState`), queries
  per-address, then apportions to the node.
- **`useDistributions()`** — fetches FOUNDATION `credit-rewards-distribution`
  messages (newest first). Returns: latest cycle `{ start_time, end_time }`,
  per-address `lastPaid` (`{ aleph, time, tx, status }` from `rewards` + matching
  `targets` entry), the cadence estimate, and the wage-decay context. The
  scheduler WebSocket layer (`scheduler-ws.ts`) is **not** the right channel
  (different sender); instead poll these messages on the credits cache cadence
  and optionally subscribe via api2 websocket later (see Open Questions). When a
  newer distribution appears, `useRewards`'s cycle window shifts → "owed this
  cycle" resets to ~0 automatically.

### Apportionment (replaces the hardcoded split)

New pure module (e.g. `src/lib/reward-apportionment.ts`) — given the
authoritative per-address role totals (from `useRewards`), the api2 expense
entries, and `nodeState`:
- **CRN execution** (`credit_revenue.execution_crn + holder_tier.execution_crn`):
  split across the address's CRNs by each CRN's share of the address's execution
  `node_id` ALEPH in the same window (exact, direct attribution).
- **CCN** (`execution_ccn + storage_ccn`): split across the address's CCNs by
  `computeScoreMultiplier(score)` weight.
- **Wage** (`wage_subsidy.crn` / `.ccn`): apportioned across the address's CRNs /
  CCNs by the same weights as above (proxy — wage has no per-node grain).
- **Staker** (`execution_staker + storage_staker + wage_subsidy.staker`): the
  address's staking line (not per-node).

Output sums **exactly** to the authoritative per-address total. The hardcoded
`STORAGE_CCN_SHARE` / `EXECUTION_CRN_SHARE` / … constants and the per-expense
re-derivation in `credit-distribution.ts` are **removed** for Phase-1 consumers
(kept only where Phase-2 surfaces still use them, then removed in Phase 2).

### Accuracy model

- **Per-address totals & by-source:** exact (source of truth).
- **Per-CRN execution:** exact (api2 `node_id`).
- **Per-CCN, storage, and all wage per-node figures:** apportioned by score /
  execution-share weights — accurate at the address level, approximate at the
  per-node level for multi-node addresses. Documented in the footnote.

## ① Owner revenue view (Wallet page)

Replaces the existing "credit rewards (24h)" section. Cycle-centric (no range
toggle). Composition (approved hero):

- **Owed this cycle** — live-accruing per-address total (from `useRewards`), with
  a fill bar and **next payment ~`<date>` (in N days)**, "cycle started
  `<start>`", and a "resets when next distribution publishes" note.
- **Last payment** panel — amount + date + on-chain status (pending/confirmed)
  + tx link, from `useDistributions().lastPaid`.
- **By source** — inline 3-segment bar + caption: 🟢 Credits · 🟣 Holder ·
  🟡 Min. wage, with a "wage decaying → 0" hint.
- **By node** — each owned node (CRN/CCN) with its apportioned total and a small
  per-source caption, plus a staking line.

Entry point unchanged: `/wallet?address=0x…` (reached from node/VM owner links).

## ② Node Earnings tab

Re-sourced from the shared layer. Keeps its 24h/7d/30d range selector and the
dual-line chart (ALEPH vs VM count).

- **KPI "ALEPH accrued"** — from `useRewards` (exact, incl. wage), with the
  **inline by-source bar + caption** (treatment A) directly beneath it.
- **Per-node ALEPH-over-time chart (fully re-sourced — decision A):** for each
  bucket, the API's per-address per-bucket role totals are apportioned across the
  node via the per-bucket api2 weights, so the chart reconciles exactly with the
  KPI and includes the node's wage slice. The VM-count secondary line is
  unchanged.
- **Reconciliation card** (this node / other same-kind / cross-kind / staking)
  stays — it's a different axis (where money flows), now fed by the apportioned
  authoritative numbers.
- **Per-VM breakdown** (CRN) stays, sourced as today from execution
  `execution_id` attribution.

## Cycle / countdown mechanics

- **"Owed this cycle"** window = `[latest distribution end_time, now]`.
- **Reset:** a newer `credit-rewards-distribution` message shifts the window;
  accrual restarts from ~0. (This is the "reset the count" mechanic from the
  Claudio↔Angelillou exchange, 2026-06-09.)
- **Next-payment estimate:** `end_time + ~10 days` (working cadence; the first
  credit cycle was a month because the system launched mid-cycle). Displayed as
  an estimate ("~`<date>`"); never relied on for correctness because the real
  message resets us. If the estimate elapses with no new distribution, show
  "payment due / awaiting distribution."
- **Time alignment:** all windows use the API's UTC-calendar-aligned buckets and
  respect `DATA_START = 2026-05-01`.

## Footnote / copy

Replace "Numbers reflect what this node earned, not yet paid on-chain." with copy
that states: figures are **owed** (accrued from the protocol's authoritative
rewards feed, `algoVersion v2`), the wage subsidy is included and decays over
time, per-node figures for multi-node addresses are apportioned, and the last
payment row reflects the on-chain distribution status.

## Types / data model

- `RewardSource = "credit_revenue" | "holder_tier" | "wage_subsidy"`.
- `BySource = Record<RewardSource, number>`; `RoleFull` per the API `full` shape.
- `OwnerRewards = { address, cycleStart, cycleEnd, total, bySource, byNode:
  NodeReward[], staking, lastPaid?: { aleph, time, tx, status } }`.
- `NodeReward = { hash, name, role, total, bySource }`.
- New wire types for the time-series response and the distribution message in
  `src/api/credit-types.ts`; new client fns in `src/api/client.ts`
  (`getRewardsTimeSeries`, `getDistributions`).

## Testing

- **Pure apportionment lib:** unit tests — single-node address (exact), multi-CRN
  address (sums to authoritative total; CRN split matches node_id weights),
  multi-CCN address (score-weighted), wage apportionment, staking-only address,
  zero/empty windows.
- **Wire parsing:** time-series response (detail 0/1/2), distribution message
  (`rewards`, `targets` tx/status, wage block) — fixtures from the live samples
  captured this session.
- **Hooks:** `useRewards` window derivation from latest distribution;
  `useDistributions` lastPaid join (rewards ↔ targets), cycle reset on a newer
  message; cadence/next-payment estimate.
- **Components:** owner view by-source/by-node render + last-payment states
  (pending/confirmed/none); Node Earnings tab KPI + by-source bar; re-sourced
  chart reconciles with KPI total.
- Reuse existing test patterns; mock network at the client boundary.

## Out of scope (Phase 2 — to BACKLOG)

- Credits page migration (recipient table ≤100-address batching, flow diagram,
  summary cards).
- Network detail panel sparklines.
- USD valuation, payout history list (only the single last payment is shown in
  Phase 1).
- Optimistic per-event WS updates for distributions.

## Open questions (non-blocking)

1. **Exact next-cadence confidence** — once a second credit-era distribution
   lands, confirm the ~10-day interval. The design tolerates drift (resets on the
   real message), so this only sharpens the estimate.
2. **WS vs poll for distributions** — *Decided:* Phase 1 polls FOUNDATION
   distribution messages on the credits cache cadence; the polling hook stays
   permanently as the fallback. A dedicated api2 websocket subscription is
   deferred to Phase 2 — confirmed additive (invalidates the same query key,
   reuses the same parser), so no Phase-1 rework.
