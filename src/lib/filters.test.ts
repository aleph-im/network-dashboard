import { describe, expect, it } from "vitest";
import {
  textSearch,
  countByStatus,
  applyNodeAdvancedFilters,
  applyVmAdvancedFilters,
  computeNodeFilterMaxes,
  computeVmFilterMaxes,
  NODE_FILTER_MAX_FLOOR,
  VM_FILTER_MAX_FLOOR,
} from "@/lib/filters";
import type { Node, VM } from "@/api/types";

const makeResources = (vcpusTotal: number, memoryTotalMb: number) => ({
  vcpusTotal,
  vcpusAvailable: vcpusTotal,
  memoryTotalMb,
  memoryAvailableMb: memoryTotalMb,
  diskTotalMb: 0,
  diskAvailableMb: 0,
  cpuUsagePct: 0,
  memoryUsagePct: 0,
  diskUsagePct: 0,
});

const makeNode = (overrides: Partial<Node> = {}): Node => ({
  hash: "abc123def456",
  name: null,
  address: null,
  status: "healthy",
  staked: false,
  resources: null,
  vmCount: 0,
  updatedAt: "2026-01-01T00:00:00Z",
  owner: null,
  supportsIpv6: null,
  discoveredAt: null,
  gpus: { used: [], available: [] },
  confidentialComputing: false,
  cpuArchitecture: null,
  cpuVendor: null,
  cpuFeatures: [],
  ...overrides,
});

const makeVm = (overrides: Partial<VM> = {}): VM => ({
  hash: "vm_hash_001",
  type: "micro_vm",
  allocatedNode: null,
  observedNodes: [],
  status: "dispatched",
  requirements: { vcpus: 2, memoryMb: 1024, diskMb: 10000 },
  paymentStatus: null,
  updatedAt: "2026-01-01T00:00:00Z",
  allocatedAt: null,
  lastObservedAt: null,
  paymentType: null,
  gpuRequirements: [],
  requiresConfidential: false,
  ...overrides,
});

describe("textSearch", () => {
  const nodes = [
    makeNode({ hash: "aaaa1111", name: "alpha-node", owner: "0xOwnerA" }),
    makeNode({ hash: "bbbb2222", name: null, owner: "0xOwnerB" }),
    makeNode({ hash: "cccc3333", name: "gamma-node", owner: null }),
  ];

  it("returns all rows when query is empty", () => {
    const fields = (n: Node) => [n.hash, n.owner, n.name];
    expect(textSearch(nodes, "", fields)).toHaveLength(3);
  });

  it("matches hash substring case-insensitively", () => {
    const fields = (n: Node) => [n.hash, n.owner, n.name];
    expect(textSearch(nodes, "AAAA", fields)).toEqual([nodes[0]]);
  });

  it("matches owner field", () => {
    const fields = (n: Node) => [n.hash, n.owner, n.name];
    expect(textSearch(nodes, "ownerb", fields)).toEqual([nodes[1]]);
  });

  it("matches name field", () => {
    const fields = (n: Node) => [n.hash, n.owner, n.name];
    expect(textSearch(nodes, "gamma", fields)).toEqual([nodes[2]]);
  });

  it("skips null fields without error", () => {
    const fields = (n: Node) => [n.hash, n.owner, n.name];
    expect(textSearch(nodes, "null", fields)).toEqual([]);
  });
});

describe("countByStatus", () => {
  it("counts items grouped by status", () => {
    const items = [
      makeNode({ status: "healthy" }),
      makeNode({ status: "healthy" }),
      makeNode({ status: "unreachable" }),
    ];
    const counts = countByStatus(items, (n) => n.status);
    expect(counts).toEqual({
      healthy: 2,
      unreachable: 1,
    });
  });

  it("returns empty object for empty array", () => {
    expect(countByStatus([], (n: Node) => n.status)).toEqual({});
  });
});

describe("applyNodeAdvancedFilters", () => {
  it("filters by staked", () => {
    const nodes = [
      makeNode({ staked: true }),
      makeNode({ staked: false }),
    ];
    const result = applyNodeAdvancedFilters(nodes, { staked: true });
    expect(result).toHaveLength(1);
  });

  it("filters by supportsIpv6", () => {
    const nodes = [
      makeNode({ supportsIpv6: true }),
      makeNode({ supportsIpv6: false }),
      makeNode({ supportsIpv6: null }),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      supportsIpv6: true,
    });
    expect(result).toHaveLength(1);
  });

  it("filters by vmCountRange", () => {
    const nodes = [
      makeNode({ vmCount: 5 }),
      makeNode({ vmCount: 15 }),
      makeNode({ vmCount: 0 }),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      vmCountRange: [3, 10],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.vmCount).toBe(5);
  });

  it("does not filter when vmCountRange spans full extent", () => {
    const nodes = [makeNode(), makeNode()];
    expect(
      applyNodeAdvancedFilters(nodes, { vmCountRange: [0, 100] }),
    ).toHaveLength(2);
  });

  it("filters by vcpusTotalRange", () => {
    const nodes = [
      makeNode({
        resources: {
          vcpusTotal: 16,
          memoryTotalMb: 0,
          diskTotalMb: 0,
          vcpusAvailable: 8,
          memoryAvailableMb: 0,
          diskAvailableMb: 0,
          cpuUsagePct: 0,
          memoryUsagePct: 0,
          diskUsagePct: 0,
        },
      }),
      makeNode({
        resources: {
          vcpusTotal: 4,
          memoryTotalMb: 0,
          diskTotalMb: 0,
          vcpusAvailable: 2,
          memoryAvailableMb: 0,
          diskAvailableMb: 0,
          cpuUsagePct: 0,
          memoryUsagePct: 0,
          diskUsagePct: 0,
        },
      }),
      makeNode({ resources: null }),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      vcpusTotalRange: [8, 128],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.resources?.vcpusTotal).toBe(16);
  });

  it("filters by memoryTotalGbRange (converts MB to GB)", () => {
    const nodes = [
      makeNode({
        resources: {
          vcpusTotal: 8,
          memoryTotalMb: 32768,
          diskTotalMb: 0,
          vcpusAvailable: 4,
          memoryAvailableMb: 16384,
          diskAvailableMb: 0,
          cpuUsagePct: 0,
          memoryUsagePct: 0,
          diskUsagePct: 0,
        },
      }),
      makeNode({
        resources: {
          vcpusTotal: 4,
          memoryTotalMb: 4096,
          diskTotalMb: 0,
          vcpusAvailable: 2,
          memoryAvailableMb: 2048,
          diskAvailableMb: 0,
          cpuUsagePct: 0,
          memoryUsagePct: 0,
          diskUsagePct: 0,
        },
      }),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      memoryTotalGbRange: [16, 512],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.resources?.memoryTotalMb).toBe(32768);
  });

  it("combines multiple filters with AND logic", () => {
    const nodes = [
      makeNode({ vmCount: 3, staked: true }),
      makeNode({ vmCount: 3, staked: false }),
      makeNode({ vmCount: 0, staked: true }),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      vmCountRange: [1, 100],
      staked: true,
    });
    expect(result).toHaveLength(1);
  });

  it("filters by hasGpu", () => {
    const gpu = { vendor: "NVIDIA", model: "RTX 6000", deviceName: "AD102GL" };
    const nodes = [
      makeNode({ gpus: { used: [gpu], available: [] } }),
      makeNode({ gpus: { used: [], available: [gpu] } }),
      makeNode(),
    ];
    const result = applyNodeAdvancedFilters(nodes, { hasGpu: true });
    expect(result).toHaveLength(2);
  });

  it("filters by confidentialComputing", () => {
    const nodes = [
      makeNode({ confidentialComputing: true }),
      makeNode({ confidentialComputing: false }),
      makeNode(),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      confidentialComputing: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.confidentialComputing).toBe(true);
  });

  it("filters by cpuVendors — single vendor", () => {
    const nodes = [
      makeNode({ cpuVendor: "AuthenticAMD" }),
      makeNode({ cpuVendor: "GenuineIntel" }),
      makeNode({ cpuVendor: null }),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      cpuVendors: new Set(["AuthenticAMD"]),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.cpuVendor).toBe("AuthenticAMD");
  });

  it("does not filter when cpuVendors includes all known vendors", () => {
    const nodes = [
      makeNode({ cpuVendor: "AuthenticAMD" }),
      makeNode({ cpuVendor: "GenuineIntel" }),
      makeNode({ cpuVendor: null }),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      cpuVendors: new Set(["AuthenticAMD", "GenuineIntel"]),
    });
    expect(result).toHaveLength(3);
  });

  it("shows all when cpuVendors is empty set", () => {
    const nodes = [
      makeNode({ cpuVendor: "AuthenticAMD" }),
      makeNode({ cpuVendor: null }),
    ];
    const result = applyNodeAdvancedFilters(nodes, {
      cpuVendors: new Set(),
    });
    expect(result).toHaveLength(2);
  });

  it("returns all when no filters active", () => {
    const nodes = [makeNode(), makeNode()];
    expect(applyNodeAdvancedFilters(nodes, {})).toHaveLength(2);
  });
});

describe("applyVmAdvancedFilters", () => {
  it("filters by vmTypes", () => {
    const vms = [
      makeVm({ type: "micro_vm" }),
      makeVm({ type: "persistent_program" }),
      makeVm({ type: "instance" }),
    ];
    const result = applyVmAdvancedFilters(vms, {
      vmTypes: new Set(["micro_vm", "instance"]),
    });
    expect(result).toHaveLength(2);
  });

  it("does not filter when vmTypes includes all types", () => {
    const vms = [makeVm({ type: "micro_vm" })];
    const result = applyVmAdvancedFilters(vms, {
      vmTypes: new Set(["micro_vm", "persistent_program", "instance"]),
    });
    expect(result).toHaveLength(1);
  });

  it("shows all when vmTypes is empty set (none selected)", () => {
    const vms = [
      makeVm({ type: "micro_vm" }),
      makeVm({ type: "persistent_program" }),
      makeVm({ type: "instance" }),
    ];
    const result = applyVmAdvancedFilters(vms, {
      vmTypes: new Set(),
    });
    expect(result).toHaveLength(3);
  });

  it("shows all when paymentStatuses is empty set", () => {
    const vms = [
      makeVm({ paymentStatus: "validated" }),
      makeVm({ paymentStatus: null }),
    ];
    const result = applyVmAdvancedFilters(vms, {
      paymentStatuses: new Set(),
    });
    expect(result).toHaveLength(2);
  });

  it("filters by paymentStatuses", () => {
    const vms = [
      makeVm({ paymentStatus: "validated" }),
      makeVm({ paymentStatus: "invalidated" }),
      makeVm({ paymentStatus: null }),
    ];
    const result = applyVmAdvancedFilters(vms, {
      paymentStatuses: new Set(["validated"]),
    });
    expect(result).toHaveLength(1);
  });

  it("filters by hasAllocatedNode", () => {
    const vms = [
      makeVm({ allocatedNode: "node_abc" }),
      makeVm({ allocatedNode: null }),
    ];
    const result = applyVmAdvancedFilters(vms, {
      hasAllocatedNode: true,
    });
    expect(result).toHaveLength(1);
  });

  it("filters by vcpusRange", () => {
    const vms = [
      makeVm({ requirements: { vcpus: 4, memoryMb: 1024, diskMb: 0 } }),
      makeVm({ requirements: { vcpus: 1, memoryMb: 1024, diskMb: 0 } }),
      makeVm({
        requirements: { vcpus: null, memoryMb: null, diskMb: null },
      }),
    ];
    const result = applyVmAdvancedFilters(vms, {
      vcpusRange: [2, 32],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.requirements.vcpus).toBe(4);
  });

  it("filters by memoryMbRange", () => {
    const vms = [
      makeVm({ requirements: { vcpus: 2, memoryMb: 2048, diskMb: 0 } }),
      makeVm({ requirements: { vcpus: 2, memoryMb: 512, diskMb: 0 } }),
    ];
    const result = applyVmAdvancedFilters(vms, {
      memoryMbRange: [1024, 65536],
    });
    expect(result).toHaveLength(1);
  });

  it("filters by requiresGpu", () => {
    const gpu = { vendor: "NVIDIA", model: "", deviceName: "AD102GL [L40S]" };
    const vms = [
      makeVm({ gpuRequirements: [gpu] }),
      makeVm({ gpuRequirements: [] }),
      makeVm(),
    ];
    const result = applyVmAdvancedFilters(vms, { requiresGpu: true });
    expect(result).toHaveLength(1);
  });

  it("filters by requiresConfidential", () => {
    const vms = [
      makeVm({ requiresConfidential: true }),
      makeVm({ requiresConfidential: false }),
      makeVm(),
    ];
    const result = applyVmAdvancedFilters(vms, {
      requiresConfidential: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.requiresConfidential).toBe(true);
  });

  it("returns all when no filters active", () => {
    const vms = [makeVm(), makeVm()];
    expect(applyVmAdvancedFilters(vms, {})).toHaveLength(2);
  });
});

describe("computeNodeFilterMaxes", () => {
  it("returns the floor for an empty fleet", () => {
    expect(computeNodeFilterMaxes([])).toEqual(NODE_FILTER_MAX_FLOOR);
  });

  it("never drops below the floor when nodes are small", () => {
    const nodes = [
      makeNode({ resources: makeResources(8, 16 * 1024), vmCount: 3 }),
    ];
    expect(computeNodeFilterMaxes(nodes)).toEqual(NODE_FILTER_MAX_FLOOR);
  });

  it("rounds up to the next power of two when nodes exceed the floor", () => {
    // 200 vCPUs → 256 ; 600 GB → 1024 ; 130 VMs → 256
    const nodes = [
      makeNode({
        resources: makeResources(200, 600 * 1024),
        vmCount: 130,
      }),
    ];
    expect(computeNodeFilterMaxes(nodes)).toEqual({
      vcpus: 256,
      memoryGb: 1024,
      vmCount: 256,
    });
  });

  it("includes a node above the floor in the filtered result when its range is open", () => {
    // Regression for the user-reported bug: a 256-vCPU node was hidden
    // when the slider extent was hardcoded to 128.
    const nodes = [
      makeNode({
        hash: "big",
        resources: makeResources(256, 1024 * 1024),
      }),
      makeNode({
        hash: "small",
        resources: makeResources(64, 256 * 1024),
      }),
    ];
    const maxes = computeNodeFilterMaxes(nodes);
    const result = applyNodeAdvancedFilters(
      nodes,
      { vcpusTotalRange: [0, maxes.vcpus] },
      maxes,
    );
    expect(result.map((n) => n.hash).sort()).toEqual(["big", "small"]);
  });
});

describe("computeVmFilterMaxes", () => {
  it("returns the floor for an empty fleet", () => {
    expect(computeVmFilterMaxes([])).toEqual(VM_FILTER_MAX_FLOOR);
  });

  it("rounds up to the next power of two when VMs exceed the floor", () => {
    const vms = [
      makeVm({
        requirements: { vcpus: 48, memoryMb: 128 * 1024, diskMb: 0 },
      }),
    ];
    expect(computeVmFilterMaxes(vms)).toEqual({
      vcpus: 64,
      memoryMb: 131072,
    });
  });
});
