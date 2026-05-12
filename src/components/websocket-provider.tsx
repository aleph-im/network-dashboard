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
