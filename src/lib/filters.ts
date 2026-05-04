import type { Node, NodeStatus, VM, VmType } from "@/api/types";

/** Generic text search: matches if any field contains the query. */
export function textSearch<T>(
  items: T[],
  query: string,
  fields: (item: T) => (string | null | undefined)[],
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    fields(item).some((f) => f?.toLowerCase().includes(q)),
  );
}

/** Count items grouped by a key extractor. */
export function countByStatus<T>(
  items: T[],
  getStatus: (item: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const s = getStatus(item);
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

/** Check if a range filter is active (not spanning the full extent). */
export function isRangeActive(
  range: [number, number],
  max = 100,
): boolean {
  return range[0] > 0 || range[1] < max;
}

// --- Range slider extents ---

/**
 * Round up to the next power of two, with a floor.
 * Used to derive slider extents that snap to readable numbers
 * (e.g. 200 → 256, 257 → 512) regardless of how large the fleet grows.
 */
function roundUpPow2(n: number, floor: number): number {
  const safe = Math.max(1, n);
  const pow = 2 ** Math.ceil(Math.log2(safe));
  return Math.max(floor, pow);
}

export type NodeFilterMaxes = {
  vmCount: number;
  vcpus: number;
  memoryGb: number;
};

/** Lower bound for slider extents — used when data is empty or loading. */
export const NODE_FILTER_MAX_FLOOR: NodeFilterMaxes = {
  vmCount: 100,
  vcpus: 128,
  memoryGb: 512,
};

export function computeNodeFilterMaxes(nodes: Node[]): NodeFilterMaxes {
  let vcpus = 0;
  let memoryGb = 0;
  let vmCount = 0;
  for (const n of nodes) {
    vcpus = Math.max(vcpus, n.resources?.vcpusTotal ?? 0);
    memoryGb = Math.max(
      memoryGb,
      (n.resources?.memoryTotalMb ?? 0) / 1024,
    );
    vmCount = Math.max(vmCount, n.vmCount);
  }
  return {
    vcpus: roundUpPow2(vcpus, NODE_FILTER_MAX_FLOOR.vcpus),
    memoryGb: roundUpPow2(
      memoryGb,
      NODE_FILTER_MAX_FLOOR.memoryGb,
    ),
    vmCount: roundUpPow2(vmCount, NODE_FILTER_MAX_FLOOR.vmCount),
  };
}

// --- Node advanced filters ---

const ALL_CPU_VENDORS = new Set(["AuthenticAMD", "GenuineIntel"]);

export type NodeAdvancedFilters = {
  staked?: boolean;
  supportsIpv6?: boolean;
  hasGpu?: boolean;
  confidentialComputing?: boolean;
  cpuVendors?: Set<string>;
  vmCountRange?: [number, number];
  vcpusTotalRange?: [number, number];
  memoryTotalGbRange?: [number, number];
};

export function applyNodeAdvancedFilters(
  nodes: Node[],
  filters: NodeAdvancedFilters,
  maxes: NodeFilterMaxes = NODE_FILTER_MAX_FLOOR,
): Node[] {
  let result = nodes;
  if (filters.staked) {
    result = result.filter((n) => n.staked);
  }
  if (filters.supportsIpv6) {
    result = result.filter((n) => n.supportsIpv6 === true);
  }
  if (filters.hasGpu) {
    result = result.filter(
      (n) => n.gpus.used.length + n.gpus.available.length > 0,
    );
  }
  if (filters.confidentialComputing) {
    result = result.filter((n) => n.confidentialComputing);
  }
  if (
    filters.cpuVendors &&
    filters.cpuVendors.size > 0 &&
    filters.cpuVendors.size < ALL_CPU_VENDORS.size
  ) {
    result = result.filter((n) => {
      const vendor = n.cpuVendor ?? "unknown";
      return filters.cpuVendors!.has(vendor);
    });
  }
  if (
    filters.vmCountRange &&
    isRangeActive(filters.vmCountRange, maxes.vmCount)
  ) {
    const [min, max] = filters.vmCountRange;
    result = result.filter(
      (n) => n.vmCount >= min && n.vmCount <= max,
    );
  }
  if (
    filters.vcpusTotalRange &&
    isRangeActive(filters.vcpusTotalRange, maxes.vcpus)
  ) {
    const [min, max] = filters.vcpusTotalRange;
    result = result.filter((n) => {
      const v = n.resources?.vcpusTotal ?? 0;
      return v >= min && v <= max;
    });
  }
  if (
    filters.memoryTotalGbRange &&
    isRangeActive(filters.memoryTotalGbRange, maxes.memoryGb)
  ) {
    const [min, max] = filters.memoryTotalGbRange;
    result = result.filter((n) => {
      const gb = (n.resources?.memoryTotalMb ?? 0) / 1024;
      return gb >= min && gb <= max;
    });
  }
  return result;
}

// --- VM advanced filters ---

export type VmAdvancedFilters = {
  vmTypes?: Set<VmType>;
  paymentStatuses?: Set<string>;
  hasAllocatedNode?: boolean;
  requiresGpu?: boolean;
  requiresConfidential?: boolean;
  vcpusRange?: [number, number];
  memoryGbRange?: [number, number];
  showInactive?: boolean;
};

export type VmFilterMaxes = {
  vcpus: number;
  memoryGb: number;
};

/** Lower bound for slider extents — used when data is empty or loading. */
export const VM_FILTER_MAX_FLOOR: VmFilterMaxes = {
  vcpus: 32,
  memoryGb: 64,
};

export function computeVmFilterMaxes(vms: VM[]): VmFilterMaxes {
  let vcpus = 0;
  let memoryGb = 0;
  for (const v of vms) {
    vcpus = Math.max(vcpus, v.requirements.vcpus ?? 0);
    memoryGb = Math.max(
      memoryGb,
      (v.requirements.memoryMb ?? 0) / 1024,
    );
  }
  return {
    vcpus: roundUpPow2(vcpus, VM_FILTER_MAX_FLOOR.vcpus),
    memoryGb: roundUpPow2(memoryGb, VM_FILTER_MAX_FLOOR.memoryGb),
  };
}

const ALL_VM_TYPES: Set<VmType> = new Set([
  "micro_vm",
  "persistent_program",
  "instance",
]);

const ALL_PAYMENT_STATUSES = new Set(["validated", "invalidated"]);

export function applyVmAdvancedFilters(
  vms: VM[],
  filters: VmAdvancedFilters,
  maxes: VmFilterMaxes = VM_FILTER_MAX_FLOOR,
): VM[] {
  let result = vms;
  if (
    filters.vmTypes &&
    filters.vmTypes.size > 0 &&
    filters.vmTypes.size < ALL_VM_TYPES.size
  ) {
    result = result.filter((v) => filters.vmTypes!.has(v.type));
  }
  if (
    filters.paymentStatuses &&
    filters.paymentStatuses.size > 0 &&
    filters.paymentStatuses.size < ALL_PAYMENT_STATUSES.size
  ) {
    result = result.filter(
      (v) =>
        v.paymentStatus != null &&
        filters.paymentStatuses!.has(v.paymentStatus),
    );
  }
  if (filters.hasAllocatedNode) {
    result = result.filter((v) => v.allocatedNode != null);
  }
  if (filters.requiresGpu) {
    result = result.filter((v) => v.gpuRequirements.length > 0);
  }
  if (filters.requiresConfidential) {
    result = result.filter((v) => v.requiresConfidential);
  }
  if (filters.vcpusRange) {
    const [min, max] = filters.vcpusRange;
    if (min > 0 || max < maxes.vcpus) {
      result = result.filter((v) => {
        const val = v.requirements.vcpus ?? 0;
        return val >= min && val <= max;
      });
    }
  }
  if (filters.memoryGbRange) {
    const [min, max] = filters.memoryGbRange;
    if (min > 0 || max < maxes.memoryGb) {
      result = result.filter((v) => {
        const val = (v.requirements.memoryMb ?? 0) / 1024;
        return val >= min && val <= max;
      });
    }
  }
  return result;
}

export const INACTIVE_NODE_STATUSES: ReadonlySet<NodeStatus> = new Set<NodeStatus>([
  "unreachable",
  "removed",
  "unknown",
]);

/**
 * Hide VMs whose allocated node is in an inactive status.
 *
 * Fail-open: VMs with no allocatedNode pass; VMs whose allocatedNode is missing
 * from the status map (e.g. nodes still loading) also pass. Once nodes load,
 * the memo re-runs and inactive VMs disappear.
 */
export function applyInactiveVmFilter(
  vms: VM[],
  nodeStatusByHash: Map<string, NodeStatus>,
  showInactive: boolean,
): VM[] {
  if (showInactive) return vms;
  return vms.filter((v) => {
    if (!v.allocatedNode) return true;
    const status = nodeStatusByHash.get(v.allocatedNode);
    if (!status) return true;
    return !INACTIVE_NODE_STATUSES.has(status);
  });
}
