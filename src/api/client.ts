import type {
  AlephMessage,
  AlephMessageInfo,
  ApiGpu,
  ApiHistoryRow,
  ApiNodeRow,
  ApiStats,
  ApiVmRow,
  GpuDevice,
  HistoryRow,
  Node,
  NodeDetail,
  NodeFilters,
  NodeResources,
  NodeStatus,
  OverviewStats,
  PaginatedResponse,
  VM,
  VmDetail,
  VmFilters,
} from "@/api/types";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const override = params.get("api");
    if (override) return override;
  }
  return (
    process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:8081"
  );
}

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  if (!res.ok) {
    throw new Error(
      `API error: ${res.status} ${res.statusText} for ${path}`,
    );
  }
  return res.json() as Promise<T>;
}

const MAX_PAGE_SIZE = 200;

async function fetchAllPages<T>(path: string): Promise<T[]> {
  const separator = path.includes("?") ? "&" : "?";
  const firstPage = await fetchApi<PaginatedResponse<T>>(
    `${path}${separator}page=1&page_size=${MAX_PAGE_SIZE}`,
  );
  if (firstPage.pagination.total_pages <= 1) {
    return firstPage.items;
  }
  const remaining = Array.from(
    { length: firstPage.pagination.total_pages - 1 },
    (_, i) =>
      fetchApi<PaginatedResponse<T>>(
        `${path}${separator}page=${i + 2}&page_size=${MAX_PAGE_SIZE}`,
      ),
  );
  const pages = await Promise.all(remaining);
  return [firstPage, ...pages].flatMap((p) => p.items);
}

// --- Transform helpers ---

function computeUsagePct(
  total: number | null,
  available: number | null,
): number {
  if (!total || available == null) return 0;
  return Math.round((1 - available / total) * 100);
}

function transformNodeStatus(
  raw: ApiNodeRow["status"],
): NodeStatus {
  const map: Record<ApiNodeRow["status"], NodeStatus> = {
    Healthy: "healthy",
    Unreachable: "unreachable",
    Unknown: "unknown",
    removed: "removed",
  };
  return map[raw];
}

function transformGpu(raw: ApiGpu): GpuDevice {
  return {
    vendor: raw.vendor,
    model: raw.model,
    deviceName: raw.device_name,
  };
}

function transformNodeResources(
  raw: ApiNodeRow,
): NodeResources | null {
  if (raw.vcpus_total == null && raw.memory_total_mb == null) {
    return null;
  }
  return {
    vcpusTotal: raw.vcpus_total ?? 0,
    memoryTotalMb: raw.memory_total_mb ?? 0,
    diskTotalMb: raw.disk_total_mb ?? 0,
    vcpusAvailable: raw.vcpus_available ?? 0,
    memoryAvailableMb: raw.memory_available_mb ?? 0,
    diskAvailableMb: raw.disk_available_mb ?? 0,
    cpuUsagePct: computeUsagePct(
      raw.vcpus_total,
      raw.vcpus_available,
    ),
    memoryUsagePct: computeUsagePct(
      raw.memory_total_mb,
      raw.memory_available_mb,
    ),
    diskUsagePct: computeUsagePct(
      raw.disk_total_mb,
      raw.disk_available_mb,
    ),
  };
}

function transformNode(raw: ApiNodeRow): Node {
  return {
    hash: raw.node_hash,
    name: raw.name,
    address: raw.address,
    status: transformNodeStatus(raw.status),
    staked: raw.staked,
    resources: transformNodeResources(raw),
    vmCount: raw.vm_count,
    updatedAt: raw.updated_at,
    owner: raw.owner,
    supportsIpv6: raw.supports_ipv6,
    discoveredAt: raw.discovered_at,
    gpus: {
      used: raw.gpus.used.map(transformGpu),
      available: raw.gpus.available.map(transformGpu),
    },
    confidentialComputing: raw.confidential_computing_enabled,
    cpuArchitecture: raw.cpu_architecture,
    cpuVendor: raw.cpu_vendor,
    cpuFeatures: raw.cpu_features,
  };
}

function transformVm(raw: ApiVmRow): VM {
  return {
    hash: raw.vm_hash,
    type: raw.vm_type,
    allocatedNode: raw.allocated_node,
    observedNodes: raw.observed_nodes,
    status: raw.status,
    requirements: {
      vcpus: raw.requirements_vcpus,
      memoryMb: raw.requirements_memory_mb,
      diskMb: raw.requirements_disk_mb,
    },
    paymentStatus: raw.payment_status,
    updatedAt: raw.updated_at,
    allocatedAt: raw.allocated_at,
    lastObservedAt: raw.last_observed_at,
    paymentType: raw.payment_type,
    gpuRequirements: raw.gpu_requirements.map(transformGpu),
    requiresConfidential: raw.requires_confidential,
  };
}

function transformHistory(raw: ApiHistoryRow): HistoryRow {
  return {
    id: raw.id,
    vmHash: raw.vm_hash,
    nodeHash: raw.node_hash,
    action: raw.action,
    reason: raw.reason,
    timestamp: raw.timestamp,
  };
}

// --- Filter helpers ---

function applyNodeFilters(
  nodes: Node[],
  filters?: NodeFilters,
): Node[] {
  let result = nodes;
  if (filters?.status) {
    result = result.filter((n) => n.status === filters.status);
  }
  if (filters?.hasVms) {
    result = result.filter((n) => n.vmCount > 0);
  }
  return result;
}

// --- Public API ---

export async function getNodes(
  filters?: NodeFilters,
): Promise<Node[]> {
  const raw = await fetchAllPages<ApiNodeRow>("/api/v1/nodes");
  const nodes = raw.map(transformNode);
  return applyNodeFilters(nodes, filters);
}

export async function getNode(
  hash: string,
): Promise<NodeDetail> {
  const [rawNode, rawVms, rawHistory] = await Promise.all([
    fetchApi<ApiNodeRow>(`/api/v1/nodes/${hash}`),
    fetchAllPages<ApiVmRow>(`/api/v1/vms?node=${hash}`),
    fetchAllPages<ApiHistoryRow>(
      `/api/v1/nodes/${hash}/history`,
    ),
  ]);
  return {
    ...transformNode(rawNode),
    vms: rawVms.map(transformVm),
    history: rawHistory.map(transformHistory),
  };
}

export async function getVMs(filters?: VmFilters): Promise<VM[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.node) params.set("node", filters.node);
  const qs = params.toString();
  const raw = await fetchAllPages<ApiVmRow>(
    `/api/v1/vms${qs ? `?${qs}` : ""}`,
  );
  return raw.map(transformVm);
}

export async function getVM(hash: string): Promise<VmDetail> {
  const [rawVm, rawHistory] = await Promise.all([
    fetchApi<ApiVmRow>(`/api/v1/vms/${hash}`),
    fetchAllPages<ApiHistoryRow>(
      `/api/v1/vms/${hash}/history`,
    ),
  ]);
  return {
    ...transformVm(rawVm),
    history: rawHistory.map(transformHistory),
  };
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const [stats, rawVms, rawNodes] = await Promise.all([
    fetchApi<ApiStats>("/api/v1/stats"),
    fetchAllPages<ApiVmRow>("/api/v1/vms"),
    fetchAllPages<ApiNodeRow>("/api/v1/nodes"),
  ]);
  const nodes = rawNodes.map(transformNode);
  const vms = rawVms.map(transformVm);
  return {
    totalNodes: stats.total_nodes,
    healthyNodes: stats.healthy_nodes,
    unreachableNodes: nodes.filter(
      (n) => n.status === "unreachable",
    ).length,
    unknownNodes: nodes.filter((n) => n.status === "unknown")
      .length,
    removedNodes: nodes.filter((n) => n.status === "removed")
      .length,
    totalVMs: vms.length,
    scheduledVMs: vms.filter((v) => v.status === "scheduled")
      .length,
    orphanedVMs: vms.filter((v) => v.status === "orphaned").length,
    missingVMs: vms.filter((v) => v.status === "missing").length,
    unschedulableVMs: vms.filter(
      (v) => v.status === "unschedulable",
    ).length,
    totalVcpusAllocated: stats.total_vcpus_allocated,
    totalVcpusCapacity: stats.total_vcpus_capacity,
  };
}

// --- Aleph Message API (api2.aleph.im) ---

function getAlephBaseUrl(): string {
  return (
    process.env["NEXT_PUBLIC_ALEPH_API_URL"] ??
    "https://api2.aleph.im"
  );
}

const HASHES_PER_BATCH = 100;

async function fetchMessageBatch(
  hashes: string[],
): Promise<AlephMessage[]> {
  const params = new URLSearchParams({
    hashes: hashes.join(","),
  });
  const url = `${getAlephBaseUrl()}/api/v0/messages.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Aleph API error: ${res.status} for messages.json`);
  }
  const data = (await res.json()) as {
    messages: AlephMessage[];
  };
  return data.messages;
}

export async function getMessagesByHashes(
  hashes: string[],
): Promise<Map<string, AlephMessageInfo>> {
  if (hashes.length === 0) return new Map();
  const batches: string[][] = [];
  for (let i = 0; i < hashes.length; i += HASHES_PER_BATCH) {
    batches.push(hashes.slice(i, i + HASHES_PER_BATCH));
  }
  const results = await Promise.all(batches.map(fetchMessageBatch));
  const map = new Map<string, AlephMessageInfo>();
  for (const messages of results) {
    for (const msg of messages) {
      map.set(msg.item_hash, {
        time: msg.time,
        name: msg.content?.metadata?.name ?? null,
        explorerUrl: `https://explorer.aleph.cloud/address/${msg.chain}/${msg.sender}/message/${msg.type}/${msg.item_hash}`,
      });
    }
  }
  return map;
}
