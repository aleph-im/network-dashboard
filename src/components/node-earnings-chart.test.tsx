import { fireEvent, render, screen } from "@testing-library/react";
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

describe("NodeEarningsChart hover", () => {
  function renderChart(bucketDurationSec: number) {
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      time: 1_715_000_000 + i * bucketDurationSec,
      aleph: 0.5,
      secondaryCount: 3,
    }));
    return render(
      <NodeEarningsChart
        buckets={buckets}
        primaryLabel="ALEPH"
        secondaryLabel="VMs"
      />,
    );
  }

  it("does not render the tooltip card before pointer interaction", () => {
    renderChart(3600);
    expect(screen.queryByText(/ALEPH/i)).toBeInTheDocument(); // legend
    // No card content yet: look for the bucket value 0.50 (only present in card).
    expect(screen.queryByText("0.50")).not.toBeInTheDocument();
  });

  it("renders the tooltip card after pointermove and hides it on pointerleave", () => {
    const { container } = renderChart(3600);
    const captureRect = container.querySelectorAll("rect")[0]!;
    captureRect.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    fireEvent.pointerMove(captureRect, { clientX: 115, clientY: 60 });
    // ALEPH primary value formatted to 2 decimals
    expect(screen.getByText("0.50")).toBeInTheDocument();
    // Secondary value rendered as integer
    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.pointerLeave(captureRect);
    expect(screen.queryByText("0.50")).not.toBeInTheDocument();
  });

  it("formats the bucket time with date + HH:MM for hourly buckets", () => {
    const { container } = renderChart(3600);
    const captureRect = container.querySelectorAll("rect")[0]!;
    captureRect.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    fireEvent.pointerMove(captureRect, { clientX: 0, clientY: 60 });
    // Bucket 0: time = 1_715_000_000s = 2024-05-06T14:13:20Z. Locale en-US, 24h.
    expect(screen.getByText(/\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("anchors the tooltip to the right of the line when the cursor is in the left half", () => {
    const { container } = renderChart(3600);
    const captureRect = container.querySelectorAll("rect")[0]!;
    captureRect.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    fireEvent.pointerMove(captureRect, { clientX: 30, clientY: 60 });
    const card = screen.getByTestId("hover-card");
    expect(card.getAttribute("data-side")).toBe("right");
  });

  it("anchors the tooltip to the left of the line when the cursor is in the right half", () => {
    const { container } = renderChart(3600);
    const captureRect = container.querySelectorAll("rect")[0]!;
    captureRect.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    fireEvent.pointerMove(captureRect, { clientX: 200, clientY: 60 });
    const card = screen.getByTestId("hover-card");
    expect(card.getAttribute("data-side")).toBe("left");
  });

  it("formats the bucket time with date only for daily buckets", () => {
    const { container } = renderChart(86_400);
    const captureRect = container.querySelectorAll("rect")[0]!;
    captureRect.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    fireEvent.pointerMove(captureRect, { clientX: 0, clientY: 60 });
    // Should NOT contain "HH:MM" — only "Mon D".
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });
});
