"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pulse } from "@phosphor-icons/react";
import { Button } from "@aleph-front/ds/button";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { useOverviewStats } from "@/hooks/use-overview-stats";
import { SlotRollNumber } from "@/components/slot-roll-number";

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

// --- Hero banner ---

function HeroBanner({
  allResolved,
  allHealthy,
  degradedCount,
}: {
  allResolved: boolean;
  allHealthy: boolean;
  degradedCount: number;
}) {
  const isHealthy = allResolved && allHealthy;
  const statusColor = isHealthy
    ? "var(--color-success-500)"
    : "var(--color-error-500)";
  const statusText = !allResolved
    ? "Checking endpoints\u2026"
    : isHealthy
      ? "All Systems Operational"
      : `${degradedCount} endpoint${degradedCount === 1 ? "" : "s"} degraded`;

  return (
    <div className="mb-8 text-center">
      <div className="relative inline-block">
        <div
          className="absolute -top-8 left-1/2 h-20 w-60 -translate-x-1/2 rounded-full"
          style={{
            background: `radial-gradient(ellipse, ${isHealthy ? "rgba(74,222,128,0.04)" : "rgba(248,113,113,0.04)"}, transparent 70%)`,
          }}
        />
        <div
          className="relative inline-flex items-center gap-2.5 rounded-full border px-5 py-2"
          style={{
            backgroundColor: isHealthy
              ? "rgba(74,222,128,0.06)"
              : "rgba(248,113,113,0.06)",
            borderColor: isHealthy
              ? "rgba(74,222,128,0.12)"
              : "rgba(248,113,113,0.12)",
          }}
        >
          <span
            className="size-2 rounded-full"
            style={{
              backgroundColor: allResolved
                ? statusColor
                : "var(--color-neutral-400)",
              boxShadow: allResolved
                ? `0 0 8px ${isHealthy ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`
                : "none",
            }}
          />
          <span
            className="text-sm font-semibold"
            style={{
              color: allResolved
                ? statusColor
                : "var(--color-muted-foreground)",
            }}
          >
            {statusText}
          </span>
        </div>
      </div>
      <h1 className="mt-6 text-4xl">Network Health</h1>
      <p className="mt-2 text-base text-muted-foreground">
        Real-time status of Aleph Cloud infrastructure
      </p>
    </div>
  );
}

// --- Quick stats bar ---

function QuickStatsBar({
  endpointsHealthy,
  endpointsTotal,
  avgLatencyMs,
  totalNodes,
  totalVMs,
  isStatsLoading,
}: {
  endpointsHealthy: number;
  endpointsTotal: number;
  avgLatencyMs: number | null;
  totalNodes: number | undefined;
  totalVMs: number | undefined;
  isStatsLoading: boolean;
}) {
  return (
    <div className="mb-8 flex flex-wrap justify-center gap-x-12 gap-y-4 border-y border-foreground/[0.04] py-5">
      <div className="text-center">
        <p
          className="font-heading font-mono text-2xl font-extrabold tabular-nums"
          style={{ color: "var(--color-success-500)" }}
        >
          <SlotRollNumber value={endpointsHealthy} />/{endpointsTotal}
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Endpoints
        </p>
      </div>
      {avgLatencyMs !== null && (
        <div className="text-center">
          <p className="font-heading font-mono text-2xl font-extrabold tabular-nums">
            <SlotRollNumber value={avgLatencyMs} />
            <span className="ml-0.5 text-sm font-normal text-muted-foreground/60">
              ms
            </span>
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Avg Latency
          </p>
        </div>
      )}
      {!isStatsLoading && totalNodes !== undefined && (
        <div className="text-center">
          <p className="font-heading font-mono text-2xl font-extrabold tabular-nums">
            <SlotRollNumber value={totalNodes} formatted />
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Active Nodes
          </p>
        </div>
      )}
      {!isStatsLoading && totalVMs !== undefined && (
        <div className="text-center">
          <p className="font-heading font-mono text-2xl font-extrabold tabular-nums">
            <SlotRollNumber value={totalVMs} formatted />
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Running VMs
          </p>
        </div>
      )}
    </div>
  );
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
}: {
  title: string;
  baseUrl: string;
  results: EndpointResult[];
}) {
  const healthyCount = results.filter(
    (r) => r.status === "healthy",
  ).length;
  const totalCount = results.length;

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
        {results.map((r, i) => (
          <EndpointRow
            key={r.path}
            result={r}
            baseUrl={baseUrl}
            index={i}
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
  const { data: stats, isLoading: statsLoading } = useOverviewStats();

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
  const totalHealthy = allResults.filter(
    (r) => r.status === "healthy",
  ).length;
  const totalEndpoints = allResults.length;
  const allResolved = allResults.every(
    (r) => r.status !== "pending",
  );
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

  return (
    <div className="mx-auto max-w-2xl p-6">
      <HeroBanner
        allResolved={allResolved}
        allHealthy={allHealthy}
        degradedCount={degradedCount}
      />

      <QuickStatsBar
        endpointsHealthy={totalHealthy}
        endpointsTotal={totalEndpoints}
        avgLatencyMs={avgLatencyMs}
        totalNodes={stats?.totalNodes}
        totalVMs={stats?.totalVMs}
        isStatsLoading={statsLoading}
      />

      <div className="space-y-6">
        <StatusSection
          title="Scheduler API"
          baseUrl={schedulerBase}
          results={schedulerResults}
        />
        <StatusSection
          title="Aleph API"
          baseUrl={alephBase}
          results={alephResults}
        />
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-center gap-3 border-t border-foreground/[0.04] pt-4">
        <span className="text-xs text-muted-foreground/60">
          Auto-refreshes every 60s
        </span>
        {lastChecked && (
          <>
            <span className="text-muted-foreground/30">&middot;</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground/60">
              {lastChecked.toLocaleTimeString()}
            </span>
          </>
        )}
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
  );
}
