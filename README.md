# Scheduler Dashboard

Operations dashboard for monitoring the [Aleph Cloud](https://aleph.im/) scheduler — node health, VM scheduling, and real-time events. Hosted as a static export on IPFS.

## Features

- Overview page with stat cards, node health bar, VM allocation summary, and event feed
- Nodes page with sortable/filterable table, resource usage bars, and detail panel
- VMs page with sortable/filterable table, discrepancy highlighting, and detail panel
- Cross-page navigation via URL search params (overview cards link to filtered lists, detail panels cross-link)
- Dark theme by default with light/dark toggle
- Responsive layout: off-canvas sidebar on mobile, inline on desktop
- Static export for decentralized IPFS deployment

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, static export) |
| Language | TypeScript (strict, ESM only) |
| Styling | Tailwind CSS 4 + [@aleph-front/ds](https://github.com/cpascariello/aleph-cloud-ds) |
| Data | TanStack React Query (client-side polling) |
| Deployment | Static export to IPFS |

## Getting Started

### Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/)
- [@aleph-front/ds](https://github.com/cpascariello/aleph-cloud-ds) cloned at `../aleph-cloud-ds`

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

The dev server starts with Turbopack. By default, mock data is used — set `NEXT_PUBLIC_USE_MOCKS=false` and `NEXT_PUBLIC_API_URL` to connect to a live scheduler API.

### Build

```bash
pnpm build
```

Outputs a static site to `out/` ready for IPFS deployment.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Static export to `out/` |
| `pnpm test` | Run tests (Vitest) |
| `pnpm lint` | Lint (oxlint) |
| `pnpm typecheck` | Type check (tsc) |
| `pnpm check` | Lint + typecheck + test |

## Project Structure

```
src/
├── app/           # Next.js App Router pages (Overview, Nodes, VMs)
├── api/           # API client, types, mock data
├── hooks/         # React Query hooks with automatic polling
├── components/    # Dashboard-specific compositions
└── lib/           # Formatting utilities
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed patterns and recipes.

## License

Private.
