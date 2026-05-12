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
