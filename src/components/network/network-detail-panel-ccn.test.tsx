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
    render(<NetworkDetailPanelCCN info={ACTIVE_CCN} ownerBalance={250_000} />);
    expect(screen.getByText("CCN")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("94.0%")).toBeInTheDocument();
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
        ownerBalance={null}
      />,
    );
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("shows the owner-locked message when owner balance is below 200k", () => {
    render(
      <NetworkDetailPanelCCN
        info={{ ...ACTIVE_CCN, totalStaked: 600_000 }}
        ownerBalance={100_000}
      />,
    );
    expect(
      screen.getByText(/Owner must hold 200,000 ALEPH/),
    ).toBeInTheDocument();
  });

  it("shows the understaked message when total is below 500k but owner is OK", () => {
    render(
      <NetworkDetailPanelCCN
        info={{ ...ACTIVE_CCN, totalStaked: 428_000 }}
        ownerBalance={250_000}
      />,
    );
    expect(
      screen.getByText(/activation needs 500,000 ALEPH total staked/),
    ).toBeInTheDocument();
  });
});
