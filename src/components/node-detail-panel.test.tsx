import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { NodeDetailPanel } from "./node-detail-panel";
import type { Node } from "@/api/types";

vi.mock("@/hooks/use-nodes", () => ({
  useNode: vi.fn(),
}));
vi.mock("@/hooks/use-node-state", () => ({
  useNodeState: vi.fn(() => ({ data: undefined })),
}));
vi.mock("@/hooks/use-node-earnings", () => ({
  useNodeEarnings: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isPlaceholderData: false,
  })),
}));

import { useNode } from "@/hooks/use-nodes";
const useNodeMock = vi.mocked(useNode);

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const BUSY_NODE = {
  hash: "crn-hash-1",
  name: "crn-eu-west-04",
  address: "node.example.com",
  status: "healthy",
  staked: true,
  ipv6: null,
  updatedAt: 1_715_000_000,
  cpuArchitecture: "x86_64",
  cpuVendor: "AuthenticAMD",
  cpuFeatures: [],
  confidentialComputing: false,
  vms: [
    { hash: "vm1", status: "dispatched" },
    { hash: "vm2", status: "dispatched" },
    { hash: "vm3", status: "dispatched" },
    { hash: "vm4", status: "dispatched" },
    { hash: "vm5", status: "dispatched" },
    { hash: "vm6", status: "dispatched" },
    { hash: "vm7", status: "dispatched" },
  ],
  history: [],
  resources: undefined,
  gpus: { used: [], available: [] },
} as unknown as Node;

const CU_NODE = {
  ...BUSY_NODE,
  hash: "crn-cu-1",
  resources: {
    vcpusTotal: 32,
    memoryTotalMb: 64 * 1024,
    diskTotalMb: 640 * 1024,
    vcpusAvailable: 24,
    memoryAvailableMb: 48 * 1024,
    diskAvailableMb: 480 * 1024,
    cpuUsagePct: 25,
    memoryUsagePct: 25,
    diskUsagePct: 25,
  },
  vms: [
    { requirements: { vcpus: 1, memoryMb: 2 * 1024, diskMb: 20 * 1024 } },
    { requirements: { vcpus: 4, memoryMb: 8 * 1024, diskMb: 80 * 1024 } },
  ],
} as unknown as Node;

describe("NodeDetailPanel", () => {
  it("renders the Earnings · 24h section and no longer renders the VMs list block", () => {
    useNodeMock.mockReturnValue({
      data: BUSY_NODE,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(<NodeDetailPanel hash="crn-hash-1" onClose={() => {}} />);

    // Earnings heading is present.
    expect(screen.getByText(/Earnings · 24h/i)).toBeInTheDocument();

    // The "VMs (N)" section heading from the old list block is gone.
    expect(screen.queryByText(/^VMs \(\d+\)$/)).not.toBeInTheDocument();

    // No "+N more" suffix from the truncated list.
    expect(screen.queryByText(/^\+\d+ more$/)).not.toBeInTheDocument();
  });

  it("renders a CU row when the node reports resources", () => {
    useNodeMock.mockReturnValue({
      data: CU_NODE,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(<NodeDetailPanel hash="crn-cu-1" onClose={() => {}} />);

    expect(screen.getByText("CU")).toBeInTheDocument();
    // 32 total, used = 1 + 4 = 5, available = 27
    expect(screen.getByText("5 / 32 CU · 27 free")).toBeInTheDocument();
  });
});
