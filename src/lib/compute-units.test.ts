import { describe, expect, it } from "vitest";
import {
  computeNodeCu,
  computeNodeCuTotal,
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

const GPU = { vendor: "NVIDIA", model: "RTX", deviceName: "RTX" };

describe("computeNodeCuTotal", () => {
  it("returns null when resources is null", () => {
    expect(computeNodeCuTotal(makeNode({ resources: null }))).toBeNull();
  });

  it("computes standard capacity (limiting resource)", () => {
    // min(32, 64/2=32, 640/20=32) = 32
    expect(computeNodeCuTotal(makeNode({ resources: RES }))).toBe(32);
  });

  it("uses the GPU ratio when the node has a free GPU", () => {
    // min(32, 64/6=10.6, 640/60=10.6) = 10
    const total = computeNodeCuTotal(
      makeNode({ resources: RES, gpus: { used: [], available: [GPU] } }),
    );
    expect(total).toBe(10);
  });

  it("reverts to the standard ratio when every GPU is in use", () => {
    // both GPUs allocated → no free GPU → standard ratio → min(32, 32, 32) = 32
    const total = computeNodeCuTotal(
      makeNode({ resources: RES, gpus: { used: [GPU], available: [] } }),
    );
    expect(total).toBe(32);
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

describe("computeNodeCu", () => {
  it("returns null when resources is null", () => {
    expect(computeNodeCu(makeNode({ resources: null }), [])).toBeNull();
  });

  it("has zero used and full available when no VMs are allocated", () => {
    expect(computeNodeCu(makeNode({ resources: RES }), [])).toEqual({
      total: 32,
      used: 0,
      available: 32,
      isGpu: false,
    });
  });

  it("subtracts allocated VM resources from available", () => {
    // total 32; two balanced VMs consume 8 vCPU / 16 GB / 160 GB
    // free = min(32-8, (64-16)/2, (640-160)/20) = min(24, 24, 24) = 24
    const vms = [
      makeVm({ vcpus: 1, memoryMb: 2 * 1024, diskMb: 20 * 1024 }),
      makeVm({ vcpus: 7, memoryMb: 14 * 1024, diskMb: 140 * 1024 }),
    ];
    expect(computeNodeCu(makeNode({ resources: RES }), vms)).toEqual({
      total: 32,
      used: 8,
      available: 24,
      isGpu: false,
    });
  });

  it("caps available by whichever resource runs out first (disk)", () => {
    // VMs are CPU/RAM-light but disk-heavy: 600 GB of 640 GB consumed
    // free = min(32-2, (64-4)/2, (640-600)/20) = min(30, 30, 2) = 2
    const vms = [
      makeVm({ vcpus: 1, memoryMb: 2 * 1024, diskMb: 300 * 1024 }),
      makeVm({ vcpus: 1, memoryMb: 2 * 1024, diskMb: 300 * 1024 }),
    ];
    expect(computeNodeCu(makeNode({ resources: RES }), vms)).toEqual({
      total: 32,
      used: 30,
      available: 2,
      isGpu: false,
    });
  });

  it("caps available by free vCPUs on a RAM/disk-rich node", () => {
    // 8 vCPU but RAM/disk-rich → total = min(8, 128/2, 2000/20) = 8
    // 6 VMs use 6 vCPU; RAM/disk barely touched → free vCPU is the limit
    const node = makeNode({
      resources: {
        ...RES,
        vcpusTotal: 8,
        memoryTotalMb: 128 * 1024,
        diskTotalMb: 2000 * 1024,
      },
    });
    const vms = Array.from({ length: 6 }, () =>
      makeVm({ vcpus: 1, memoryMb: 1 * 1024, diskMb: 10 * 1024 }),
    );
    expect(computeNodeCu(node, vms)).toEqual({
      total: 8,
      used: 6,
      available: 2,
      isGpu: false,
    });
  });

  it("clamps available at 0 when VMs overcommit a resource", () => {
    // 40 single-vCPU VMs on a 32 vCPU node → vCPU overcommitted
    const vms = Array.from({ length: 40 }, () => makeVm({ vcpus: 1 }));
    expect(computeNodeCu(makeNode({ resources: RES }), vms)).toEqual({
      total: 32,
      used: 32,
      available: 0,
      isGpu: false,
    });
  });

  it("uses the GPU ratio for capacity when a GPU is free", () => {
    // free GPU → GPU ratio → total = min(32, 64/6, 640/60) = 10
    const node = makeNode({
      resources: RES,
      gpus: { used: [], available: [GPU] },
    });
    expect(computeNodeCu(node, [])).toEqual({
      total: 10,
      used: 0,
      available: 10,
      isGpu: true,
    });
  });
});

describe("formatCuSummary", () => {
  it("formats used / total / free", () => {
    expect(
      formatCuSummary({ total: 32, used: 8, available: 24, isGpu: false }),
    ).toBe("8 / 32 CU · 24 free");
  });
});
