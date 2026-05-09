import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetworkDetailPanelCCN } from "@/components/network/network-detail-panel-ccn";
import type { CCNInfo } from "@/api/credit-types";

const ACTIVE_CCN: CCNInfo = {
  hash: "ccn-hash-1",
  name: "aleph-prod-01",
  owner: "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
  reward: "0xee99ff88aa77bb66cc55dd44ee33ff22aa11bb00",
  score: 0.94,
  status: "active",
  stakers: { "0xstaker1": 100, "0xstaker2": 200, "0xstaker3": 300 },
  totalStaked: 1_243_500,
  inactiveSince: null,
  resourceNodes: ["crn-1", "crn-2", "crn-3", "crn-4"],
};

describe("NetworkDetailPanelCCN", () => {
  it("renders identity, score, counts, total staked, owner and reward", () => {
    render(<NetworkDetailPanelCCN info={ACTIVE_CCN} />);
    expect(screen.getByText("CCN")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("0.94")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("CRNs attached")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Stakers")).toBeInTheDocument();
    expect(screen.getByText(/1,243,500\s+ALEPH/)).toBeInTheDocument();
  });

  it("renders the inactive CCN without crashing", () => {
    render(
      <NetworkDetailPanelCCN
        info={{ ...ACTIVE_CCN, inactiveSince: 1700000000 }}
      />,
    );
    expect(screen.getByText("active")).toBeInTheDocument();
  });
});
