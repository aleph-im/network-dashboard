# List Page Filtering Overhaul

Full filtering overhaul for the Nodes and VMs list pages: text search, dynamic count badges on status pills, and a collapsible advanced filter section with boolean toggles and range inputs.

## Layout

Both pages share the same structure:

```
┌──────────────────────────────────────────────────┐
│ [Search hash, owner, name...    ]  [Filters (o)] │  <- search bar + toggle button
├──────────────────────────────────────────────────┤
│ All (150) Healthy (12/42) Unreachable (3/8) ...  │  <- status pills, always visible
├──────────────────────────────────────────────────┤
│ ┌─ collapsible, animated push-down ────────────┐ │
│ │ [checkboxes]   [range inputs]   [Clear all]  │ │
│ └──────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────┤
│                     TABLE                        │
└──────────────────────────────────────────────────┘
```

## Search Bar

- Debounced text input (300ms), client-side substring match, case-insensitive.
- **Nodes:** matches `hash`, `owner`, `name`.
- **VMs:** matches `hash`, `allocatedNode`.
- Persisted in URL as `?q=`.
- Placeholder text lists the searchable fields.
- Search icon on the left, clear (x) button when non-empty.

## Status Pills

Existing pill button design, with count badges added.

**Count badge logic:**
- Each pill shows the number of rows matching that status after applying all non-status filters (search, toggles, ranges).
- When non-status filters are active and the filtered count differs from the unfiltered count, show `filtered/total` format: `Healthy (12/42)`.
- When no non-status filters are active, show just the total: `Healthy (42)`.
- The "All" pill shows the sum across all statuses with the same logic.

**Implementation:** Compute counts from the fetched dataset in two passes:
1. `unfilteredCounts` — group the raw fetched data by status.
2. `filteredCounts` — apply search + toggles + ranges, then group by status.
3. If `filteredCounts[s] !== unfilteredCounts[s]` for any status `s`, use the dual format.

## Collapsible Advanced Filter Section

### Interaction

- Toggled by a "Filters" button in the search bar row.
- When collapsed and any advanced filter is active, a small dot indicator appears on the button.
- Opens with a smooth animated push-down (content below slides down, not overlaid).
- "Clear all" button inside resets all advanced filters (not search or status).
- Collapsible state is local `useState`, not URL-persisted.

### Animation

Animated height transition using CSS `grid-template-rows`:
- Wrapper: `display: grid; transition: grid-template-rows 200ms ease-out`.
- Collapsed: `grid-template-rows: 0fr`. Inner div: `overflow: hidden; min-height: 0`.
- Expanded: `grid-template-rows: 1fr`.

This avoids JS height measurement and works with dynamic content height.

### Nodes Page Filters

| Filter | Control | Default | Logic |
|--------|---------|---------|-------|
| Has VMs | Checkbox | off | `vmCount > 0` |
| Staked | Checkbox | off | `staked === true` |
| Supports IPv6 | Checkbox | off | `supportsIpv6 === true` |
| CPU >= X% | Number input (0-100) | empty | `resources.cpuUsagePct >= X` |
| Memory >= X% | Number input (0-100) | empty | `resources.memoryUsagePct >= X` |
| Disk >= X% | Number input (0-100) | empty | `resources.diskUsagePct >= X` |

### VMs Page Filters

| Filter | Control | Default | Logic |
|--------|---------|---------|-------|
| VM Type | Multi-select pills | all selected | `type in selectedTypes` |
| Payment Status | Multi-select pills | all selected | `paymentStatus in selectedStatuses` |
| Has Allocated Node | Checkbox | off | `allocatedNode !== null` |
| vCPUs >= X | Number input | empty | `requirements.vcpus >= X` |
| Memory >= X MB | Number input | empty | `requirements.memoryMb >= X` |

Multi-select pills reuse the same styling as status pills. When all are selected, no filtering is applied (acts as "all"). Deselecting one filters it out.

## Data Flow

All filtering is client-side post-fetch. This avoids putting ephemeral filter state into React Query keys, which would cause refetches and loading spinners on every filter change.

```
useNodes() / useVMs()
  |
  v
full dataset (cached, polled every 30s)
  |
  ├──> compute unfilteredCounts (by status)
  |
  ├──> apply text search
  ├──> apply advanced filters (toggles + ranges)
  |
  ├──> compute filteredCounts (by status)
  |
  ├──> apply status filter
  |
  v
displayed rows -> Table component
```

Status filtering is applied last so that the count badges on status pills reflect the search + advanced filter intersection, not the status filter itself.

## URL Persistence

| Param | Persisted | Reason |
|-------|-----------|--------|
| `?q=` | Yes | Shareable search links |
| `?status=` | Yes | Already exists, cross-page navigation depends on it |
| `?hasVms=` | Yes | Already exists |
| `?selected=` | Yes | Already exists |
| `?view=` | Yes | Already exists |
| `?sort=`, `?order=` | Yes | Already exists |
| Advanced filters | No | Too noisy for URL, reset on page load |

## Components

No new DS components needed. All filter UI is built with:
- Standard `<input>` with Tailwind styling (search, number inputs)
- Existing pill button pattern (status pills, multi-select pills)
- DS `Checkbox` component (boolean toggles)
- CSS grid for collapsible animation

## Scope

- Desktop only. Mobile-responsive adaptation is a separate backlog item.
- No changes to the API client or hooks (all filtering is client-side).
- No changes to the Table DS component.

## Non-Goals

- Server-side filtering or pagination (dataset is small enough for client-side).
- Saved/preset filter configurations.
- Filter state in localStorage (resets on page load, except URL params).
