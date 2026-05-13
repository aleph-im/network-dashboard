import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DualLineChart } from "./dual-line-chart";

const sampleBuckets = Array.from({ length: 24 }, (_, i) => ({
  time: i * 3600,
  aleph: i % 3 === 0 ? 1 : 0.5,
  secondaryCount: i + 1,
}));

describe("DualLineChart", () => {
  it("renders two polylines when given >=2 buckets", () => {
    const { container } = render(<DualLineChart buckets={sampleBuckets} />);
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("renders an empty SVG when given <2 buckets", () => {
    const { container } = render(<DualLineChart buckets={[]} />);
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders no crosshair when highlightedIndex is null", () => {
    const { container } = render(<DualLineChart buckets={sampleBuckets} highlightedIndex={null} />);
    expect(container.querySelector("line")).toBeNull();
    expect(container.querySelectorAll("[data-testid='crosshair-dot']")).toHaveLength(0);
  });

  it("renders crosshair line and two emphasis dots when highlightedIndex is set", () => {
    const { container } = render(<DualLineChart buckets={sampleBuckets} highlightedIndex={12} />);
    expect(container.querySelector("line")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid='crosshair-dot']")).toHaveLength(2);
  });

  it("omits the pointer-capture rect when onHoverIndex is not provided", () => {
    const { container } = render(<DualLineChart buckets={sampleBuckets} />);
    // The only <rect> in the tree should be the overlay rect (if present).
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });

  it("renders a pointer-capture rect and calls onHoverIndex with the snapped bucket on pointermove", () => {
    const onHoverIndex = vi.fn();
    const { container } = render(
      <DualLineChart buckets={sampleBuckets} onHoverIndex={onHoverIndex} />,
    );
    const rect = container.querySelector("rect");
    expect(rect).toBeTruthy();
    // Mock getBoundingClientRect so the snap calculation has a known width.
    rect!.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    // n = 24, so each bucket spans 10px. Pointer at x=125 should snap to bucket 13 (round(12.5)).
    fireEvent.pointerMove(rect!, { clientX: 125, clientY: 60 });
    expect(onHoverIndex).toHaveBeenCalledWith(13);
  });

  it("calls onHoverEnd on pointerleave", () => {
    const onHoverEnd = vi.fn();
    const { container } = render(
      <DualLineChart buckets={sampleBuckets} onHoverIndex={() => {}} onHoverEnd={onHoverEnd} />,
    );
    const rect = container.querySelector("rect")!;
    fireEvent.pointerLeave(rect);
    expect(onHoverEnd).toHaveBeenCalled();
  });

  it("clamps pointer x at the right edge to the last bucket index", () => {
    const onHoverIndex = vi.fn();
    const { container } = render(
      <DualLineChart buckets={sampleBuckets} onHoverIndex={onHoverIndex} />,
    );
    const rect = container.querySelector("rect")!;
    rect.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 120, right: 230, bottom: 120 }) as DOMRect;
    fireEvent.pointerMove(rect, { clientX: 999, clientY: 60 });
    expect(onHoverIndex).toHaveBeenLastCalledWith(23);
  });
});
