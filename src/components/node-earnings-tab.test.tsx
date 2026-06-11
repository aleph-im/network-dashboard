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
let mockSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/nodes",
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
vi.mock("@/hooks/use-vm-creation-times", () => ({
  useVMMessageInfo: () => ({ data: undefined }),
}));

import { useNodeEarnings } from "@/hooks/use-node-earnings";

const BASE_EARNINGS = {
  data: {
    role: "crn" as const,
    totalAleph: 26,
    bySource: { credit_revenue: 4.27, holder_tier: 20.95, wage_subsidy: 0.78 },
    weightsExact: true,
    delta: { aleph: 0, secondaryCount: 0 },
    buckets: Array.from({ length: 24 }, (_, i) => ({
      time: i * 3600,
      aleph: 1,
      secondaryCount: 24,
    })),
    perVm: [],
    reconciliation: null,
  },
  isLoading: false,
  isPlaceholderData: false,
  isError: false,
  isPerVmLoading: false,
  isPerVmError: false,
};

describe("NodeEarningsTab (CRN)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch = "";
  });

  it("renders KPI row, chart, per-VM table", () => {
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        role: "crn",
        totalAleph: 12.84,
        bySource: { credit_revenue: 10, holder_tier: 2, wage_subsidy: 0.84 },
        weightsExact: true,
        delta: { aleph: 1.2, secondaryCount: -2 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.5,
          secondaryCount: 18,
        })),
        perVm: [
          { vmHash: "vmA", aleph: 4.21, source: "credits" as const },
          { vmHash: "vmB", aleph: 3.86, source: "hold" as const },
        ],
        reconciliation: null,
      },
      isLoading: false,
      isPlaceholderData: false,
      isError: false,
      isPerVmLoading: false,
      isPerVmError: false,
    });

    render(<NodeEarningsTab hash="crn1" />);

    // KPI primary numbers visible (12.84 formats as "12.84")
    // Appears in KPI card AND in per-VM table total — both expected.
    expect(screen.getAllByText("12.84").length).toBeGreaterThan(0);
    // Footnote
    expect(
      screen.getByText(/authoritative rewards\s*feed/i),
    ).toBeInTheDocument();
    // Per-VM hashes appear (CopyableText renders truncated representation)
    expect(screen.getAllByText(/vmA|vmB/).length).toBeGreaterThan(0);
    // Payment column distinguishes credit-paid vs hold-tier VMs. Both mobile
    // card list and desktop table render to DOM (CSS gates visibility), so each
    // badge appears twice.
    expect(screen.getAllByText("Credits").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hold").length).toBeGreaterThan(0);
  });

  it("collapses extra VMs behind a +N more row that expands when clicked", () => {
    const perVm = Array.from({ length: 7 }, (_, i) => ({
      vmHash: `vm${i + 1}-aaaaaaaa-bbbbbbbb-cccccccc-dddddddd`,
      aleph: 10 - i,
      source: "credits" as const,
    }));
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        role: "crn",
        totalAleph: perVm.reduce((s, v) => s + v.aleph, 0),
        bySource: { credit_revenue: 49, holder_tier: 0, wage_subsidy: 0 },
        weightsExact: true,
        delta: { aleph: 0, secondaryCount: 0 },
        buckets: Array.from({ length: 24 }, (_, i) => ({
          time: i * 3600,
          aleph: 0.5,
          secondaryCount: 5,
        })),
        perVm,
        reconciliation: null,
      },
      isLoading: false,
      isPlaceholderData: false,
      isError: false,
      isPerVmLoading: false,
      isPerVmError: false,
    });

    render(<NodeEarningsTab hash="crn1" />);

    // The "+ 2 more" trigger renders once in the mobile card list and once in
    // the desktop table footer — both in DOM, CSS gates visibility.
    const expandTriggers = screen.getAllByRole("button", { name: /\+ 2 more/i });
    expect(expandTriggers.length).toBe(2);
    // Hashes 6 and 7 should not be in the DOM yet (they're the collapsed ones).
    expect(screen.queryByText(/^vm6/)).not.toBeInTheDocument();

    // Click to expand the first (mobile) trigger — they share state.
    fireEvent.click(expandTriggers[0]!);

    // Now all 7 rows should be visible — and both triggers flip to "Show less".
    expect(screen.getAllByRole("button", { name: /show less/i }).length).toBe(2);
    expect(screen.queryByRole("button", { name: /\+ 2 more/i })).not.toBeInTheDocument();
  });

  it("counts earning VMs in the window — bare count matching the table", () => {
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      ...BASE_EARNINGS,
      data: {
        ...BASE_EARNINGS.data,
        perVm: [{ vmHash: "vmX", aleph: 25.22, source: "hold" as const }],
      },
    });
    render(<NodeEarningsTab hash="crn1" />);
    expect(screen.getByText("VMs earning (24h)")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument(); // = the table's row count
    expect(screen.queryByText(/of \d+ scheduled/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /see issues/i })).not.toBeInTheDocument();
  });

  it("omits the 30d count with a too-heavy note instead of mislabeling", () => {
    mockSearch = "earningsRange=30d";
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue(BASE_EARNINGS);
    render(<NodeEarningsTab hash="crn1" />);
    expect(screen.getByText("VMs earning (30d)")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(
      screen.getByText(/30d VM count is too heavy to load/i),
    ).toBeInTheDocument();
  });

  it("renders loading skeleton when data is undefined", () => {
    (useNodeEarnings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isPlaceholderData: false,
      isError: false,
      isPerVmLoading: false,
      isPerVmError: false,
    });
    const { container } = render(<NodeEarningsTab hash="crn1" />);
    expect(
      container.querySelector("[data-slot='skeleton'], .animate-pulse"),
    ).toBeTruthy();
  });
});
