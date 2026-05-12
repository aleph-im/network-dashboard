import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeEarningsChart } from "./node-earnings-chart";

describe("NodeEarningsChart", () => {
  it("renders an SVG with two polylines when given non-empty buckets", () => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      time: i * 3600,
      aleph: i % 3 === 0 ? 1 : 0.5,
      secondaryCount: i + 1,
    }));
    const { container } = render(
      <NodeEarningsChart
        buckets={buckets}
        primaryLabel="ALEPH"
        secondaryLabel="VMs"
      />,
    );
    const polylines = container.querySelectorAll("polyline");
    expect(polylines).toHaveLength(2);
    expect(screen.getByText("ALEPH")).toBeInTheDocument();
    expect(screen.getByText("VMs")).toBeInTheDocument();
  });

  it("renders empty state when all buckets are zero", () => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      time: i * 3600,
      aleph: 0,
      secondaryCount: 0,
    }));
    render(
      <NodeEarningsChart
        buckets={buckets}
        primaryLabel="ALEPH"
        secondaryLabel="VMs"
      />,
    );
    expect(screen.getByText(/no accrued earnings/i)).toBeInTheDocument();
  });
});
