import type {
  AlephMessage,
  AlephMessageInfo,
  ApiGpu,
  ApiHistoryRow,
  ApiNodeRow,
  ApiStats,
  ApiVmRow,
  AuthorizationResponse,
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
import { ACTIVE_VM_STATUSES } from "@/lib/filters";

export function getBaseUrl(): string {
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

export function transformVm(raw: ApiVmRow): VM {
  return {
    hash: raw.vm_hash,
    type: raw.vm_type,
    allocatedNode: raw.allocated_node,
    observedNodes: raw.observed_nodes ?? [],
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
    schedulingStatus: raw.scheduling_status,
    migrationTarget: raw.migration_target,
    migrationStartedAt: raw.migration_started_at,
    owner: raw.owner,
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
    fetchAllPages<ApiVmRow>(`/api/v1/vms?node=${hash}`).catch(
      () => [] as ApiVmRow[],
    ),
    fetchAllPages<ApiHistoryRow>(
      `/api/v1/nodes/${hash}/history`,
    ).catch(() => [] as ApiHistoryRow[]),
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
    ).catch(() => [] as ApiHistoryRow[]),
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
    totalVMs: vms.filter((v) => ACTIVE_VM_STATUSES.has(v.status))
      .length,
    dispatchedVMs: vms.filter((v) => v.status === "dispatched")
      .length,
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

export async function checkHealth(): Promise<boolean> {
  const res = await fetch(`${getBaseUrl()}/health`);
  return res.ok;
}

export async function getWalletMessages(
  address: string,
  messageTypes?: string[],
): Promise<AlephMessage[]> {
  const params = new URLSearchParams({ addresses: address });
  if (messageTypes && messageTypes.length > 0) {
    params.set("message_types", messageTypes.join(","));
  }
  const allMessages: AlephMessage[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    params.set("pagination", String(perPage));
    params.set("page", String(page));
    const url = `${getAlephBaseUrl()}/api/v0/messages.json?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Aleph API error: ${res.status} for messages.json`,
      );
    }
    const data = (await res.json()) as {
      messages: AlephMessage[];
      pagination_total: number;
      pagination_per_page: number;
    };
    allMessages.push(...data.messages);
    if (
      allMessages.length >= data.pagination_total ||
      data.messages.length < perPage
    ) {
      break;
    }
    page++;
  }
  return allMessages;
}

// On-chain ALEPH balance for a list of addresses, returned keyed by the
// lowercased address. The endpoint returns the balance summed across chains
// (ETH + BASE + …) under `balance`. Failures for individual addresses are
// skipped — the resulting map is best-effort, and callers should treat a
// missing entry as "unknown" rather than zero.
const BALANCE_FETCH_BATCH = 20;

export async function getOwnerBalances(
  addresses: string[],
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  const unique = [...new Set(addresses)];
  for (let i = 0; i < unique.length; i += BALANCE_FETCH_BATCH) {
    const batch = unique.slice(i, i + BALANCE_FETCH_BATCH);
    const results = await Promise.allSettled(
      batch.map(async (addr): Promise<[string, number]> => {
        const url =
          `${getAlephBaseUrl()}/api/v0/addresses/${addr}/balance`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`balance ${res.status} for ${addr}`);
        }
        const data = (await res.json()) as { balance?: number };
        return [addr.toLowerCase(), data.balance ?? 0];
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        balances.set(r.value[0], r.value[1]);
      }
    }
  }
  return balances;
}

export async function getAuthorizations(
  address: string,
  direction: "granted" | "received",
): Promise<AuthorizationResponse> {
  const url = `${getAlephBaseUrl()}/api/v0/authorizations/${direction}/${address}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Aleph API error: ${res.status} for authorizations/${direction}`,
    );
  }
  return res.json() as Promise<AuthorizationResponse>;
}

// --- Credit Expense API ---

const CREDIT_EXPENSE_SENDER =
  "0x6aeaEEb08720DEc9d6dae1A8fc49344Dd99391Ac";
const CORECHANNEL_SENDER =
  "0xa1B3bb7d2332383D96b7796B908fB7f7F3c2Be10";

type ApiCreditExpenseMessage = {
  item_hash: string;
  time: number;
  content: {
    content: {
      tags: string[];
      expense: {
        amount: number;
        count: number;
        credit_price_aleph: number;
        credit_price_usdc: number;
        credits: {
          address: string;
          amount: number;
          price: number;
          ref: string;
          time: number;
          node_id?: string;
          execution_id?: string;
          size?: number;
        }[];
        start_date: number;
        end_date: number;
      };
    };
  };
};

import type {
  CCNInfo,
  CRNInfo,
  CreditExpense,
  NodeState,
  ApiCorechannelNode,
  ApiResourceNode,
} from "@/api/credit-types";

function parseCreditMessage(
  msg: ApiCreditExpenseMessage,
): CreditExpense | null {
  const inner = msg.content.content;
  const tags = inner.tags ?? [];
  const expense = inner.expense;
  if (!expense) return null;

  const type = tags.includes("type_storage")
    ? ("storage" as const)
    : tags.includes("type_execution")
      ? ("execution" as const)
      : null;
  if (!type) return null;

  const creditPriceAleph = expense.credit_price_aleph;

  return {
    hash: msg.item_hash,
    time: msg.time,
    type,
    totalAleph: expense.credits.reduce(
      (sum, c) => sum + c.amount * creditPriceAleph,
      0,
    ),
    creditCount: expense.count,
    creditPriceAleph,
    credits: expense.credits.map((c) => ({
      address: c.address,
      amount: c.amount,
      alephCost: c.amount * creditPriceAleph,
      ref: c.ref,
      timeSec: c.time,
      nodeId: c.node_id ?? null,
      executionId: c.execution_id ?? null,
    })),
  };
}

export async function getCreditExpenses(
  startDate: number,
  endDate: number,
): Promise<CreditExpense[]> {
  // Single request with high pagination limit — credit expenses are
  // ~2 per hour (storage + execution), so 30 days ≈ 1440 messages.
  const params = new URLSearchParams({
    msgType: "POST",
    contentTypes: "aleph_credit_expense",
    addresses: CREDIT_EXPENSE_SENDER,
    startDate: String(Math.floor(startDate)),
    endDate: String(Math.floor(endDate)),
    pagination: "10000",
    sort_order: "1",
    sort_by: "tx-time",
  });

  const url = `${getAlephBaseUrl()}/api/v0/messages.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Aleph API error: ${res.status}`);
  }
  const data = (await res.json()) as {
    messages: ApiCreditExpenseMessage[];
  };

  const all: CreditExpense[] = [];
  for (const msg of data.messages) {
    const parsed = parseCreditMessage(msg);
    if (parsed) all.push(parsed);
  }

  return all;
}

export async function getNodeState(): Promise<NodeState> {
  const url = `${getAlephBaseUrl()}/api/v0/aggregates/${CORECHANNEL_SENDER}.json?keys=corechannel`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Aleph API error: ${res.status} for aggregates`);
  }
  const data = (await res.json()) as {
    data: {
      corechannel: {
        nodes: ApiCorechannelNode[];
        resource_nodes: ApiResourceNode[];
      };
    };
  };

  const channel = data.data.corechannel;
  const ccns = new Map<string, CCNInfo>();
  const crns = new Map<string, CRNInfo>();

  for (const n of channel.nodes ?? []) {
    ccns.set(n.hash, {
      hash: n.hash,
      name: n.name,
      owner: n.owner,
      reward: n.reward,
      score: n.score,
      status: n.status,
      stakers: n.stakers,
      totalStaked: n.total_staked,
      inactiveSince: n.inactive_since ?? null,
      resourceNodes: n.resource_nodes ?? [],
    });
  }

  for (const r of channel.resource_nodes ?? []) {
    crns.set(r.hash, {
      hash: r.hash,
      name: r.name,
      owner: r.owner,
      reward: r.reward,
      score: r.score,
      status: r.status,
      inactiveSince: r.inactive_since ?? null,
      parent: r.parent ?? null,
    });
  }

  return { ccns, crns };
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
        sender: msg.sender,
        explorerUrl: `https://explorer.aleph.cloud/address/${msg.chain}/${msg.sender}/message/${msg.type}/${msg.item_hash}`,
      });
    }
  }
  return map;
}
