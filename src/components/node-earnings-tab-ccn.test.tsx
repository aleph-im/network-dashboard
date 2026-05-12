import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NodeEarningsTabCcn } from "./node-earnings-tab-ccn";

vi.mock("@/hooks/use-node-earnings", () => ({
  useNodeEarnings: vi.fn(),
}));
vi.mock("@/hooks/use-node-state", () => ({
  useNodeState: vi.fn(() => ({
    data: {
      crns: new Map(),
      ccns: new Map([
        [
          "ccn1",
          {
            hash: "ccn1",
            name: "CCN-1",
            owner: "0x",
            reward: "0x",
            score: 0.8,
            status: "active",
            stakers: {},
            totalStaked: 600000,
            inactiveSince: null,
            resourceNodes: ["crn1", "crn2"],
          },
        ],
      ]),
    },
  })),
}));
vi.mock("@/hooks/use-nodes", () => ({
  useNode: vi.fn(() => ({
    data: { hash: "ccn1", status: "active", updatedAt: "2026-05-12T00:00:00Z" },
  })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/nodes",
  useSearchParams: () => new URLSearchParams(),
}));

import { useNodeEarnings } from "@/hooks/use-node-earnings";

describe("NodeEarningsTabCcn", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders KPI row, chart, linked CRN list (no per-VM table)", () => {
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        role: "ccn",
        totalAleph: 7.42,
        delta: { aleph: 0.5, secondaryCount: 0 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.3,
          secondaryCount: 2,
        })),
        linkedCrns: [
          { hash: "crn1", name: "CRN-1", status: "healthy", vmCount: 5 },
          { hash: "crn2", name: "CRN-2", status: "unreachable", vmCount: 0 },
        ],
      },
      isLoading: false,
      isPlaceholderData: false,
    });
    render(<NodeEarningsTabCcn hash="ccn1" />);

    // formatAleph(7.42) outputs "7.42" (no " ALEPH" suffix)
    expect(screen.getAllByText("7.42").length).toBeGreaterThan(0);
    expect(screen.getByText("CRN-1")).toBeInTheDocument();
    expect(screen.getByText("CRN-2")).toBeInTheDocument();
    expect(screen.queryByText(/hosted vms/i)).not.toBeInTheDocument();
  });
});
