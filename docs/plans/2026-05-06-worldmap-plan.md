# Worldmap Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Aleph Cloud Nodes" world map card to the Overview page, fed by a build-time snapshot of node hash → country, and restructure the hero to a 2×2 stat grid + map layout.

**Architecture:** A `prebuild`-style script resolves CRN domains via DNS and parses CCN multiaddresses for IPs, runs each through a bundled IP-to-country DB, and writes `src/data/node-locations.json`. At runtime, the `WorldMapCard` joins live corechannel data with this snapshot, projects country centroids onto an equirectangular SVG, and renders one dot per active node with a deterministic per-hash scatter.

**Tech Stack:** Next.js 16 (static export), React 19, TypeScript, Vitest, `ip3country` (build), `world-countries` (one-shot generator), `tsx` (run TS scripts), Vemaps SVG.

**Spec:** `docs/plans/2026-05-06-worldmap-design.md`

---

## Notes for the implementer

- **Branch first.** Run `/start-session` (or `git checkout -b feature/worldmap`) before any code edits. Brainstorming and planning happen on `main`; implementation happens on a feature branch.
- **JSON locations** — both `src/data/node-locations.json` and `src/data/country-centroids.json` live under `src/data/`, not `public/`. This deviates from the spec on purpose: importing JSON as a module is type-aware, bundled, and avoids a runtime fetch. The spec's `public/` reference can be ignored.
- **Project conventions:** function ≤100 lines, ≤5 positional params, 100-char lines, absolute imports (`@/...`), no comments unless the WHY is non-obvious.

---

## Task 1: Install deps and add Vemaps SVG

**Files:**
- Modify: `package.json`
- Create: `public/world-map.svg`

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
pnpm add ip3country
pnpm add -D tsx world-countries
```

Expected: `package.json` updated, `pnpm-lock.yaml` updated.

- [ ] **Step 2: Download the Vemaps World Equirectangular SVG**

```bash
curl -L -o public/world-map.svg \
  "https://www.vemaps.com/uploads/img/large/world/world-equirectangular-projection-01.svg"
```

If the URL 404s, fall back to manual download: open https://www.vemaps.com/world/world-equirectangular and download the SVG, save as `public/world-map.svg`.

- [ ] **Step 3: Verify viewBox is full-globe equirectangular**

Run: `head -5 public/world-map.svg`

Expected: a `viewBox` attribute. Note the dimensions (e.g. `viewBox="0 0 1100 540"`). The exact pixel dimensions don't matter — what matters is that the projection is equirectangular and covers the full globe (-180°..180° lng, -90°..90° lat). If the SVG covers a partial region (cropped Antarctica is OK; cropped longitudes is not), pick a different export.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml public/world-map.svg
git commit -m "chore: add ip3country, tsx, world-countries, vemaps SVG"
```

---

## Task 2: Generate country centroids data file

**Files:**
- Create: `scripts/build-country-centroids.ts`
- Create: `src/data/country-centroids.json` (generated, committed)

- [ ] **Step 1: Write the generator script**

Create `scripts/build-country-centroids.ts`:

```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import countries from "world-countries";

type Centroid = { lat: number; lng: number; name: string };

const out: Record<string, Centroid> = {};
for (const c of countries) {
  if (!c.cca2 || !Array.isArray(c.latlng) || c.latlng.length !== 2) continue;
  const [lat, lng] = c.latlng;
  if (typeof lat !== "number" || typeof lng !== "number") continue;
  out[c.cca2] = { lat, lng, name: c.name.common };
}

const path = "src/data/country-centroids.json";
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${Object.keys(out).length} country centroids to ${path}`);
```

- [ ] **Step 2: Run the generator**

```bash
pnpm tsx scripts/build-country-centroids.ts
```

Expected output: `Wrote 250 country centroids to src/data/country-centroids.json` (the exact count depends on `world-countries` version; should be ≥240).

- [ ] **Step 3: Spot-check a known country**

```bash
grep -A 2 '"US"' src/data/country-centroids.json | head -5
```

Expected: `"lat": 38, "lng": -97, ...` (United States centroid is around there).

- [ ] **Step 4: Commit**

```bash
git add scripts/build-country-centroids.ts src/data/country-centroids.json
git commit -m "feat(worldmap): generate country centroids data file"
```

---

## Task 3: World map projection lib (TDD)

**Files:**
- Test: `src/lib/world-map-projection.test.ts`
- Create: `src/lib/world-map-projection.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/world-map-projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  hashToSeed,
  mulberry32,
  project,
  scatter,
} from "@/lib/world-map-projection";

describe("project", () => {
  it("places (0, 0) at the center of the SVG", () => {
    const { x, y } = project(0, 0, 600, 300);
    expect(x).toBeCloseTo(300, 5);
    expect(y).toBeCloseTo(150, 5);
  });

  it("places (90, -180) at the top-left corner", () => {
    const { x, y } = project(90, -180, 600, 300);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
  });

  it("places (-90, 180) at the bottom-right corner", () => {
    const { x, y } = project(-90, 180, 600, 300);
    expect(x).toBeCloseTo(600, 5);
    expect(y).toBeCloseTo(300, 5);
  });

  it("places NYC (40.7, -74) in the upper-left quadrant", () => {
    const { x, y } = project(40.7, -74, 600, 300);
    expect(x).toBeGreaterThan(150);
    expect(x).toBeLessThan(200);
    expect(y).toBeGreaterThan(70);
    expect(y).toBeLessThan(110);
  });
});

describe("hashToSeed", () => {
  it("returns the same seed for the same hash", () => {
    expect(hashToSeed("abc123")).toBe(hashToSeed("abc123"));
  });

  it("returns different seeds for different hashes", () => {
    expect(hashToSeed("abc123")).not.toBe(hashToSeed("def456"));
  });

  it("returns a non-negative 32-bit integer", () => {
    const seed = hashToSeed(
      "6c7578899ac475fbdc05c6a4711331c7590aa6b719f0c169941b99a10faf1136",
    );
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
    expect(Number.isInteger(seed)).toBe(true);
  });
});

describe("mulberry32", () => {
  it("produces deterministic sequences for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("produces values in [0, 1)", () => {
    const rand = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("scatter", () => {
  it("returns the same offset for the same hash", () => {
    const a = scatter("hash-A");
    const b = scatter("hash-A");
    expect(a).toEqual(b);
  });

  it("returns different offsets for different hashes", () => {
    const a = scatter("hash-A");
    const b = scatter("hash-B");
    expect(a).not.toEqual(b);
  });

  it("stays within the configured radius (~1.5 degrees)", () => {
    for (const h of ["a", "b", "cdef123", "long-hash-xyz"]) {
      const { dLat, dLng } = scatter(h);
      const r = Math.hypot(dLat, dLng);
      expect(r).toBeLessThanOrEqual(1.5 + 1e-9);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/world-map-projection.test.ts
```

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement the module**

Create `src/lib/world-map-projection.ts`:

```ts
const SCATTER_RADIUS_DEG = 1.5;

export type Point = { x: number; y: number };
export type Offset = { dLat: number; dLng: number };

export function project(
  lat: number,
  lng: number,
  width: number,
  height: number,
): Point {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

export function hashToSeed(hash: string): number {
  let h = 2166136261;
  for (let i = 0; i < hash.length; i++) {
    h ^= hash.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scatter(hash: string): Offset {
  const rand = mulberry32(hashToSeed(hash));
  const angle = rand() * 2 * Math.PI;
  const radius = Math.sqrt(rand()) * SCATTER_RADIUS_DEG;
  return {
    dLat: Math.sin(angle) * radius,
    dLng: Math.cos(angle) * radius,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/world-map-projection.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/world-map-projection.ts src/lib/world-map-projection.test.ts
git commit -m "feat(worldmap): add equirectangular projection + deterministic scatter"
```

---

## Task 4: Multiaddr / hostname resolution helpers (TDD)

**Files:**
- Test: `src/lib/world-map-resolution.test.ts`
- Create: `src/lib/world-map-resolution.ts`

These are the pure helpers used by both the build script (Task 5) and any future consumers. Keeping them separate makes them unit-testable without network.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/world-map-resolution.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseHostname,
  parseIpv4FromMultiaddr,
} from "@/lib/world-map-resolution";

describe("parseIpv4FromMultiaddr", () => {
  it("extracts IPv4 from /ip4/.../tcp/... multiaddr", () => {
    expect(
      parseIpv4FromMultiaddr(
        "/ip4/46.255.204.193/tcp/4025/p2p/Qmb5b2ZwJm9pVWrppf3D3iMF1bXbjZhbJTwGvKEBMZNxa2",
      ),
    ).toBe("46.255.204.193");
  });

  it("returns null for /dns4/... multiaddr", () => {
    expect(parseIpv4FromMultiaddr("/dns4/example.com/tcp/443")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseIpv4FromMultiaddr("")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseIpv4FromMultiaddr("not-a-multiaddr")).toBeNull();
  });

  it("returns null for /ip6/... multiaddr", () => {
    expect(parseIpv4FromMultiaddr("/ip6/::1/tcp/4025")).toBeNull();
  });
});

describe("parseHostname", () => {
  it("extracts hostname from a full HTTPS URL", () => {
    expect(parseHostname("https://a-node-719754-y.tokenchain.network")).toBe(
      "a-node-719754-y.tokenchain.network",
    );
  });

  it("extracts hostname from an HTTPS URL with a path", () => {
    expect(parseHostname("https://example.com/path?q=1")).toBe("example.com");
  });

  it("returns null for empty string", () => {
    expect(parseHostname("")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(parseHostname("not a url")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/world-map-resolution.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/world-map-resolution.ts`:

```ts
const IPV4_FROM_MULTIADDR = /^\/ip4\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\//;

export function parseIpv4FromMultiaddr(multiaddr: string): string | null {
  if (!multiaddr) return null;
  const match = IPV4_FROM_MULTIADDR.exec(multiaddr);
  return match ? (match[1] ?? null) : null;
}

export function parseHostname(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/world-map-resolution.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/world-map-resolution.ts src/lib/world-map-resolution.test.ts
git commit -m "feat(worldmap): add multiaddr + hostname parsing helpers"
```

---

## Task 5: Snapshot build script and package.json wiring

**Files:**
- Create: `scripts/build-node-locations.ts`
- Modify: `package.json` (scripts)
- Create: `src/data/node-locations.json` (generated, committed)

- [ ] **Step 1: Write the snapshot script**

Create `scripts/build-node-locations.ts`:

```ts
import { promises as dns } from "node:dns";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as ip3country from "ip3country";
import {
  parseHostname,
  parseIpv4FromMultiaddr,
} from "../src/lib/world-map-resolution.ts";

ip3country.init();

const CORECHANNEL_SENDER = "0xa1B3bb7d2332383D96b7796B908fB7f7F3c2Be10";
const URL_API =
  `https://api2.aleph.im/api/v0/aggregates/${CORECHANNEL_SENDER}.json?keys=corechannel`;
const OUT = "src/data/node-locations.json";
const ABORT_FRACTION = 0.5;

type RawNode = {
  hash?: string;
  multiaddress?: string | null;
  address?: string | null;
  inactive_since?: number | null;
};

type LocationEntry = { country: string };

async function resolveIpv4(hostname: string): Promise<string | null> {
  try {
    const ips = await dns.resolve4(hostname);
    return ips[0] ?? null;
  } catch {
    return null;
  }
}

function lookupCountry(ip: string): string | null {
  try {
    const code = ip3country.lookupStr(ip);
    return code && code.length === 2 ? code : null;
  } catch {
    return null;
  }
}

async function ccnEntry(node: RawNode): Promise<[string, LocationEntry] | null> {
  if (!node.hash || node.inactive_since != null || !node.multiaddress) return null;
  const ip = parseIpv4FromMultiaddr(node.multiaddress);
  if (!ip) return null;
  const country = lookupCountry(ip);
  if (!country) return null;
  return [node.hash, { country }];
}

async function crnEntry(node: RawNode): Promise<[string, LocationEntry] | null> {
  if (!node.hash || node.inactive_since != null || !node.address) return null;
  const hostname = parseHostname(node.address);
  if (!hostname) return null;
  const ip = await resolveIpv4(hostname);
  if (!ip) return null;
  const country = lookupCountry(ip);
  if (!country) return null;
  return [node.hash, { country }];
}

function loadPrevious(): Record<string, LocationEntry> {
  if (!existsSync(OUT)) return {};
  try {
    return JSON.parse(readFileSync(OUT, "utf-8")) as Record<
      string,
      LocationEntry
    >;
  } catch {
    return {};
  }
}

async function main() {
  let resp: Response;
  try {
    resp = await fetch(URL_API);
  } catch (e) {
    console.warn("api2 unreachable, keeping existing JSON:", e);
    return;
  }
  if (!resp.ok) {
    console.warn(`api2 returned ${resp.status}, keeping existing JSON`);
    return;
  }
  const payload = (await resp.json()) as {
    data?: { corechannel?: { nodes?: RawNode[]; resource_nodes?: RawNode[] } };
  };
  const channel = payload.data?.corechannel ?? {};
  const ccnNodes = channel.nodes ?? [];
  const crnNodes = channel.resource_nodes ?? [];

  const ccnPairs = await Promise.all(ccnNodes.map(ccnEntry));
  const crnPairs = await Promise.all(crnNodes.map(crnEntry));

  const out: Record<string, LocationEntry> = {};
  for (const pair of [...ccnPairs, ...crnPairs]) {
    if (pair) out[pair[0]] = pair[1];
  }

  const prev = loadPrevious();
  const prevCount = Object.keys(prev).length;
  const newCount = Object.keys(out).length;
  if (prevCount > 0 && newCount < prevCount * ABORT_FRACTION) {
    console.warn(
      `Refusing to overwrite: new dataset (${newCount}) is < ${
        ABORT_FRACTION * 100
      }% of previous (${prevCount}). Keeping existing JSON.`,
    );
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `Wrote ${newCount} node locations to ${OUT} ` +
      `(CCN attempted: ${ccnNodes.length}, CRN attempted: ${crnNodes.length})`,
  );
}

main().catch((err) => {
  console.error("build-node-locations failed:", err);
  process.exit(1);
});
```

Note the `.ts` extension on the import — that's how `tsx` resolves a sibling TS file.

- [ ] **Step 2: Wire into `package.json`**

Modify `package.json` `scripts`:

```jsonc
"build": "tsx scripts/build-node-locations.ts && next build",
"build:locations": "tsx scripts/build-node-locations.ts",
```

Leave the other scripts (`dev`, `lint`, `typecheck`, `test`, `check`, `preview`) unchanged.

- [ ] **Step 3: Run the script and inspect the output**

```bash
pnpm build:locations
```

Expected: `Wrote N node locations to src/data/node-locations.json (CCN attempted: ...)` where N is roughly 100–200.

```bash
head -20 src/data/node-locations.json
```

Expected: hash → `{ "country": "XX" }` entries. Spot-check that countries look plausible (US, DE, FR, NL, FI, etc.).

- [ ] **Step 4: Commit**

```bash
git add scripts/build-node-locations.ts src/data/node-locations.json package.json
git commit -m "feat(worldmap): add build-time node location snapshot"
```

---

## Task 6: Pass `inactiveSince` through the node state types

**Files:**
- Modify: `src/api/credit-types.ts` (or wherever `CCNInfo`/`CRNInfo` live)
- Modify: `src/api/client.ts` (around line 505-527, the `getNodeState` parser)

The runtime needs `inactive_since` to filter out newly-inactive nodes that were active at last build. Currently `CCNInfo`/`CRNInfo` don't expose it.

- [ ] **Step 1: Locate the type definitions**

```bash
grep -n "CCNInfo\|CRNInfo" src/api/*.ts | head
```

Expected: type declarations (likely in `credit-types.ts`).

- [ ] **Step 2: Add `inactiveSince: number | null` to both types**

In the file containing `CCNInfo` / `CRNInfo`, add:

```ts
inactiveSince: number | null;
```

…to both type definitions. Place it consistently with the existing field order.

- [ ] **Step 3: Pass the field through in `getNodeState`**

In `src/api/client.ts`, the `getNodeState` parser (around line 505-527), add `inactiveSince: n.inactive_since ?? null,` to the CCN object literal and `inactiveSince: r.inactive_since ?? null,` to the CRN object literal.

If the `ApiCorechannelNode` / `ApiResourceNode` raw types don't already declare `inactive_since`, add `inactive_since?: number | null;` to both.

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS. If any consumer of `CCNInfo`/`CRNInfo` errors because of an unrelated property mismatch, that's pre-existing — only fix errors caused by these additions.

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/credit-types.ts src/api/client.ts
git commit -m "feat(api): expose inactiveSince on CCNInfo and CRNInfo"
```

---

## Task 7: `useNodeLocations` hook (TDD)

**Files:**
- Test: `src/hooks/use-node-locations.test.ts`
- Create: `src/hooks/use-node-locations.ts`

The hook returns dot-render data: `{ hash, country, x, y }[]`. It joins live corechannel data with the snapshot, filters by `inactiveSince == null`, drops snapshot misses, and projects.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/use-node-locations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeNodeDots } from "@/hooks/use-node-locations";

const centroids = {
  US: { lat: 38, lng: -97, name: "United States" },
  DE: { lat: 51, lng: 9, name: "Germany" },
};

const locations = {
  hash_us_a: { country: "US" },
  hash_de_a: { country: "DE" },
  hash_unknown_country: { country: "ZZ" },
  hash_inactive_in_snapshot: { country: "US" },
};

describe("computeNodeDots", () => {
  it("returns one dot per hash that exists in both live data and snapshot", () => {
    const dots = computeNodeDots({
      ccns: [
        { hash: "hash_us_a", inactiveSince: null },
        { hash: "hash_de_a", inactiveSince: null },
      ],
      crns: [],
      locations,
      centroids,
      width: 600,
      height: 300,
    });
    expect(dots).toHaveLength(2);
    expect(dots.map((d) => d.country).sort()).toEqual(["DE", "US"]);
  });

  it("drops nodes with no snapshot entry", () => {
    const dots = computeNodeDots({
      ccns: [{ hash: "hash_no_snapshot", inactiveSince: null }],
      crns: [{ hash: "hash_us_a", inactiveSince: null }],
      locations,
      centroids,
      width: 600,
      height: 300,
    });
    expect(dots).toHaveLength(1);
    expect(dots[0]?.hash).toBe("hash_us_a");
  });

  it("drops inactive nodes (inactiveSince != null)", () => {
    const dots = computeNodeDots({
      ccns: [{ hash: "hash_us_a", inactiveSince: 19401322 }],
      crns: [{ hash: "hash_de_a", inactiveSince: null }],
      locations,
      centroids,
      width: 600,
      height: 300,
    });
    expect(dots).toHaveLength(1);
    expect(dots[0]?.hash).toBe("hash_de_a");
  });

  it("drops nodes whose snapshot country is not in the centroid table", () => {
    const dots = computeNodeDots({
      ccns: [{ hash: "hash_unknown_country", inactiveSince: null }],
      crns: [],
      locations,
      centroids,
      width: 600,
      height: 300,
    });
    expect(dots).toHaveLength(0);
  });

  it("places the dot near the country centroid", () => {
    const dots = computeNodeDots({
      ccns: [{ hash: "hash_us_a", inactiveSince: null }],
      crns: [],
      locations,
      centroids,
      width: 600,
      height: 300,
    });
    const dot = dots[0];
    expect(dot).toBeDefined();
    if (!dot) return;
    const us = centroids.US;
    const expected = {
      x: ((us.lng + 180) / 360) * 600,
      y: ((90 - us.lat) / 180) * 300,
    };
    expect(Math.abs(dot.x - expected.x)).toBeLessThan(10);
    expect(Math.abs(dot.y - expected.y)).toBeLessThan(10);
  });

  it("returns deterministic positions across calls", () => {
    const args = {
      ccns: [{ hash: "hash_us_a", inactiveSince: null }],
      crns: [],
      locations,
      centroids,
      width: 600,
      height: 300,
    };
    const a = computeNodeDots(args);
    const b = computeNodeDots(args);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/hooks/use-node-locations.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/use-node-locations.ts`:

```ts
"use client";

import { useMemo } from "react";
import { useNodeState } from "@/hooks/use-node-state";
import locationsJson from "@/data/node-locations.json";
import centroidsJson from "@/data/country-centroids.json";
import { project, scatter } from "@/lib/world-map-projection";

export type NodeDot = {
  hash: string;
  country: string;
  x: number;
  y: number;
};

type LocationEntry = { country: string };
type Centroid = { lat: number; lng: number; name: string };
type NodeLite = { hash: string; inactiveSince: number | null };

const locations = locationsJson as Record<string, LocationEntry>;
const centroids = centroidsJson as Record<string, Centroid>;

export function computeNodeDots(args: {
  ccns: NodeLite[];
  crns: NodeLite[];
  locations: Record<string, LocationEntry>;
  centroids: Record<string, Centroid>;
  width: number;
  height: number;
}): NodeDot[] {
  const { ccns, crns, locations, centroids, width, height } = args;
  const dots: NodeDot[] = [];
  for (const node of [...ccns, ...crns]) {
    if (node.inactiveSince != null) continue;
    const loc = locations[node.hash];
    if (!loc) continue;
    const centroid = centroids[loc.country];
    if (!centroid) continue;
    const offset = scatter(node.hash);
    const { x, y } = project(
      centroid.lat + offset.dLat,
      centroid.lng + offset.dLng,
      width,
      height,
    );
    dots.push({ hash: node.hash, country: loc.country, x, y });
  }
  return dots;
}

export function useNodeLocations(width: number, height: number): NodeDot[] {
  const { data } = useNodeState();
  return useMemo(() => {
    if (!data) return [];
    const ccns = [...data.ccns.values()];
    const crns = [...data.crns.values()];
    return computeNodeDots({
      ccns,
      crns,
      locations,
      centroids,
      width,
      height,
    });
  }, [data, width, height]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/hooks/use-node-locations.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-node-locations.ts src/hooks/use-node-locations.test.ts
git commit -m "feat(worldmap): add useNodeLocations hook"
```

---

## Task 8: `WorldMapCard` component

**Files:**
- Create: `src/components/world-map-card.tsx`
- Modify: `src/app/globals.css` (add the flicker keyframe)

This is the visual card. No unit tests — manual verification at the end.

- [ ] **Step 1: Add the flicker keyframe to global CSS**

Append to `src/app/globals.css`:

```css
@keyframes node-dot-flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

@media (prefers-reduced-motion: reduce) {
  .node-dot {
    animation: none !important;
  }
}
```

- [ ] **Step 2: Implement the component**

Create `src/components/world-map-card.tsx`:

```tsx
"use client";

import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@aleph-front/ds/tooltip";
import { useNodeLocations } from "@/hooks/use-node-locations";
import { hashToSeed, mulberry32 } from "@/lib/world-map-projection";

const VIEW_W = 1100;
const VIEW_H = 540;

function ExpandIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export function WorldMapCard() {
  const dots = useNodeLocations(VIEW_W, VIEW_H);

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03]">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: "var(--color-success-500)" }}
          />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/80">
            Aleph Cloud Nodes
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <button
                  type="button"
                  disabled
                  aria-label="Expand world map (coming soon)"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ExpandIcon />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">Coming soon</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="relative flex-1">
        <Image
          src="/world-map.svg"
          alt=""
          fill
          unoptimized
          className="select-none object-contain opacity-70"
          priority
        />
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 size-full"
          aria-hidden="true"
        >
          {dots.map((dot) => {
            const rand = mulberry32(hashToSeed(dot.hash));
            const delay = rand() * 5;
            const duration = 4 + rand() * 2;
            return (
              <circle
                key={dot.hash}
                cx={dot.x}
                cy={dot.y}
                r={3}
                fill="var(--color-success-500)"
                className="node-dot"
                style={{
                  animation: `node-dot-flicker ${duration.toFixed(
                    2,
                  )}s ease-in-out ${delay.toFixed(2)}s infinite`,
                }}
              />
            );
          })}
        </svg>
      </div>

      <a
        href="https://www.vemaps.com/world/world-equirectangular"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 left-5 text-[10px] uppercase tracking-wider text-muted-foreground/40 hover:text-muted-foreground/60"
      >
        World Map by Vemaps.com
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Type check**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Lint**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/world-map-card.tsx src/app/globals.css
git commit -m "feat(worldmap): add WorldMapCard component"
```

---

## Task 9: Slim `StatsBar` to four cards in a 2×2 grid

**Files:**
- Modify: `src/components/stats-bar.tsx`

Drop the four cards we don't want from the Overview hero (Unreachable, Removed, Missing, Unschedulable). They remain accessible from the list pages. The result: a 2×2 grid of stat cards.

- [ ] **Step 1: Edit `StatsBar`**

In `src/components/stats-bar.tsx`:

1. Remove the imports/usage for the icons no longer needed: `iconWifiSlash`, `iconTrash`, `iconWarning`, `iconProhibit` (and their SVG declarations).
2. Replace the entire `return (...)` of `StatsBar` with:

```tsx
  return (
    <div className="grid grid-cols-2 gap-4">
      <p className="col-span-2 mb-[-8px] text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
        Nodes
      </p>
      <Stat
        label="Total"
        value={stats?.totalNodes}
        total={undefined}
        subtitle="Compute nodes registered with the scheduler"
        isLoading={isLoading}
        href="/nodes"
        index={0}
      />
      <Stat
        label="Healthy"
        value={stats?.healthyNodes}
        total={stats?.totalNodes}
        subtitle="Nodes that passed their last health check"
        isLoading={isLoading}
        color="var(--color-success-500)"
        tint="var(--color-success-500)"
        icon={iconCheck}
        href="/nodes?status=healthy"
        index={1}
      />
      <p className="col-span-2 mb-[-8px] mt-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
        Virtual Machines
      </p>
      <Stat
        label="Total"
        value={stats?.totalVMs}
        total={undefined}
        subtitle="VMs currently active across the network — running, expected, or awaiting placement"
        isLoading={isLoading}
        href="/vms"
        index={2}
      />
      <Stat
        label="Dispatched"
        value={stats?.dispatchedVMs}
        total={stats?.totalVMs}
        subtitle="VMs running on their correct assigned node"
        isLoading={isLoading}
        icon={iconCheck}
        href="/vms?status=dispatched"
        index={3}
        {...(hasDispatched
          ? {
              color: "var(--color-success-500)",
              tint: "var(--color-success-500)",
            }
          : {})}
      />
    </div>
  );
```

3. Remove the now-unused destructured booleans (`hasUnreachable`, `hasRemoved`, `hasMissing`, `hasUnschedulable`) from the top of `StatsBar`. Keep `hasDispatched`.

- [ ] **Step 2: Type check + lint**

```bash
pnpm lint && pnpm typecheck
```

Expected: PASS. If `oxlint` complains about unused imports (`iconWifiSlash` etc), delete them.

- [ ] **Step 3: Commit**

```bash
git add src/components/stats-bar.tsx
git commit -m "refactor(stats): slim Overview StatsBar to 4 cards in 2x2 grid"
```

---

## Task 10: Restructure Overview hero (StatsBar | WorldMapCard)

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace the Overview body**

In `src/app/page.tsx`, change the JSX to:

```tsx
"use client";

import { StatsBar } from "@/components/stats-bar";
import { TopNodesCard } from "@/components/top-nodes-card";
import { LatestVMsCard } from "@/components/latest-vms-card";
import { WorldMapCard } from "@/components/world-map-card";

export default function OverviewPage() {
  return (
    <div>
      <div className="mb-10">
        <h1 className="text-4xl">Overview</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Real-time scheduler health and VM allocation
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-4">
        <StatsBar />
        <WorldMapCard />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <TopNodesCard />
        <LatestVMsCard />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check + lint**

```bash
pnpm lint && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(overview): place WorldMapCard alongside slimmed StatsBar"
```

---

## Task 11: Verify and refine

- [ ] Run full project checks (`pnpm check`)
- [ ] Run `pnpm dev` and visually verify the Overview page in a browser:
  - Hero: 2×2 stat grid on the left, world map on the right (lg breakpoint).
  - Below `lg`: stat grid stacks above map.
  - Map shows green dots clustered roughly where the design shows them (NA East/West, Europe).
  - Dot flicker is subtle and visible. Toggle OS reduced-motion to confirm animation stops.
  - Expand button shows "Coming soon" tooltip on hover and is not clickable.
  - Vemaps attribution visible bottom-left, links out.
  - Light/dark theme toggle still works on the new card.
- [ ] Manual smoke: navigate from Overview to `/nodes` and `/vms` via the stat cards — links still work.
- [ ] Fix any issues found
- [ ] Re-run checks until clean

---

## Task 12: Update docs and version

- [ ] `docs/ARCHITECTURE.md` — document:
  - The build-time snapshot pipeline (`scripts/build-node-locations.ts`, `prebuild` wiring, `src/data/node-locations.json` shape)
  - The world-map projection lib and scatter helper
  - Where new patterns belong (e.g. "build-time data preparation" as a new section)
- [ ] `docs/DECISIONS.md` — log the design decisions (Q1–Q6 from the spec):
  - Both CRN+CCN, single color
  - Hero restructure: 2×2 stat grid + worldmap
  - All non-removed (`inactiveSince == null`)
  - No interaction in v1; subtle hash-seeded flicker
  - Build-time pre-resolution chosen over runtime DoH
  - Tight scatter around country centroids, deterministic per hash
- [ ] `docs/BACKLOG.md` — add to Completed; add new Roadmap items: "Worldmap v2: D3.js with hover details, click-to-detail, zoom/pan, layer toggles for CRN vs CCN" and "Worldmap city-level granularity (would require larger geo DB)"
- [ ] `CLAUDE.md` — update **Current Features**:
  - Update the Overview page bullet to describe the new hero layout (2×2 stat grid + worldmap on the right) and the dropped cards
  - Add a new bullet for the worldmap card
- [ ] `src/changelog.ts` — bump `CURRENT_VERSION` (minor bump: new feature) and add a `VersionEntry` describing the worldmap card and Overview hero restructure

---

## Task 13: Add status frontmatter

- [ ] After all tasks complete (or stopped mid-way), add to the **top** of this plan file:

```
---
status: done
branch: feature/worldmap
date: 2026-05-06
note: <any execution-time context, or empty>
---
```

This is part of the project's plan-status convention from `CLAUDE.md`.
