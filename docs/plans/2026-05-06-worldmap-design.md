# Worldmap card — design

**Date:** 2026-05-06
**Status:** brainstormed, awaiting plan
**Figma:** https://www.figma.com/design/mHjnzkYvxwWjDbBjAqbZ2g/Untitled?node-id=10-3

## Context

The Overview page currently shows 8 stat cards (4 nodes, 4 VMs) above a two-column row of activity cards (Top Nodes, Latest VMs). The user has a new card design for a world map of Aleph Cloud nodes — green dots clustered roughly where nodes physically run, intended as a glanceable "footprint of the network" view. The Overview hero will be restructured to make room.

## Goals

- Plot every active CRN and CCN as a dot on a static world map.
- Use country-level granularity (no city accuracy needed); when many nodes share a country, scatter dots tightly around the country centroid with a deterministic per-hash offset.
- Show subtle activity (gentle dot flicker) without becoming distracting.
- Ship the expand button disabled with a "Coming soon" tooltip — the rich interactive version (planned in D3.js) is out of scope for v1.
- Restructure the Overview hero per design: left half = 2×2 stat grid, right half = worldmap card.

## Non-goals (v1)

- Hover tooltips, click-to-detail, or any dot interaction.
- Zoom, pan, or any expanded view.
- IPv6-only nodes (CCN multiaddrs use `/ip4/`; revisit if `/ip6/` appears).
- City-level accuracy.
- Showing the four cards being dropped from the hero (Unreachable / Removed nodes, Missing / Unschedulable VMs) — they remain accessible via the Nodes and VMs list pages.

## Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Which nodes? | CRN + CCN, single green color (matches design). |
| Q2 | Placement? | Restructure Overview hero: 2×2 stat grid (Total Nodes / Healthy / Total VMs / Dispatched) on the left half, worldmap on the right half. Existing Top Nodes / Latest VMs row stays below. |
| Q3 | Status filter? | All non-removed (`inactive_since == null`). The map's job is "where the network is", not health. |
| Q4 | Dot interaction? | None in v1. Add subtle per-dot flicker animation (hash-seeded delay, 4–6s opacity cycle, respects `prefers-reduced-motion`). |
| Q5 | DNS resolution? | Build-time pre-resolution. `prebuild` script writes `public/node-locations.json` keyed by node hash. Runtime is a static import. New nodes added between IPFS deploys won't appear until the next deploy — accepted trade-off for zero runtime DNS and zero external dependency. |
| Q6 | Scatter style? | Tight scatter around country centroid; deterministic per-hash offset so dots don't jitter on reload. |

## Architecture

Two cleanly-split concerns:

### Build-time snapshot

`scripts/build-node-locations.ts`, wired into `package.json` as a `prebuild` step (also runnable as `pnpm build:locations`):

1. `fetch('https://api2.aleph.im/api/v0/aggregates/<corechannel-sender>.json?keys=corechannel')`
2. For each **CCN**: regex `multiaddress` for `/ip4/(\d+\.\d+\.\d+\.\d+)/` → IP. Skip if absent or empty.
3. For each **CRN**: parse hostname from `address` (HTTPS URL), `await dns.resolve4(hostname)` → IP. Skip if no `address` or DNS NXDOMAIN/timeout.
4. Run each IP through bundled `ip3country` → ISO-3166 alpha-2 country code.
5. Write `public/node-locations.json` shape `{ "<hash>": { "country": "US" } }`. Country code only — no IP stored (keeps the JSON ~5KB; redundant since IPs already public on api2).

**Safety guard:** if the new dataset contains fewer than 50% of last run's entries, abort and keep the existing JSON. Prevents a network catastrophe from clobbering a good snapshot.

**Failure handling:**
- api2 unreachable → keep existing JSON, log warning, exit 0 (don't break build).
- DNS NXDOMAIN / timeout per node → skip, log, continue.
- IP→country lookup miss → skip, log.

The JSON is committed to git so PR diffs surface drift.

### Runtime UI

The Overview page consumes:
- The live corechannel data via the existing hook (`useNodeState()` already used by the Credits page — that's the source of CRN+CCN union).
- A static import of `public/node-locations.json` (no network call at runtime).
- A static import of `src/lib/country-centroids.json` (~250 entries, fixed reference data).

Flow:

```
corechannel hashes (filter: inactive_since == null)
  ↓ join by hash with node-locations.json
  ↓ drop nodes without a country (snapshot miss)
  ↓ lookup country centroid (lat, lng)
  ↓ apply deterministic per-hash scatter (~1.5° lat/lng)
  ↓ project (lat, lng) → SVG (x, y) — equirectangular: x = (lng+180)/360 × W, y = (90−lat)/180 × H
  ↓ render <circle> per node
```

**Map SVG:** `public/world-map.svg` from Vemaps' free **equirectangular** export so projection math stays trivial. (If the Vemaps SVG used Robinson or Miller, the design would need d3-geo for projection — keeping equirectangular is a deliberate v1 simplification.)

**Deterministic scatter:** seeded `mulberry32(hashToSeed(node.hash))` produces an offset within ~1.5° lat/lng. Same hash → same offset across reloads.

**Flicker animation:** per-dot CSS `animation-delay` derived from the hash, 4–6s opacity cycle dipping to ~0.55. Disabled under `prefers-reduced-motion`.

## File structure

**New:**
- `scripts/build-node-locations.ts` — build-time job (Node, uses built-in `dns/promises`).
- `public/node-locations.json` — generated, committed.
- `public/world-map.svg` — Vemaps equirectangular SVG, committed once.
- `src/lib/country-centroids.json` — fixed reference data, committed.
- `src/lib/world-map-projection.ts` — `project(lat, lng)`, `scatter(hash)`, `hashToSeed(hash)`.
- `src/hooks/use-node-locations.ts` — joins live corechannel nodes to the snapshot, returns `{ hash, country, x, y }[]`.
- `src/components/world-map-card.tsx` — the card itself.

**Modified:**
- `package.json` — `prebuild: tsx scripts/build-node-locations.ts && next build` and `build:locations` script. Add `ip3country` dep.
- `src/app/page.tsx` — restructure hero into the new 2×2 + map layout.
- `src/components/stats-bar.tsx` — slim to 4 stats (Total Nodes / Healthy / Total VMs / Dispatched), 2×2 grid.

## Component layout

The card matches the Figma design (584×361 baseline, scales responsively):

- **Header:** `● ALEPH CLOUD NODES` (uppercase, green dot) on the left; expand icon on the right (DS Button, `disabled`, DS Tooltip "Coming soon").
- **Body:** the SVG map fills the card. Dots are absolutely positioned `<circle>` elements in the same SVG, on top of the map paths.
- **Footer:** "World Map by Vemaps.com" attribution as a small link, bottom-left, low contrast.

Below `lg` breakpoint the hero stacks (stat grid above, map below) — consistent with the existing hero stacking behavior.

## Edge cases

**Runtime:**
- 0 nodes (api2 empty) → empty map with title and "—" caption.
- New node post-build → silently skipped, appears next deploy.
- Many overlapping dots in one country → accepted for v1.
- `prefers-reduced-motion` → flicker disabled.

**Build-time:**
- api2 down → existing JSON kept, warning logged, build continues.
- Catastrophic resolution failure → 50% guard rejects the new dataset.
- DNS resolver returning multiple IPs → take the first (good enough for country lookup).

## Verification

**Unit tests:**
- Projection math: known lat/lng → known x/y (Greenwich/Equator → center; NYC ≈ x=170,y=130; Sydney ≈ x=480,y=235).
- Deterministic scatter: `scatter(hash)` returns the same offset across calls.
- Multiaddr regex: matches `/ip4/.../tcp/...`, rejects `/dns4/...`, handles empty string.
- Hash → seed → mulberry32 produces expected output for a known hash.

**Manual:**
- `pnpm build:locations` runs cleanly against live api2, JSON diff is sensible.
- Dev preview shows dots clustered in NA/EU resembling the design.
- Reduced motion respected when toggled in OS settings.
- 2×2 stat grid + map renders correctly at desktop and mobile breakpoints.

**Project checks:** `pnpm check` (lint + typecheck + test) clean before merge.

## Future (out of scope here)

- Expand → full-page or modal D3.js map with hover details, click-to-detail, zoom/pan, layer toggles for CRN vs CCN.
- City-level granularity (would require larger geo DB or a backend).
- Latency/health overlays.
- Time-lapse / historical view.
