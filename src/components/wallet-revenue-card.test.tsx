import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletRevenueCard } from "@/components/wallet-revenue-card";
import type { OwnerRewards } from "@/api/rewards-types";

const NOW_SEC = Math.floor(Date.now() / 1000);

const OWNER: OwnerRewards = {
  address: "0xowner",
  accrualStartSec: NOW_SEC - 10 * 86400,
  totalAleph: 1284,
  bySource: { credit_revenue: 796, holder_tier: 103, wage_subsidy: 385 },
  byNode: [
    { hash: "crnA", name: "node-alpha", role: "crn", totalAleph: 612, bySource: { credit_revenue: 480, holder_tier: 0, wage_subsidy: 132 } },
    { hash: "ccnX", name: "node-bravo", role: "ccn", totalAleph: 418, bySource: { credit_revenue: 300, holder_tier: 30, wage_subsidy: 88 } },
  ],
  stakingAleph: 254,
  unattributedAleph: 0,
  lastPaid: { aleph: 82.28, timeSec: NOW_SEC - 10 * 86400, txHash: "0xtx", status: "pending" },
};

describe("WalletRevenueCard", () => {
  it("shows owed-this-cycle total, sources, nodes, and last payment", () => {
    render(<WalletRevenueCard rewards={OWNER} />);
    expect(screen.getByText(/Owed this cycle/i)).toBeInTheDocument();
    expect(screen.getByText("node-alpha")).toBeInTheDocument();
    expect(screen.getByText(/Min\. wage/i)).toBeInTheDocument();
    expect(screen.getByText(/Last payment/i)).toBeInTheDocument();
    expect(screen.getByText(/Accruing for 10 days/i)).toBeInTheDocument();
    // The distribution message's on-chain status is stale upstream — not rendered.
    expect(screen.queryByText(/pending/i)).toBeNull();
  });

  it("renders nothing when there is no revenue and no payout", () => {
    const { container } = render(
      <WalletRevenueCard rewards={{ ...OWNER, totalAleph: 0, byNode: [], stakingAleph: 0, lastPaid: null }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows skeleton and label but not node rows when breakdownLoading is true", () => {
    render(<WalletRevenueCard rewards={OWNER} breakdownLoading />);
    expect(screen.getByText(/By node/i)).toBeInTheDocument();
    expect(screen.queryByText("node-alpha")).toBeNull();
  });
});
