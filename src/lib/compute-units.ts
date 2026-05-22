import type { Node, VM } from "@/api/types";

/**
 * RAM (GB) and disk (GB) bundled into one Compute Unit, by node class.
 * Standard and confidential nodes share the same ratio; GPU nodes differ.
 */
export const CU_RATIOS = {
  standard: { ramGbPerCu: 2, diskGbPerCu: 20 },
  gpu: { ramGbPerCu: 6, diskGbPerCu: 60 },
} as const;

export type NodeCu = {
  /** CU capacity — the limiting resource, whole number. */
  total: number;
  /** CU consumed by allocated VMs — `total - available`, whole number. */
  used: number;
  /** Free CU — how many more CU the node can still host. */
  available: number;
  /** Whether the GPU ratio was used (node has a free GPU). */
  isGpu: boolean;
};

/**
 * A node is treated as GPU-class while it still has a *free* GPU: its spare
 * capacity can host a GPU instance, so it is measured with the GPU ratio.
 * Once every GPU is allocated, only standard instances can be placed, so the
 * node reverts to the standard ratio.
 */
function isGpuNode(node: Node): boolean {
  return node.gpus.available.length > 0;
}

/** CU implied by a vCPU / RAM / disk triple — the scarcest dimension. */
function cuFromResources(
  vcpus: number,
  memoryMb: number,
  diskMb: number,
  ramGbPerCu: number,
  diskGbPerCu: number,
): number {
  const byCpu = vcpus;
  const byRam = memoryMb / 1024 / ramGbPerCu;
  const byDisk = diskMb / 1024 / diskGbPerCu;
  return Math.min(byCpu, byRam, byDisk);
}

/**
 * Total CU capacity of a CRN — the limiting (scarcest) resource across
 * CPU / RAM / disk, floored to a whole number. Returns `null` when the node
 * reports no `resources`. GPU-class nodes use the 1vCPU/6GB/60GB ratio;
 * everything else uses 1vCPU/2GB/20GB. Confidential computing does not change
 * the ratio.
 */
export function computeNodeCuTotal(node: Node): number | null {
  const r = node.resources;
  if (r == null) return null;

  const { ramGbPerCu, diskGbPerCu } = isGpuNode(node)
    ? CU_RATIOS.gpu
    : CU_RATIOS.standard;

  return Math.max(
    0,
    Math.floor(
      cuFromResources(
        r.vcpusTotal,
        r.memoryTotalMb,
        r.diskTotalMb,
        ramGbPerCu,
        diskGbPerCu,
      ),
    ),
  );
}

/**
 * CU capacity, usage, and availability of a CRN.
 *
 * `available` is how many more CU the node can host — the scarcest of its
 * *remaining* vCPU, RAM, and disk after subtracting what the allocated VMs
 * request. `used` is `total - available`, so the three figures always
 * reconcile. Both are derived from VM allocation, not the node's `*Available`
 * resource fields (those track live hardware utilization, not commitment).
 * Returns `null` when the node reports no `resources`.
 */
export function computeNodeCu(node: Node, vms: VM[]): NodeCu | null {
  const r = node.resources;
  const total = computeNodeCuTotal(node);
  if (r == null || total == null) return null;

  const isGpu = isGpuNode(node);
  const { ramGbPerCu, diskGbPerCu } = isGpu
    ? CU_RATIOS.gpu
    : CU_RATIOS.standard;

  let usedVcpu = 0;
  let usedMemoryMb = 0;
  let usedDiskMb = 0;
  for (const vm of vms) {
    usedVcpu += vm.requirements?.vcpus ?? 0;
    usedMemoryMb += vm.requirements?.memoryMb ?? 0;
    usedDiskMb += vm.requirements?.diskMb ?? 0;
  }

  const freeCu = cuFromResources(
    r.vcpusTotal - usedVcpu,
    r.memoryTotalMb - usedMemoryMb,
    r.diskTotalMb - usedDiskMb,
    ramGbPerCu,
    diskGbPerCu,
  );
  const available = Math.max(0, Math.floor(freeCu));
  const used = total - available;

  return { total, used, available, isGpu };
}

/** Compact one-liner for the detail panels: `"8 / 32 CU · 24 free"`. */
export function formatCuSummary(cu: NodeCu): string {
  return `${cu.used} / ${cu.total} CU · ${cu.available} free`;
}
