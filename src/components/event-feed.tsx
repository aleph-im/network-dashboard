"use client";

import { useState } from "react";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useEvents } from "@/hooks/use-events";
import { relativeTime, truncateHash } from "@/lib/format";
import type { EventCategory, SchedulerEvent } from "@/api/types";

const CATEGORY_FILTERS: { label: string; value: EventCategory | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Registry", value: "registry" },
  { label: "Node", value: "node" },
  { label: "VM", value: "vm" },
];

const EVENT_VARIANT: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  node_registered: "success",
  node_deregistered: "error",
  node_status_changed: "warning",
  node_heartbeat_missed: "error",
  node_resources_updated: "info",
  node_staking_updated: "info",
  node_address_updated: "info",
  vm_scheduled: "success",
  vm_observed: "info",
  vm_orphaned_detected: "warning",
  vm_missing_detected: "error",
  vm_unschedulable: "error",
  vm_rescheduled: "warning",
};

function eventSummary(event: SchedulerEvent): string {
  const p = event.payload;
  const nodeHash = p["nodeHash"] as string | undefined;
  const vmHash = p["vmHash"] as string | undefined;

  switch (event.type) {
    case "node_registered":
      return `Node ${truncateHash(nodeHash ?? "")} registered`;
    case "node_deregistered":
      return `Node ${truncateHash(nodeHash ?? "")} deregistered`;
    case "node_status_changed":
      return `Node ${truncateHash(nodeHash ?? "")} ${p["previousStatus"]} → ${p["newStatus"]}`;
    case "node_heartbeat_missed":
      return `Node ${truncateHash(nodeHash ?? "")} missed ${p["missedCount"]} heartbeats`;
    case "node_resources_updated":
      return `Node ${truncateHash(nodeHash ?? "")} CPU: ${p["cpuUsage"]}%, Mem: ${p["memoryUsage"]}%`;
    case "node_staking_updated":
      return `Node ${truncateHash(nodeHash ?? "")} stake ${p["previousStake"]} → ${p["newStake"]}`;
    case "node_address_updated":
      return `Node ${truncateHash(nodeHash ?? "")} address updated`;
    case "vm_scheduled":
      return `VM ${truncateHash(vmHash ?? "")} scheduled on ${truncateHash((p["nodeHash"] as string) ?? "")}`;
    case "vm_observed":
      return `VM ${truncateHash(vmHash ?? "")} observed on ${truncateHash((p["nodeHash"] as string) ?? "")}`;
    case "vm_orphaned_detected":
      return `VM ${truncateHash(vmHash ?? "")} orphaned on ${truncateHash((p["nodeHash"] as string) ?? "")}`;
    case "vm_missing_detected":
      return `VM ${truncateHash(vmHash ?? "")} missing from ${truncateHash((p["nodeHash"] as string) ?? "")}`;
    case "vm_unschedulable":
      return `VM ${truncateHash(vmHash ?? "")} unschedulable: ${p["reason"]}`;
    case "vm_rescheduled":
      return `VM ${truncateHash(vmHash ?? "")} moved ${truncateHash((p["fromNode"] as string) ?? "")} → ${truncateHash((p["toNode"] as string) ?? "")}`;
    default:
      return event.type;
  }
}

export function EventFeed() {
  const [category, setCategory] = useState<EventCategory | undefined>(
    undefined,
  );
  const filters = category
    ? { category, limit: 20 }
    : { limit: 20 };
  const { data: events, isLoading } = useEvents(filters);

  return (
    <Card title="Recent Events" padding="md">
      <div className="mb-3 flex gap-1.5">
        {CATEGORY_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setCategory(filter.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              category === filter.value
                ? "bg-primary-600/10 text-primary-500"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            style={{ transitionDuration: "var(--duration-fast)" }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : (
        <ul className="space-y-1">
          {events?.map((event) => (
            <li
              key={event.id}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <Badge
                variant={EVENT_VARIANT[event.type] ?? "default"}
                size="sm"
                className="mt-0.5 shrink-0"
              >
                {event.type.replace(/_/g, " ")}
              </Badge>
              <span className="flex-1 text-foreground">
                {eventSummary(event)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {relativeTime(event.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
