# GPU Info for Nodes and VMs

## Context

The scheduler API already returns GPU data that the dashboard ignores. Nodes have `gpus: { used: [], available: [] }` and VMs have `gpu_requirements: []`. Currently 8/543 nodes have GPUs and 4/462 VMs require GPUs. This feature surfaces that data.

## Wire Format (from API)

**Node GPU object:**
```json
{
  "gpus": {
    "used": [{ "vendor": "NVIDIA", "model": "RTX 6000 ADA", "device_name": "AD102GL [RTX 6000 Ada Generation]", "device_class": "0300", "device_id": "10de:26b1" }],
    "available": []
  }
}
```

**VM GPU requirement:**
```json
{
  "gpu_requirements": [{ "vendor": "NVIDIA", "model": "", "device_name": "AD102GL [L40S]", "device_class": "0302", "device_id": "10de:26b9" }]
}
```

## Design

### Types & API Layer

- Add `ApiGpu = { vendor: string, model: string, device_name: string, device_class: string, device_id: string }` wire type
- Add `gpus: { used: ApiGpu[], available: ApiGpu[] }` to `ApiNodeRow`
- Add `gpu_requirements: ApiGpu[]` to `ApiVmRow`
- App type `GpuDevice = { vendor: string, model: string, deviceName: string }` — drop `device_class` and `device_id` (PCI identifiers, not useful for display)
- `Node` gets `gpus: { used: GpuDevice[], available: GpuDevice[] }`
- `VM` gets `gpuRequirements: GpuDevice[]`
- Transform functions map snake_case wire fields to camelCase app types

### Display Helper

`formatGpuLabel(gpus: GpuDevice[]): string` in `format.ts`:
- Groups by model, shows count prefix when >1: `"2x RTX 6000 ADA"`
- Falls back to `deviceName` when `model` is empty (e.g. VMs where model is `""`)
- Returns empty string for empty arrays

### Node Table Column

- New "GPU" column after Memory, before VMs
- Shows `Badge variant="default" size="sm"` with label like `"2x RTX 6000 ADA"` via `formatGpuLabel(used + available)`
- Empty cell for non-GPU nodes (no dash — 98% of rows will be empty)
- Sortable by total GPU count (`used.length + available.length`)

### Node Advanced Filter

- "Has GPU" checkbox in the Properties column alongside Staked and IPv6
- Description: "has one or more GPUs"
- Adds `hasGpu?: boolean` to `NodeAdvancedFilters`
- Filter logic: `n.gpus.used.length + n.gpus.available.length > 0`
- Counts toward `activeAdvancedCount`

### Node Detail View

- New GPU card after Resources card, shown only when node has GPUs
- Title: "GPUs (N)" with count
- Lists each GPU: "NVIDIA RTX 6000 ADA" (vendor + model/deviceName)
- Each entry shows badge indicating "in use" or "available"

### VM Advanced Filter

- "Requires GPU" checkbox alongside `hasAllocatedNode` in the "Payment & Allocation" column
- Adds `requiresGpu?: boolean` to `VmAdvancedFilters`
- Filter logic: `v.gpuRequirements.length > 0`
- Counts toward `activeAdvancedCount`

### VM Detail View

- Extend the Requirements card with a GPU row when `gpuRequirements` is non-empty
- Shows: "NVIDIA AD102GL [L40S]" (vendor + deviceName since model is empty for VMs)
- No change when no GPU requirements
