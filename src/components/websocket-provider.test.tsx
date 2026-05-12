import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { WsClient } from "@/lib/scheduler-ws";
import {
  WebSocketProvider,
  useWebSocketStatus,
  handleEvent,
} from "@/components/websocket-provider";

// We mock the WS module so tests don't open a real socket. Tests
// verify the provider's lifecycle (mount/unmount) and the event-to-
// queryKey map directly via `handleEvent`; no test fires synthetic
// events through the mocked socket, so subscribe/onStatusChange just
// return no-op unsubscribers.
let lastCreated: WsClient | null = null;

vi.mock("@/lib/scheduler-ws", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/scheduler-ws")
  >("@/lib/scheduler-ws");
  return {
    ...actual,
    getWsUrl: () => "ws://test/api/v1/ws",
    createWsClient: (): WsClient => {
      const client: WsClient = {
        status: "connecting",
        lastEventAt: null,
        eventCount: 0,
        subscribe: () => () => {},
        onStatusChange: () => () => {},
        close: vi.fn(),
      };
      lastCreated = client;
      return client;
    },
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <WebSocketProvider>{children}</WebSocketProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  lastCreated = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WebSocketProvider", () => {
  it("opens a client on mount and exposes initial context", () => {
    const { result } = renderHook(() => useWebSocketStatus(), {
      wrapper,
    });

    expect(lastCreated).not.toBeNull();
    expect(result.current.status).toBe("connecting");
    expect(result.current.eventCount).toBe(0);
    expect(result.current.lastEventAt).toBeNull();
  });

  it("closes the client on unmount", () => {
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <WebSocketProvider>
          <div />
        </WebSocketProvider>
      </QueryClientProvider>,
    );
    const client = lastCreated!;
    unmount();
    expect(client.close).toHaveBeenCalled();
  });

  it("throws if useWebSocketStatus is used outside the provider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => renderHook(() => useWebSocketStatus())).toThrow(
      /WebSocketProvider/,
    );
    consoleError.mockRestore();
  });
});

describe("handleEvent → queryKey invalidation map", () => {
  function makeQc() {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    return { qc, spy };
  }

  it("VmScheduled invalidates overview-stats, vms, and the specific vm", () => {
    const { qc, spy } = makeQc();
    handleEvent(
      { type: "VmScheduled", vmHash: "vm-1", nodeHash: "node-1" },
      qc,
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["overview-stats"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vms"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vm", "vm-1"] });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("VmUnscheduled invalidates the same set as VmScheduled", () => {
    const { qc, spy } = makeQc();
    handleEvent(
      { type: "VmUnscheduled", vmHash: "vm-2", nodeHash: "node-1" },
      qc,
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vms"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vm", "vm-2"] });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("VmUnschedulable invalidates overview-stats + vms + the vm", () => {
    const { qc, spy } = makeQc();
    handleEvent({ type: "VmUnschedulable", vmHash: "vm-3" }, qc);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vms"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vm", "vm-3"] });
  });

  it("VmMigrated also invalidates nodes + both node hashes", () => {
    const { qc, spy } = makeQc();
    handleEvent(
      {
        type: "VmMigrated",
        vmHash: "vm-4",
        sourceHash: "node-src",
        targetHash: "node-dst",
      },
      qc,
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["overview-stats"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vms"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vm", "vm-4"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["nodes"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["node", "node-src"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["node", "node-dst"] });
    expect(spy).toHaveBeenCalledTimes(6);
  });

  it("never invalidates wallet or credit-expense keys", () => {
    const { qc, spy } = makeQc();
    handleEvent(
      {
        type: "VmMigrated",
        vmHash: "vm-5",
        sourceHash: "a",
        targetHash: "b",
      },
      qc,
    );
    for (const call of spy.mock.calls) {
      const head = (call[0] as { queryKey: unknown[] }).queryKey[0];
      expect(head).not.toBe("wallet-vms");
      expect(head).not.toBe("wallet-activity");
      expect(head).not.toBe("credit-expenses");
    }
  });
});
