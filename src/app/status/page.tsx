"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusDot } from "@aleph-front/ds/status-dot";

type EndpointStatus = {
  path: string;
  label: string;
  status: "pending" | "healthy" | "error" | "skipped";
  httpCode: number | null;
};

type EndpointDef = {
  path: string;
  label: string;
  dependsOn?: string;
};

const API_PREFIX = "/api/v1";

const ENDPOINTS: EndpointDef[] = [
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

type CheckResult = {
  path: string;
  label: string;
  status: "healthy" | "error" | "skipped";
  httpCode: number | null;
};

async function checkEndpoint(
  baseUrl: string,
  ep: EndpointDef,
  resolvedPath?: string,
): Promise<CheckResult> {
  const path = resolvedPath ?? ep.path;
  const url = `${baseUrl}${API_PREFIX}${path}`;
  const res = await fetch(url);
  return {
    path: `${API_PREFIX}${ep.path}`,
    label: ep.label,
    status: res.ok ? "healthy" : "error",
    httpCode: res.status,
  };
}

export default function StatusPage() {
  const [results, setResults] = useState<EndpointStatus[]>([
    { path: "/health", label: "Health", status: "pending", httpCode: null },
    ...ENDPOINTS.map((e) => ({
      path: `${API_PREFIX}${e.path}`,
      label: e.label,
      status: "pending" as const,
      httpCode: null,
    })),
  ]);
  const [checking, setChecking] = useState(false);

  const runChecks = useCallback(async () => {
    setChecking(true);
    const baseUrl = getBaseUrl();
    const newResults: EndpointStatus[] = [];
    const listData: Record<string, unknown> = {};

    let healthResult: EndpointStatus;
    try {
      const res = await fetch(`${baseUrl}/health`);
      healthResult = {
        path: "/health",
        label: "Health",
        status: res.ok ? "healthy" : "error",
        httpCode: res.status,
      };
    } catch {
      healthResult = {
        path: "/health",
        label: "Health",
        status: "error",
        httpCode: null,
      };
    }

    const independent = ENDPOINTS.filter((e) => !e.dependsOn);
    const indResults = await Promise.allSettled(
      independent.map(async (ep) => {
        const url = `${baseUrl}${API_PREFIX}${ep.path}`;
        const res = await fetch(url);
        const data = res.ok ? await res.json() : null;
        if (ep.path === "/nodes") listData["nodes"] = data;
        if (ep.path === "/vms") listData["vms"] = data;
        return {
          path: `${API_PREFIX}${ep.path}`,
          label: ep.label,
          status: (res.ok ? "healthy" : "error") as
            | "healthy"
            | "error",
          httpCode: res.status,
        };
      }),
    );
    for (const [i, r] of indResults.entries()) {
      newResults.push(
        r.status === "fulfilled"
          ? r.value
          : {
              path: `${API_PREFIX}${independent[i]!.path}`,
              label: independent[i]!.label,
              status: "error",
              httpCode: null,
            },
      );
    }

    const dependent = ENDPOINTS.filter((e) => e.dependsOn);
    const depResults = await Promise.allSettled(
      dependent.map(async (ep) => {
        const hash = unwrapFirstHash(
          listData[ep.dependsOn!],
          ep.dependsOn as "nodes" | "vms",
        );
        if (!hash) {
          return {
            path: `${API_PREFIX}${ep.path}`,
            label: ep.label,
            status: "skipped" as const,
            httpCode: null,
          };
        }
        const resolvedPath = ep.path.replace(":hash", hash);
        return checkEndpoint(baseUrl, ep, resolvedPath);
      }),
    );
    for (const [i, r] of depResults.entries()) {
      newResults.push(
        r.status === "fulfilled"
          ? r.value
          : {
              path: `${API_PREFIX}${dependent[i]!.path}`,
              label: dependent[i]!.label,
              status: "error",
              httpCode: null,
            },
      );
    }

    setResults([healthResult, ...newResults]);
    setChecking(false);
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const baseUrl = getBaseUrl();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Checking endpoints at{" "}
          <code className="text-xs">{baseUrl}</code>
        </p>
        <button
          type="button"
          onClick={runChecks}
          disabled={checking}
          className="rounded-lg bg-primary-600/10 px-3 py-1.5 text-sm font-medium text-primary-400 transition-colors hover:bg-primary-600/20 disabled:opacity-50"
        >
          {checking ? "Checking\u2026" : "Recheck"}
        </button>
      </div>

      <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface">
        {results.map((ep) => (
          <li
            key={ep.path}
            className="flex items-center gap-3 px-4 py-3"
          >
            <StatusDot
              status={
                ep.status === "pending"
                  ? "unknown"
                  : ep.status === "skipped"
                    ? "offline"
                    : ep.status
              }
            />
            <div className="min-w-0 flex-1">
              <a
                href={`${baseUrl}${ep.path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-foreground transition-colors hover:text-primary-400"
              >
                {ep.path}
              </a>
              <p className="text-xs text-muted-foreground">
                {ep.label}
              </p>
            </div>
            <span
              className={`font-mono text-xs ${
                ep.status === "healthy"
                  ? "text-success-400"
                  : ep.status === "error"
                    ? "text-error-400"
                    : "text-muted-foreground"
              }`}
            >
              {ep.status === "skipped"
                ? "no data"
                : ep.status === "pending"
                  ? "\u2026"
                  : ep.httpCode}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
