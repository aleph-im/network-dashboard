import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ReactElement } from "react";

import { VMTable } from "@/components/vm-table";
import type { VM } from "@/api/types";

const makeVm = (overrides: Partial<VM> = {}): VM => ({
  hash: "vm_hash_001",
  type: "micro_vm",
  allocatedNode: null,
  observedNodes: [],
  status: "dispatched",
  requirements: { vcpus: 2, memoryMb: 1024, diskMb: 10000 },
  paymentStatus: null,
  updatedAt: "2026-01-01T00:00:00Z",
  allocatedAt: null,
  lastObservedAt: null,
  paymentType: null,
  gpuRequirements: [],
  requiresConfidential: false,
  schedulingStatus: null,
  migrationTarget: null,
  migrationStartedAt: null,
  owner: null,
  ...overrides,
});

// Stub router so we can observe URL writes without a real Next.js runtime.
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => "/vms",
  useSearchParams: () => new URLSearchParams(),
}));

// Stub the VM-fetching hook so we can assert filter shape without network.
const useVMsMock = vi.fn((_filters?: unknown) => ({
  data: [] as VM[],
  isLoading: false,
}));
vi.mock("@/hooks/use-vms", () => ({
  useVMs: (filters?: unknown) => useVMsMock(filters),
}));

// useVMMessageInfo would otherwise try to fetch — stub it inert.
vi.mock("@/hooks/use-vm-creation-times", () => ({
  useVMMessageInfo: () => ({ data: undefined }),
}));

function renderWithQuery(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

describe("VMTable — owner filter", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    replaceMock.mockReset();
    useVMsMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not pass owner to useVMs while the input is invalid mid-typing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithQuery(<VMTable onSelectVM={() => {}} />);

    // Open advanced filters so the Owner input is visible.
    const filtersToggle = screen.getByRole("button", { name: /filter/i });
    await user.click(filtersToggle);

    const owner = screen.getByPlaceholderText("0x…");
    await user.type(owner, "0xabc"); // incomplete

    // Flush the debounce.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // useVMs was called, but never with an owner filter — the value is
    // still invalid.
    const lastCall = useVMsMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toBeUndefined();
  });

  it("passes owner to useVMs and writes ?owner= once the address is valid", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithQuery(<VMTable onSelectVM={() => {}} />);

    const filtersToggle = screen.getByRole("button", { name: /filter/i });
    await user.click(filtersToggle);

    const owner = screen.getByPlaceholderText("0x…");
    const validAddress = "0x" + "ab".repeat(20); // 40 hex chars
    await user.type(owner, validAddress);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const lastCall = useVMsMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({ owner: validAddress });

    // URL was updated with the raw value (URL persistence is not gated on
    // validity; only the query is).
    const replaceCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(replaceCall).toContain(
      `owner=${encodeURIComponent(validAddress)}`,
    );
  });

  it("seeds the input from initialOwner and queries immediately when valid", () => {
    const validAddress = "0x" + "cd".repeat(20);
    renderWithQuery(
      <VMTable onSelectVM={() => {}} initialOwner={validAddress} />,
    );

    const lastCall = useVMsMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({ owner: validAddress });
  });
});

describe("VMTable — search bypasses the inactive-VM filter", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    replaceMock.mockReset();
    useVMsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("surfaces a scheduled (inactive) VM in the All tab when its hash is searched", async () => {
    const scheduled = makeVm({
      hash: "scheduledhash000000000000000000000000000000000000000000000scheduled",
      status: "scheduled",
    });
    const dispatched = makeVm({ hash: "dispatchedhashaaaa", status: "dispatched" });
    useVMsMock.mockReturnValue({
      data: [scheduled, dispatched],
      isLoading: false,
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithQuery(<VMTable onSelectVM={() => {}} />);

    // Default All tab hides inactive statuses — the scheduled VM is absent.
    expect(screen.queryByText("scheduled")).toBeNull();

    const search = screen.getByPlaceholderText("Search hash, name, node...");
    await user.type(search, scheduled.hash);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // An explicit hash search must surface the match even though its status
    // is outside ACTIVE_VM_STATUSES — same bypass clicking a status pill gets.
    expect(screen.getByText("scheduled")).toBeInTheDocument();
  });
});
