import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletRevenueCard } from "@/components/wallet-revenue-card";
import type { OwnerRewards } from "@/api/rewards-types";

const OWNER: OwnerRewards = {
  address: "0xowner",
  cycleStartSec: Math.floor(Date.UTC(2026, 5, 1) / 1000),
  cycleEndSec: Math.floor(Date.UTC(2026, 5, 1) / 1000),
  totalAleph: 1284,
  bySource: { credit_revenue: 796, holder_tier: 103, wage_subsidy: 385 },
  byNode: [
    { hash: "crnA", name: "node-alpha", role: "crn", totalAleph: 612, bySource: { credit_revenue: 480, holder_tier: 0, wage_subsidy: 132 } },
    { hash: "ccnX", name: "node-bravo", role: "ccn", totalAleph: 418, bySource: { credit_revenue: 300, holder_tier: 30, wage_subsidy: 88 } },
  ],
  stakingAleph: 254,
  unattributedAleph: 0,
  lastPaid: { aleph: 82.28, timeSec: Math.floor(Date.UTC(2026, 5, 1) / 1000), txHash: "0xtx", status: "pending" },
};

describe("WalletRevenueCard", () => {
  it("shows owed-this-cycle total, sources, nodes, and last payment", () => {
    render(<WalletRevenueCard rewards={OWNER} />);
    expect(screen.getByText(/Owed this cycle/i)).toBeInTheDocument();
    expect(screen.getByText("node-alpha")).toBeInTheDocument();
    expect(screen.getByText(/Min\. wage/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it("renders nothing when there is no revenue and no payout", () => {
    const { container } = render(
      <WalletRevenueCard rewards={{ ...OWNER, totalAleph: 0, byNode: [], stakingAleph: 0, lastPaid: null }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
