import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RevenuePaymentsTable } from "@/components/revenue-payments-table";
import type { BuyflowChainEvent } from "@/api/buyflow-types";

function makeEvent(overrides: Partial<BuyflowChainEvent> = {}): BuyflowChainEvent {
  return {
    token: "0x" + "11".repeat(20),
    sender: "0x" + "22".repeat(20),
    txHash: "0x" + "ab".repeat(32),
    amountIn: 1000,
    isStable: true,
    marketBuy: true,
    timestamp: 1_750_000_000_000,
    alephBurned: 0,
    blockNumber: 100,
    tokenSymbol: "USDC",
    swapAmountIn: 1000,
    toDevelopers: 50,
    alephReceived: 12_000,
    alephToDistribution: 11_950,
    usdValue: 1000,
    ...overrides,
  };
}

describe("RevenuePaymentsTable", () => {
  it("links tx hashes to Etherscan via CopyableText", () => {
    const event = makeEvent();
    render(<RevenuePaymentsTable events={[event]} />);
    // One link in the desktop table, one in the mobile card (CSS picks one).
    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        `https://etherscan.io/tx/${event.txHash}`,
      );
    }
    expect(links.length).toBeGreaterThan(0);
  });

  it("renders newest event first by block number", () => {
    const older = makeEvent({
      txHash: "0x" + "01".repeat(32),
      blockNumber: 1,
      tokenSymbol: "ALEPH",
    });
    const newer = makeEvent({
      txHash: "0x" + "02".repeat(32),
      blockNumber: 2,
      tokenSymbol: "USDC",
    });
    render(<RevenuePaymentsTable events={[older, newer]} />);
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows[0]).toHaveTextContent("USDC");
    expect(rows[1]).toHaveTextContent("ALEPH");
  });

  it("labels direct ALEPH transfers and market buys distinctly", () => {
    render(
      <RevenuePaymentsTable
        events={[
          makeEvent({ txHash: "0x" + "03".repeat(32), marketBuy: true }),
          makeEvent({ txHash: "0x" + "04".repeat(32), marketBuy: false }),
        ]}
      />,
    );
    // Each event renders in both the desktop table and the mobile card list.
    expect(screen.getAllByText("market buy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("direct ALEPH").length).toBeGreaterThan(0);
  });

  it("paginates past 50 events instead of rendering them all", () => {
    const events = Array.from({ length: 60 }, (_, i) =>
      makeEvent({
        txHash: `0x${String(i).padStart(64, "0")}`,
        blockNumber: i,
      }),
    );
    render(<RevenuePaymentsTable events={events} />);
    const dataRows = screen.getAllByRole("row").slice(1);
    expect(dataRows.length).toBe(50);
    expect(screen.getByText(/Showing 1–50 of 60/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no events", () => {
    render(<RevenuePaymentsTable events={[]} />);
    expect(screen.getAllByText("No payments processed yet").length).toBeGreaterThan(0);
  });
});
