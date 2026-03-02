export type NodeStatus = "healthy" | "degraded" | "offline" | "unknown";

export type VMStatus =
  | "scheduled"
  | "observed"
  | "orphaned"
  | "missing"
  | "unschedulable";

export type ResourceSnapshot = {
  cpu: number;
  memory: number;
  disk: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
};

export type Node = {
  hash: string;
  address: string;
  status: NodeStatus;
  resources: ResourceSnapshot;
  vmCount: number;
  lastSeen: string;
};

export type NodeDetail = Node & {
  stakedAmount: number;
  vms: VMSummary[];
  recentEvents: SchedulerEvent[];
};

export type VMSummary = {
  hash: string;
  type: string;
  scheduledStatus: VMStatus;
};

export type VM = {
  hash: string;
  type: string;
  assignedNode: string | null;
  scheduledStatus: VMStatus;
  observedStatus: VMStatus | null;
  requirements: ResourceSnapshot;
};

export type VMDetail = VM & {
  schedulingHistory: SchedulerEvent[];
  recentEvents: SchedulerEvent[];
};

export type EventCategory = "registry" | "node" | "vm";

export type SchedulerEvent = {
  id: string;
  type: string;
  category: EventCategory;
  timestamp: string;
  payload: Record<string, unknown>;
};

export type OverviewStats = {
  totalNodes: number;
  healthyNodes: number;
  degradedNodes: number;
  offlineNodes: number;
  totalVMs: number;
  scheduledVMs: number;
  observedVMs: number;
  orphanedVMs: number;
  missingVMs: number;
  unschedulableVMs: number;
};

export type EventFilters = {
  category?: EventCategory;
  limit?: number;
};

export type NodeFilters = {
  status?: NodeStatus;
};

export type VMFilters = {
  status?: VMStatus;
};

export type StatsSnapshot = OverviewStats & {
  timestamp: string;
};
