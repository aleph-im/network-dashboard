import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeEarningsKpiRow, type KpiCard } from "./node-earnings-kpi-row";

describe("NodeEarningsKpiRow", () => {
  it("renders one card per entry, with primary and secondary values", () => {
    const cards: KpiCard[] = [
      { label: "ALEPH", primary: "12.84", secondary: "▲ 1.2" },
      { label: "VMs", primary: "18", secondary: "▼ 2" },
      { label: "Score", primary: "0.92", secondary: "vs 0.8" },
      { label: "Status", primary: "healthy", secondary: "last 5m" },
    ];
    render(<NodeEarningsKpiRow cards={cards} />);
    for (const c of cards) {
      expect(screen.getByText(c.label)).toBeInTheDocument();
      expect(screen.getByText(c.primary)).toBeInTheDocument();
      expect(screen.getByText(c.secondary)).toBeInTheDocument();
    }
  });
});
