import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { RewardHistoryChart } from "@/components/reward-history-chart";
import type { MonthlyReward } from "@/hooks/use-owner-rewards-history";

const MONTHS: MonthlyReward[] = [
  { startSec: 1, label: "May", total: 115, partial: false, bySource: { credit_revenue: 100, holder_tier: 10, wage_subsidy: 5 } },
  { startSec: 2, label: "Jun", total: 525, partial: false, bySource: { credit_revenue: 120, holder_tier: 400, wage_subsidy: 5 } },
  { startSec: 3, label: "Jul", total: 38, partial: true, bySource: { credit_revenue: 8, holder_tier: 30, wage_subsidy: 0.3 } },
];

describe("RewardHistoryChart", () => {
  it("renders a month label per bucket and marks the partial month", () => {
    render(<RewardHistoryChart months={MONTHS} />);
    expect(screen.getByText("May")).toBeInTheDocument();
    expect(screen.getByText("Jun")).toBeInTheDocument();
    expect(screen.getByText("Jul")).toBeInTheDocument();
    expect(screen.getByText("MTD")).toBeInTheDocument();
  });

  it("renders stacked source segments as SVG rects", () => {
    const { container } = render(<RewardHistoryChart months={MONTHS} />);
    // 3 source segments + 1 hit overlay per month = 12 rects (no hover bg yet).
    expect(container.querySelectorAll("rect").length).toBe(12);
  });

  it("shows a per-source hover card on pointer enter", () => {
    render(<RewardHistoryChart months={MONTHS} />);
    const hits = screen.getAllByTestId("col-hit");
    fireEvent.pointerEnter(hits[1]!);
    const card = screen.getByTestId("hover-card");
    expect(within(card).getByText("Wage subsidy")).toBeInTheDocument();
    expect(within(card).getByText("Total")).toBeInTheDocument();
  });

  it("renders nothing for an empty month list", () => {
    const { container } = render(<RewardHistoryChart months={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
