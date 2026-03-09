/**
 * Integration tests against the live scheduler API.
 * Skipped unless RUN_API_TESTS=true (they depend on an external service).
 *
 * Usage:
 *   RUN_API_TESTS=true pnpm test src/api/client.test.ts
 *
 * Override the API URL:
 *   RUN_API_TESTS=true API_URL=http://localhost:8081 pnpm test src/api/client.test.ts
 */
import { describe, expect, it } from "vitest";

const API_URL =
  process.env["API_URL"] ?? "https://rust-scheduler.aleph.im";
const skip = process.env["RUN_API_TESTS"] !== "true";

async function apiFetch(path: string): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`);
  return res;
}

function unwrap<T>(data: T[] | Record<string, T[]>): T[] {
  if (Array.isArray(data)) return data;
  if ("items" in data && Array.isArray(data["items"])) {
    return data["items"] as T[];
  }
  const values = Object.values(data);
  if (values.length === 1 && Array.isArray(values[0])) {
    return values[0];
  }
  return [];
}

describe.skipIf(skip)("live API integration", () => {
  // --- Health check ---

  it("GET /health is reachable", async () => {
    const res = await apiFetch("/health");
    expect(res.ok, `/health returned ${res.status}`).toBe(true);
    const data = await res.json();
    expect(data).toMatchObject({ status: "ok" });
  });

  // --- Connectivity: verify endpoints respond ---

  it("GET /api/v1/nodes is reachable", async () => {
    const res = await apiFetch("/api/v1/nodes");
    expect(res.ok, `/api/v1/nodes returned ${res.status}`).toBe(
      true,
    );
  });

  it("GET /api/v1/vms is reachable", async () => {
    const res = await apiFetch("/api/v1/vms");
    expect(res.ok, `/api/v1/vms returned ${res.status}`).toBe(true);
  });

  it("GET /api/v1/stats is reachable", async () => {
    const res = await apiFetch("/api/v1/stats");
    expect(res.ok, `/api/v1/stats returned ${res.status}`).toBe(
      true,
    );
  });

  // --- Contract: verify response shapes ---

  it("/api/v1/stats matches expected shape", async () => {
    const res = await apiFetch("/api/v1/stats");
    if (!res.ok) return; // skip shape check if endpoint is down

    const data = await res.json();
    expect(data).toMatchObject({
      total_vms: expect.any(Number),
      total_nodes: expect.any(Number),
      healthy_nodes: expect.any(Number),
      total_vcpus_allocated: expect.any(Number),
      total_vcpus_capacity: expect.any(Number),
    });
  });

  it("/api/v1/nodes returns array with valid items", async () => {
    const res = await apiFetch("/api/v1/nodes");
    if (!res.ok) return;

    const data = await res.json();
    const nodes = unwrap(data);
    expect(Array.isArray(nodes)).toBe(true);

    if (nodes.length > 0) {
      const node = nodes[0];
      expect(node).toHaveProperty("node_hash");
      expect(node).toHaveProperty("status");
      expect(node).toHaveProperty("updated_at");
    }
  });

  it("/api/v1/vms returns array with valid items", async () => {
    const res = await apiFetch("/api/v1/vms");
    if (!res.ok) return;

    const data = await res.json();
    const vms = unwrap(data);
    expect(Array.isArray(vms)).toBe(true);

    if (vms.length > 0) {
      const vm = vms[0];
      expect(vm).toHaveProperty("vm_hash");
      expect(vm).toHaveProperty("status");
      expect(vm).toHaveProperty("vm_type");
    }
  });

  // --- Detail endpoints (require data to exist) ---

  it("/api/v1/nodes/:hash returns node detail", async () => {
    const listRes = await apiFetch("/api/v1/nodes");
    if (!listRes.ok) return;

    const nodes = unwrap(await listRes.json());
    if (nodes.length === 0) return; // no data to test against

    const hash = (nodes[0] as { node_hash: string }).node_hash;
    const res = await apiFetch(`/api/v1/nodes/${hash}`);
    expect(res.ok, `node detail returned ${res.status}`).toBe(true);

    const node = await res.json();
    expect(node.node_hash).toBe(hash);
    expect(node).toHaveProperty("status");
  });

  it("/api/v1/nodes/:hash/history returns array", async () => {
    const listRes = await apiFetch("/api/v1/nodes");
    if (!listRes.ok) return;

    const nodes = unwrap(await listRes.json());
    if (nodes.length === 0) return;

    const hash = (nodes[0] as { node_hash: string }).node_hash;
    const res = await apiFetch(`/api/v1/nodes/${hash}/history`);
    expect(res.ok, `node history returned ${res.status}`).toBe(true);

    const history = unwrap(await res.json());
    expect(Array.isArray(history)).toBe(true);
  });

  it("/api/v1/vms/:hash returns VM detail", async () => {
    const listRes = await apiFetch("/api/v1/vms");
    if (!listRes.ok) return;

    const vms = unwrap(await listRes.json());
    if (vms.length === 0) return;

    const hash = (vms[0] as { vm_hash: string }).vm_hash;
    const res = await apiFetch(`/api/v1/vms/${hash}`);
    expect(res.ok, `VM detail returned ${res.status}`).toBe(true);

    const vm = await res.json();
    expect(vm.vm_hash).toBe(hash);
    expect(vm).toHaveProperty("status");
  });

  it("/api/v1/vms/:hash/history returns array", async () => {
    const listRes = await apiFetch("/api/v1/vms");
    if (!listRes.ok) return;

    const vms = unwrap(await listRes.json());
    if (vms.length === 0) return;

    const hash = (vms[0] as { vm_hash: string }).vm_hash;
    const res = await apiFetch(`/api/v1/vms/${hash}/history`);
    expect(res.ok, `VM history returned ${res.status}`).toBe(true);

    const history = unwrap(await res.json());
    expect(Array.isArray(history)).toBe(true);
  });

  // --- Transform layer: verify client functions produce valid app types ---

  it("getNodes() transforms API response correctly", async () => {
    const res = await apiFetch("/api/v1/nodes");
    if (!res.ok) return;

    const { getNodes } = await import("@/api/client");
    const nodes = await getNodes();
    expect(Array.isArray(nodes)).toBe(true);

    if (nodes.length > 0) {
      const node = nodes[0]!;
      expect(node).toHaveProperty("hash");
      expect(["healthy", "unreachable", "unknown", "removed"]).toContain(
        node.status,
      );
    }
  });

  it("getVMs() transforms API response correctly", async () => {
    const res = await apiFetch("/api/v1/vms");
    if (!res.ok) return;

    const { getVMs } = await import("@/api/client");
    const vms = await getVMs();
    expect(Array.isArray(vms)).toBe(true);

    if (vms.length > 0) {
      const vm = vms[0];
      expect(vm).toHaveProperty("hash");
      expect(vm).toHaveProperty("requirements");
    }
  });
});
