# Scheduler WebSocket cache invalidation

**Date:** 2026-05-12
**Status:** Design approved, ready for implementation planning
**Related:** Scheduler API additions (PR #158 — new `/api/v1/ws` WebSocket endpoint).

## Goal

Subscribe to the scheduler's new event stream and invalidate the React Query caches that depend on the affected entities. This turns every existing page into a near-live view of scheduling activity without any UI work on those pages.

Polling continues to run as a fallback for disconnected states, so this is purely additive — no page loses correctness if the WebSocket is down.

## Scope

**In scope:**

1. New WebSocket client module with auto-reconnect (exponential backoff).
2. Singleton `WebSocketProvider` mounted at the app root inside `QueryClientProvider`.
3. Event-to-queryKey invalidation map driven by a single internal listener.
4. Connection status surfaced on `/status` as a new row in the Scheduler API section: state + event count + last-event timestamp.

**Out of scope:**

- **New "Activity feed" page.** Considered; rejected as premature — the value of WS in v1 is making existing pages feel live, not adding new UI surface.
- **Replacing polling.** Polling stays. Dropping it would require careful resync logic for missed-event scenarios; the marginal load saved isn't worth the complexity risk.
- **Pulse animations on the network graph.** Rejected for v1 — cache invalidation already keeps the polled migration tethers (Spec A) fresh on the next event tick.
- **Per-page event subscriptions** beyond cache invalidation. The provider is a black box for v1 — only the status page reads its context.

## Connection module (`src/lib/scheduler-ws.ts`)

A standalone non-React module so it's unit-testable and the connection lifecycle is decoupled from React mount/unmount semantics.

**Public surface:**

```ts
export type SchedulerEvent =
  | { type: "VmScheduled"; vmHash: string; nodeHash: string }
  | { type: "VmUnscheduled"; vmHash: string; nodeHash: string }
  | { type: "VmMigrated"; vmHash: string; sourceHash: string; targetHash: string }
  | { type: "VmUnschedulable"; vmHash: string };

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export type WsClient = {
  status: ConnectionStatus;
  lastEventAt: number | null;     // ms epoch
  eventCount: number;
  subscribe(fn: (e: SchedulerEvent) => void): () => void;
  onStatusChange(fn: (s: ConnectionStatus) => void): () => void;
  close(): void;
};

export function createWsClient(url: string): WsClient;
```

**Behavior:**

- On construction, opens the WebSocket immediately. Reports `status: "connecting"` until first `onopen`.
- On `onmessage`, parses JSON, validates `type` against the union, increments `eventCount`, sets `lastEventAt = Date.now()`, dispatches to subscribers.
- On `onclose` / `onerror`, transitions to `"reconnecting"`, schedules a reconnect with exponential backoff: 1s, 2s, 4s, 8s, 16s, then 30s cap. Resets to 1s after a successful reconnect.
- Subscribers are stored in a `Set<(e: SchedulerEvent) => void>`. `subscribe()` returns an unsubscribe function. Re-entrancy is fine — sets handle add/remove during iteration via a defensive copy.
- `close()` clears the reconnect timer, sets `status: "disconnected"`, and stops further reconnect attempts.

**URL derivation.**

```ts
function getWsUrl(): string {
  const base = getBaseUrl();    // existing helper from src/api/client.ts
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/api/v1/ws`;
}
```

The `?api=` URL override is already handled by `getBaseUrl()` — the protocol swap flips `https://override.example.com` → `wss://override.example.com` correctly.

**Static export compatibility.** WebSocket is browser-only, but `createWsClient` is only invoked from a `"use client"` provider, so there's no SSR concern. Production deploys to IPFS — the WS connection target is governed at runtime by `NEXT_PUBLIC_API_URL` / `?api=`, same as the REST client.

## React provider (`src/components/websocket-provider.tsx`)

```ts
"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createWsClient, type ConnectionStatus, type SchedulerEvent, type WsClient } from "@/lib/scheduler-ws";

type Ctx = {
  status: ConnectionStatus;
  lastEventAt: number | null;
  eventCount: number;
};

const WebSocketContext = createContext<Ctx | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
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
  if (!ctx) throw new Error("useWebSocketStatus must be used inside WebSocketProvider");
  return ctx;
}
```

`handleEvent` is the **event → invalidation** map (kept in the same file or extracted to `scheduler-ws.ts`):

```ts
function handleEvent(e: SchedulerEvent, qc: QueryClient): void {
  // Overview-stats is its own query that fetches /api/v1/stats + full VM and
  // node lists, so any scheduling event affects it. Always invalidate.
  qc.invalidateQueries({ queryKey: ["overview-stats"] });

  switch (e.type) {
    case "VmScheduled":
    case "VmUnscheduled":
    case "VmUnschedulable":
      qc.invalidateQueries({ queryKey: ["vms"] });
      qc.invalidateQueries({ queryKey: ["vm", e.vmHash] });
      // Issues derives from vms+nodes; React Query handles the dependency
      // automatically via useVMs()/useNodes() — no separate invalidate needed.
      break;
    case "VmMigrated":
      qc.invalidateQueries({ queryKey: ["vms"] });
      qc.invalidateQueries({ queryKey: ["vm", e.vmHash] });
      qc.invalidateQueries({ queryKey: ["nodes"] });     // vmCount changed on both ends
      qc.invalidateQueries({ queryKey: ["node", e.sourceHash] });
      qc.invalidateQueries({ queryKey: ["node", e.targetHash] });
      break;
  }
}
```

**Coverage.** This covers every entity-data queryKey the dashboard currently uses: `["vms"]`, `["vm", hash]`, `["nodes"]`, `["node", hash]`, `["overview-stats"]`. `["issues"]` doesn't exist as a separate key — Issues is a `useMemo` over `useVMs()` + `useNodes()`, so the existing invalidations cascade for free. Wallet (`["wallet-vms", …]`, `["wallet-activity", …]`) and credit-expense (`["credit-expenses", …]`) keys are intentionally excluded — they source from api2, not the scheduler, and a scheduler WS event doesn't materially affect them.

## Wiring (`src/app/providers.tsx`)

Mount the new provider **inside** `PersistQueryClientProvider` so `useQueryClient()` resolves:

```tsx
<PersistQueryClientProvider client={queryClient} persistOptions={...}>
  <WebSocketProvider>
    {children}
  </WebSocketProvider>
</PersistQueryClientProvider>
```

One connection for the whole app. Subscribers come and go (status page mounts/unmounts); the WS stays up.

## Network Health page (`src/app/status/page.tsx`)

Add a new row to the **Scheduler API** section, sibling to `/health`:

- **Label:** "WebSocket stream"
- **StatusDot color:** `green` for `connected`, `amber` for `connecting` / `reconnecting`, `grey` for `disconnected`.
- **Right side:** event count + last-event relative time, e.g. `12 events · last 3s ago`. When no events yet: `connected · awaiting events`.
- **No latency column** — WebSocket doesn't have a meaningful per-message latency in this context.

Renders from the `useWebSocketStatus()` context. No new fetch logic — the status is already maintained by the provider.

## Files changed

- `src/lib/scheduler-ws.ts` — new module: connection, reconnect, subscriber registry.
- `src/lib/scheduler-ws.test.ts` — new tests (see Testing).
- `src/components/websocket-provider.tsx` — new React provider, event-handler map.
- `src/app/providers.tsx` — mount `WebSocketProvider` inside the query-client provider.
- `src/app/status/page.tsx` — new "WebSocket stream" row in the Scheduler API section.
- `src/changelog.ts` — minor bump entry.
- `docs/ARCHITECTURE.md` — note the WS layer: where it lives, how invalidation is keyed.
- `CLAUDE.md` — Current Features list entry for live cache invalidation + status page row.
- `docs/DECISIONS.md` — entry for "WS used for cache invalidation only; polling stays as fallback".

## Testing

**`src/lib/scheduler-ws.test.ts`:**

- Mock `WebSocket` (vitest's `vi.stubGlobal` + a minimal mock class).
- **Construction → connecting → connected.** Calling `createWsClient(url)` reports `"connecting"`; `onopen` flips to `"connected"`.
- **Event parsing.** Sending a malformed JSON payload doesn't crash; valid payloads increment `eventCount` and reach subscribers.
- **Reconnect backoff.** Fake timers; force `onclose`; assert reconnect attempted at 1s, then 2s, then 4s (no need to test the whole sequence).
- **`close()` is final.** After `close()`, no further reconnect attempts even if the mock socket reports another close.
- **Subscriber unsubscribe.** `subscribe(fn)()` removes the subscriber; further events don't reach the unsubbed function.

**Provider tests** (`src/components/websocket-provider.test.tsx`):

- Mount the provider with a mocked WS; assert `useWebSocketStatus()` returns the expected initial state.
- Dispatch a `VmScheduled` event; assert `queryClient.invalidateQueries` was called with `["vms"]` and `["vm", hash]`.
- Dispatch a `VmMigrated` event; assert the additional `["nodes"]`, `["node", sourceHash]`, `["node", targetHash]` invalidations.

**Status page test:**

- Mock `useWebSocketStatus()` to return each connection state; assert the StatusDot variant and label text.

## Open questions

None at design approval time. Implementation-time decisions deferred:

- **Reconnect backoff sequence.** 1/2/4/8/16/30s cap is a reasonable default; tune during implementation if it feels too aggressive (excess load on a flaky scheduler) or too slow.
- **Schema validation.** First pass parses JSON and trusts the `type` field. If we observe malformed events in practice, add a `zod` (or hand-rolled) discriminated-union validator before dispatch.
- **Optimistic UI updates from WS events.** Cache invalidation triggers a refetch, which lands in ~30-500ms. If that feels laggy, a future optimization can `setQueryData` directly from the event payload — but that requires duplicating the transform layer's shape and risks drift. Defer until the lag is observed.
