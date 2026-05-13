import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NodeEarningsTab } from "./node-earnings-tab";

vi.mock("@/hooks/use-node-earnings", () => ({
  useNodeEarnings: vi.fn(),
}));
vi.mock("@/hooks/use-node-state", () => ({
  useNodeState: vi.fn(() => ({
    data: {
      crns: new Map([
        [
          "crn1",
          {
            hash: "crn1",
            name: "CRN-1",
            owner: "0x",
            reward: "0x",
            score: 0.9,
            status: "linked",
            inactiveSince: null,
            parent: "ccn1",
          },
        ],
      ]),
      ccns: new Map(),
    },
  })),
}));
vi.mock("@/hooks/use-nodes", () => ({
  useNode: vi.fn(() => ({
    data: { hash: "crn1", status: "healthy", updatedAt: "2026-05-12T00:00:00Z" },
  })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/nodes",
  useSearchParams: () => new URLSearchParams(),
}));

import { useNodeEarnings } from "@/hooks/use-node-earnings";

describe("NodeEarningsTab (CRN)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders KPI row, chart, per-VM table", () => {
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        role: "crn",
        totalAleph: 12.84,
        delta: { aleph: 1.2, secondaryCount: -2 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.5,
          secondaryCount: 18,
        })),
        perVm: [
          { vmHash: "vmA", aleph: 4.21 },
          { vmHash: "vmB", aleph: 3.86 },
        ],
      },
      isLoading: false,
      isPlaceholderData: false,
    });

    render(<NodeEarningsTab hash="crn1" />);

    // KPI primary numbers visible (12.84 formats as "12.84")
    // Appears in KPI card AND in per-VM table total — both expected.
    expect(screen.getAllByText("12.84").length).toBeGreaterThan(0);
    // Footnote
    expect(
      screen.getByText(/accrued.*not yet paid on-chain/i),
    ).toBeInTheDocument();
    // Per-VM hashes appear (CopyableText renders truncated representation)
    expect(screen.getAllByText(/vmA|vmB/).length).toBeGreaterThan(0);
  });

  it("collapses extra VMs behind a +N more row that expands when clicked", () => {
    const perVm = Array.from({ length: 7 }, (_, i) => ({
      vmHash: `vm${i + 1}-aaaaaaaa-bbbbbbbb-cccccccc-dddddddd`,
      aleph: 10 - i,
    }));
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        role: "crn",
        totalAleph: perVm.reduce((s, v) => s + v.aleph, 0),
        delta: { aleph: 0, secondaryCount: 0 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.5,
          secondaryCount: 5,
        })),
        perVm,
      },
      isLoading: false,
      isPlaceholderData: false,
    });

    render(<NodeEarningsTab hash="crn1" />);

    // The "+ 2 more" row is visible by default (since 5 of 7 are shown).
    const expandTrigger = screen.getByRole("button", { name: /\+ 2 more/i });
    expect(expandTrigger).toBeInTheDocument();
    // Hashes 6 and 7 should not be in the DOM yet (they're the collapsed ones).
    expect(screen.queryByText(/^vm6/)).not.toBeInTheDocument();

    // Click to expand.
    fireEvent.click(expandTrigger);

    // Now all 7 rows should be visible — and the trigger flips to "Show less".
    expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ 2 more/i })).not.toBeInTheDocument();
  });

  it("renders loading skeleton when data is undefined", () => {
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isPlaceholderData: false,
    });
    const { container } = render(<NodeEarningsTab hash="crn1" />);
    expect(
      container.querySelector("[data-slot='skeleton'], .animate-pulse"),
    ).toBeTruthy();
  });
});
