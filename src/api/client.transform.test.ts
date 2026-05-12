import { describe, expect, it } from "vitest";
import { transformVm } from "@/api/client";
import type { ApiVmRow } from "@/api/types";

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
