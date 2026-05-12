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
});
