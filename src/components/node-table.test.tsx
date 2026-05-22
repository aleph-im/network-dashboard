import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { NodeTable } from "@/components/node-table";
import type { Node } from "@/api/types";

// Stub router — no real Next.js runtime needed.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/nodes",
  useSearchParams: () => new URLSearchParams(),
}));

// Stub the node-fetching hook so we control the data completely.
const useNodesMock = vi.fn(() => ({ data: [] as Node[], isLoading: false }));
vi.mock("@/hooks/use-nodes", () => ({
  useNodes: () => useNodesMock(),
  useNode: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

function renderWithQuery(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

function renderNodeTable(nodes: Node[] = [BASE_NODE]) {
  useNodesMock.mockReturnValue({ data: nodes, isLoading: false });
  return renderWithQuery(
    <NodeTable onSelectNode={() => {}} />,
  );
}

const BASE_NODE: Node = {
  hash: "abc123def456abc123def456abc123de",
  name: "test-node",
  address: "node.example.com",
  status: "healthy",
  staked: true,
  supportsIpv6: true,
  owner: "0x" + "aa".repeat(20),
  discoveredAt: null,
  updatedAt: "2024-05-01T00:00:00Z",
  vmCount: 0,
  confidentialComputing: false,
  cpuArchitecture: "x86_64",
  cpuVendor: "AuthenticAMD",
  cpuFeatures: [],
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
  gpus: { used: [], available: [] },
};

describe("NodeTable", () => {
  it("shows a CU column instead of vCPUs", () => {
    renderNodeTable([BASE_NODE]);
    // Scope assertions to the table element so the "vCPUs" slider label in
    // the filter panel (still present as a hardware filter) doesn't interfere.
    const table = screen.getByRole("table");
    expect(within(table).getByText("CU")).toBeInTheDocument();
    expect(within(table).queryByText("vCPUs")).not.toBeInTheDocument();
  });
});
