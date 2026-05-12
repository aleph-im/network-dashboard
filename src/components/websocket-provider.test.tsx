import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { WsClient, SchedulerEvent } from "@/lib/scheduler-ws";
import {
  WebSocketProvider,
  useWebSocketStatus,
} from "@/components/websocket-provider";

// We mock the WS module so tests don't open a real socket and so we
// can drive events imperatively from the test body.
let eventDispatch: ((e: SchedulerEvent) => void) | null = null;
let statusDispatch:
  | ((s: WsClient["status"]) => void)
  | null = null;
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
        subscribe(fn) {
          eventDispatch = fn;
          return () => {
            eventDispatch = null;
          };
        },
        onStatusChange(fn) {
          statusDispatch = fn;
          return () => {
            statusDispatch = null;
          };
        },
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
  eventDispatch = null;
  statusDispatch = null;
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
