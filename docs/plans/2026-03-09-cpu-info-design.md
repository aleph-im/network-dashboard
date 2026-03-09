# CPU Info on Nodes — Design

## Summary

Surface CPU architecture, vendor, and features from the scheduler API on the nodes page. Nodes-only — VMs have no CPU data in production.

## Data

The API already returns `cpu_architecture`, `cpu_vendor`, and `cpu_features` on node rows. Current distribution (~200 nodes):

- **Architecture:** 146 x86_64, 54 null (no ARM yet)
- **Vendor:** 87 Intel, 59 AMD, 54 null
- **Features:** 2 nodes with sev/sev_es, 1 with sev_snp (AMD confidential computing)

## Data Model

Add three fields to the app-level `Node` type:

- `cpuArchitecture: string | null`
- `cpuVendor: string | null`
- `cpuFeatures: string[]`

A `formatCpuLabel()` helper in `format.ts` maps vendor strings to friendly names:

- `"AuthenticAMD"` -> `"AMD"`
- `"GenuineIntel"` -> `"Intel"`
- Combined with architecture: `"AMD x86_64"`, `"Intel x86_64"`
- Null -> `"Unknown"`

## Table Column

New **CPU** column in the nodes table showing the formatted label (e.g. "AMD x86_64", "Intel x86_64", "Unknown"). Plain text, no badges.

## Filter

New **Vendor** checkbox group in the advanced filters panel (Properties column, alongside Staked/IPv6/Has GPU/Confidential): AMD / Intel / Unknown. Same multi-select semantics as existing filters — all unchecked = no filter.

## Detail Panel & Detail View

New **CPU** section showing:

- **Architecture:** x86_64
- **Vendor:** AMD / Intel / Unknown
- **Features:** list of feature strings (e.g. "sev", "sev_es", "sev_snp"), or "None" if empty

## VMs — No Changes

All VM CPU fields are null in production. No columns, filters, or detail fields for VMs.
