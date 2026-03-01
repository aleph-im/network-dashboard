import type {
  EventFilters,
  Node,
  NodeDetail,
  NodeFilters,
  OverviewStats,
  SchedulerEvent,
  VM,
  VMDetail,
  VMFilters,
} from "@/api/types";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const override = params.get("api");
    if (override) return override;
  }
  return (
    process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:8000"
  );
}

function useMocks(): boolean {
  return process.env["NEXT_PUBLIC_USE_MOCKS"] === "true";
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

export async function getNodes(
  filters?: NodeFilters,
): Promise<Node[]> {
  if (useMocks()) {
    const { mockNodes } = await import("@/api/mock");
    const nodes = mockNodes;
    if (filters?.status) {
      return nodes.filter((n) => n.status === filters.status);
    }
    return nodes;
  }
  const params = filters?.status
    ? `?status=${filters.status}`
    : "";
  return fetchApi<Node[]>(`/nodes${params}`);
}

export async function getNode(hash: string): Promise<NodeDetail> {
  if (useMocks()) {
    const { getMockNodeDetail } = await import("@/api/mock");
    return getMockNodeDetail(hash);
  }
  return fetchApi<NodeDetail>(`/nodes/${hash}`);
}

export async function getVMs(filters?: VMFilters): Promise<VM[]> {
  if (useMocks()) {
    const { mockVMs } = await import("@/api/mock");
    const vms = mockVMs;
    if (filters?.status) {
      return vms.filter(
        (v) =>
          v.scheduledStatus === filters.status ||
          v.observedStatus === filters.status,
      );
    }
    return vms;
  }
  const params = filters?.status
    ? `?status=${filters.status}`
    : "";
  return fetchApi<VM[]>(`/vms${params}`);
}

export async function getVM(hash: string): Promise<VMDetail> {
  if (useMocks()) {
    const { getMockVMDetail } = await import("@/api/mock");
    return getMockVMDetail(hash);
  }
  return fetchApi<VMDetail>(`/vms/${hash}`);
}

export async function getEvents(
  filters?: EventFilters,
): Promise<SchedulerEvent[]> {
  if (useMocks()) {
    const { mockEvents } = await import("@/api/mock");
    let events = mockEvents;
    if (filters?.category) {
      events = events.filter(
        (e) => e.category === filters.category,
      );
    }
    if (filters?.limit) {
      events = events.slice(0, filters.limit);
    }
    return events;
  }
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return fetchApi<SchedulerEvent[]>(
    `/events${qs ? `?${qs}` : ""}`,
  );
}

export async function getOverviewStats(): Promise<OverviewStats> {
  if (useMocks()) {
    const { mockOverviewStats } = await import("@/api/mock");
    return mockOverviewStats;
  }
  return fetchApi<OverviewStats>("/stats");
}
