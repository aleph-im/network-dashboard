#!/usr/bin/env node
// Smoke test for the Overview headline stats (marketing backlog P0-03:
// dashboard rendering "0 nodes / 0 VMs" on transient API failures).
//
// The deployed dashboard is a static export rendered client-side with React
// Query, so its HTML carries no stat values — verifying the *rendered* DOM
// would require headless Chrome, which we deliberately avoid here (no new
// deps). Instead this script exercises the exact data path the client uses
// (`getOverviewStats` in src/api/client.ts): the cheap /api/v1/stats call
// for the headline totals, plus the paginated /api/v1/vms and /api/v1/nodes
// fan-outs for the derived breakdowns. It asserts:
//
//   1. /api/v1/stats reports nonzero total_nodes / total_vms / healthy_nodes
//   2. The node fan-out count agrees with stats.total_nodes within 5%
//   3. The 7d-retention VM count (the Overview "Total VMs" headline,
//      Decision #110) is nonzero
//
// Usage: node scripts/smoke-stats.mjs [api-base-url]
//   default api-base-url: https://rust-scheduler.aleph.im

const BASE_URL = process.argv[2] ?? "https://rust-scheduler.aleph.im";
const MAX_PAGE_SIZE = 200; // mirrors MAX_PAGE_SIZE in src/api/client.ts
const RETENTION_MS = 7 * 86_400_000; // DEFAULT_RETENTION ("7d") in src/lib/filters.ts
const TOLERANCE = 0.05;

let failures = 0;

function check(ok, label, detail) {
  const status = ok ? "ok " : "FAIL";
  console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function fetchJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText} for ${path}`);
  }
  return res.json();
}

// Mirrors fetchAllPages in src/api/client.ts.
async function fetchAllPages(path) {
  const separator = path.includes("?") ? "&" : "?";
  const firstPage = await fetchJson(
    `${path}${separator}page=1&page_size=${MAX_PAGE_SIZE}`,
  );
  if (firstPage.pagination.total_pages <= 1) return firstPage.items;
  const remaining = Array.from(
    { length: firstPage.pagination.total_pages - 1 },
    (_, i) =>
      fetchJson(`${path}${separator}page=${i + 2}&page_size=${MAX_PAGE_SIZE}`),
  );
  const pages = await Promise.all(remaining);
  return [firstPage, ...pages].flatMap((p) => p.items);
}

function withinTolerance(a, b) {
  if (b === 0) return a === 0;
  return Math.abs(a - b) / b <= TOLERANCE;
}

// Mirrors lastActivityMs + applyRetentionWindow in src/lib/filters.ts
// (wire-format field names, since we skip the client's transform step).
function lastActivityMs(vm) {
  const t = (s) => (s ? new Date(s).getTime() : Number.NEGATIVE_INFINITY);
  return Math.max(
    t(vm.last_observed_at),
    t(vm.updated_at),
    t(vm.allocated_at),
  );
}

const stats = await fetchJson("/api/v1/stats");
check(stats.total_nodes > 0, "stats.total_nodes nonzero", String(stats.total_nodes));
check(stats.total_vms > 0, "stats.total_vms nonzero", String(stats.total_vms));
check(
  stats.healthy_nodes > 0,
  "stats.healthy_nodes nonzero",
  String(stats.healthy_nodes),
);

const [nodes, vms] = await Promise.all([
  fetchAllPages("/api/v1/nodes"),
  fetchAllPages("/api/v1/vms"),
]);

check(
  withinTolerance(nodes.length, stats.total_nodes),
  "node fan-out agrees with stats.total_nodes (±5%)",
  `${nodes.length} fetched vs ${stats.total_nodes} reported`,
);

const cutoff = Date.now() - RETENTION_MS;
const recentVms = vms.filter((vm) => lastActivityMs(vm) >= cutoff).length;
check(
  recentVms > 0,
  'Overview "Total VMs" headline (7d retention) nonzero',
  `${recentVms} of ${vms.length} fetched VMs`,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed against ${BASE_URL}`);
  process.exit(1);
}
console.log(`\nAll checks passed against ${BASE_URL}`);
