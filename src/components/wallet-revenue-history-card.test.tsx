import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletRevenueHistoryCard } from "@/components/wallet-revenue-history-card";
import * as h from "@/hooks/use-owner-rewards-history";
import type { MonthlyReward } from "@/hooks/use-owner-rewards-history";

afterEach(() => vi.restoreAllMocks());

const MONTHS: MonthlyReward[] = [
  { startSec: 1, label: "May", total: 115, partial: false, bySource: { credit_revenue: 100, holder_tier: 10, wage_subsidy: 5 } },
  { startSec: 2, label: "Jun", total: 525, partial: false, bySource: { credit_revenue: 120, holder_tier: 400, wage_subsidy: 5 } },
  { startSec: 3, label: "Jul", total: 38, partial: true, bySource: { credit_revenue: 8, holder_tier: 30, wage_subsidy: 0.3 } },
];

describe("WalletRevenueHistoryCard", () => {
  it("renders chart, month labels, and legend when there is data", () => {
    vi.spyOn(h, "useOwnerRewardsHistory").mockReturnValue({ months: MONTHS, isLoading: false, isError: false });
    render(<WalletRevenueHistoryCard address="0xowner" />);
    expect(screen.getByText("Node revenue history")).toBeInTheDocument();
    expect(screen.getByText("Jun")).toBeInTheDocument();
    expect(screen.getByText("MTD")).toBeInTheDocument();
    expect(screen.getByText("Wage subsidy")).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    vi.spyOn(h, "useOwnerRewardsHistory").mockReturnValue({ months: [], isLoading: true, isError: false });
    const { container } = render(<WalletRevenueHistoryCard address="0xowner" />);
    expect(screen.queryByText("Jun")).toBeNull();
    expect(container.querySelector(".bg-edge")).not.toBeNull();
  });

  it("renders nothing when the wallet has no reward history", () => {
    vi.spyOn(h, "useOwnerRewardsHistory").mockReturnValue({ months: [], isLoading: false, isError: false });
    const { container } = render(<WalletRevenueHistoryCard address="0xowner" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing on error (page-level revenue card surfaces the outage)", () => {
    vi.spyOn(h, "useOwnerRewardsHistory").mockReturnValue({ months: [], isLoading: false, isError: true });
    const { container } = render(<WalletRevenueHistoryCard address="0xowner" />);
    expect(container.firstChild).toBeNull();
  });
});
