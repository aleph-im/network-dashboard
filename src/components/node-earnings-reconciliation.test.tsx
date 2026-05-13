import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NodeEarningsReconciliation } from "./node-earnings-reconciliation";
import type { Reconciliation } from "@/hooks/use-node-earnings";

const fullReconciliation: Reconciliation = {
  rewardAddr: "0xWALLET",
  windowAleph: 14.28,
  thisNode: 7.42,
  otherSameKind: { aleph: 3.18, count: 3 },
  crossKind: { aleph: 2.4, role: "ccn" },
  staker: 1.28,
};

const noOverlap: Reconciliation = {
  rewardAddr: "0xWALLET",
  windowAleph: 7.42,
  thisNode: 7.42,
  otherSameKind: { aleph: 0, count: 0 },
  crossKind: { aleph: 0, role: "ccn" },
  staker: 0,
};

describe("NodeEarningsReconciliation", () => {
  it("returns null when reconciliation is null", () => {
    const { container } = render(
      <NodeEarningsReconciliation
        reconciliation={null}
        range="24h"
        kind="crn"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the no-overlap caption when no portfolio overlap", () => {
    render(
      <NodeEarningsReconciliation
        reconciliation={noOverlap}
        range="24h"
        kind="crn"
      />,
    );
    expect(
      screen.getByText(/earned only from this node in the last 24h/i),
    ).toBeInTheDocument();
    // No stacked bar segments rendered
    expect(screen.queryByTestId("reconciliation-bar")).toBeNull();
  });

  it("renders the stacked bar and labels for CRN view with overlap", () => {
    render(
      <NodeEarningsReconciliation
        reconciliation={fullReconciliation}
        range="24h"
        kind="crn"
      />,
    );
    // Stacked bar present
    expect(screen.getByTestId("reconciliation-bar")).toBeInTheDocument();
    // CRN view labels
    expect(screen.getByText("This node")).toBeInTheDocument();
    expect(screen.getByText(/Other CRNs \(3\)/)).toBeInTheDocument();
    expect(screen.getByText("CCN ops")).toBeInTheDocument();
    expect(screen.getByText("Staking")).toBeInTheDocument();
  });

  it("renders CCN-view labels for CCN kind", () => {
    render(
      <NodeEarningsReconciliation
        reconciliation={{
          ...fullReconciliation,
          otherSameKind: { aleph: 3.18, count: 2 },
          crossKind: { aleph: 2.4, role: "crn" },
        }}
        range="7d"
        kind="ccn"
      />,
    );
    expect(screen.getByText(/Other CCNs \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("CRN ops")).toBeInTheDocument();
  });

  it("links to /wallet?address=<rewardAddr>", () => {
    render(
      <NodeEarningsReconciliation
        reconciliation={fullReconciliation}
        range="24h"
        kind="crn"
      />,
    );
    const link = screen.getByRole("link", { name: /view full wallet/i });
    expect(link).toHaveAttribute("href", "/wallet?address=0xWALLET");
  });
});
