import type { NodeStatus, VmStatus } from "@/api/types";

type DotStatus =
  | "healthy"
  | "degraded"
  | "error"
  | "offline"
  | "unknown";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

const NODE_STATUS_TO_DOT: Record<NodeStatus, DotStatus> = {
  healthy: "healthy",
  unreachable: "error",
  unknown: "unknown",
  removed: "offline",
};

export function nodeStatusToDot(status: NodeStatus): DotStatus {
  return NODE_STATUS_TO_DOT[status];
}

export const NODE_STATUS_VARIANT: Record<NodeStatus, BadgeVariant> = {
  healthy: "success",
  unreachable: "error",
  unknown: "default",
  removed: "warning",
};

export const VM_STATUS_VARIANT: Record<VmStatus, BadgeVariant> = {
  scheduled: "success",
  unscheduled: "default",
  orphaned: "warning",
  missing: "error",
  unschedulable: "warning",
  unknown: "default",
};
