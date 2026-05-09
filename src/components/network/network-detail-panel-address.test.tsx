import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetworkDetailPanelAddress } from "@/components/network/network-detail-panel-address";
import type { GraphNode } from "@/lib/network-graph-model";

const STAKER: GraphNode = {
  id: "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
  kind: "staker",
  label: "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
  status: "active",
  owner: null,
  reward: null,
  inactive: false,
};

describe("NetworkDetailPanelAddress", () => {
  it("renders the address, degree summary, and wallet link when degree > 0", () => {
    render(<NetworkDetailPanelAddress node={STAKER} degree={4} />);
    expect(screen.getByText(/Connected to 4 CCNs/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open wallet view/i }),
    ).toHaveAttribute("href", `/wallet?address=${STAKER.id}`);
  });

  it("hides the degree line when degree is 0", () => {
    render(<NetworkDetailPanelAddress node={STAKER} degree={0} />);
    expect(screen.queryByText(/Connected to/i)).not.toBeInTheDocument();
  });

  it("uses 'nodes' for kind=reward in the degree summary", () => {
    render(
      <NetworkDetailPanelAddress
        node={{ ...STAKER, kind: "reward" }}
        degree={2}
      />,
    );
    expect(screen.getByText(/Connected to 2 nodes/i)).toBeInTheDocument();
  });
});
