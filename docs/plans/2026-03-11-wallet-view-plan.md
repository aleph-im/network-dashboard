# Wallet View Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/wallet?address=0x...` page showing owned nodes, created VMs (with scheduler status), activity timeline, and authorization permissions for any wallet address.

**Architecture:** New page at `src/app/wallet/page.tsx` with four data sections. Nodes come from the existing `useNodes()` cache (client-side filter). VMs and activity come from api2 `messages.json` endpoint, cross-referenced against `useVMs()` for scheduler status. Permissions come from two new api2 authorization endpoints. All wallet addresses across the dashboard become clickable links to this page.

**Tech Stack:** Next.js App Router, React Query, TanStack React Query, `@aleph-front/ds` components, Tailwind CSS 4

**Spec:** `docs/plans/2026-03-11-wallet-view-design.md`

---

## Chunk 1: API Layer + Types

### Task 1: Add authorization and wallet message types

**Files:**
- Modify: `src/api/types.ts`

- [ ] **Step 1: Add new types to `types.ts`**

Add after the `AlephMessageInfo` type at the end of the file:

```typescript
// --- Aleph Message types (extended for wallet view) ---

export type AlephMessageType =
  | "INSTANCE"
  | "PROGRAM"
  | "STORE"
  | "AGGREGATE"
  | "POST"
  | "FORGET";

// --- Authorization API ---

export type AuthorizationScope = {
  alias?: string;
  types?: string[];
  channels?: string[];
  post_types?: string[];
  aggregate_keys?: string[];
};

export type AuthorizationResponse = {
  authorizations: Record<string, AuthorizationScope[]>;
  pagination_page: number;
  pagination_total: number;
  address: string;
};
```

Also update the existing `AlephMessage` type to include all fields needed for the activity timeline:

```typescript
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
```

The existing `AlephMessage` already has the right shape — no changes needed there. Only add the authorization types and `AlephMessageType`.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (new types are additive only)

- [ ] **Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(wallet): add authorization and message type definitions"
```

### Task 2: Add API client functions for wallet data

**Files:**
- Modify: `src/api/client.ts`

- [ ] **Step 1: Add `getWalletMessages()` function**

Add after the existing `getMessagesByHashes` function:

```typescript
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

  // Paginate through all results
  // eslint-disable-next-line no-constant-condition
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
```

- [ ] **Step 2: Add `getAuthorizations()` function**

Add after `getWalletMessages`:

```typescript
import type {
  // ... add to existing imports:
  AuthorizationResponse,
} from "@/api/types";

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
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/api/client.ts
git commit -m "feat(wallet): add getWalletMessages and getAuthorizations API functions"
```

### Task 3: Add React Query hooks for wallet data

**Files:**
- Create: `src/hooks/use-wallet.ts`

- [ ] **Step 1: Create the hooks file**

```typescript
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getWalletMessages,
  getAuthorizations,
} from "@/api/client";
import { useNodes } from "@/hooks/use-nodes";
import { useVMs } from "@/hooks/use-vms";
import type {
  AlephMessage,
  AuthorizationResponse,
  Node,
  VM,
} from "@/api/types";

export type WalletVM = {
  hash: string;
  name: string | null;
  type: string;
  chain: string;
  createdAt: number;
  schedulerStatus: VM["status"] | null;
  allocatedNode: string | null;
  updatedAt: string | null;
};

export type ActivityItem = {
  hash: string;
  type: string;
  name: string | null;
  chain: string;
  sender: string;
  time: number;
  schedulerStatus: VM["status"] | null;
  explorerUrl: string;
};

export function useWalletNodes(address: string) {
  const { data: allNodes, isLoading } = useNodes();

  const nodes = useMemo(() => {
    if (!allNodes || !address) return [];
    return allNodes.filter(
      (n) =>
        n.owner?.toLowerCase() === address.toLowerCase(),
    );
  }, [allNodes, address]);

  return { nodes, isLoading };
}

export function useWalletVMs(address: string) {
  const { data: messages, isLoading: messagesLoading } =
    useQuery({
      queryKey: ["wallet-vms", address],
      queryFn: () =>
        getWalletMessages(address, [
          "INSTANCE",
          "PROGRAM",
        ]),
      enabled: address.length > 0,
      staleTime: 5 * 60_000,
      refetchInterval: false,
    });

  const { data: allVMs, isLoading: vmsLoading } = useVMs();

  const walletVMs = useMemo(() => {
    if (!messages) return [];
    const vmMap = new Map(
      (allVMs ?? []).map((v) => [v.hash, v]),
    );
    return messages.map(
      (msg): WalletVM => {
        const scheduled = vmMap.get(msg.item_hash);
        return {
          hash: msg.item_hash,
          name: msg.content?.metadata?.name ?? null,
          type: msg.type,
          chain: msg.chain,
          createdAt: msg.time,
          schedulerStatus: scheduled?.status ?? null,
          allocatedNode: scheduled?.allocatedNode ?? null,
          updatedAt: scheduled?.updatedAt ?? null,
        };
      },
    );
  }, [messages, allVMs]);

  return {
    walletVMs,
    isLoading: messagesLoading || vmsLoading,
  };
}

export function useWalletActivity(address: string) {
  const queryClient = useQueryClient();

  const {
    data: messages,
    isLoading,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["wallet-activity", address],
    queryFn: () => getWalletMessages(address),
    enabled: address.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });

  const { data: allVMs } = useVMs();

  const items = useMemo(() => {
    if (!messages) return [];
    const vmMap = new Map(
      (allVMs ?? []).map((v) => [v.hash, v]),
    );
    return messages
      .map(
        (msg): ActivityItem => {
          const isCompute =
            msg.type === "INSTANCE" ||
            msg.type === "PROGRAM";
          const scheduled = isCompute
            ? vmMap.get(msg.item_hash)
            : null;
          return {
            hash: msg.item_hash,
            type: msg.type,
            name: msg.content?.metadata?.name ?? null,
            chain: msg.chain,
            sender: msg.sender,
            time: msg.time,
            schedulerStatus: scheduled?.status ?? null,
            explorerUrl: `https://explorer.aleph.cloud/address/${msg.chain}/${msg.sender}/message/${msg.type}/${msg.item_hash}`,
          };
        },
      )
      .sort((a, b) => b.time - a.time);
  }, [messages, allVMs]);

  function refresh() {
    queryClient.invalidateQueries({
      queryKey: ["wallet-activity", address],
    });
  }

  return { items, isLoading, refresh, dataUpdatedAt };
}

export function useAuthorizations(
  address: string,
  direction: "granted" | "received",
) {
  return useQuery({
    queryKey: ["authorizations", direction, address],
    queryFn: () => getAuthorizations(address, direction),
    enabled: address.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-wallet.ts
git commit -m "feat(wallet): add React Query hooks for wallet data"
```

---

## Chunk 2: Wallet Page Components

### Task 4: Add message type badge variant map

**Files:**
- Modify: `src/lib/status-map.ts`

- [ ] **Step 1: Add message type badge variant map**

Add at the end of `status-map.ts`:

```typescript
export const MESSAGE_TYPE_VARIANT: Record<string, BadgeVariant> = {
  INSTANCE: "info",
  PROGRAM: "success",
  STORE: "default",
  AGGREGATE: "warning",
  POST: "default",
  FORGET: "error",
};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/status-map.ts
git commit -m "feat(wallet): add message type badge variant map"
```

### Task 5: Add Explorer URL helper to format.ts

**Files:**
- Modify: `src/lib/format.ts`

- [ ] **Step 1: Add `explorerWalletUrl` helper**

Add at the end of `format.ts`:

```typescript
export function explorerWalletUrl(address: string): string {
  return `https://explorer.aleph.cloud/address/ETH/${address}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/format.ts
git commit -m "feat(wallet): add Explorer URL helper"
```

### Task 6: Create the wallet page

**Files:**
- Create: `src/app/wallet/page.tsx`

- [ ] **Step 1: Create the page component**

The page reads `?address=` from search params, renders a header with the wallet address (copyable, with Explorer link), summary stats, and four sections: Nodes, VMs, Activity, Permissions. Each section is a separate component rendered inline to keep the page file manageable.

```typescript
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
import type { Node, AuthorizationScope } from "@/api/types";
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
                    <Badge
                      variant={NODE_STATUS_VARIANT[node.status]}
                      size="sm"
                      className="capitalize"
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
                  <Badge variant="default" size="sm">
                    {vm.type}
                  </Badge>
                </td>
                <td className="py-2 pr-4">
                  {vm.schedulerStatus ? (
                    <Badge
                      variant={
                        VM_STATUS_VARIANT[vm.schedulerStatus]
                      }
                      size="sm"
                      className="capitalize"
                    >
                      {vm.schedulerStatus}
                    </Badge>
                  ) : (
                    <Badge variant="default" size="sm">
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
                    <td className="py-2 pr-4 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {relativeTimeFromUnix(item.time)}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge
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
                        <Badge
                          variant={
                            VM_STATUS_VARIANT[
                              item.schedulerStatus
                            ]
                          }
                          size="sm"
                          className="capitalize"
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
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          {tag}
        </span>
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
              <div className="mt-1">
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
            startChars={10}
            endChars={6}
            size="sm"
            href={explorerWalletUrl(address)}
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
```

Note: This is a large file (~400 lines). The inline section components (SummaryStats, NodesSection, VMsSection, ActivitySection, PermissionsCard) are tightly coupled to this page and don't need separate files — they're display-only with no reuse outside the wallet page.

- [ ] **Step 2: Verify typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS — the page should be statically exported as `wallet/index.html`

- [ ] **Step 3: Commit**

```bash
git add src/app/wallet/page.tsx
git commit -m "feat(wallet): add wallet view page with nodes, VMs, activity, and permissions"
```

---

## Chunk 3: Entry Points + Navigation

### Task 7: Make wallet addresses clickable in node detail view

**Files:**
- Modify: `src/components/node-detail-view.tsx`

- [ ] **Step 1: Make owner field a Link**

In `node-detail-view.tsx`, find the owner MetaItem (around line 136-141) and replace:

```typescript
// Before:
{node.owner && (
  <MetaItem label="Owner">
    <span className="font-mono text-xs">
      {truncateHash(node.owner, 16)}
    </span>
  </MetaItem>
)}

// After:
{node.owner && (
  <MetaItem label="Owner">
    <Link
      href={`/wallet?address=${node.owner}`}
      className="font-mono text-xs text-primary-300 hover:underline"
    >
      {truncateHash(node.owner, 16)}
    </Link>
  </MetaItem>
)}
```

No new imports needed — `Link` is already imported.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/node-detail-view.tsx
git commit -m "feat(wallet): make node owner clickable link to wallet view"
```

### Task 8: Make wallet addresses clickable in node detail panel

**Files:**
- Modify: `src/components/node-detail-panel.tsx`

- [ ] **Step 1: Add owner link to panel**

The panel doesn't currently show the owner field. We need to add it. Find the "Updated" `<div>` block (around line 103-106) and add the owner row before it:

```typescript
// Add before the Updated div:
{node.owner && (
  <div className="flex justify-between">
    <dt className="text-muted-foreground">Owner</dt>
    <dd>
      <Link
        href={`/wallet?address=${node.owner}`}
        className="font-mono text-xs text-primary-300 hover:underline"
      >
        {truncateHash(node.owner, 12)}
      </Link>
    </dd>
  </div>
)}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/node-detail-panel.tsx
git commit -m "feat(wallet): add clickable owner link to node detail panel"
```

### Task 9: Add sidebar nav entry for wallet page

**Files:**
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Decide on sidebar placement**

The wallet page is not a primary navigation destination — users arrive via clicking wallet addresses. It doesn't need a sidebar entry. It follows the same pattern as the detail views (`?view=hash`) which also aren't in the sidebar. The `isActive` function already handles `/wallet` correctly (it won't match any existing nav item, so no item is highlighted — which is fine for a utility page like this).

**No changes needed.** Skip this task.

- [ ] **Step 2: Commit**

No commit needed — this task is intentionally skipped.

---

## Chunk 4: Docs Update

### Task 10: Update docs

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/BACKLOG.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update ARCHITECTURE.md**

Add to Project Structure:
```
│   ├── wallet/
│   │   └── page.tsx        # Wallet view (owned nodes, VMs, activity, permissions)
```

Add new pattern section after "Issues Page — Derived Data Views":

```markdown
### Wallet View — Cross-API Entity Page

**Context:** Ops needs to investigate a specific wallet's resources and activity across the scheduler and Aleph network.
**Approach:** `/wallet?address=0x...` page combines data from three sources: scheduler API (nodes filtered by owner, VMs cross-referenced by hash), api2 messages endpoint (VM ownership via sender, activity timeline), and api2 authorization endpoints (granted/received permissions). `useWalletNodes()` filters existing `useNodes()` cache — no extra API call. `useWalletVMs()` fetches message hashes from api2 then cross-references against `useVMs()` for scheduler status. Activity section has a manual refresh button (invalidates React Query cache) for live troubleshooting. All wallet addresses in the dashboard (node owner, permission addresses) are clickable `<Link>`s to the wallet view, enabling wallet-to-wallet navigation.
**Key files:** `src/app/wallet/page.tsx`, `src/hooks/use-wallet.ts`, `src/api/client.ts`
**Notes:** VMs not found in the scheduler show "not tracked" status. Activity items link to Explorer for deep detail. Permissions show inline scope tags (types, channels, post_types, aggregate_keys). No sidebar entry — wallet view is a utility page reached via address links.
```

- [ ] **Step 2: Update DECISIONS.md**

Log the key decisions made during this feature:
- Using api2 `?addresses=` filter vs fetching all VMs and filtering client-side
- No sidebar entry for wallet page (utility page pattern)
- Manual refresh for activity vs auto-polling
- Inline section components vs separate files

- [ ] **Step 3: Update BACKLOG.md**

Move "Wallet view page" from Open Items to Completed. Also update the "Authorization reverse-index indexer" investigate item to note the new endpoints are now integrated. Keep "Wallet identity hub" as a Low priority open item.

- [ ] **Step 4: Update CLAUDE.md**

Add to Current Features list:
```
- Wallet view page: `/wallet?address=0x...` showing owned nodes (from scheduler), created VMs with scheduler status (api2 cross-ref), activity timeline with manual refresh (all message types), permissions granted/received with inline scope tags, wallet-to-wallet navigation, Explorer deep links. Entry points: clickable wallet addresses in node detail view/panel.
```

- [ ] **Step 5: Commit**

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md CLAUDE.md
git commit -m "docs: update architecture, decisions, backlog, and features for wallet view"
```
