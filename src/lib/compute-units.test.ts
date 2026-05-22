import { describe, expect, it } from "vitest";
import {
  computeNodeCu,
  computeNodeCuTotal,
  computeVmCu,
  formatCuSummary,
} from "@/lib/compute-units";
import type { Node, VM } from "@/api/types";

function makeNode(over: Partial<Node>): Node {
  return {
    hash: "h",
    name: null,
    address: null,
    status: "healthy",
    staked: false,
    resources: null,
    vmCount: 0,
    updatedAt: "2026-05-22T00:00:00Z",
    owner: null,
    supportsIpv6: null,
    discoveredAt: null,
    gpus: { used: [], available: [] },
    confidentialComputing: false,
    cpuArchitecture: null,
    cpuVendor: null,
    cpuFeatures: [],
    ...over,
  };
}

function makeVm(req: Partial<VM["requirements"]>): VM {
  return {
    hash: "vm",
    type: "instance",
    allocatedNode: null,
    observedNodes: [],
    status: "dispatched",
    requirements: { vcpus: null, memoryMb: null, diskMb: null, ...req },
    paymentStatus: null,
    updatedAt: "2026-05-22T00:00:00Z",
    allocatedAt: null,
    lastObservedAt: null,
    paymentType: null,
    gpuRequirements: [],
    requiresConfidential: false,
    schedulingStatus: null,
    migrationTarget: null,
    migrationStartedAt: null,
    owner: null,
  };
}

const RES = {
  vcpusTotal: 32,
  memoryTotalMb: 64 * 1024,
  diskTotalMb: 640 * 1024,
  vcpusAvailable: 24,
  memoryAvailableMb: 48 * 1024,
  diskAvailableMb: 480 * 1024,
  cpuUsagePct: 25,
  memoryUsagePct: 25,
  diskUsagePct: 25,
};

describe("computeNodeCuTotal", () => {
  it("returns null when resources is null", () => {
    expect(computeNodeCuTotal(makeNode({ resources: null }))).toBeNull();
  });

  it("computes standard capacity (limiting resource)", () => {
    // min(32, 64/2=32, 640/20=32) = 32
    expect(computeNodeCuTotal(makeNode({ resources: RES }))).toBe(32);
  });

  it("uses the GPU ratio when the node has GPU devices", () => {
    // min(32, 64/6=10.6, 640/60=10.6) = 10
    const total = computeNodeCuTotal(
      makeNode({
        resources: RES,
        gpus: {
          used: [],
          available: [{ vendor: "NVIDIA", model: "RTX", deviceName: "RTX" }],
        },
      }),
    );
    expect(total).toBe(10);
  });

  it("is RAM-limited when memory is the scarce resource", () => {
    // 16GB RAM standard → min(32, 16/2=8, ...) = 8
    expect(
      computeNodeCuTotal(makeNode({ resources: { ...RES, memoryTotalMb: 16 * 1024 } })),
    ).toBe(8);
  });

  it("is disk-limited when disk is the scarce resource", () => {
    // 100GB disk standard → min(32, 32, 100/20=5) = 5
    expect(
      computeNodeCuTotal(makeNode({ resources: { ...RES, diskTotalMb: 100 * 1024 } })),
    ).toBe(5);
  });
});

describe("computeVmCu", () => {
  it("is the larger of vCPU and RAM, ignoring disk", () => {
    // 2 vCPU / 4GB / 2000GB standard → max(2, 4/2=2) = 2 (disk ignored)
    expect(
      computeVmCu({ vcpus: 2, memoryMb: 4 * 1024, diskMb: 2000 * 1024 }, false),
    ).toBe(2);
  });

  it("is RAM-dominated when RAM is the larger dimension", () => {
    // 1 vCPU / 16GB standard → max(1, 16/2=8) = 8
    expect(computeVmCu({ vcpus: 1, memoryMb: 16 * 1024, diskMb: 0 }, false)).toBe(8);
  });

  it("is vCPU-dominated when vCPU is the larger dimension", () => {
    // 4 vCPU / 4GB standard → max(4, 4/2=2) = 4
    expect(computeVmCu({ vcpus: 4, memoryMb: 4 * 1024, diskMb: 0 }, false)).toBe(4);
  });

  it("floors at 1 CU for a tiny VM", () => {
    expect(computeVmCu({ vcpus: 1, memoryMb: 256, diskMb: 512 }, false)).toBe(1);
  });

  it("treats null / missing requirements as 1 CU", () => {
    expect(computeVmCu({ vcpus: null, memoryMb: null, diskMb: null }, false)).toBe(1);
    expect(computeVmCu(null, false)).toBe(1);
  });

  it("uses the GPU ratio when the host is GPU-class", () => {
    // 1 vCPU / 18GB gpu → max(1, 18/6=3) = 3
    expect(computeVmCu({ vcpus: 1, memoryMb: 18 * 1024, diskMb: 0 }, true)).toBe(3);
  });
});

describe("computeNodeCu", () => {
  it("returns null when resources is null", () => {
    expect(computeNodeCu(makeNode({ resources: null }), [])).toBeNull();
  });

  it("has zero used and full available when no VMs are allocated", () => {
    // total 32; no disk consumed → available capped only by total - used
    expect(computeNodeCu(makeNode({ resources: RES }), [])).toEqual({
      total: 32,
      used: 0,
      available: 32,
      isGpu: false,
    });
  });

  it("sums per-VM vCPU/RAM footprints for used", () => {
    // VMs: max(1,1)=1 and max(4,4)=4 → used 5; disk 100GB → free 540GB/20=27
    const vms = [
      makeVm({ vcpus: 1, memoryMb: 2 * 1024, diskMb: 20 * 1024 }),
      makeVm({ vcpus: 4, memoryMb: 8 * 1024, diskMb: 80 * 1024 }),
    ];
    expect(computeNodeCu(makeNode({ resources: RES }), vms)).toEqual({
      total: 32,
      used: 5,
      available: 27,
      isGpu: false,
    });
  });

  it("does not inflate used CU for a storage-heavy VM", () => {
    // 2 vCPU / 4GB / 2000GB → used 2 (disk excluded); disk overflows the node
    const vms = [makeVm({ vcpus: 2, memoryMb: 4 * 1024, diskMb: 2000 * 1024 })];
    const cu = computeNodeCu(makeNode({ resources: RES }), vms);
    expect(cu?.used).toBe(2);
    expect(cu?.available).toBe(0);
  });

  it("caps available by the disk left on the node", () => {
    // 5 VMs of 1 CU each → used 5 (vCPU/RAM headroom would be 27);
    // disk: 5 × 120GB = 600GB used of 640GB → 40GB free → 2 CU
    const vms = Array.from({ length: 5 }, () =>
      makeVm({ vcpus: 1, memoryMb: 2 * 1024, diskMb: 120 * 1024 }),
    );
    expect(computeNodeCu(makeNode({ resources: RES }), vms)).toEqual({
      total: 32,
      used: 5,
      available: 2,
      isGpu: false,
    });
  });

  it("counts every VM as at least 1 CU", () => {
    // 25 sub-1-CU VMs → used 25 (each floored to 1)
    const vms = Array.from({ length: 25 }, () =>
      makeVm({ vcpus: 1, memoryMb: 256, diskMb: 512 }),
    );
    expect(computeNodeCu(makeNode({ resources: RES }), vms)?.used).toBe(25);
  });

  it("clamps available at 0 when VMs overcommit vCPU/RAM", () => {
    // total = min(4, 8/2=4, 80/20=4) = 4; one 10-CU VM
    const node = makeNode({
      resources: { ...RES, vcpusTotal: 4, memoryTotalMb: 8 * 1024, diskTotalMb: 80 * 1024 },
    });
    const vms = [makeVm({ vcpus: 10, memoryMb: 20 * 1024, diskMb: 0 })];
    const cu = computeNodeCu(node, vms);
    expect(cu?.total).toBe(4);
    expect(cu?.used).toBe(10);
    expect(cu?.available).toBe(0);
  });
});

describe("formatCuSummary", () => {
  it("formats used / total / free", () => {
    expect(
      formatCuSummary({ total: 32, used: 8, available: 24, isGpu: false }),
    ).toBe("8 / 32 CU · 24 free");
  });
});
