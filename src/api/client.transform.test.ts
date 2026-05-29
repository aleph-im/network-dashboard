import { describe, expect, it } from "vitest";
import { transformVm } from "@/api/client";
import { applyRetentionWindow } from "@/lib/filters";
import type { ApiVmRow, VM } from "@/api/types";

function makeRow(overrides?: Partial<ApiVmRow>): ApiVmRow {
  return {
    vm_hash: "vm-1",
    vm_type: "instance",
    allocated_node: null,
    allocated_at: null,
    observed_nodes: [],
    last_observed_at: null,
    status: "scheduled",
    requirements_vcpus: null,
    requirements_memory_mb: null,
    requirements_disk_mb: null,
    payment_type: null,
    payment_status: null,
    updated_at: "2026-05-12T00:00:00Z",
    requires_confidential: false,
    gpu_requirements: [],
    cpu_architecture: null,
    cpu_vendor: null,
    cpu_features: [],
    scheduling_status: null,
    migration_target: null,
    migration_started_at: null,
    owner: null,
    ...overrides,
  };
}

describe("transformVm", () => {
  it("maps the four new fields verbatim", () => {
    const vm = transformVm(
      makeRow({
        scheduling_status: "dispatched",
        migration_target: "node-target-hash",
        migration_started_at: "2026-05-12T12:34:56Z",
        owner: "0xabc1230000000000000000000000000000000000",
      }),
    );
    expect(vm.schedulingStatus).toBe("dispatched");
    expect(vm.migrationTarget).toBe("node-target-hash");
    expect(vm.migrationStartedAt).toBe("2026-05-12T12:34:56Z");
    expect(vm.owner).toBe("0xabc1230000000000000000000000000000000000");
  });

  it("preserves nulls when the scheduler omits the fields", () => {
    const vm = transformVm(makeRow());
    expect(vm.schedulingStatus).toBeNull();
    expect(vm.migrationTarget).toBeNull();
    expect(vm.migrationStartedAt).toBeNull();
    expect(vm.owner).toBeNull();
  });

  it("accepts `migrating` as a valid status value", () => {
    const vm = transformVm(makeRow({ status: "migrating" }));
    expect(vm.status).toBe("migrating");
  });
});

describe("overview totalVMs window rule", () => {
  const NOW = new Date("2026-05-29T00:00:00Z").getTime();
  const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
  const vm = (over: Partial<VM>): VM =>
    ({
      hash: "h", type: "instance", allocatedNode: null, observedNodes: [],
      status: "dispatched", requirements: { vcpus: 1, memoryMb: 1, diskMb: 1 },
      paymentStatus: null, updatedAt: daysAgo(1), allocatedAt: null,
      lastObservedAt: daysAgo(1), paymentType: null, gpuRequirements: [],
      requiresConfidential: false, schedulingStatus: null, migrationTarget: null,
      migrationStartedAt: null, owner: null, ...over,
    }) as VM;

  it("counts only VMs active within 7d", () => {
    const vms = [
      vm({ hash: "live", lastObservedAt: daysAgo(1), updatedAt: daysAgo(1) }),
      vm({ hash: "dead", status: "unscheduled", lastObservedAt: daysAgo(40), updatedAt: daysAgo(40) }),
    ];
    expect(applyRetentionWindow(vms, "7d", NOW)).toHaveLength(1);
  });
});
