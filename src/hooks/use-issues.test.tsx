import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Node, VM } from "@/api/types";

vi.mock("@/hooks/use-vms", () => ({
  useVMs: vi.fn(),
}));
vi.mock("@/hooks/use-nodes", () => ({
  useNodes: vi.fn(),
}));

import { useVMs } from "@/hooks/use-vms";
import { useNodes } from "@/hooks/use-nodes";
import { useIssues } from "@/hooks/use-issues";

const useVMsMock = vi.mocked(useVMs);
const useNodesMock = vi.mocked(useNodes);

function makeVm(overrides: Partial<VM> & Pick<VM, "hash" | "status">): VM {
  return {
    type: "instance",
    allocatedNode: null,
    observedNodes: [],
    requirements: { vcpus: null, memoryMb: null, diskMb: null },
    paymentStatus: null,
    // Relative so the default never ages out of the Issues 30d retention
    // window (a fixed date silently culls these fixtures once it passes 30d).
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    allocatedAt: null,
    lastObservedAt: null,
    paymentType: null,
    gpuRequirements: [],
    requiresConfidential: false,
    schedulingStatus: null,
    migrationTarget: null,
    migrationStartedAt: null,
    owner: null,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useIssues — migrating exclusion", () => {
  it("does not include migrating VMs in issueVMs", () => {
    useVMsMock.mockReturnValue({
      data: [
        makeVm({ hash: "vm-mig", status: "migrating" }),
        makeVm({ hash: "vm-orphan", status: "orphaned" }),
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useVMs>);
    useNodesMock.mockReturnValue({
      data: [] as Node[],
      isLoading: false,
    } as unknown as ReturnType<typeof useNodes>);

    const { result } = renderHook(() => useIssues(), { wrapper });
    const hashes = result.current.issueVMs.map((v) => v.hash);
    expect(hashes).toContain("vm-orphan");
    expect(hashes).not.toContain("vm-mig");
  });
});

describe("useIssues — retention window", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  it("excludes discrepancy VMs whose last activity is older than 30d", () => {
    useVMsMock.mockReturnValue({
      data: [
        makeVm({ hash: "recent-orphan", status: "orphaned", lastObservedAt: daysAgo(5), updatedAt: daysAgo(5) }),
        makeVm({ hash: "old-orphan", status: "orphaned", lastObservedAt: daysAgo(120), updatedAt: daysAgo(120) }),
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useVMs>);
    useNodesMock.mockReturnValue({
      data: [] as Node[],
      isLoading: false,
    } as unknown as ReturnType<typeof useNodes>);

    const { result } = renderHook(() => useIssues(), { wrapper });
    expect(result.current.issueVMs.map((v) => v.hash)).toEqual(["recent-orphan"]);
  });
});
