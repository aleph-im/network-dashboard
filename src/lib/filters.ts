import type { Node, VM, VmType } from "@/api/types";

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

// --- Node advanced filters ---

export const NODE_VM_COUNT_MAX = 100;
export const NODE_VCPUS_MAX = 128;
export const NODE_MEMORY_GB_MAX = 512;

export type NodeAdvancedFilters = {
  staked?: boolean;
  supportsIpv6?: boolean;
  hasGpu?: boolean;
  confidentialComputing?: boolean;
  vmCountRange?: [number, number];
  vcpusTotalRange?: [number, number];
  memoryTotalGbRange?: [number, number];
};

export function applyNodeAdvancedFilters(
  nodes: Node[],
  filters: NodeAdvancedFilters,
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
    filters.vmCountRange &&
    isRangeActive(filters.vmCountRange, NODE_VM_COUNT_MAX)
  ) {
    const [min, max] = filters.vmCountRange;
    result = result.filter(
      (n) => n.vmCount >= min && n.vmCount <= max,
    );
  }
  if (
    filters.vcpusTotalRange &&
    isRangeActive(filters.vcpusTotalRange, NODE_VCPUS_MAX)
  ) {
    const [min, max] = filters.vcpusTotalRange;
    result = result.filter((n) => {
      const v = n.resources?.vcpusTotal ?? 0;
      return v >= min && v <= max;
    });
  }
  if (
    filters.memoryTotalGbRange &&
    isRangeActive(filters.memoryTotalGbRange, NODE_MEMORY_GB_MAX)
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
  memoryMbRange?: [number, number];
};

export const VM_VCPUS_MAX = 32;
export const VM_MEMORY_MB_MAX = 65536;

const ALL_VM_TYPES: Set<VmType> = new Set([
  "microvm",
  "persistent_program",
  "instance",
]);

const ALL_PAYMENT_STATUSES = new Set(["validated", "invalidated"]);

export function applyVmAdvancedFilters(
  vms: VM[],
  filters: VmAdvancedFilters,
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
    if (min > 0 || max < VM_VCPUS_MAX) {
      result = result.filter((v) => {
        const val = v.requirements.vcpus ?? 0;
        return val >= min && val <= max;
      });
    }
  }
  if (filters.memoryMbRange) {
    const [min, max] = filters.memoryMbRange;
    if (min > 0 || max < VM_MEMORY_MB_MAX) {
      result = result.filter((v) => {
        const val = v.requirements.memoryMb ?? 0;
        return val >= min && val <= max;
      });
    }
  }
  return result;
}
