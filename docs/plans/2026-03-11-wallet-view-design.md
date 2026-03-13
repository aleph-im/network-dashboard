# Wallet View — Design Spec

**Date:** 2026-03-11
**Status:** Approved

## Purpose

Ops-focused wallet view for investigating what a specific wallet owns and does on Aleph Cloud. Entry point for troubleshooting: "what resources does this wallet have, what's their status, and what has the user been doing?"

## Route & Entry Points

**Route:** `/wallet?address=0x...`

**Entry points** — every wallet address in the dashboard becomes a clickable `<Link>` to the wallet view:
- Node detail view/panel: `owner` field
- Node table: `owner` column (if visible)
- Latest VMs card: `sender` from api2 message data

## Data Sources

| Data | Source | Endpoint |
|------|--------|----------|
| Owned nodes | Scheduler API | `useNodes()` filtered client-side by `owner === address` |
| Created VMs | api2 + Scheduler | `/api/v0/messages.json?addresses=<addr>&message_types=INSTANCE,PROGRAM` → cross-ref `useVMs()` for scheduler status |
| Activity | api2 | `/api/v0/messages.json?addresses=<addr>` (all message types) |
| Permissions granted | api2 | `/api/v0/authorizations/granted/<addr>.json` |
| Permissions received | api2 | `/api/v0/authorizations/received/<addr>.json` |

## Page Layout

### Header

- Wallet address: full, copyable via DS `CopyableText`, with external link to `https://explorer.aleph.cloud/address/ETH/<address>`
- Summary stat row: node count, VM count, permissions granted count, permissions received count

### Nodes Section (hidden if none)

- Table: hash, name, status (StatusDot), VM count, last updated
- Clickable rows → `/nodes?view=hash`
- Uses existing `status-map.ts` for StatusDot/Badge variants

### VMs Section (hidden if none)

- Table: hash, name (from api2 `content.metadata.name`), type, scheduler status (Badge), allocated node, last updated
- VMs not found in scheduler show a "not tracked" indicator (VM may have been forgotten/deleted from the network)
- Clickable rows → `/vms?view=hash` (for scheduler-tracked VMs)

### Activity Section

- Chronological table: timestamp (relative), type (Badge), name/description, hash (truncated, copyable)
- Type badges with distinct colors: INSTANCE, PROGRAM, STORE, AGGREGATE, POST, FORGET
- For INSTANCE/PROGRAM rows, show scheduler status badge inline
- Each row links to Explorer message page: `https://explorer.aleph.cloud/address/{chain}/{sender}/message/{type}/{item_hash}`
- Manual **refresh button** in section header — for live troubleshooting (ops can follow user actions in real-time during investigation)
- Default sort: newest first
- Paginated if large (reuse `usePagination`)

### Permissions Section

Two cards side by side (stacked on mobile):

**Granted** — addresses this wallet has authorized:

| Address | Permissions |
|---------|-------------|
| `0xeA24...CAeD` | channels: `libertai`, `libertai-chat-ui` |
| `0x27fa...22a0` (alias: "Dev machine") | types: `STORE` |

**Received** — addresses that have authorized this wallet:

| Address | Permissions |
|---------|-------------|
| `0x2E44...c1dC` | types: `POST`, channels: `ALEPH_CREDIT`, post_types: `aleph_credit_transfer` |
| `0xFba5...ae2A` | types: `AGGREGATE`, aggregate_keys: `pricing`, `settings`, `backoffice` |

Each row shows:
- Address (clickable → `/wallet?address=...` for wallet-to-wallet navigation)
- Alias (if present)
- Inline scope details: types, channels, post_types, aggregate_keys as tags/badges
- External link to Explorer wallet page for more granularity

## Data Flow

1. **Nodes:** Filter existing `useNodes()` cache by `owner === address`. No extra API call — just client-side filter on React Query cache.
2. **VMs:** Fetch from api2 `?addresses=&message_types=INSTANCE,PROGRAM` (paginated, batched). Cross-reference each `item_hash` against `useVMs()` cache for scheduler status. Unmatched hashes = "not tracked".
3. **Activity:** Fetch from api2 `?addresses=` (all message types). Display message-level metadata only — no deep content parsing. `staleTime: 5min`, `refetchInterval: false`, manual `refetch()` wired to refresh button.
4. **Permissions:** Two parallel fetches to authorization endpoints. Simple display, no polling. Paginated if the endpoint supports it.

## New Code

| File | Purpose |
|------|---------|
| `src/app/wallet/page.tsx` | Page component |
| `src/hooks/use-wallet.ts` | `useWalletNodes()`, `useWalletVMs()`, `useWalletActivity()`, `useAuthorizations()` |
| `src/api/client.ts` | `getWalletMessages()`, `getAuthorizations()` |
| `src/api/types.ts` | `Authorization`, `AuthorizationResponse`, extended `AlephMessage` |
| Existing detail components | Make owner/sender addresses into `<Link>`s to `/wallet?address=...` |

## External Links

- **Wallet header** → `https://explorer.aleph.cloud/address/ETH/{address}`
- **Activity rows** → `https://explorer.aleph.cloud/address/{chain}/{sender}/message/{type}/{item_hash}`
- **Permission addresses** → Explorer wallet page for each address

## Not in Scope

- Wallet balance / ALEPH staking / transaction history (backlogged as "Wallet identity hub")
- Auto-polling on activity (manual refresh only)
- Deep message content parsing (metadata only: type, name, timestamp)
- VM management actions (create/delete/restart)
