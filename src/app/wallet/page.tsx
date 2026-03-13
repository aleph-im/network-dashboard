"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { Button } from "@aleph-front/ds/button";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import {
  useWalletNodes,
  useWalletVMs,
  useWalletActivity,
  useAuthorizations,
} from "@/hooks/use-wallet";
import type { WalletVM, ActivityItem } from "@/hooks/use-wallet";
import type { Node, AuthorizationResponse, AuthorizationScope } from "@/api/types";
import { TablePagination } from "@/components/table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import {
  relativeTime,
  relativeTimeFromUnix,
  truncateHash,
  explorerWalletUrl,
} from "@/lib/format";
import {
  nodeStatusToDot,
  NODE_STATUS_VARIANT,
  VM_STATUS_VARIANT,
  MESSAGE_TYPE_VARIANT,
} from "@/lib/status-map";

// --- Summary Stats ---

function SummaryStats({
  nodeCount,
  vmCount,
  grantedCount,
  receivedCount,
}: {
  nodeCount: number;
  vmCount: number;
  grantedCount: number;
  receivedCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {[
        { label: "Nodes", value: nodeCount },
        { label: "VMs", value: vmCount },
        { label: "Granted", value: grantedCount },
        { label: "Received", value: receivedCount },
      ].map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3"
        >
          <p className="text-2xl font-bold tabular-nums">
            {stat.value}
          </p>
          <p className="text-xs text-muted-foreground">
            {stat.label}
          </p>
        </div>
      ))}
    </div>
  );
}

// --- Nodes Section ---

function NodesSection({ nodes }: { nodes: Node[] }) {
  if (nodes.length === 0) return null;
  return (
    <Card padding="md">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Nodes ({nodes.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Hash</th>
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium text-right">
                VMs
              </th>
              <th className="pb-2 font-medium text-right">
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {nodes.map((node) => (
              <tr key={node.hash} className="group">
                <td className="py-2 pr-4">
                  <Link
                    href={`/nodes?view=${node.hash}`}
                    className="font-mono text-xs text-primary-300 hover:underline"
                  >
                    {truncateHash(node.hash)}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-xs">
                  {node.name ?? "—"}
                </td>
                <td className="py-2 pr-4">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot
                      status={nodeStatusToDot(node.status)}
                      size="sm"
                    />
                    <Badge fill="outline"
                      variant={NODE_STATUS_VARIANT[node.status]}
                      size="sm"
                    >
                      {node.status}
                    </Badge>
                  </span>
                </td>
                <td className="py-2 pr-4 text-right text-xs tabular-nums">
                  {node.vmCount}
                </td>
                <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {relativeTime(node.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// --- VMs Section ---

function VMsSection({ vms }: { vms: WalletVM[] }) {
  if (vms.length === 0) return null;
  return (
    <Card padding="md">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Virtual Machines ({vms.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Hash</th>
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 font-medium text-right">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {vms.map((vm) => (
              <tr key={vm.hash}>
                <td className="py-2 pr-4">
                  {vm.schedulerStatus ? (
                    <Link
                      href={`/vms?view=${vm.hash}`}
                      className="font-mono text-xs text-primary-300 hover:underline"
                    >
                      {truncateHash(vm.hash)}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {truncateHash(vm.hash)}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-xs">
                  {vm.name ?? "—"}
                </td>
                <td className="py-2 pr-4">
                  <Badge fill="outline" variant="default" size="sm">
                    {vm.type}
                  </Badge>
                </td>
                <td className="py-2 pr-4">
                  {vm.schedulerStatus ? (
                    <Badge fill="outline"
                      variant={
                        VM_STATUS_VARIANT[vm.schedulerStatus]
                      }
                      size="sm"
                    >
                      {vm.schedulerStatus}
                    </Badge>
                  ) : (
                    <Badge fill="outline" variant="default" size="sm">
                      not tracked
                    </Badge>
                  )}
                </td>
                <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {relativeTimeFromUnix(vm.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// --- Activity Section ---

function ActivitySection({
  items,
  isLoading,
  onRefresh,
  dataUpdatedAt,
}: {
  items: ActivityItem[];
  isLoading: boolean;
  onRefresh: () => void;
  dataUpdatedAt: number;
}) {
  const {
    page,
    pageSize,
    totalPages,
    totalItems,
    startItem,
    endItem,
    pageItems,
    setPage,
    setPageSize,
  } = usePagination(items, 25);

  return (
    <Card padding="md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Activity ({items.length})
        </h3>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="xs"
            onClick={onRefresh}
            disabled={isLoading}
          >
            {isLoading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {items.length === 0 && !isLoading ? (
        <p className="text-sm text-muted-foreground">
          No activity found.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Time</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Hash</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {pageItems.map((item) => (
                  <tr key={`${item.hash}-${item.time}`}>
                    <td className="whitespace-nowrap py-2 pr-4 text-xs text-muted-foreground tabular-nums">
                      {relativeTimeFromUnix(item.time)}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge fill="outline"
                        variant={
                          MESSAGE_TYPE_VARIANT[item.type] ??
                          "default"
                        }
                        size="sm"
                      >
                        {item.type}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {item.name ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <a
                        href={item.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs text-primary-300 hover:underline"
                      >
                        {truncateHash(item.hash)}
                        <ArrowSquareOut size={12} />
                      </a>
                    </td>
                    <td className="py-2">
                      {item.schedulerStatus ? (
                        <Badge fill="outline"
                          variant={
                            VM_STATUS_VARIANT[
                              item.schedulerStatus
                            ]
                          }
                          size="sm"
                        >
                          {item.schedulerStatus}
                        </Badge>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            startItem={startItem}
            endItem={endItem}
            totalItems={totalItems}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}
    </Card>
  );
}

// --- Permissions Section ---

function ScopeTags({ scope }: { scope: AuthorizationScope }) {
  const tags: string[] = [];
  if (scope.types) {
    for (const t of scope.types) tags.push(`type:${t}`);
  }
  if (scope.channels) {
    for (const c of scope.channels) tags.push(`ch:${c}`);
  }
  if (scope.post_types) {
    for (const p of scope.post_types) tags.push(`post:${p}`);
  }
  if (scope.aggregate_keys) {
    for (const k of scope.aggregate_keys) tags.push(`key:${k}`);
  }
  if (tags.length === 0) tags.push("full access");

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Badge fill="outline" key={tag} variant="default" size="sm">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

function PermissionsCard({
  title,
  data,
}: {
  title: string;
  data: AuthorizationResponse | undefined;
}) {
  const entries = data
    ? Object.entries(data.authorizations)
    : [];

  return (
    <Card padding="md" className="flex-1">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title} ({entries.length})
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-3">
          {entries.map(([addr, scopes]) => (
            <li key={addr}>
              <div className="flex items-center gap-2">
                <Link
                  href={`/wallet?address=${addr}`}
                  className="font-mono text-xs text-primary-300 hover:underline"
                >
                  {truncateHash(addr, 12)}
                </Link>
                <a
                  href={explorerWalletUrl(addr)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground/60 hover:text-muted-foreground"
                >
                  <ArrowSquareOut size={12} />
                </a>
                {scopes[0]?.alias && (
                  <span className="text-xs text-muted-foreground">
                    ({scopes[0].alias})
                  </span>
                )}
              </div>
              <div className="mt-2">
                {scopes.map((scope, i) => (
                  <ScopeTags key={i} scope={scope} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- Page Content ---

function WalletContent() {
  const searchParams = useSearchParams();
  const address = searchParams.get("address") ?? "";

  const { nodes, isLoading: nodesLoading } =
    useWalletNodes(address);
  const { walletVMs, isLoading: vmsLoading } =
    useWalletVMs(address);
  const {
    items: activityItems,
    isLoading: activityLoading,
    refresh: refreshActivity,
    dataUpdatedAt,
  } = useWalletActivity(address);
  const { data: granted } = useAuthorizations(
    address,
    "granted",
  );
  const { data: received } = useAuthorizations(
    address,
    "received",
  );

  if (!address) {
    return (
      <div className="space-y-4">
        <h1 className="text-4xl">Wallet</h1>
        <Card padding="md">
          <p className="text-sm text-muted-foreground">
            No wallet address provided. Use{" "}
            <code className="rounded bg-white/[0.06] px-1">
              ?address=0x...
            </code>{" "}
            to view a wallet.
          </p>
        </Card>
      </div>
    );
  }

  const grantedCount = granted
    ? Object.keys(granted.authorizations).length
    : 0;
  const receivedCount = received
    ? Object.keys(received.authorizations).length
    : 0;

  const isLoading =
    nodesLoading || vmsLoading || activityLoading;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl">Wallet</h1>
        <div className="mt-3 flex items-center gap-3">
          <CopyableText
            text={address}
            startChars={8}
            endChars={8}
            size="sm"
            href={explorerWalletUrl(address)}
            className="text-primary-400"
          />
        </div>
      </div>

      {/* Summary */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <SummaryStats
          nodeCount={nodes.length}
          vmCount={walletVMs.length}
          grantedCount={grantedCount}
          receivedCount={receivedCount}
        />
      )}

      {/* Permissions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PermissionsCard
          title="Permissions Granted"
          data={granted}
        />
        <PermissionsCard
          title="Permissions Received"
          data={received}
        />
      </div>

      {/* Nodes */}
      <NodesSection nodes={nodes} />

      {/* VMs */}
      <VMsSection vms={walletVMs} />

      {/* Activity */}
      <ActivitySection
        items={activityItems}
        isLoading={activityLoading}
        onRefresh={refreshActivity}
        dataUpdatedAt={dataUpdatedAt}
      />
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense>
      <WalletContent />
    </Suspense>
  );
}
