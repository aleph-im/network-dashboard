"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pulse } from "@phosphor-icons/react";
import { Button } from "@aleph-front/ds/button";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { Badge } from "@aleph-front/ds/badge";
import { useWebSocketStatus } from "@/components/websocket-provider";

type EndpointResult = {
  path: string;
  label: string;
  status: "pending" | "healthy" | "error" | "skipped";
  httpCode: number | null;
  latencyMs: number | null;
};

type EndpointDef = {
  path: string;
  label: string;
  dependsOn?: string;
};

// --- Scheduler API ---

const SCHEDULER_PREFIX = "/api/v1";

const SCHEDULER_ENDPOINTS: EndpointDef[] = [
  { path: "/stats", label: "Stats" },
  { path: "/nodes", label: "Nodes (list)" },
  { path: "/vms", label: "VMs (list)" },
  {
    path: "/nodes/:hash",
    label: "Node detail",
    dependsOn: "nodes",
  },
  {
    path: "/nodes/:hash/history",
    label: "Node history",
    dependsOn: "nodes",
  },
  {
    path: "/vms/:hash",
    label: "VM detail",
    dependsOn: "vms",
  },
  {
    path: "/vms/:hash/history",
    label: "VM history",
    dependsOn: "vms",
  },
];

// --- Aleph API (api2) ---

type AlephEndpointDef = EndpointDef & { probePath: string };

const ALEPH_ENDPOINTS: AlephEndpointDef[] = [
  {
    path: "/api/v0/messages.json",
    probePath: "/api/v0/messages.json?pagination=1",
    label: "Messages",
  },
  {
    path: "/api/v0/aggregates/:address.json",
    probePath:
      "/api/v0/aggregates/0xa1B3bb7d2332383D96b7796B908fB7f7F3c2Be10.json?keys=corechannel&limit=1",
    label: "Aggregates (corechannel)",
  },
  {
    path: "/api/v0/authorizations/:direction/:address.json",
    probePath:
      "/api/v0/authorizations/granted/0xa1B3bb7d2332383D96b7796B908fB7f7F3c2Be10.json",
    label: "Authorizations",
  },
];

function getSchedulerBaseUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const override = params.get("api");
    if (override) return override;
  }
  return (
    process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:8081"
  );
}

function getAlephBaseUrl(): string {
  return (
    process.env["NEXT_PUBLIC_ALEPH_API_URL"] ??
    "https://api2.aleph.im"
  );
}

function unwrapFirstHash(
  data: unknown,
  key: "nodes" | "vms",
): string | null {
  const hashField = key === "nodes" ? "node_hash" : "vm_hash";
  let arr: unknown[];
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if ("items" in obj && Array.isArray(obj["items"])) {
      arr = obj["items"];
    } else if (key in obj) {
      arr = (obj as Record<string, unknown[]>)[key]!;
    } else {
      return null;
    }
  } else {
    return null;
  }
  const first = arr[0];
  if (first && typeof first === "object" && hashField in first) {
    return (first as Record<string, string>)[hashField]!;
  }
  return null;
}

async function timedFetch(
  url: string,
): Promise<{ res: Response; latencyMs: number }> {
  const t0 = performance.now();
  const res = await fetch(url);
  const latencyMs = Math.round(performance.now() - t0);
  return { res, latencyMs };
}

function formatRelativeTime(ms: number | null): string {
  if (ms == null) return "—";
  const deltaSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const min = Math.floor(deltaSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

type WsRowStatus = "healthy" | "degraded" | "offline";

function wsRowStatus(
  s: ReturnType<typeof useWebSocketStatus>["status"],
): WsRowStatus {
  if (s === "connected") return "healthy";
  if (s === "disconnected") return "offline";
  return "degraded"; // connecting / reconnecting
}

function WebSocketRow() {
  const { status, eventCount, lastEventAt } = useWebSocketStatus();
  const dotStatus = wsRowStatus(status);
  const label =
    status === "connected" && eventCount === 0
      ? "connected · awaiting events"
      : status === "connected"
        ? `${eventCount} event${eventCount === 1 ? "" : "s"} · last ${formatRelativeTime(lastEventAt)}`
        : status === "reconnecting"
          ? "reconnecting…"
          : status === "connecting"
            ? "connecting…"
            : "disconnected";

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <StatusDot status={dotStatus} />
      <div className="min-w-0 flex-1">
        <span className="block truncate font-mono text-sm text-foreground">
          /api/v1/ws
        </span>
        <p className="text-xs text-muted-foreground">WebSocket stream</p>
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {label}
      </span>
    </li>
  );
}

async function probeEndpoint(
  url: string,
  displayPath: string,
  label: string,
): Promise<EndpointResult> {
  try {
    const { res, latencyMs } = await timedFetch(url);
    return {
      path: displayPath,
      label,
      status: res.ok ? "healthy" : "error",
      httpCode: res.status,
      latencyMs,
    };
  } catch {
    return {
      path: displayPath,
      label,
      status: "error",
      httpCode: null,
      latencyMs: null,
    };
  }
}

// --- Endpoint row ---

function EndpointRow({
  result,
  baseUrl,
  index,
}: {
  result: EndpointResult;
  baseUrl: string;
  index: number;
}) {
  const isPending = result.status === "pending";

  return (
    <li
      className="flex items-center gap-3 px-4 py-2.5 transition-opacity duration-300"
      style={{
        animationDelay: `${index * 60}ms`,
        animationDuration: "400ms",
        animationFillMode: "both",
        animationName: isPending ? "none" : "fade-in",
        opacity: isPending ? 0.4 : undefined,
      }}
    >
      <StatusDot
        status={
          result.status === "pending"
            ? "unknown"
            : result.status === "skipped"
              ? "offline"
              : result.status
        }
      />
      <div className="min-w-0 flex-1">
        <a
          href={`${baseUrl}${result.path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate font-mono text-sm text-foreground transition-colors hover:text-primary-400"
        >
          {result.path}
        </a>
        <p className="text-xs text-muted-foreground">
          {result.label}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {result.latencyMs != null && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {result.latencyMs}ms
          </span>
        )}
        <span
          className={`min-w-[3ch] text-right font-mono text-xs tabular-nums ${
            result.status === "healthy"
              ? "text-success-400"
              : result.status === "error"
                ? "text-error-400"
                : "text-muted-foreground"
          }`}
        >
          {result.status === "skipped"
            ? "—"
            : result.status === "pending"
              ? "\u2026"
              : result.httpCode}
        </span>
      </div>
    </li>
  );
}

// --- Section ---

function StatusSection({
  title,
  baseUrl,
  results,
  extraRowAfterFirst,
  extraHealthy = 0,
  extraTotal = 0,
}: {
  title: string;
  baseUrl: string;
  results: EndpointResult[];
  // Optional row rendered after the first result (e.g. /health) — used for the
  // WebSocket stream check, which sits below the health row but is counted
  // separately via extraHealthy/extraTotal.
  extraRowAfterFirst?: ReactNode;
  extraHealthy?: number;
  extraTotal?: number;
}) {
  const healthyCount =
    results.filter((r) => r.status === "healthy").length + extraHealthy;
  const totalCount = results.length + extraTotal;

  const [first, ...rest] = results;

  return (
    <section className="stat-card border border-edge bg-surface/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-edge px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {title}
        </h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {healthyCount}/{totalCount} healthy
        </span>
      </div>
      <ul className="divide-y divide-edge/50">
        {first && (
          <EndpointRow
            key={first.path}
            result={first}
            baseUrl={baseUrl}
            index={0}
          />
        )}
        {extraRowAfterFirst}
        {rest.map((r, i) => (
          <EndpointRow
            key={r.path}
            result={r}
            baseUrl={baseUrl}
            index={i + 1}
          />
        ))}
      </ul>
    </section>
  );
}

// --- Pending state builder ---

function buildPendingList(
  prefix: string,
  endpoints: EndpointDef[],
  includeHealth: boolean,
): EndpointResult[] {
  const items: EndpointResult[] = [];
  if (includeHealth) {
    items.push({
      path: "/health",
      label: "Health",
      status: "pending",
      httpCode: null,
      latencyMs: null,
    });
  }
  for (const e of endpoints) {
    items.push({
      path: prefix ? `${prefix}${e.path}` : e.path,
      label: e.label,
      status: "pending",
      httpCode: null,
      latencyMs: null,
    });
  }
  return items;
}

// --- Page ---

export default function StatusPage() {
  const wsStatus = useWebSocketStatus();
  const wsHealthy = wsStatus.status === "connected";
  const wsPending = wsStatus.status === "connecting";

  const [schedulerResults, setSchedulerResults] = useState<
    EndpointResult[]
  >(
    buildPendingList(SCHEDULER_PREFIX, SCHEDULER_ENDPOINTS, true),
  );
  const [alephResults, setAlephResults] = useState<
    EndpointResult[]
  >(buildPendingList("", ALEPH_ENDPOINTS, false));
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const runChecks = useCallback(async () => {
    setChecking(true);
    const minDelay = new Promise((r) => setTimeout(r, 600));
    const schedulerBase = getSchedulerBaseUrl();
    const alephBase = getAlephBaseUrl();

    // --- Scheduler checks ---
    const schedulerItems: EndpointResult[] = [];
    const listData: Record<string, unknown> = {};

    const healthResult = await probeEndpoint(
      `${schedulerBase}/health`,
      "/health",
      "Health",
    );

    const independent = SCHEDULER_ENDPOINTS.filter(
      (e) => !e.dependsOn,
    );
    const indResults = await Promise.allSettled(
      independent.map(async (ep) => {
        const url = `${schedulerBase}${SCHEDULER_PREFIX}${ep.path}`;
        const { res, latencyMs } = await timedFetch(url);
        const data = res.ok ? await res.json() : null;
        if (ep.path === "/nodes") listData["nodes"] = data;
        if (ep.path === "/vms") listData["vms"] = data;
        return {
          path: `${SCHEDULER_PREFIX}${ep.path}`,
          label: ep.label,
          status: (res.ok ? "healthy" : "error") as
            | "healthy"
            | "error",
          httpCode: res.status,
          latencyMs,
        };
      }),
    );
    for (const [i, r] of indResults.entries()) {
      schedulerItems.push(
        r.status === "fulfilled"
          ? r.value
          : {
              path: `${SCHEDULER_PREFIX}${independent[i]!.path}`,
              label: independent[i]!.label,
              status: "error",
              httpCode: null,
              latencyMs: null,
            },
      );
    }

    const dependent = SCHEDULER_ENDPOINTS.filter(
      (e) => e.dependsOn,
    );
    const depResults = await Promise.allSettled(
      dependent.map(async (ep) => {
        const hash = unwrapFirstHash(
          listData[ep.dependsOn!],
          ep.dependsOn as "nodes" | "vms",
        );
        if (!hash) {
          return {
            path: `${SCHEDULER_PREFIX}${ep.path}`,
            label: ep.label,
            status: "skipped" as const,
            httpCode: null,
            latencyMs: null,
          };
        }
        const resolvedPath = ep.path.replace(":hash", hash);
        const url = `${schedulerBase}${SCHEDULER_PREFIX}${resolvedPath}`;
        const { res, latencyMs } = await timedFetch(url);
        return {
          path: `${SCHEDULER_PREFIX}${ep.path}`,
          label: ep.label,
          status: (res.ok ? "healthy" : "error") as
            | "healthy"
            | "error",
          httpCode: res.status,
          latencyMs,
        };
      }),
    );
    for (const [i, r] of depResults.entries()) {
      schedulerItems.push(
        r.status === "fulfilled"
          ? r.value
          : {
              path: `${SCHEDULER_PREFIX}${dependent[i]!.path}`,
              label: dependent[i]!.label,
              status: "error",
              httpCode: null,
              latencyMs: null,
            },
      );
    }

    setSchedulerResults([healthResult, ...schedulerItems]);

    // --- Aleph API checks ---
    const alephSettled = await Promise.allSettled(
      ALEPH_ENDPOINTS.map((ep) =>
        probeEndpoint(
          `${alephBase}${ep.probePath}`,
          ep.path,
          ep.label,
        ),
      ),
    );
    setAlephResults(
      alephSettled.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : {
              path: ALEPH_ENDPOINTS[i]!.path,
              label: ALEPH_ENDPOINTS[i]!.label,
              status: "error" as const,
              httpCode: null,
              latencyMs: null,
            },
      ),
    );

    await minDelay;
    setChecking(false);
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  // Auto-refresh every 60s
  useEffect(() => {
    intervalRef.current = setInterval(runChecks, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runChecks]);

  const schedulerBase = getSchedulerBaseUrl();
  const alephBase = getAlephBaseUrl();

  const allResults = [...schedulerResults, ...alephResults];
  const totalHealthy =
    allResults.filter((r) => r.status === "healthy").length +
    (wsHealthy ? 1 : 0);
  const totalEndpoints = allResults.length + 1;
  const allResolved =
    allResults.every((r) => r.status !== "pending") && !wsPending;
  const allHealthy =
    allResolved && totalHealthy === totalEndpoints;
  const degradedCount = totalEndpoints - totalHealthy;

  const resolvedLatencies = allResults
    .filter((r) => r.latencyMs !== null)
    .map((r) => r.latencyMs!);
  const avgLatencyMs =
    resolvedLatencies.length > 0
      ? Math.round(
          resolvedLatencies.reduce((a, b) => a + b, 0) /
            resolvedLatencies.length,
        )
      : null;

  const statusBadgeVariant = !allResolved
    ? ("default" as const)
    : allHealthy
      ? ("success" as const)
      : ("error" as const);
  const statusText = !allResolved
    ? "Checking\u2026"
    : allHealthy
      ? "All Systems Operational"
      : `${degradedCount} endpoint${degradedCount === 1 ? "" : "s"} degraded`;

  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl">Network Health</h1>
          <Badge variant={statusBadgeVariant} fill="outline" size="sm">
            {statusText}
          </Badge>
        </div>
        <p className="mt-2 text-base text-muted-foreground">
          Real-time status of Aleph Cloud infrastructure
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="stat-card border border-foreground/[0.06] bg-foreground/[0.03] p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Endpoints Healthy
          </p>
          <p
            className="mt-3 font-heading font-mono text-4xl font-extrabold tabular-nums tracking-tight"
            style={{ color: allHealthy ? "var(--color-success-500)" : "var(--color-error-400)" }}
          >
            {totalHealthy}/{totalEndpoints}
          </p>
        </div>
        <div className="stat-card border border-foreground/[0.06] bg-foreground/[0.03] p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Avg Latency
          </p>
          <p className="mt-3 font-heading font-mono text-4xl font-extrabold tabular-nums tracking-tight">
            {avgLatencyMs !== null ? `${avgLatencyMs}` : "\u2026"}
            <span className="ml-1 text-lg font-normal text-muted-foreground/60">ms</span>
          </p>
        </div>
        <div className="stat-card flex items-center justify-between border border-foreground/[0.06] bg-foreground/[0.03] p-6 sm:col-span-1 max-sm:col-span-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Last Checked
            </p>
            <p className="mt-3 font-mono text-sm tabular-nums text-muted-foreground">
              {lastChecked ? lastChecked.toLocaleTimeString() : "\u2026"}
            </p>
          </div>
          <Button
            variant="text"
            size="xs"
            className="shrink-0"
            iconLeft={
              <Pulse className={checking ? "animate-pulse" : ""} />
            }
            onClick={runChecks}
            disabled={checking}
          >
            {checking ? "Checking" : "Recheck"}
          </Button>
        </div>
      </div>

      {/* API sections — side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <StatusSection
          title="Scheduler API"
          baseUrl={schedulerBase}
          results={schedulerResults}
          extraRowAfterFirst={<WebSocketRow />}
          extraHealthy={wsHealthy ? 1 : 0}
          extraTotal={1}
        />
        <StatusSection
          title="Aleph API"
          baseUrl={alephBase}
          results={alephResults}
        />
      </div>
    </div>
  );
}
