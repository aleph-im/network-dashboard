import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsBar } from "@/components/stats-bar";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("StatsBar", () => {
  it("renders the slimmed 4-card overview labels", () => {
    renderWithQuery(<StatsBar />);
    expect(screen.getByText("Nodes")).toBeInTheDocument();
    expect(screen.getByText("Virtual Machines")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Dispatched")).toBeInTheDocument();
    expect(screen.getAllByText("Total")).toHaveLength(2);
    expect(screen.queryByText("Unreachable")).not.toBeInTheDocument();
    expect(screen.queryByText("Removed")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing")).not.toBeInTheDocument();
    expect(screen.queryByText("Unschedulable")).not.toBeInTheDocument();
  });
});
