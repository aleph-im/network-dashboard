# CRN Compute Units (CU) Display — Design

**Date:** 2026-05-22

> **Correction (2026-05-22, post-implementation).** This spec originally defined
> `used CU` as `total − available`, where `available` was the limiting-resource
> `min()` over the node's `*Available` fields. That was wrong: those fields are
> live runtime utilization, not VM allocation, so a node of 25 idle VMs reported
> ~1 CU used. The shipped model: **used CU** = the sum of each allocated VM's
> footprint, where a VM's footprint is `max(vCPUs, RAM_GB/ratio)`, floored at
> 1 CU — **disk is excluded** (a CU is a fixed vCPU+RAM bundle; storage is paid
> separately as persistent storage). **available CU** = the vCPU/RAM headroom
> `total − used`, capped by remaining disk: `max(0, min(total − used,
> freeDiskCu))`. The Nodes table shows **total capacity only** (the node-list
> payload has no per-VM requirements). See **Decision #107** for the
> authoritative record. Sections below are kept as the original design;
> Decision #107 supersedes the `used`/`available` and table-cell details.

## Problem

The dashboard shows raw `vCPUs` for each CRN, but the operationally meaningful
capacity unit is the **Compute Unit (CU)** — a bundle of CPU, RAM, and disk.
Operators want to see how many CU each CRN provides, consumes, and has free,
rather than reasoning about vCPU count alone.

## CU definition

A CU is the limiting resource across CPU, RAM, and disk. The ratio depends on
whether the CRN is GPU-class:

| Class | 1 CU = |
|-------|--------|
| Standard / confidential | 1 vCPU · 2 GB RAM · 20 GB SSD |
| GPU | 1 vCPU · 6 GB RAM · 60 GB SSD |

Standard and confidential CRNs share the same ratio — only GPU CRNs differ.

## Core computation

New pure helper `src/lib/compute-units.ts`:

```ts
const CU_RATIOS = {
  standard: { ramGbPerCu: 2, diskGbPerCu: 20 }, // standard + confidential
  gpu:      { ramGbPerCu: 6, diskGbPerCu: 60 },
};

type NodeCu = {
  total: number;      // CU capacity, whole number
  available: number;  // free CU, whole number, clamped to <= total
  used: number;       // total - available, always >= 0
  isGpu: boolean;
};

function computeNodeCu(node: Node): NodeCu | null;
function formatCuSummary(cu: NodeCu): string; // "8 / 32 CU · 24 free"
```

Rules:

- **GPU classification:** the node is GPU-class when
  `node.gpus.used.length + node.gpus.available.length > 0` → uses the 1/6/60
  ratio. Otherwise standard (1/2/20). `confidentialComputing` does not change
  the ratio.
- **CU = limiting resource:**
  `total = floor(min(vcpusTotal, memTotalGB / ram, diskTotalGB / disk))`,
  with the analogous `min()` over the `*Available` fields for `available`.
  Memory is converted MB → GB (`/ 1024`) before the division.
- `available` is clamped to `total` (`min(rawAvailable, total)`) so a node
  reporting more free than total resources can't display `available > total`.
- `used = total - available`, always `>= 0` after the clamp, so the three
  figures always reconcile.
- Returns `null` when `node.resources` is `null` → surfaces render `—`.
- `formatCuSummary(cu)` returns the compact one-liner used by both panels:
  `"<used> / <total> CU · <available> free"`.

## Surfaces

CU appears on four surfaces.

### 1. Nodes table (`node-table.tsx`)

- The `vCPUs` column is **replaced** by a `CU` column.
- Cell shows total CU prominently with `used` muted alongside, e.g.
  `32` · small `8 used`. `—` when `computeNodeCu` returns `null`.
- Sort by total CU (`sortValue` = `total`).
- The DS `Table` `Column.header` is `string`-only (no ReactNode), so there is
  no `?` tooltip in the header. Instead, each CU cell has a hover tooltip
  carrying the full breakdown — total / available / used — **and** the formula
  for the node's class (standard 1vCPU/2GB/20GB or GPU 1vCPU/6GB/60GB).

### 2. Node detail view (`node-detail-view.tsx`)

- In the Resources section, alongside the existing vCPU / Memory / Disk
  usage bars.
- A CU `ResourceBar`: `used / total` with percent, matching the existing bars.
- A caption line below it: `Available: N CU · GPU-class` (or `standard`).

### 3. Node quick-peek panel (`node-detail-panel.tsx`)

- A single compact line — the panel is deliberately slim (Decision #96), so no
  bar.
- Row: `CU · 8 / 32 used · 24 available`.

### 4. Network graph CRN panel (`network-detail-panel-crn.tsx`)

- A CU row beside the existing CPU / Memory bars.
- Same compact one-liner as the node panel: `CU · 8 / 32 used`.

## Filter

The Nodes advanced filter panel (Hardware group) keeps the vCPUs range slider
and **adds** a CU range slider.

- New `cuTotalRange: [number, number]` field on the node advanced filters.
- `filterMaxes.cu` is computed by running `computeNodeCu` over the fleet.
- Filters on **total CU**. Reset clears it like the other range filters.
- A node with `resources === null` (no CU) is excluded when the CU filter is
  active, consistent with how the existing range filters treat missing data.

## Edge cases

- `resources === null` → `—` on every surface; excluded from CU filtering.
- Zero vCPU / zero resources → `0 CU`.
- A GPU node that is RAM- or disk-limited still resolves correctly — the
  `min()` handles the limiting dimension regardless of class.

## Testing

- `src/lib/compute-units.test.ts` — standard node, GPU node, RAM-limited node,
  disk-limited node, `null` resources, zero vCPU, used/available reconciliation.
- `node-table.test.tsx` — column swap (CU instead of vCPUs), sort, a CU filter
  case.
- Detail-view, node-panel, and network CRN panel tests gain CU assertions.

## Docs to update

- `docs/ARCHITECTURE.md` — new `compute-units.ts` helper and the CU surfaces.
- `docs/DECISIONS.md` — decision entry: CU formula, GPU classification,
  `used = total − available`, the vCPUs→CU column replacement.
- `docs/BACKLOG.md` — no open item; nothing to move.
- `CLAUDE.md` — Current Features: Nodes table CU column, detail Resources
  section, quick-peek panel, network CRN panel.
- `src/changelog.ts` — minor version bump (new feature) with a VersionEntry.

## Out of scope

- CU on VMs / VM requirements (the request is per-CRN).
- CU aggregates on the Overview page or network-wide totals.
- Historical CU trends.
