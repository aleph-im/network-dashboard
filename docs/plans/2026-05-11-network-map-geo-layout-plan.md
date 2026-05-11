# Network Map — Geographical Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth `Geo` layer to `/network` that introduces country nodes pinned at projected centroids, pulls located CCN/CRN toward their country via a soft `forceLink`, and makes countries clickable + searchable.

**Architecture:** Country becomes a new `GraphNodeKind` with a `geo: { lat, lng }` field; `buildGraph` emits one country node per represented country and one `type: "geo"` edge per located CCN/CRN. The graph component pins country nodes via `fx`/`fy` projected through a new `networkMercator` (symmetric world-coord space), tunes per-edge `distance`/`strength` for geo links, skips rendering geo edges (force only), and overrides the label zoom-gate for country labels. Search routes country matches through the existing focus action.

**Tech Stack:** Next.js 16 (App Router, static export), React 19, TypeScript, `d3-force`, Vitest, `@aleph-front/ds`. No new dependencies.

**Spec:** `docs/plans/2026-05-11-network-map-geo-layout-design.md`

---

## Notes for the implementer

- **Branch first.** Run `/start-session` or `git checkout -b feature/network-map-geo` before touching code. Brainstorm/plan live on `main`; implementation moves to a feature branch.
- **TDD discipline:** every logic-bearing task starts with a failing test, then implementation, then a passing test, then commit. UI components use React Testing Library + jsdom (vitest config already wired).
- **`exactOptionalPropertyTypes: true`** is on. Never assign `undefined` to optional props — spread instead: `{ ...(x ? { key: x } : {}) }`.
- **Project conventions:** function ≤100 lines, ≤5 positional params, 100-char lines, absolute imports (`@/...`), no comments unless WHY is non-obvious. DS components only.
- **Frequent commits:** one commit per task minimum. Conventional prefixes (`feat:`, `test:`, `chore:`, `docs:`).
- **Permission tip from MEMORY.md:** keep `git status` and `git log` as separate parallel Bash calls (not chained with `&&`).

## File map

| File | Action |
|---|---|
| `src/lib/network-graph-model.ts` | Extend `GraphNodeKind`, `GraphLayer`, `GraphNode`; extend `buildGraph` |
| `src/lib/network-graph-model.test.ts` | New / extended tests for geo branch |
| `src/lib/world-map-projection.ts` | Add `NETWORK_MERCATOR` params + `networkMercator` projection |
| `src/lib/world-map-projection.test.ts` | New / extended tests for the network projection |
| `src/hooks/use-network-graph.ts` | `ALL_LAYERS` includes `"geo"` |
| `src/components/network/network-layer-toggles.tsx` | Add Geo entry to `ALL` |
| `src/components/network/network-graph.tsx` | Pin country nodes; per-edge geo `distance`/`strength`; skip geo edge rendering; country labels bypass zoom gate |
| `src/components/network/network-node.tsx` | Country branch — small grey dot |
| `src/components/network/network-search.tsx` | Country match → focus action (`?focus + ?selected`) |
| `src/components/network/network-detail-panel.tsx` | Country branch in body selector |
| `src/components/network/network-detail-panel-country.tsx` | **New** — country body |
| `src/components/network/network-detail-panel-country.test.tsx` | **New** |
| `src/components/network/network-legend.tsx` | Country legend item conditional on geo layer |
| `src/lib/country-flag.ts` | **New** — ISO → flag emoji helper |
| `src/lib/country-flag.test.ts` | **New** |

Public data files (`src/data/node-locations.json`, `src/data/country-centroids.json`) are reused unchanged.

---

## Task 1: Create feature branch

**Files:** none yet — git state only.

- [ ] **Step 1: Verify clean main**

Run: `git status`
Expected: only the design doc + `docs/BACKLOG.md` may be modified (from the brainstorming session); nothing in `src/`.

- [ ] **Step 2: Pull main**

Run: `git fetch origin main && git checkout main && git pull --ff-only origin main`

- [ ] **Step 3: Create branch**

Run: `git checkout -b feature/network-map-geo`

- [ ] **Step 4: Commit design doc + BACKLOG edits (if uncommitted)**

```bash
git add docs/plans/2026-05-11-network-map-geo-layout-design.md docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
docs(plans): network map geo-layout design

Spec for adding a Geo layer to /network. Country becomes a
clickable+searchable node kind pinned at its projected centroid;
located CCN/CRN attach via a soft forceLink. Stakers/rewards/unlocated
nodes float as today. No world-map backdrop.
EOF
)"
```

---

## Task 2: Country flag emoji helper

**Files:**
- Create: `src/lib/country-flag.ts`
- Create: `src/lib/country-flag.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/country-flag.test.ts
import { describe, expect, it } from "vitest";
import { countryFlag } from "@/lib/country-flag";

describe("countryFlag", () => {
  it("converts uppercase ISO alpha-2 to flag emoji", () => {
    expect(countryFlag("FR")).toBe("🇫🇷");
    expect(countryFlag("US")).toBe("🇺🇸");
    expect(countryFlag("JP")).toBe("🇯🇵");
  });

  it("accepts lowercase and mixed case", () => {
    expect(countryFlag("fr")).toBe("🇫🇷");
    expect(countryFlag("Us")).toBe("🇺🇸");
  });

  it("returns empty string for invalid input", () => {
    expect(countryFlag("")).toBe("");
    expect(countryFlag("X")).toBe("");
    expect(countryFlag("ABC")).toBe("");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm vitest run src/lib/country-flag.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/country-flag.ts
const REGIONAL_A = 0x1f1e6;
const ASCII_A = 65;

export function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  const a = upper.charCodeAt(0);
  const b = upper.charCodeAt(1);
  if (a < ASCII_A || a > ASCII_A + 25) return "";
  if (b < ASCII_A || b > ASCII_A + 25) return "";
  return String.fromCodePoint(
    REGIONAL_A + (a - ASCII_A),
    REGIONAL_A + (b - ASCII_A),
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm vitest run src/lib/country-flag.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/country-flag.ts src/lib/country-flag.test.ts
git commit -m "feat(network): ISO alpha-2 to flag emoji helper"
```

---

## Task 3: Network-space Mercator projection

**Files:**
- Modify: `src/lib/world-map-projection.ts`
- Create or modify: `src/lib/world-map-projection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/world-map-projection.test.ts (append, or create if missing)
import { describe, expect, it } from "vitest";
import { networkMercator } from "@/lib/world-map-projection";

describe("networkMercator", () => {
  it("projects (0, 0) to origin", () => {
    const { x, y } = networkMercator(0, 0);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
  });

  it("projects positive latitudes to negative y (north is up)", () => {
    const { y } = networkMercator(45, 0);
    expect(y).toBeLessThan(0);
  });

  it("projects positive longitudes to positive x (east is right)", () => {
    const { x } = networkMercator(0, 90);
    expect(x).toBeGreaterThan(0);
  });

  it("is symmetric around the equator/prime meridian", () => {
    const a = networkMercator(30, 60);
    const b = networkMercator(-30, -60);
    expect(a.x).toBeCloseTo(-b.x, 5);
    expect(a.y).toBeCloseTo(-b.y, 5);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm vitest run src/lib/world-map-projection.test.ts`
Expected: FAIL — `networkMercator` not exported.

- [ ] **Step 3: Implement**

```ts
// src/lib/world-map-projection.ts (append below existing exports)
const NETWORK_MERCATOR: MercatorParams = {
  centerX: 0,
  equatorY: 0,
  R: 320,
  lngOffset: 0,
};

export const networkMercator: Projection = mercator(NETWORK_MERCATOR);
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm vitest run src/lib/world-map-projection.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/world-map-projection.ts src/lib/world-map-projection.test.ts
git commit -m "feat(network): network-space Mercator projection"
```

---

## Task 4: Extend graph model — types + country kind

**Files:**
- Modify: `src/lib/network-graph-model.ts`

- [ ] **Step 1: Extend the type definitions**

Replace the existing `GraphLayer` and `GraphNodeKind` exports:

```ts
// src/lib/network-graph-model.ts (top of file)
export type GraphLayer =
  | "structural" | "owner" | "staker" | "reward" | "geo";

export type GraphNodeKind =
  | "ccn" | "crn" | "staker" | "reward" | "country";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  status: string;
  owner: string | null;
  reward: string | null;
  inactive: boolean;
  country?: string;
  geo?: { lat: number; lng: number };
};
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. (No code yet emits the new types, so no errors.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/network-graph-model.ts
git commit -m "feat(network): add country kind + geo layer to graph model"
```

---

## Task 5: `buildGraph` — geo layer

**Files:**
- Modify: `src/lib/network-graph-model.ts`
- Create or modify: `src/lib/network-graph-model.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/network-graph-model.test.ts (create if missing)
import { describe, expect, it } from "vitest";
import { buildGraph, type GraphLayer } from "@/lib/network-graph-model";
import type { NodeState, CCNInfo, CRNInfo } from "@/api/credit-types";

function fakeState(opts: {
  ccns: Partial<CCNInfo>[];
  crns: Partial<CRNInfo>[];
}): NodeState {
  const ccns = new Map<string, CCNInfo>();
  for (const c of opts.ccns) {
    ccns.set(c.hash!, {
      hash: c.hash!,
      name: c.name ?? c.hash!,
      status: c.status ?? "active",
      owner: c.owner ?? null,
      reward: c.reward ?? null,
      inactiveSince: c.inactiveSince ?? null,
      score: c.score ?? 1,
      stakers: c.stakers ?? {},
      totalStaked: c.totalStaked ?? 0,
      resourceNodes: c.resourceNodes ?? [],
    } as CCNInfo);
  }
  const crns = new Map<string, CRNInfo>();
  for (const r of opts.crns) {
    crns.set(r.hash!, {
      hash: r.hash!,
      name: r.name ?? r.hash!,
      status: r.status ?? "active",
      owner: r.owner ?? null,
      reward: r.reward ?? null,
      inactiveSince: r.inactiveSince ?? null,
      parent: r.parent ?? null,
    } as CRNInfo);
  }
  return { ccns, crns } as NodeState;
}

describe("buildGraph — geo layer", () => {
  it("does not add country nodes or geo edges when geo layer is off", () => {
    const state = fakeState({
      ccns: [{ hash: "ccn1" }],
      crns: [{ hash: "crn1", parent: "ccn1" }],
    });
    const layers = new Set<GraphLayer>(["structural"]);
    const graph = buildGraph(state, layers, {
      locations: { ccn1: { country: "FR" }, crn1: { country: "FR" } },
      centroids: { FR: { lat: 46, lng: 2, name: "France" } },
    });
    expect(graph.nodes.find((n) => n.kind === "country")).toBeUndefined();
    expect(graph.edges.find((e) => e.type === "geo")).toBeUndefined();
  });

  it("adds one country node per represented country when geo is on", () => {
    const state = fakeState({
      ccns: [{ hash: "ccn1" }],
      crns: [
        { hash: "crn1", parent: "ccn1" },
        { hash: "crn2", parent: "ccn1" },
      ],
    });
    const layers = new Set<GraphLayer>(["geo"]);
    const graph = buildGraph(state, layers, {
      locations: {
        ccn1: { country: "FR" },
        crn1: { country: "FR" },
        crn2: { country: "US" },
      },
      centroids: {
        FR: { lat: 46, lng: 2, name: "France" },
        US: { lat: 38, lng: -97, name: "United States" },
      },
    });
    const countries = graph.nodes.filter((n) => n.kind === "country");
    expect(countries.map((c) => c.id).sort()).toEqual([
      "country:FR",
      "country:US",
    ]);
    expect(countries.find((c) => c.id === "country:FR")!.label).toBe("France");
    expect(countries.find((c) => c.id === "country:FR")!.geo).toEqual({
      lat: 46,
      lng: 2,
    });
  });

  it("emits one geo edge per located CCN/CRN", () => {
    const state = fakeState({
      ccns: [{ hash: "ccn1" }],
      crns: [{ hash: "crn1", parent: "ccn1" }],
    });
    const layers = new Set<GraphLayer>(["geo"]);
    const graph = buildGraph(state, layers, {
      locations: { ccn1: { country: "FR" }, crn1: { country: "FR" } },
      centroids: { FR: { lat: 46, lng: 2, name: "France" } },
    });
    const geoEdges = graph.edges.filter((e) => e.type === "geo");
    expect(geoEdges).toHaveLength(2);
    expect(geoEdges.every((e) => e.target === "country:FR")).toBe(true);
  });

  it("does not emit a geo edge for nodes with no resolved country", () => {
    const state = fakeState({
      ccns: [{ hash: "ccn1" }],
      crns: [{ hash: "crn_no_loc", parent: "ccn1" }],
    });
    const layers = new Set<GraphLayer>(["geo"]);
    const graph = buildGraph(state, layers, {
      locations: { ccn1: { country: "FR" } },
      centroids: { FR: { lat: 46, lng: 2, name: "France" } },
    });
    const geoEdges = graph.edges.filter((e) => e.type === "geo");
    expect(geoEdges.map((e) => e.source)).toEqual(["ccn1"]);
  });

  it("skips a country whose centroid is missing", () => {
    const state = fakeState({
      ccns: [{ hash: "ccn1" }],
      crns: [],
    });
    const layers = new Set<GraphLayer>(["geo"]);
    const graph = buildGraph(state, layers, {
      locations: { ccn1: { country: "ZZ" } },
      centroids: {},
    });
    expect(graph.nodes.find((n) => n.kind === "country")).toBeUndefined();
    expect(graph.edges.find((e) => e.type === "geo")).toBeUndefined();
  });

  it("sets node.country on located CCN/CRN", () => {
    const state = fakeState({
      ccns: [{ hash: "ccn1" }],
      crns: [],
    });
    const layers = new Set<GraphLayer>(["geo"]);
    const graph = buildGraph(state, layers, {
      locations: { ccn1: { country: "FR" } },
      centroids: { FR: { lat: 46, lng: 2, name: "France" } },
    });
    const ccn = graph.nodes.find((n) => n.id === "ccn1")!;
    expect(ccn.country).toBe("FR");
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm vitest run src/lib/network-graph-model.test.ts`
Expected: FAIL — `buildGraph` does not accept a third argument.

- [ ] **Step 3: Implement geo branch in `buildGraph`**

Update `buildGraph` to accept an optional `geoData` parameter and emit country nodes + edges. Add at the top of the file:

```ts
// src/lib/network-graph-model.ts
import locationsJson from "@/data/node-locations.json";
import centroidsJson from "@/data/country-centroids.json";

type LocationEntry = { country: string };
type Centroid = { lat: number; lng: number; name: string };

export type GeoData = {
  locations: Record<string, LocationEntry>;
  centroids: Record<string, Centroid>;
};

const DEFAULT_GEO: GeoData = {
  locations: locationsJson as Record<string, LocationEntry>,
  centroids: centroidsJson as Record<string, Centroid>,
};
```

Change the signature:

```ts
export function buildGraph(
  state: NodeState,
  layers: Set<GraphLayer>,
  geo: GeoData = DEFAULT_GEO,
): Graph {
  // ... existing CCN/CRN/structural/owner/reward/staker blocks unchanged ...
}
```

After the existing layer blocks, add:

```ts
  if (layers.has("geo")) {
    const represented = new Set<string>();
    for (const n of nodes) {
      if (n.kind !== "ccn" && n.kind !== "crn") continue;
      const loc = geo.locations[n.id];
      if (!loc) continue;
      const centroid = geo.centroids[loc.country];
      if (!centroid) continue;
      n.country = loc.country;
      represented.add(loc.country);
      edges.push({
        source: n.id,
        target: `country:${loc.country}`,
        type: "geo",
      });
    }
    for (const code of represented) {
      const c = geo.centroids[code]!;
      nodes.push({
        id: `country:${code}`,
        kind: "country",
        label: c.name,
        status: "",
        owner: null,
        reward: null,
        inactive: false,
        geo: { lat: c.lat, lng: c.lng },
      });
    }
  }
```

- [ ] **Step 4: Run, verify all tests pass**

Run: `pnpm vitest run src/lib/network-graph-model.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/network-graph-model.ts src/lib/network-graph-model.test.ts
git commit -m "feat(network): geo layer in buildGraph emits country nodes + edges"
```

---

## Task 6: Wire geo into the layer enum + toggle UI

**Files:**
- Modify: `src/hooks/use-network-graph.ts`
- Modify: `src/components/network/network-layer-toggles.tsx`

- [ ] **Step 1: Add `geo` to `ALL_LAYERS`**

```ts
// src/hooks/use-network-graph.ts
const ALL_LAYERS: GraphLayer[] = ["structural", "owner", "staker", "reward", "geo"];
```

Leave `DEFAULT_LAYERS` unchanged (geo stays off by default).

- [ ] **Step 2: Add `Geo` to the toggle list**

```ts
// src/components/network/network-layer-toggles.tsx
const ALL: { id: GraphLayer; label: string }[] = [
  { id: "structural", label: "Structural" },
  { id: "owner", label: "Owner" },
  { id: "staker", label: "Stakers" },
  { id: "reward", label: "Reward addr" },
  { id: "geo", label: "Geo" },
];
```

- [ ] **Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-network-graph.ts src/components/network/network-layer-toggles.tsx
git commit -m "feat(network): expose Geo layer in toggle bar"
```

---

## Task 7: Pin country nodes in the simulation

**Files:**
- Modify: `src/components/network/network-graph.tsx`

- [ ] **Step 1: Import the network projection**

Add to the imports:

```ts
import { networkMercator } from "@/lib/world-map-projection";
```

- [ ] **Step 2: Pin country nodes during `simNodes` seeding**

In the `simNodes = useMemo<SimNode[]>(...)` block, replace the body of the `graph.nodes.map((n, i) => { ... })` callback with a version that pins countries:

```ts
const seeded: SimNode[] = graph.nodes.map((n, i) => {
  let p = positionsRef.current.get(n.id);
  if (n.kind === "country" && n.geo) {
    const projected = networkMercator(n.geo.lat, n.geo.lng);
    p = projected;
    positionsRef.current.set(n.id, p);
    return { ...n, x: p.x, y: p.y, fx: p.x, fy: p.y };
  }
  if (!p) {
    const radius = 10 * Math.sqrt(0.5 + i);
    const angle = i * initialAngle;
    p = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    positionsRef.current.set(n.id, p);
  }
  return { ...n, x: p.x, y: p.y };
});
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/network/network-graph.tsx
git commit -m "feat(network): pin country nodes at projected centroids"
```

---

## Task 8: Split geo links into a separate force

**Files:**
- Modify: `src/components/network/network-graph.tsx`

Rationale: applying a per-edge `.strength((l) => ...)` to a single `forceLink` forces us to reimplement d3's default degree-based formula for non-geo edges. Cleaner: keep the existing `forceLink` for relational edges with d3 defaults, add a second `forceLink` for geo edges with a constant strength.

- [ ] **Step 1: Partition links by type at the top of the live-sim effect**

Inside the `useEffect(() => { const sim = forceSimulation... }, [simNodes, simLinks])` block, replace the existing `.force("link", ...)` line with:

```ts
const geoLinks = simLinks.filter((l) => l.type === "geo");
const otherLinks = simLinks.filter((l) => l.type !== "geo");

const sim = forceSimulation<SimNode>(simNodes)
  .force("link", forceLink<SimNode, SimLink>(otherLinks)
    .id((d) => d.id)
    .distance(60))
  .force("geo", forceLink<SimNode, SimLink>(geoLinks)
    .id((d) => d.id)
    .distance(40)
    .strength(0.6))
  .force("charge", forceManyBody().strength(-180))
  // ... rest of existing chain unchanged ...
```

- [ ] **Step 2: Mirror the change in the warmup simulation**

The `simNodes` useMemo runs a throwaway warmup simulation. Apply the same partition there so the pre-warm converges with geo pull active:

```ts
const warmupGeo = warmupLinks.filter((l) => l.type === "geo");
const warmupOther = warmupLinks.filter((l) => l.type !== "geo");
const warmup = forceSimulation<SimNode>(seeded)
  .force("link", forceLink<SimNode, SimLink>(warmupOther)
    .id((d) => d.id)
    .distance(60))
  .force("geo", forceLink<SimNode, SimLink>(warmupGeo)
    .id((d) => d.id)
    .distance(40)
    .strength(0.6))
  .force("charge", forceManyBody().strength(-180))
  .alphaDecay(SIM_DECAY)
  .stop();
warmup.tick(300);
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/network/network-graph.tsx
git commit -m "feat(network): geo links as a separate forceLink"
```

---

## Task 9: Skip rendering geo edges + extend label gate

**Files:**
- Modify: `src/components/network/network-graph.tsx`

- [ ] **Step 1: Skip geo edges in the render loop**

In the `<g ref={gRef}>` block where `graph.edges.map(...)` is rendered, return `null` for geo edges right at the start of the callback (before the `a`/`b` lookup):

```tsx
{graph.edges.map((e) => {
  if (e.type === "geo") return null;
  const a = positionsRef.current.get(e.source);
  // ... existing logic unchanged ...
})}
```

- [ ] **Step 2: Always show country labels**

The existing label layer is gated by `showLabels = transform.k >= LABEL_ZOOM_THRESHOLD`. Change the gate so country labels render regardless:

```tsx
{(showLabels || graph.nodes.some((n) => n.kind === "country")) && (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">
    {graph.nodes.map((n) => {
      if (n.kind === "staker" || n.kind === "reward") return null;
      if (n.kind !== "country" && !showLabels) return null;
      const p = positionsRef.current.get(n.id);
      if (!p) return null;
      // ... existing badge render unchanged ...
    })}
  </div>
)}
```

- [ ] **Step 3: Run typecheck + dev server smoke**

Run: `pnpm typecheck`
Expected: PASS.

Manual smoke (optional at this stage):
- `pnpm dev`, open `/network?layers=geo`, confirm no green lines from CCN/CRN to country nodes, and country labels are always visible.

- [ ] **Step 4: Commit**

```bash
git add src/components/network/network-graph.tsx
git commit -m "feat(network): skip rendering geo edges, always show country labels"
```

---

## Task 10: Country node visual

**Files:**
- Modify: `src/components/network/network-node.tsx`

- [ ] **Step 1: Extend `RADIUS` + add a country branch**

Update the `RADIUS` map and add a kind branch in `nodeColor`:

```ts
export const RADIUS: Record<GraphNodeKind, number> = {
  ccn: 16,
  crn: 11,
  staker: 5,
  reward: 6,
  country: 4,
};

function nodeColor(kind: GraphNodeKind, status: string, inactive: boolean): string {
  if (kind === "country") return "var(--color-muted-foreground)";
  if (inactive || DEAD_STATUSES.has(status)) {
    return "var(--color-neutral-500)";
  }
  // ... existing branches unchanged ...
}
```

Add the country render block (after the `reward` branch, before the default branch):

```tsx
if (kind === "country") {
  return (
    <g
      data-id={id}
      opacity={dimmed ? 0.18 : 0.6}
      role="img"
      aria-label={`Country ${id.replace("country:", "")}`}
      style={{ cursor: "default" }}
    >
      {selected && (
        <circle cx={x} cy={y} r={r + 8} fill={color} fillOpacity={0.25} />
      )}
      <circle cx={x} cy={y} r={r} fill={color} fillOpacity={0.6} />
    </g>
  );
}
```

(Country nodes never use the highlight pulse, the kind-specific outer ring, or the background underlay — they're anchors, not data.)

- [ ] **Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/network/network-node.tsx
git commit -m "feat(network): country node visual — small grey dot"
```

---

## Task 11: Country detail panel body

**Files:**
- Create: `src/components/network/network-detail-panel-country.tsx`
- Create: `src/components/network/network-detail-panel-country.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/network/network-detail-panel-country.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetworkDetailPanelCountry } from "./network-detail-panel-country";

describe("NetworkDetailPanelCountry", () => {
  it("renders country name and flag", () => {
    render(
      <NetworkDetailPanelCountry
        code="FR"
        name="France"
        ccnCount={3}
        crnCount={8}
        uniqueOwners={2}
        inactiveCount={0}
      />,
    );
    expect(screen.getByText("France")).toBeTruthy();
    expect(screen.getByText("🇫🇷")).toBeTruthy();
  });

  it("renders stat tiles for CCN, CRN, total, and unique owners", () => {
    render(
      <NetworkDetailPanelCountry
        code="US"
        name="United States"
        ccnCount={2}
        crnCount={5}
        uniqueOwners={3}
        inactiveCount={0}
      />,
    );
    expect(screen.getByText("2")).toBeTruthy(); // CCN
    expect(screen.getByText("5")).toBeTruthy(); // CRN
    expect(screen.getByText("7")).toBeTruthy(); // total
    expect(screen.getByText("3")).toBeTruthy(); // owners
  });

  it("hides the inactive footnote when count is zero", () => {
    render(
      <NetworkDetailPanelCountry
        code="FR"
        name="France"
        ccnCount={1}
        crnCount={0}
        uniqueOwners={1}
        inactiveCount={0}
      />,
    );
    expect(screen.queryByText(/inactive/i)).toBeNull();
  });

  it("shows the inactive footnote when count is > 0", () => {
    render(
      <NetworkDetailPanelCountry
        code="FR"
        name="France"
        ccnCount={1}
        crnCount={0}
        uniqueOwners={1}
        inactiveCount={4}
      />,
    );
    expect(screen.getByText(/4 inactive/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm vitest run src/components/network/network-detail-panel-country.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/network/network-detail-panel-country.tsx
"use client";

import { countryFlag } from "@/lib/country-flag";

type Props = {
  code: string;
  name: string;
  ccnCount: number;
  crnCount: number;
  uniqueOwners: number;
  inactiveCount: number;
};

export function NetworkDetailPanelCountry({
  code,
  name,
  ccnCount,
  crnCount,
  uniqueOwners,
  inactiveCount,
}: Props) {
  const total = ccnCount + crnCount;
  return (
    <div className="space-y-4 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          {countryFlag(code)}
        </span>
        <h4 className="text-base font-semibold">{name}</h4>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Total nodes" value={total} />
        <StatTile label="Unique owners" value={uniqueOwners} />
        <StatTile label="CCNs" value={ccnCount} />
        <StatTile label="CRNs" value={crnCount} />
      </div>

      {inactiveCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {inactiveCount} inactive node{inactiveCount === 1 ? "" : "s"} not
          shown here.
        </p>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] p-2.5">
      <div className="text-lg font-semibold leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm vitest run src/components/network/network-detail-panel-country.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/network/network-detail-panel-country.tsx src/components/network/network-detail-panel-country.test.tsx
git commit -m "feat(network): country detail panel body"
```

---

## Task 12: Wire country body into the detail panel selector

**Files:**
- Modify: `src/components/network/network-detail-panel.tsx`

- [ ] **Step 1: Add the country branch**

Compute the country aggregate from `visibleGraph` (it already contains the located CCN/CRN that link to this country via geo edges when the layer is on). Add helper:

```ts
function countryAggregate(graph: Graph, countryId: string): {
  code: string;
  ccnCount: number;
  crnCount: number;
  uniqueOwners: number;
  inactiveCount: number;
} {
  const code = countryId.replace("country:", "");
  let ccn = 0;
  let crn = 0;
  let inactive = 0;
  const owners = new Set<string>();
  const ids = new Set<string>();
  for (const e of graph.edges) {
    if (e.type !== "geo" || e.target !== countryId) continue;
    ids.add(e.source);
  }
  for (const n of graph.nodes) {
    if (!ids.has(n.id)) continue;
    if (n.kind === "ccn") ccn++;
    if (n.kind === "crn") crn++;
    if (n.inactive) inactive++;
    if (n.owner) owners.add(n.owner);
  }
  return {
    code,
    ccnCount: ccn,
    crnCount: crn,
    uniqueOwners: owners.size,
    inactiveCount: inactive,
  };
}
```

Import the new body and render it in the body slot:

```tsx
import { NetworkDetailPanelCountry } from "./network-detail-panel-country";

// ... inside the panel's body region ...
{node.kind === "country" && (() => {
  const agg = countryAggregate(visibleGraph, node.id);
  return (
    <NetworkDetailPanelCountry
      code={agg.code}
      name={node.label}
      ccnCount={agg.ccnCount}
      crnCount={agg.crnCount}
      uniqueOwners={agg.uniqueOwners}
      inactiveCount={agg.inactiveCount}
    />
  );
})()}
```

Also update `titleFor` and `dotStatusFor` so country selection reads cleanly in the header:

```ts
function titleFor(node: GraphNode): string {
  if (node.kind === "country") return node.label;
  if (node.kind === "staker") return "Staker";
  if (node.kind === "reward") return "Reward address";
  return node.label || `${node.id.slice(0, 10)}…`;
}

function dotStatusFor(node: GraphNode): DotStatus {
  if (node.kind === "country") return "unknown";
  // ... existing branches unchanged ...
}
```

Hide the "View full details →" footer for country selection — `showFooter` becomes:

```ts
const showFooter = node.kind === "ccn" || node.kind === "crn";
// already excludes "country" because of the explicit list — no change needed.
```

- [ ] **Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/network/network-detail-panel.tsx
git commit -m "feat(network): country branch in detail panel selector"
```

---

## Task 13: Search — country match fires focus action

**Files:**
- Modify: `src/components/network/network-search.tsx`

- [ ] **Step 1: Branch on `kind === "country"`**

Replace the match-handling block in `onSubmit`:

```ts
const match = fullGraph.nodes.find((n) =>
  n.id.toLowerCase().includes(needle) ||
  n.label.toLowerCase().includes(needle),
);
if (match) {
  const params = new URLSearchParams(searchParams.toString());
  if (match.kind === "country") {
    params.set("focus", match.id);
    params.set("selected", match.id);
  } else {
    params.set("selected", match.id);
  }
  router.replace(`/network?${params.toString()}`, { scroll: false });
}
```

Also update the placeholder to hint at the new capability:

```tsx
<Input
  size="sm"
  placeholder="Search hash, name, country, or 0x address…"
  // ... unchanged ...
/>
```

- [ ] **Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Manual smoke**

- `pnpm dev`, open `/network?layers=structural,staker,geo`
- Type "France" + Enter → URL becomes `?focus=country:FR&selected=country:FR`, graph collapses to France's ego subgraph
- Clear focus → returns to full graph
- Type "FR" + Enter → same result

- [ ] **Step 4: Commit**

```bash
git add src/components/network/network-search.tsx
git commit -m "feat(network): country search match fires focus action"
```

---

## Task 14: Legend — country item conditional on geo layer

**Files:**
- Modify: `src/components/network/network-legend.tsx`

- [ ] **Step 1: Add the geo layer check + country row**

The legend is currently a static list. Read the layer set from the URL so the country row only appears when geo is on:

```tsx
"use client";

import { useSearchParams } from "next/navigation";
import { parseLayers } from "@/hooks/use-network-graph";

export function NetworkLegend() {
  const layers = parseLayers(useSearchParams().get("layers"));
  return (
    <div className="absolute bottom-4 left-4 rounded-md border border-foreground/[0.06] bg-surface/80 p-3 text-[11px] shadow-sm backdrop-blur-sm">
      <div className="mb-2 font-medium text-foreground">Legend</div>
      <ul className="space-y-1.5 text-muted-foreground">
        {/* existing CCN / CRN / Structural / Same owner / Stake link items unchanged */}
        {layers.has("geo") && (
          <li className="flex items-center gap-2">
            <svg width="22" height="14" viewBox="0 0 22 14">
              <circle
                cx="11" cy="7" r="3"
                fill="var(--color-muted-foreground)" fillOpacity={0.6}
              />
            </svg>
            Country
          </li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/network/network-legend.tsx
git commit -m "feat(network): legend shows country item when Geo is on"
```

---

## Task 15: Verify and refine

- [ ] **Step 1: Full project checks**

Run: `pnpm check`
Expected: lint + typecheck + tests all pass.

- [ ] **Step 2: Manual smoke testing**

Run: `pnpm dev`. Test in browser:

- [ ] `/network` (default) — Geo layer off; behavior unchanged from main.
- [ ] Toggle Geo on — country dots appear at expected centroids; nodes drift toward their countries; labels (FR, US, DE, …) visible regardless of zoom.
- [ ] Click a country dot — detail panel opens with flag, name, CCN/CRN counts, owner count.
- [ ] Click "Focus" in the panel — ego subgraph collapses to country + its located nodes; structural / owner / staker neighbors visible too.
- [ ] Clear focus — full graph returns.
- [ ] Search "France" + Enter — same focus action via search.
- [ ] Search "FR" + Enter — same.
- [ ] Toggle Geo + Owner together — owner cliques tug nodes between countries; geo pull keeps them close to their country.
- [ ] Toggle Geo off — country nodes and edges disappear; sim settles back to relational layout.
- [ ] Reset view — fits to full extent (including country pins when Geo is on).
- [ ] Zoom in past LABEL_ZOOM_THRESHOLD — CCN/CRN labels appear; country labels remain at the same opacity.
- [ ] `prefers-reduced-motion` — no fly-around animations after toggling Geo.
- [ ] Mobile view — `/network` still renders the list fallback.

- [ ] **Step 3: Fix any issues found**

For each issue: locate, fix, re-run `pnpm check`, recommit.

- [ ] **Step 4: Final check**

Run: `pnpm check`
Expected: clean.

---

## Task 16: Update docs and version

- [ ] **Step 1: `docs/ARCHITECTURE.md`**

Update the `/network` section to mention the Geo layer (country pinning via `fx`/`fy` through `networkMercator`, geo `forceLink` strength 0.6, country nodes always-labeled, ego subgraph via geo edges, country search fires focus action).

- [ ] **Step 2: `docs/DECISIONS.md`**

Add a Decision entry (next number after #73) covering:
- Soft `forceLink` to a pinned country node vs. hard `fx`/`fy` on all located nodes (chose: pin country only)
- Country as a real node kind vs. label-only (chose: real node kind for clickability + searchability + consistency)
- No world-map backdrop (chose: relational reading stays primary; worldmap card already serves the geographic glance)

- [ ] **Step 3: `docs/BACKLOG.md`**

Move "Group nodes by geographical location on the network map" from **Needs planning** to **Completed** with a one-line summary linking the plan and the decision number.

- [ ] **Step 4: `CLAUDE.md` — Current Features**

Extend the `Network graph page (/network)` bullet with the Geo layer: country nodes at projected centroids, soft `forceLink` (distance 40, strength 0.6) into the country node, always-visible country labels (bypass `LABEL_ZOOM_THRESHOLD`), country search routes through the focus action, country detail panel shows flag + name + CCN/CRN/owners.

- [ ] **Step 5: `src/changelog.ts`**

- Bump `CURRENT_VERSION` (semver minor — new feature)
- Add a `VersionEntry` with the feature description and a `feature` badge.

- [ ] **Step 6: Plan status frontmatter**

Add this block at the very top of `docs/plans/2026-05-11-network-map-geo-layout-plan.md`:

```markdown
---
status: done
branch: feature/network-map-geo
date: <YYYY-MM-DD>
note: shipped
---
```

- [ ] **Step 7: Run final checks + commit docs**

```bash
pnpm check
git add docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md CLAUDE.md src/changelog.ts docs/plans/2026-05-11-network-map-geo-layout-plan.md
git commit -m "docs(network): geo-layout feature changelog + decisions"
```

- [ ] **Step 8: Hand off to `/dio:ship`**

Per project CLAUDE.md, do NOT push or open a PR yet. Inform the user the branch is ready and `/dio:ship` runs the full finishing sequence (catch-up + doc audit + preview gate + push + PR + squash-merge + cleanup).
