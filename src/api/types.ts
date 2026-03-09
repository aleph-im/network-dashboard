// --- Node ---

export type NodeStatus =
  | "healthy"
  | "unreachable"
  | "unknown"
  | "removed";

export type NodeResources = {
  vcpusTotal: number;
  memoryTotalMb: number;
  diskTotalMb: number;
  vcpusAvailable: number;
  memoryAvailableMb: number;
  diskAvailableMb: number;
  cpuUsagePct: number;
  memoryUsagePct: number;
  diskUsagePct: number;
};

export type GpuDevice = {
  vendor: string;
  model: string;
  deviceName: string;
};

export type Node = {
  hash: string;
  name: string | null;
  address: string | null;
  status: NodeStatus;
  staked: boolean;
  resources: NodeResources | null;
  vmCount: number;
  updatedAt: string;
  owner: string | null;
  supportsIpv6: boolean | null;
  discoveredAt: string | null;
  gpus: { used: GpuDevice[]; available: GpuDevice[] };
  confidentialComputing: boolean;
  cpuArchitecture: string | null;
  cpuVendor: string | null;
  cpuFeatures: string[];
};

export type NodeDetail = Node & {
  vms: VM[];
  history: HistoryRow[];
};

export type NodeFilters = {
  status?: NodeStatus;
  hasVms?: boolean;
};

// --- VM ---

export type VmStatus =
  | "scheduled"
  | "unscheduled"
  | "unschedulable"
  | "missing"
  | "orphaned"
  | "unknown";

export type VmType = "microvm" | "persistent_program" | "instance";

export type VmRequirements = {
  vcpus: number | null;
  memoryMb: number | null;
  diskMb: number | null;
};

export type VM = {
  hash: string;
  type: VmType;
  allocatedNode: string | null;
  observedNodes: string[];
  status: VmStatus;
  requirements: VmRequirements;
  paymentStatus: "validated" | "invalidated" | null;
  updatedAt: string;
  allocatedAt: string | null;
  lastObservedAt: string | null;
  paymentType: string | null;
  gpuRequirements: GpuDevice[];
  requiresConfidential: boolean;
};

export type VmDetail = VM & {
  history: HistoryRow[];
};

export type VmFilters = {
  status?: VmStatus;
  node?: string;
};

// --- History ---

export type HistoryAction =
  | "scheduled"
  | "unscheduled"
  | "migrated_from"
  | "migrated_to";

export type HistoryRow = {
  id: number;
  vmHash: string;
  nodeHash: string;
  action: HistoryAction;
  reason: string | null;
  timestamp: string;
};

// --- Overview ---

export type OverviewStats = {
  totalNodes: number;
  healthyNodes: number;
  unreachableNodes: number;
  unknownNodes: number;
  removedNodes: number;
  totalVMs: number;
  scheduledVMs: number;
  orphanedVMs: number;
  missingVMs: number;
  unschedulableVMs: number;
  totalVcpusAllocated: number;
  totalVcpusCapacity: number;
};

// --- API wire types (snake_case, used only in client.ts) ---

export type ApiNodeRow = {
  node_hash: string;
  name: string | null;
  owner: string | null;
  address: string | null;
  status: "Healthy" | "Unreachable" | "Unknown" | "removed";
  staked: boolean;
  vcpus_total: number | null;
  memory_total_mb: number | null;
  disk_total_mb: number | null;
  vcpus_available: number | null;
  memory_available_mb: number | null;
  disk_available_mb: number | null;
  supports_ipv6: boolean | null;
  confidential_computing_enabled: boolean;
  cpu_architecture: string | null;
  cpu_vendor: string | null;
  cpu_features: string[];
  gpus: { used: ApiGpu[]; available: ApiGpu[] };
  payment_receiver: string | null;
  vm_count: number;
  discovered_at: string | null;
  updated_at: string;
};

export type ApiVmRow = {
  vm_hash: string;
  vm_type: VmType;
  allocated_node: string | null;
  allocated_at: string | null;
  observed_nodes: string[];
  last_observed_at: string | null;
  status: VmStatus;
  requirements_vcpus: number | null;
  requirements_memory_mb: number | null;
  requirements_disk_mb: number | null;
  payment_type: string | null;
  payment_status: "validated" | "invalidated" | null;
  updated_at: string;
  requires_confidential: boolean;
  gpu_requirements: ApiGpu[];
  cpu_architecture: string | null;
  cpu_vendor: string | null;
  cpu_features: string[];
};

export type ApiHistoryRow = {
  id: number;
  vm_hash: string;
  node_hash: string;
  action: HistoryAction;
  reason: string | null;
  timestamp: string;
};

export type ApiGpu = {
  vendor: string;
  model: string;
  device_name: string;
  device_class: string;
  device_id: string;
};

export type ApiStats = {
  total_vms: number;
  total_nodes: number;
  healthy_nodes: number;
  total_vcpus_allocated: number;
  total_vcpus_capacity: number;
};

// --- Pagination ---

export type PaginationInfo = {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  pagination: PaginationInfo;
};

// --- Aleph Message API (api2) ---

export type AlephMessage = {
  item_hash: string;
  sender: string;
  chain: string;
  type: string;
  time: number;
  content?: {
    metadata?: {
      name?: string;
    };
  };
};

export type AlephMessageInfo = {
  time: number;
  name: string | null;
  explorerUrl: string;
};
