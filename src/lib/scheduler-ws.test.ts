import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWsClient, getWsUrl } from "@/lib/scheduler-ws";

// Minimal WebSocket mock. The constructor records the URL and stays
// open until tests trigger `triggerOpen` / `triggerClose` / `triggerMessage`.
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  closeCalled = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closeCalled = true;
    this.readyState = MockWebSocket.CLOSED;
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  triggerClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  triggerMessage(data: string) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createWsClient — connection lifecycle", () => {
  it("starts in 'connecting' and flips to 'connected' on open", () => {
    const client = createWsClient("ws://example/api/v1/ws");
    expect(client.status).toBe("connecting");

    const sock = MockWebSocket.instances[0]!;
    sock.triggerOpen();

    expect(client.status).toBe("connected");
    client.close();
  });

  it("ignores malformed JSON without crashing", () => {
    const client = createWsClient("ws://example/api/v1/ws");
    const sock = MockWebSocket.instances[0]!;
    sock.triggerOpen();

    sock.triggerMessage("not-json-{");

    expect(client.eventCount).toBe(0);
    expect(client.lastEventAt).toBeNull();
    client.close();
  });

  it("ignores valid JSON with an unknown event type", () => {
    const client = createWsClient("ws://example/api/v1/ws");
    const sock = MockWebSocket.instances[0]!;
    sock.triggerOpen();

    sock.triggerMessage(JSON.stringify({ type: "NotAThing", vmHash: "v1" }));

    expect(client.eventCount).toBe(0);
    client.close();
  });

  it("dispatches a valid VmScheduled event to subscribers", () => {
    const client = createWsClient("ws://example/api/v1/ws");
    const sock = MockWebSocket.instances[0]!;
    sock.triggerOpen();
    const fn = vi.fn();
    client.subscribe(fn);

    sock.triggerMessage(
      JSON.stringify({
        type: "VmScheduled",
        vmHash: "vm-1",
        nodeHash: "node-1",
      }),
    );

    expect(client.eventCount).toBe(1);
    expect(client.lastEventAt).not.toBeNull();
    expect(fn).toHaveBeenCalledWith({
      type: "VmScheduled",
      vmHash: "vm-1",
      nodeHash: "node-1",
    });
    client.close();
  });

  it("subscribe() returns an unsubscribe that stops further dispatch", () => {
    const client = createWsClient("ws://example/api/v1/ws");
    const sock = MockWebSocket.instances[0]!;
    sock.triggerOpen();

    const fn = vi.fn();
    const unsub = client.subscribe(fn);

    sock.triggerMessage(
      JSON.stringify({
        type: "VmScheduled",
        vmHash: "vm-1",
        nodeHash: "node-1",
      }),
    );
    expect(fn).toHaveBeenCalledTimes(1);

    unsub();
    sock.triggerMessage(
      JSON.stringify({
        type: "VmScheduled",
        vmHash: "vm-2",
        nodeHash: "node-1",
      }),
    );
    expect(fn).toHaveBeenCalledTimes(1);
    client.close();
  });

  it("onStatusChange() returns an unsubscribe that stops further notifications", () => {
    const client = createWsClient("ws://example/api/v1/ws");
    const sock = MockWebSocket.instances[0]!;
    const fn = vi.fn();
    const unsub = client.onStatusChange(fn);

    sock.triggerOpen();
    expect(fn).toHaveBeenCalledWith("connected");

    unsub();
    fn.mockClear();
    client.close();
    expect(fn).not.toHaveBeenCalled();
  });

  it("reconnects with exponential backoff 1s/2s/4s after close", () => {
    vi.useFakeTimers();
    const client = createWsClient("ws://example/api/v1/ws");
    expect(MockWebSocket.instances).toHaveLength(1);

    // First reconnect after 1s
    MockWebSocket.instances[0]!.triggerClose();
    expect(client.status).toBe("reconnecting");
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second reconnect after 2s
    MockWebSocket.instances[1]!.triggerClose();
    vi.advanceTimersByTime(2_000);
    expect(MockWebSocket.instances).toHaveLength(3);

    // Third reconnect after 4s
    MockWebSocket.instances[2]!.triggerClose();
    vi.advanceTimersByTime(4_000);
    expect(MockWebSocket.instances).toHaveLength(4);

    client.close();
  });

  it("resets backoff to 1s after a successful reconnect", () => {
    vi.useFakeTimers();
    const client = createWsClient("ws://example/api/v1/ws");

    // Burn through 1s + 2s of backoff
    MockWebSocket.instances[0]!.triggerClose();
    vi.advanceTimersByTime(1_000);
    MockWebSocket.instances[1]!.triggerClose();
    vi.advanceTimersByTime(2_000);
    expect(MockWebSocket.instances).toHaveLength(3);

    // Successful reconnect resets the timer
    MockWebSocket.instances[2]!.triggerOpen();
    expect(client.status).toBe("connected");

    // Next failure reconnects at 1s again, not 4s
    MockWebSocket.instances[2]!.triggerClose();
    vi.advanceTimersByTime(1_000);
    expect(MockWebSocket.instances).toHaveLength(4);

    client.close();
  });

  it("caps backoff at 30s", () => {
    vi.useFakeTimers();
    const client = createWsClient("ws://example/api/v1/ws");

    // Walk through 1, 2, 4, 8, 16, 32→30, then expect 30 for the next round.
    const steps = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
    for (const ms of steps) {
      MockWebSocket.instances.at(-1)!.triggerClose();
      vi.advanceTimersByTime(ms);
    }
    expect(MockWebSocket.instances).toHaveLength(steps.length + 1);

    client.close();
  });
});
