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
  it("renders all stat card labels", () => {
    renderWithQuery(<StatsBar />);
    expect(screen.getByText("Total Nodes")).toBeInTheDocument();
    expect(screen.getByText("Healthy Nodes")).toBeInTheDocument();
    expect(screen.getByText("Total VMs")).toBeInTheDocument();
    expect(screen.getByText("Orphaned VMs")).toBeInTheDocument();
    expect(screen.getByText("Missing VMs")).toBeInTheDocument();
    expect(screen.getByText("Unschedulable VMs")).toBeInTheDocument();
  });
});
