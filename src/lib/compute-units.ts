import type { Node, VM, VmRequirements } from "@/api/types";

/**
 * RAM (GB) and disk (GB) bundled into one Compute Unit, by node class.
 * Standard and confidential nodes share the same ratio; GPU nodes differ.
 */
export const CU_RATIOS = {
  standard: { ramGbPerCu: 2, diskGbPerCu: 20 },
  gpu: { ramGbPerCu: 6, diskGbPerCu: 60 },
} as const;

export type NodeCu = {
  /** CU capacity — whole number. */
  total: number;
  /** CU committed to allocated VMs (vCPU/RAM bundles) — whole number. */
  used: number;
  /** Free CU — vCPU/RAM headroom, capped by remaining disk. */
  available: number;
  /** Whether the GPU ratio was used (node has GPU devices). */
  isGpu: boolean;
};

/** A node is GPU-class when it reports any GPU device, used or available. */
function isGpuNode(node: Node): boolean {
  return node.gpus.used.length + node.gpus.available.length > 0;
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

  const byCpu = r.vcpusTotal;
  const byRam = r.memoryTotalMb / 1024 / ramGbPerCu;
  const byDisk = r.diskTotalMb / 1024 / diskGbPerCu;

  return Math.max(0, Math.floor(Math.min(byCpu, byRam, byDisk)));
}

/**
 * CU footprint of one VM — the larger of its requested vCPU and RAM demand,
 * floored at a 1 CU minimum (every VM occupies at least one CU).
 *
 * Disk is deliberately excluded: a CU bundles a fixed vCPU + RAM slice, and a
 * customer who needs more storage buys it separately as persistent storage.
 * Counting disk here would inflate the footprint of a storage-heavy VM far
 * beyond the CU the customer actually provisioned. Disk pressure is instead
 * reflected in `computeNodeCu`'s `available`. `isGpu` must match the host
 * node's class.
 */
export function computeVmCu(
  req: VmRequirements | null | undefined,
  isGpu: boolean,
): number {
  const { ramGbPerCu } = isGpu ? CU_RATIOS.gpu : CU_RATIOS.standard;

  const byCpu = req?.vcpus ?? 0;
  const byRam = (req?.memoryMb ?? 0) / 1024 / ramGbPerCu;

  return Math.max(1, byCpu, byRam);
}

/**
 * CU capacity, usage, and availability of a CRN.
 *
 * `used` is the sum of every allocated VM's vCPU/RAM CU footprint (see
 * `computeVmCu`) — what is committed to VMs, NOT live hardware utilization.
 *
 * `available` is the vCPU/RAM headroom (`total - used`) capped by the disk
 * left on the node: persistent storage is paid separately and consumes disk,
 * so a node can run out of disk while vCPU/RAM still look free — and the
 * leftover vCPU/RAM is then unplaceable. Returns `null` when the node reports
 * no `resources`.
 */
export function computeNodeCu(node: Node, vms: VM[]): NodeCu | null {
  const r = node.resources;
  const total = computeNodeCuTotal(node);
  if (r == null || total == null) return null;

  const isGpu = isGpuNode(node);
  const { diskGbPerCu } = isGpu ? CU_RATIOS.gpu : CU_RATIOS.standard;

  const usedRaw = vms.reduce(
    (sum, vm) => sum + computeVmCu(vm.requirements, isGpu),
    0,
  );
  const used = Math.round(usedRaw);

  const usedDiskGb = vms.reduce(
    (sum, vm) => sum + (vm.requirements?.diskMb ?? 0) / 1024,
    0,
  );
  const freeDiskCu = (r.diskTotalMb / 1024 - usedDiskGb) / diskGbPerCu;
  const available = Math.max(
    0,
    Math.floor(Math.min(total - used, freeDiskCu)),
  );

  return { total, used, available, isGpu };
}

/** Compact one-liner for the detail panels: `"8 / 32 CU · 24 free"`. */
export function formatCuSummary(cu: NodeCu): string {
  return `${cu.used} / ${cu.total} CU · ${cu.available} free`;
}
