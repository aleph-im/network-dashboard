import { describe, expect, it } from "vitest";
import { computeNodeCu, formatCuSummary } from "@/lib/compute-units";
import type { Node } from "@/api/types";

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

describe("computeNodeCu", () => {
  it("returns null when resources is null", () => {
    expect(computeNodeCu(makeNode({ resources: null }))).toBeNull();
  });

  it("computes standard CU when the node has no GPUs", () => {
    // 32 vCPU / (64GB / 2) / (640GB / 20) = min(32, 32, 32) = 32
    const cu = computeNodeCu(makeNode({ resources: RES }));
    expect(cu).toEqual({ total: 32, available: 24, used: 8, isGpu: false });
  });

  it("uses the GPU ratio when the node has GPU devices", () => {
    // 32 vCPU / (64GB / 6) / (640GB / 60) = min(32, 10.6, 10.6) = 10
    const cu = computeNodeCu(
      makeNode({
        resources: RES,
        gpus: {
          used: [],
          available: [{ vendor: "NVIDIA", model: "RTX", deviceName: "RTX" }],
        },
      }),
    );
    expect(cu?.isGpu).toBe(true);
    expect(cu?.total).toBe(10);
  });

  it("is RAM-limited when memory is the scarce resource", () => {
    // 32 vCPU but only 16GB RAM → standard: min(32, 16/2=8, ...) = 8
    const cu = computeNodeCu(
      makeNode({
        resources: { ...RES, memoryTotalMb: 16 * 1024 },
      }),
    );
    expect(cu?.total).toBe(8);
  });

  it("is disk-limited when disk is the scarce resource", () => {
    // 32 vCPU, 64GB RAM, but only 100GB disk → standard: min(32, 32, 100/20=5) = 5
    const cu = computeNodeCu(
      makeNode({
        resources: { ...RES, diskTotalMb: 100 * 1024 },
      }),
    );
    expect(cu?.total).toBe(5);
  });

  it("returns 0 CU for a node with zero vCPUs", () => {
    const cu = computeNodeCu(
      makeNode({
        resources: { ...RES, vcpusTotal: 0, vcpusAvailable: 0 },
      }),
    );
    expect(cu?.total).toBe(0);
    expect(cu?.used).toBe(0);
  });

  it("clamps available to total so used is never negative", () => {
    // available resources exceed total (inconsistent API data)
    const cu = computeNodeCu(
      makeNode({
        resources: {
          ...RES,
          vcpusAvailable: 64,
          memoryAvailableMb: 128 * 1024,
          diskAvailableMb: 1280 * 1024,
        },
      }),
    );
    expect(cu?.available).toBe(32);
    expect(cu?.used).toBe(0);
  });
});

describe("formatCuSummary", () => {
  it("formats used / total / free", () => {
    expect(
      formatCuSummary({ total: 32, available: 24, used: 8, isGpu: false }),
    ).toBe("8 / 32 CU · 24 free");
  });
});
