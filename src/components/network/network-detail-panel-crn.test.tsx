import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { NetworkDetailPanelCRN } from "@/components/network/network-detail-panel-crn";
import type { CCNInfo, CRNInfo } from "@/api/credit-types";
import type { Node } from "@/api/types";

const CRN: CRNInfo = {
  hash: "crn-hash-1",
  name: "crn-eu-west-04",
  owner: "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
  reward: "0xee99ff88aa77bb66cc55dd44ee33ff22aa11bb00",
  score: 0.88,
  status: "active",
  inactiveSince: null,
  parent: "ccn-hash-1",
};

const PARENT: CCNInfo = {
  hash: "ccn-hash-1",
  name: "aleph-prod-01",
  owner: "0x0000000000000000000000000000000000000000",
  reward: "0x0000000000000000000000000000000000000000",
  score: 0.94,
  status: "active",
  stakers: {},
  totalStaked: 0,
  inactiveSince: null,
  resourceNodes: ["crn-hash-1"],
};

vi.mock("@/hooks/use-nodes", () => ({
  useNode: vi.fn(),
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

describe("NetworkDetailPanelCRN", () => {
  it("renders identity, parent CCN, and resources skeleton while loading", () => {
    useNodeMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={CRN}
        parent={PARENT}
        unreachable={false}
        onFocusParent={() => {}}
      />,
    );
    expect(screen.getByText("CRN")).toBeInTheDocument();
    expect(screen.getByText(/aleph-prod-01/)).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
  });

  it("renders resource bars and VM count when scheduler data is available", () => {
    const node = {
      hash: "crn-hash-1",
      vms: [{}, {}, {}, {}, {}, {}, {}],
      resources: {
        vcpusTotal: 32,
        memoryTotalMb: 131072,
        diskTotalMb: 0,
        cpuUsagePct: 62,
        memoryUsagePct: 48,
        diskUsagePct: 0,
      },
    } as unknown as Node;
    useNodeMock.mockReturnValue({
      data: node,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={CRN}
        parent={PARENT}
        unreachable={false}
        onFocusParent={() => {}}
      />,
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(/CPU.*32 vCPUs/)).toBeInTheDocument();
    expect(screen.getByText(/Memory.*128 GB/)).toBeInTheDocument();
  });

  it("omits resources when scheduler returns no data", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={CRN}
        parent={PARENT}
        unreachable={false}
        onFocusParent={() => {}}
      />,
    );
    expect(screen.queryByText("Resources")).not.toBeInTheDocument();
  });

  it("renders an em-dash when there is no parent CCN", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={{ ...CRN, parent: null }}
        parent={null}
        unreachable={false}
        onFocusParent={() => {}}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/aleph-prod-01/)).not.toBeInTheDocument();
  });

  it("renders the unreachable message when scheduler health is failing", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={{ ...CRN, status: "linked", score: 0.95 }}
        parent={PARENT}
        unreachable={true}
        onFocusParent={() => {}}
      />,
    );
    expect(
      screen.getByText(/Unreachable — scheduler health check is failing/i),
    ).toBeInTheDocument();
  });

  it("renders the low-score message when score is below 0.8 and reachable", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={{ ...CRN, status: "linked", score: 0.65 }}
        parent={PARENT}
        unreachable={false}
        onFocusParent={() => {}}
      />,
    );
    expect(
      screen.getByText(/Low score \(0\.65\) — below the 0\.8 threshold/i),
    ).toBeInTheDocument();
  });

  it("prefers the unreachable message when both signals fire (severity cascade)", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={{ ...CRN, status: "linked", score: 0.4 }}
        parent={PARENT}
        unreachable={true}
        onFocusParent={() => {}}
      />,
    );
    expect(
      screen.getByText(/Unreachable — scheduler health check is failing/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Low score/i),
    ).not.toBeInTheDocument();
  });

  it("renders the Migrations row when inbound + outbound > 0", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={CRN}
        parent={PARENT}
        unreachable={false}
        inboundMigrations={1}
        outboundMigrations={2}
        onFocusParent={() => {}}
      />,
    );
    expect(screen.getByText(/Migrations/i)).toBeInTheDocument();
    expect(screen.getByText(/→\s*2\s*outbound/i)).toBeInTheDocument();
    expect(screen.getByText(/←\s*1\s*inbound/i)).toBeInTheDocument();
  });

  it("renders the Earnings · 24h section heading", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={CRN}
        parent={PARENT}
        unreachable={false}
        onFocusParent={() => {}}
      />,
    );
    expect(screen.getByText(/Earnings · 24h/i)).toBeInTheDocument();
  });

  it("hides the Migrations row when both counts are zero", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={CRN}
        parent={PARENT}
        unreachable={false}
        inboundMigrations={0}
        outboundMigrations={0}
        onFocusParent={() => {}}
      />,
    );
    expect(screen.queryByText(/Migrations/i)).not.toBeInTheDocument();
  });
});
