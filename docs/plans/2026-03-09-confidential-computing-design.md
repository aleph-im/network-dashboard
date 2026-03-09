# Confidential Computing Indicators — Design

## Summary

Surface the `confidential_computing_enabled` (nodes) and `requires_confidential` (VMs) boolean fields that already exist in the API wire types but aren't mapped to app types or shown in the UI.

## Data Layer

- Add `confidentialComputing: boolean` to the `Node` app type
- Add `requiresConfidential: boolean` to the `VM` app type
- Map `raw.confidential_computing_enabled` in `transformNode`
- Map `raw.requires_confidential` in `transformVm`

## Dependency

Add `@phosphor-icons/react@2.1.10` as a direct dependency (same version the DS uses internally). Import `ShieldCheck` for the confidential indicator icon.

## Tables — ShieldCheck Icon Next to Name

**Node table (Name column):** When `node.confidentialComputing` is true, render a `ShieldCheck` icon (size 14, `weight="fill"`) inline after the name text, wrapped in a DS `Tooltip` saying "Supports confidential computing (TEE)". When the name is null (em-dash fallback), the icon still appears next to the dash.

**VM table (Name column):** Same `ShieldCheck` icon after the VM name when `vm.requiresConfidential` is true, tooltip says "Requires confidential computing". Same null-name handling.

Icon color: `text-accent` or a subtle `text-muted-foreground` — whichever reads better against both light/dark backgrounds.

## Filters — Checkbox in Advanced Filters

**Nodes page:** Add "Confidential" checkbox in the Properties column (alongside Staked, IPv6, Has GPU), description text: "supports TEE".

**VMs page:** Add "Requires Confidential" checkbox in the Payment & Allocation column (alongside Validated, Allocated, Requires GPU), description text: "requires TEE".

## Filter Logic

- `NodeAdvancedFilters.confidentialComputing?: boolean` — when true, keep only nodes where `confidentialComputing === true`
- `VmAdvancedFilters.requiresConfidential?: boolean` — when true, keep only VMs where `requiresConfidential === true`

## Detail Panels and Views

**Node detail panel/view:** Add a row in the metadata section: label "Confidential", value is `ShieldCheck` icon + "Enabled" text when true, or "No" when false.

**VM detail panel/view:** Add a row in the requirements section: label "Confidential", value is `ShieldCheck` icon + "Required" text when true, or "No" when false.

## Tests

Add filter test cases for both new boolean filters in `filters.test.ts`, following the same pattern as `hasGpu` / `requiresGpu` tests.
