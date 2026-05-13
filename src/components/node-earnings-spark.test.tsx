import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NodeEarningsSpark } from "./node-earnings-spark";

vi.mock("@/hooks/use-node-earnings", () => ({
  useNodeEarnings: vi.fn(),
}));

import { useNodeEarnings } from "@/hooks/use-node-earnings";
const useNodeEarningsMock = vi.mocked(useNodeEarnings);

describe("NodeEarningsSpark", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a skeleton while loading", () => {
    useNodeEarningsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isPlaceholderData: false,
    });
    const { container } = render(<NodeEarningsSpark hash="crn1" />);
    expect(
      container.querySelector("[data-slot='skeleton'], .animate-pulse"),
    ).toBeTruthy();
  });

  it("renders nothing when data is undefined and not loading", () => {
    useNodeEarningsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isPlaceholderData: false,
    });
    const { container } = render(<NodeEarningsSpark hash="crn1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the empty line when all buckets are zero", () => {
    useNodeEarningsMock.mockReturnValue({
      data: {
        role: "crn",
        totalAleph: 0,
        delta: { aleph: 0, secondaryCount: 0 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0,
          secondaryCount: 0,
        })),
        perVm: [],
      },
      isLoading: false,
      isPlaceholderData: false,
    });
    render(<NodeEarningsSpark hash="crn1" />);
    expect(screen.getByText(/No earnings · last 24h/i)).toBeInTheDocument();
  });

  it("renders the chart + CRN caption (X.XX ALEPH · N.N VMs avg)", () => {
    useNodeEarningsMock.mockReturnValue({
      data: {
        role: "crn",
        totalAleph: 12.4,
        delta: { aleph: 1, secondaryCount: 0 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.5,
          secondaryCount: i < 12 ? 3 : 4,
        })),
        perVm: [],
      },
      isLoading: false,
      isPlaceholderData: false,
    });
    const { container } = render(<NodeEarningsSpark hash="crn1" />);
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
    expect(screen.getByText(/12\.40 ALEPH/)).toBeInTheDocument();
    expect(screen.getByText(/3\.5 VMs avg/)).toBeInTheDocument();
  });

  it("renders the chart + CCN caption (X.XX ALEPH · N CRNs linked)", () => {
    useNodeEarningsMock.mockReturnValue({
      data: {
        role: "ccn",
        totalAleph: 7.85,
        delta: { aleph: 0, secondaryCount: 0 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.3,
          secondaryCount: 5,
        })),
        linkedCrns: [],
      },
      isLoading: false,
      isPlaceholderData: false,
    });
    render(<NodeEarningsSpark hash="ccn1" />);
    expect(screen.getByText(/7\.85 ALEPH/)).toBeInTheDocument();
    expect(screen.getByText(/5 CRNs linked/)).toBeInTheDocument();
  });
});
