---
status: in-progress
branch: feature/scheduler-websocket
date: 2026-05-12
wave: 2026-05-12-scheduler-v1
reservedDecision: 87
note: fanned out as part of wave 2026-05-12-scheduler-v1
---

# Scheduler WebSocket Cache Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subscribe to the scheduler's new `/api/v1/ws` event stream and invalidate the React Query caches affected by each event, turning every existing page into a near-live view without touching its UI. Polling stays as a fallback.

**Architecture:** A non-React `scheduler-ws.ts` module owns the WebSocket lifecycle — connect, exponential-backoff reconnect, subscriber registry — and exposes a `WsClient` factory. A singleton `WebSocketProvider` (`"use client"`) mounts inside `PersistQueryClientProvider` in `src/app/providers.tsx`, opens one client for the whole app, subscribes once, and maps each `SchedulerEvent` to `queryClient.invalidateQueries(...)` calls against the existing keys (`["vms"]`, `["vm", hash]`, `["nodes"]`, `["node", hash]`, `["overview-stats"]`). The Network Health page reads the provider's context via `useWebSocketStatus()` to render a new "WebSocket stream" row in the Scheduler API section.

**Tech Stack:** Next.js 16 (App Router, static export), TypeScript (strict), React 19, React Query, `@aleph-front/ds` (StatusDot), Vitest + Testing Library, native browser WebSocket API.

**Spec:** `docs/superpowers/specs/2026-05-12-scheduler-websocket-design.md`

---

## File Structure

**Create:**
- `src/lib/scheduler-ws.ts` — connection module: types, `createWsClient`, reconnect backoff, subscriber registry, `getWsUrl()` helper.
- `src/lib/scheduler-ws.test.ts` — unit tests for the module (mocked `WebSocket`, fake timers).
- `src/components/websocket-provider.tsx` — React provider, event-to-queryKey invalidation map, `useWebSocketStatus()` hook.
- `src/components/websocket-provider.test.tsx` — provider tests (mocked WS + mocked `QueryClient`).

**Modify:**
- `src/api/client.ts` — export `getBaseUrl` so `scheduler-ws.ts` can derive the WS URL without duplicating the `?api=` override logic.
- `src/app/providers.tsx` — mount `WebSocketProvider` inside `PersistQueryClientProvider`.
- `src/app/status/page.tsx` — new "WebSocket stream" row in the Scheduler API section.
- `src/changelog.ts` — bump `CURRENT_VERSION` 0.16.0 → 0.17.0; new `VersionEntry`.
- `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md` — doc updates.

---

## Task 1: Export `getBaseUrl` from `src/api/client.ts`

**Files:**
- Modify: `src/api/client.ts`

- [ ] **Step 1: Make the helper public**

In `src/api/client.ts`, change line 25:

```ts
function getBaseUrl(): string {
```

To:

```ts
export function getBaseUrl(): string {
```

This is the only change needed — the function already encapsulates both the `?api=` URL override and the `NEXT_PUBLIC_API_URL` env fallback, exactly the semantics `scheduler-ws.ts` needs.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: passes (no callers change shape).

- [ ] **Step 3: Commit**

```bash
git add src/api/client.ts
git commit -m "refactor(api): export getBaseUrl for reuse by WS module"
```

---

## Task 2: `scheduler-ws.ts` — types + skeleton (TDD, no behavior yet)

**Files:**
- Create: `src/lib/scheduler-ws.ts`
- Create: `src/lib/scheduler-ws.test.ts`

- [ ] **Step 1: Write the failing test for construction → `"connecting"` → `"connected"`**

Create `src/lib/scheduler-ws.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test, expect import failure**

Run: `pnpm test --run src/lib/scheduler-ws.test.ts`
Expected: test fails because `scheduler-ws.ts` doesn't exist yet.

- [ ] **Step 3: Create `src/lib/scheduler-ws.ts` skeleton**

```ts
import { getBaseUrl } from "@/api/client";

export type SchedulerEvent =
  | { type: "VmScheduled"; vmHash: string; nodeHash: string }
  | { type: "VmUnscheduled"; vmHash: string; nodeHash: string }
  | {
      type: "VmMigrated";
      vmHash: string;
      sourceHash: string;
      targetHash: string;
    }
  | { type: "VmUnschedulable"; vmHash: string };

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type WsClient = {
  readonly status: ConnectionStatus;
  readonly lastEventAt: number | null;
  readonly eventCount: number;
  subscribe(fn: (e: SchedulerEvent) => void): () => void;
  onStatusChange(fn: (s: ConnectionStatus) => void): () => void;
  close(): void;
};

export function getWsUrl(): string {
  const base = getBaseUrl();
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/api/v1/ws`;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function createWsClient(url: string): WsClient {
  let status: ConnectionStatus = "connecting";
  let lastEventAt: number | null = null;
  let eventCount = 0;
  let closed = false;
  let backoff = INITIAL_BACKOFF_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let socket: WebSocket | null = null;

  const eventSubs = new Set<(e: SchedulerEvent) => void>();
  const statusSubs = new Set<(s: ConnectionStatus) => void>();

  function setStatus(next: ConnectionStatus): void {
    status = next;
    // Defensive copy — re-entrancy during unsubscribe.
    for (const fn of [...statusSubs]) fn(next);
  }

  function open(): void {
    socket = new WebSocket(url);
    socket.onopen = () => {
      backoff = INITIAL_BACKOFF_MS;
      setStatus("connected");
    };
    socket.onmessage = (e: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (!isSchedulerEvent(parsed)) return;
      eventCount += 1;
      lastEventAt = Date.now();
      for (const fn of [...eventSubs]) fn(parsed);
    };
    const reconnect = () => {
      if (closed) return;
      setStatus("reconnecting");
      reconnectTimer = setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };
    socket.onclose = reconnect;
    socket.onerror = reconnect;
  }

  open();

  return {
    get status() {
      return status;
    },
    get lastEventAt() {
      return lastEventAt;
    },
    get eventCount() {
      return eventCount;
    },
    subscribe(fn) {
      eventSubs.add(fn);
      return () => {
        eventSubs.delete(fn);
      };
    },
    onStatusChange(fn) {
      statusSubs.add(fn);
      return () => {
        statusSubs.delete(fn);
      };
    },
    close() {
      closed = true;
      if (reconnectTimer != null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
      setStatus("disconnected");
    },
  };
}

function isSchedulerEvent(v: unknown): v is SchedulerEvent {
  if (!v || typeof v !== "object") return false;
  const t = (v as { type?: unknown }).type;
  return (
    t === "VmScheduled" ||
    t === "VmUnscheduled" ||
    t === "VmMigrated" ||
    t === "VmUnschedulable"
  );
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm test --run src/lib/scheduler-ws.test.ts`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduler-ws.ts src/lib/scheduler-ws.test.ts
git commit -m "feat(ws): scheduler-ws module — types, client factory, lifecycle

Non-React module that owns the WebSocket. Reports connecting → connected
on open. Reconnect, subscribers, and message dispatch are scaffolded
but tested in follow-up tasks."
```

---

## Task 3: Event parsing — malformed JSON ignored, valid payload dispatched (TDD)

**Files:**
- Modify: `src/lib/scheduler-ws.test.ts`

- [ ] **Step 1: Add two cases inside the existing `describe`**

Append inside the `describe("createWsClient — connection lifecycle", ...)` block:

```ts
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
```

- [ ] **Step 2: Run tests, expect pass**

Run: `pnpm test --run src/lib/scheduler-ws.test.ts`
Expected: all 4 tests pass. The skeleton from Task 2 already handles malformed JSON via the try/catch and gates on `isSchedulerEvent`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduler-ws.test.ts
git commit -m "test(ws): event parsing — malformed JSON + unknown type + happy path"
```

---

## Task 4: Subscriber unsubscribe (TDD)

**Files:**
- Modify: `src/lib/scheduler-ws.test.ts`

- [ ] **Step 1: Add the unsubscribe case**

Append inside the same `describe`:

```ts
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
```

- [ ] **Step 2: Run tests, expect pass**

Run: `pnpm test --run src/lib/scheduler-ws.test.ts`
Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduler-ws.test.ts
git commit -m "test(ws): subscribe()/onStatusChange() return working unsubscribers"
```

---

## Task 5: Reconnect with exponential backoff (TDD, fake timers)

**Files:**
- Modify: `src/lib/scheduler-ws.test.ts`

- [ ] **Step 1: Add reconnect cases**

Append inside the same `describe`:

```ts
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
```

- [ ] **Step 2: Run tests, expect pass**

Run: `pnpm test --run src/lib/scheduler-ws.test.ts`
Expected: 9 tests pass. The skeleton's reconnect loop already implements the 1s/2s/4s/.../30s cap.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduler-ws.test.ts
git commit -m "test(ws): exponential reconnect — 1/2/4s, reset on success, cap at 30s"
```

---

## Task 6: `close()` is final — no further reconnects (TDD)

**Files:**
- Modify: `src/lib/scheduler-ws.test.ts`

- [ ] **Step 1: Add the case**

Append inside the same `describe`:

```ts
  it("close() prevents further reconnects even on later socket close", () => {
    vi.useFakeTimers();
    const client = createWsClient("ws://example/api/v1/ws");
    MockWebSocket.instances[0]!.triggerOpen();

    client.close();
    expect(client.status).toBe("disconnected");

    // Subsequent close on the underlying socket must not schedule a reconnect.
    MockWebSocket.instances[0]!.triggerClose();
    vi.advanceTimersByTime(60_000);

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(client.status).toBe("disconnected");
  });
```

- [ ] **Step 2: Run tests, expect pass**

Run: `pnpm test --run src/lib/scheduler-ws.test.ts`
Expected: 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduler-ws.test.ts
git commit -m "test(ws): close() is final — no reconnect after manual close"
```

---

## Task 7: `getWsUrl()` derives ws:// or wss:// from `getBaseUrl()` (TDD)

**Files:**
- Modify: `src/lib/scheduler-ws.test.ts`

- [ ] **Step 1: Add a new describe block**

Append at the end of `src/lib/scheduler-ws.test.ts` (outside the lifecycle `describe`). `getWsUrl` is already imported at the top of the file (alongside `createWsClient`):

```ts
describe("getWsUrl", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("rewrites http:// → ws:// when the ?api= override is http", () => {
    window.history.replaceState(
      {},
      "",
      "/?api=http://override.example.com",
    );
    expect(getWsUrl()).toBe("ws://override.example.com/api/v1/ws");
  });

  it("rewrites https:// → wss:// when the ?api= override is https", () => {
    window.history.replaceState(
      {},
      "",
      "/?api=https://scheduler.api.aleph.cloud",
    );
    expect(getWsUrl()).toBe(
      "wss://scheduler.api.aleph.cloud/api/v1/ws",
    );
  });
});
```

Driving the `?api=` override via `window.history.replaceState` rather than stubbing `window` works because `getBaseUrl()` reads `window.location.search` at call time, and jsdom honors `history.replaceState` updates against `window.location`.

- [ ] **Step 2: Run tests, expect pass**

Run: `pnpm test --run src/lib/scheduler-ws.test.ts`
Expected: 12 tests pass total. The `?api=` override path of `getBaseUrl()` is what drives both branches.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduler-ws.test.ts
git commit -m "test(ws): getWsUrl swaps http/https → ws/wss via getBaseUrl override"
```

---

## Task 8: `WebSocketProvider` — context surface + mount/unmount (TDD)

**Files:**
- Create: `src/components/websocket-provider.tsx`
- Create: `src/components/websocket-provider.test.tsx`

- [ ] **Step 1: Write the failing test for context surface**

Create `src/components/websocket-provider.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests, expect import failure**

Run: `pnpm test --run src/components/websocket-provider.test.tsx`
Expected: tests fail because `websocket-provider.tsx` doesn't exist yet.

- [ ] **Step 3: Create the provider**

Create `src/components/websocket-provider.tsx`:

```tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createWsClient,
  getWsUrl,
  type ConnectionStatus,
  type SchedulerEvent,
  type WsClient,
} from "@/lib/scheduler-ws";

type Ctx = {
  status: ConnectionStatus;
  lastEventAt: number | null;
  eventCount: number;
};

const WebSocketContext = createContext<Ctx | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const clientRef = useRef<WsClient | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [eventCount, setEventCount] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  useEffect(() => {
    const client = createWsClient(getWsUrl());
    clientRef.current = client;

    const unsubStatus = client.onStatusChange(setStatus);
    const unsubEvents = client.subscribe((e) => {
      setEventCount((c) => c + 1);
      setLastEventAt(Date.now());
      handleEvent(e, queryClient);
    });

    return () => {
      unsubStatus();
      unsubEvents();
      client.close();
    };
  }, [queryClient]);

  return (
    <WebSocketContext.Provider value={{ status, eventCount, lastEventAt }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketStatus(): Ctx {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error(
      "useWebSocketStatus must be used inside WebSocketProvider",
    );
  }
  return ctx;
}

// Event → queryKey invalidation map. Exported for unit tests.
// Wallet (["wallet-vms", …], ["wallet-activity", …]) and credit-expense
// (["credit-expenses", …]) keys are intentionally excluded — they source
// from api2, not the scheduler.
export function handleEvent(
  e: SchedulerEvent,
  qc: QueryClient,
): void {
  qc.invalidateQueries({ queryKey: ["overview-stats"] });
  switch (e.type) {
    case "VmScheduled":
    case "VmUnscheduled":
    case "VmUnschedulable":
      qc.invalidateQueries({ queryKey: ["vms"] });
      qc.invalidateQueries({ queryKey: ["vm", e.vmHash] });
      break;
    case "VmMigrated":
      qc.invalidateQueries({ queryKey: ["vms"] });
      qc.invalidateQueries({ queryKey: ["vm", e.vmHash] });
      qc.invalidateQueries({ queryKey: ["nodes"] });
      qc.invalidateQueries({ queryKey: ["node", e.sourceHash] });
      qc.invalidateQueries({ queryKey: ["node", e.targetHash] });
      break;
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test --run src/components/websocket-provider.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/websocket-provider.tsx src/components/websocket-provider.test.tsx
git commit -m "feat(ws): WebSocketProvider — mounts client, exposes context

useWebSocketStatus() returns { status, eventCount, lastEventAt } and
throws when used outside the provider. handleEvent() is exported for
direct unit testing in the next task."
```

---

## Task 9: Event → invalidation map (TDD)

**Files:**
- Modify: `src/components/websocket-provider.test.tsx`

- [ ] **Step 1: Add a `describe` block for `handleEvent`**

Append to `src/components/websocket-provider.test.tsx`:

```tsx
import { QueryClient as RealQueryClient } from "@tanstack/react-query";
import { handleEvent } from "@/components/websocket-provider";

describe("handleEvent → queryKey invalidation map", () => {
  function makeQc() {
    const qc = new RealQueryClient();
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
```

- [ ] **Step 2: Run tests, expect pass**

Run: `pnpm test --run src/components/websocket-provider.test.tsx`
Expected: 8 tests pass total (3 existing + 5 new). The map from Task 8 satisfies these assertions verbatim.

- [ ] **Step 3: Commit**

```bash
git add src/components/websocket-provider.test.tsx
git commit -m "test(ws): event → queryKey invalidation map (5 cases)

Covers every variant of SchedulerEvent. Asserts wallet and
credit-expense keys are never invalidated — they source from api2."
```

---

## Task 10: Mount `WebSocketProvider` in `src/app/providers.tsx`

**Files:**
- Modify: `src/app/providers.tsx`

- [ ] **Step 1: Add the import**

Near the top of `src/app/providers.tsx`, add:

```ts
import { WebSocketProvider } from "@/components/websocket-provider";
```

- [ ] **Step 2: Wrap `{children}` with the provider**

The current return block:

```tsx
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: ONE_DAY_MS,
        buster: CURRENT_VERSION,
        dehydrateOptions: {
          shouldDehydrateQuery,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
```

Becomes:

```tsx
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: ONE_DAY_MS,
        buster: CURRENT_VERSION,
        dehydrateOptions: {
          shouldDehydrateQuery,
        },
      }}
    >
      <WebSocketProvider>{children}</WebSocketProvider>
    </PersistQueryClientProvider>
  );
```

The provider must sit **inside** `PersistQueryClientProvider` so `useQueryClient()` resolves.

- [ ] **Step 3: Run check**

Run: `pnpm check`
Expected: lint + typecheck + tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/providers.tsx
git commit -m "feat(ws): mount WebSocketProvider inside PersistQueryClientProvider

One client for the whole app; subscribers come and go as pages mount."
```

---

## Task 11: "WebSocket stream" row on the Network Health page

**Files:**
- Modify: `src/app/status/page.tsx`

- [ ] **Step 1: Add the import**

Near the top of `src/app/status/page.tsx`, add:

```ts
import { useWebSocketStatus } from "@/components/websocket-provider";
```

- [ ] **Step 2: Add a relative-time helper**

After the existing helpers (around line 130), add:

```ts
function formatRelativeTime(ms: number | null): string {
  if (ms == null) return "—";
  const deltaSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const min = Math.floor(deltaSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

type WsRowStatus = "healthy" | "degraded" | "offline";

function wsRowStatus(s: ReturnType<typeof useWebSocketStatus>["status"]): WsRowStatus {
  if (s === "connected") return "healthy";
  if (s === "disconnected") return "offline";
  return "degraded"; // connecting / reconnecting
}
```

- [ ] **Step 3: Add the `WebSocketRow` component**

After `formatRelativeTime` / `wsRowStatus` (still above `StatusSection`), add:

```tsx
function WebSocketRow() {
  const { status, eventCount, lastEventAt } = useWebSocketStatus();
  const dotStatus = wsRowStatus(status);
  const label =
    status === "connected" && eventCount === 0
      ? "connected · awaiting events"
      : status === "connected"
        ? `${eventCount} event${eventCount === 1 ? "" : "s"} · last ${formatRelativeTime(lastEventAt)}`
        : status === "reconnecting"
          ? "reconnecting…"
          : status === "connecting"
            ? "connecting…"
            : "disconnected";

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <StatusDot status={dotStatus} />
      <div className="min-w-0 flex-1">
        <span className="block truncate font-mono text-sm text-foreground">
          /api/v1/ws
        </span>
        <p className="text-xs text-muted-foreground">WebSocket stream</p>
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {label}
      </span>
    </li>
  );
}
```

- [ ] **Step 4: Render the row at the top of the Scheduler API list**

In `StatusSection`, find the `<ul className="divide-y divide-edge/50">` block (around line 254). Insert the new row only for the Scheduler section. The cleanest path: thread an optional `leading?: ReactNode` prop into `StatusSection`. Update its props:

```tsx
function StatusSection({
  title,
  baseUrl,
  results,
  leading,
}: {
  title: string;
  baseUrl: string;
  results: EndpointResult[];
  leading?: ReactNode;
}) {
```

(Add `ReactNode` to the existing react import at the top: `import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";`.)

Then change the `<ul>` body to render `leading` first:

```tsx
      <ul className="divide-y divide-edge/50">
        {leading}
        {results.map((r, i) => (
          <EndpointRow
            key={r.path}
            result={r}
            baseUrl={baseUrl}
            index={i}
          />
        ))}
      </ul>
```

At the bottom of `StatusPage`, pass `<WebSocketRow />` only to the Scheduler section:

```tsx
        <StatusSection
          title="Scheduler API"
          baseUrl={schedulerBase}
          results={schedulerResults}
          leading={<WebSocketRow />}
        />
        <StatusSection
          title="Aleph API"
          baseUrl={alephBase}
          results={alephResults}
        />
```

- [ ] **Step 5: Run check**

Run: `pnpm check`
Expected: lint + typecheck + tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/status/page.tsx
git commit -m "feat(ws): WebSocket stream row in the Scheduler API section

Reads useWebSocketStatus(). StatusDot — green/connected, amber/connecting
or reconnecting, grey/disconnected. Right column shows event count +
last-event relative time, or 'connected · awaiting events' before any
event has arrived."
```

---

## Task 12: Verify and refine

- [ ] Run full project checks (`pnpm check`)
- [ ] Manual testing / smoke test the feature in `pnpm dev` — open `/status`, confirm the new "WebSocket stream" row renders even if the scheduler doesn't yet implement `/api/v1/ws` (expect the row to cycle through `connecting…` → `reconnecting…` as the socket fails). Once the scheduler endpoint is live, confirm:
  - Status flips to green and the row shows `connected · awaiting events`.
  - Triggering a scheduling action (or waiting for one) makes `/vms` and `/nodes` refetch without manual interaction; the event count increments.
  - Killing the scheduler should put the row into `reconnecting…` and stop event increments; recovery flips back to green.
- [ ] Fix any issues found
- [ ] Re-run checks until clean

---

## Task 13: Update docs and version

- [ ] ARCHITECTURE.md — new patterns, new files, or changed structure (document `src/lib/scheduler-ws.ts` + `src/components/websocket-provider.tsx`; note the invalidation map and that WS is mounted inside `PersistQueryClientProvider`)
- [ ] DECISIONS.md — design decisions made during this feature (WS used for cache invalidation only; polling stays as fallback; wallet + credit-expense keys excluded because they source from api2; reconnect backoff 1/2/4/8/16/30s)
- [ ] BACKLOG.md — completed items moved, deferred ideas added (optimistic `setQueryData` from event payloads; zod-based schema validation if malformed events are observed in practice)
- [ ] CLAUDE.md — Current Features list if user-facing behavior changed (yes — live cache invalidation across all entity pages + new "WebSocket stream" row on `/status`)
- [ ] src/changelog.ts — bump `CURRENT_VERSION` 0.16.0 → 0.17.0 (minor) + add `VersionEntry` with a `feature` change describing the live cache invalidation + new status row

Suggested changelog entry:

```ts
  {
    version: "0.17.0",
    date: "2026-05-12",
    changes: [
      {
        type: "feature",
        text: "Scheduler WebSocket cache invalidation: a single app-wide WebSocket subscribes to the scheduler's new event stream and invalidates the affected React Query caches per event, so every existing page — Overview, Nodes, VMs, Issues — refreshes in near-real-time as VMs are scheduled, migrated, or fail to schedule. Polling stays as a fallback, so disconnected periods don't lose correctness. The Network Health page gains a new \"WebSocket stream\" row that surfaces connection state, event count, and last-event relative time.",
      },
    ],
  },
```

Commit:

```bash
git add CLAUDE.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md src/changelog.ts docs/superpowers/specs/2026-05-12-scheduler-websocket-design.md docs/superpowers/plans/2026-05-12-scheduler-websocket.md
git commit -m "docs: scheduler WebSocket — ARCHITECTURE, DECISIONS, CLAUDE.md, changelog v0.17.0"
```

(The two `docs/superpowers/` files are the spec + this plan, both currently untracked from the brainstorming session. Including them in this final commit ships the design artifacts alongside the feature.)

---

## Done

After Task 13:
- Branch has the WS module, provider, wiring, status row, tests, and docs.
- The plan's status frontmatter at the top should be updated to `status: done` before invoking the ship sequence.
- Run `/dio:ship` (or invoke the ship skill directly) to push, open the PR, run the CI gate, squash-merge, and clean up local state.
