import type { Node } from "@/api/types";

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
  /** Free CU — whole number, clamped to `<= total`. */
  available: number;
  /** Consumed CU — `total - available`, always `>= 0`. */
  used: number;
  /** Whether the GPU ratio was used (node has GPU devices). */
  isGpu: boolean;
};

/**
 * CU for one resource snapshot: the limiting dimension across CPU, RAM, disk.
 * Memory and disk are supplied in MB and converted to GB before the division.
 */
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
  return Math.max(0, Math.floor(Math.min(byCpu, byRam, byDisk)));
}

/**
 * Compute the CU capacity, availability, and usage of a CRN.
 *
 * Returns `null` when the node reports no `resources`. GPU-class nodes (any
 * GPU device, used or available) use the 1vCPU/6GB/60GB ratio; everything
 * else uses 1vCPU/2GB/20GB. Confidential computing does not change the ratio.
 */
export function computeNodeCu(node: Node): NodeCu | null {
  const r = node.resources;
  if (r == null) return null;

  const isGpu = node.gpus.used.length + node.gpus.available.length > 0;
  const { ramGbPerCu, diskGbPerCu } = isGpu
    ? CU_RATIOS.gpu
    : CU_RATIOS.standard;

  const total = cuFromResources(
    r.vcpusTotal,
    r.memoryTotalMb,
    r.diskTotalMb,
    ramGbPerCu,
    diskGbPerCu,
  );
  const rawAvailable = cuFromResources(
    r.vcpusAvailable,
    r.memoryAvailableMb,
    r.diskAvailableMb,
    ramGbPerCu,
    diskGbPerCu,
  );
  const available = Math.min(rawAvailable, total);
  const used = total - available;

  return { total, available, used, isGpu };
}

/** Compact one-liner for the detail panels: `"8 / 32 CU · 24 free"`. */
export function formatCuSummary(cu: NodeCu): string {
  return `${cu.used} / ${cu.total} CU · ${cu.available} free`;
}
