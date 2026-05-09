import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { NetworkDetailPanel } from "@/components/network/network-detail-panel";
import type { NodeState } from "@/api/credit-types";
import type { Graph, GraphNode } from "@/lib/network-graph-model";

vi.mock("@/hooks/use-nodes", () => ({
  useNode: () => ({ data: null, isLoading: false }),
}));

const CCN_NODE: GraphNode = {
  id: "ccn-hash-1",
  kind: "ccn",
  label: "aleph-prod-01",
  status: "active",
  owner: "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
  reward: "0xee99ff88aa77bb66cc55dd44ee33ff22aa11bb00",
  inactive: false,
};

const NODE_STATE: NodeState = {
  ccns: new Map([
    [
      "ccn-hash-1",
      {
        hash: "ccn-hash-1",
        name: "aleph-prod-01",
        owner: CCN_NODE.owner!,
        reward: CCN_NODE.reward!,
        score: 0.94,
        status: "active",
        stakers: { "0x1": 100 },
        totalStaked: 1000,
        inactiveSince: null,
        resourceNodes: ["crn-1", "crn-2"],
      },
    ],
  ]),
  crns: new Map(),
};

const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("NetworkDetailPanel", () => {
  it("renders the CCN body with title and view-full-details footer", () => {
    renderWithQuery(
      <NetworkDetailPanel
        node={CCN_NODE}
        nodeState={NODE_STATE}
        visibleGraph={EMPTY_GRAPH}
        focusNode={null}
        onClose={() => {}}
        onFocus={() => {}}
        onStepBackFocus={() => {}}
        onClearFocus={() => {}}
      />,
    );
    expect(screen.getByText("aleph-prod-01")).toBeInTheDocument();
    expect(screen.getByText("CRNs attached")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View full details/i }),
    ).toHaveAttribute("href", "/nodes?view=ccn-hash-1");
  });

  it("calls onFocus with the node id when Focus is clicked", async () => {
    const onFocus = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <NetworkDetailPanel
        node={CCN_NODE}
        nodeState={NODE_STATE}
        visibleGraph={EMPTY_GRAPH}
        focusNode={null}
        onClose={() => {}}
        onFocus={onFocus}
        onStepBackFocus={() => {}}
        onClearFocus={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^Focus$/i }));
    expect(onFocus).toHaveBeenCalledWith("ccn-hash-1");
  });

  it("calls onClose when Close is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <NetworkDetailPanel
        node={CCN_NODE}
        nodeState={NODE_STATE}
        visibleGraph={EMPTY_GRAPH}
        focusNode={null}
        onClose={onClose}
        onFocus={() => {}}
        onStepBackFocus={() => {}}
        onClearFocus={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Close panel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders address body without footer for staker nodes", () => {
    const stakerNode: GraphNode = {
      id: "0xstaker",
      kind: "staker",
      label: "0xstaker",
      status: "active",
      owner: null,
      reward: null,
      inactive: false,
    };
    const graphWithEdges: Graph = {
      nodes: [],
      edges: [
        { source: "0xstaker", target: "ccn-1", type: "staker" },
        { source: "0xstaker", target: "ccn-2", type: "staker" },
      ],
    };
    renderWithQuery(
      <NetworkDetailPanel
        node={stakerNode}
        nodeState={NODE_STATE}
        visibleGraph={graphWithEdges}
        focusNode={null}
        onClose={() => {}}
        onFocus={() => {}}
        onStepBackFocus={() => {}}
        onClearFocus={() => {}}
      />,
    );
    expect(screen.getByText("Staker")).toBeInTheDocument();
    expect(screen.getByText(/Connected to 2 CCNs/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /View full details/i }),
    ).not.toBeInTheDocument();
  });

  it("returns null when node is null", () => {
    const { container } = renderWithQuery(
      <NetworkDetailPanel
        node={null}
        nodeState={NODE_STATE}
        visibleGraph={EMPTY_GRAPH}
        focusNode={null}
        onClose={() => {}}
        onFocus={() => {}}
        onStepBackFocus={() => {}}
        onClearFocus={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
