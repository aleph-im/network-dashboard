"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { FilterToolbar } from "@/components/filter-toolbar";
import { applySort, type SortDirection } from "@/lib/sort";
import { formatAleph } from "@/lib/format";
import type {
  RecipientTotal,
  DistributionSummary,
  NodeState,
} from "@/api/credit-types";

type RoleFilter = "all" | "crn" | "ccn" | "staker";

const ROLE_PILLS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "crn", label: "CRN" },
  { value: "ccn", label: "CCN" },
  { value: "staker", label: "Staker" },
];

type SourceBadge = {
  key: string;
  label: string;
  variant: "success" | "default" | "warning";
};

function buildSourceBadges(r: RecipientTotal): SourceBadge[] {
  const badges: SourceBadge[] = [];
  if (r.crnCount > 0) {
    badges.push({ key: "crn", label: `CRN: ${r.crnCount}`, variant: "success" });
  }
  if (r.ccnCount > 0) {
    badges.push({ key: "ccn", label: `CCN: ${r.ccnCount}`, variant: "default" });
  }
  if (r.stakerAleph > 0) {
    badges.push({ key: "staker", label: "Staker", variant: "warning" });
  }
  return badges;
}

type NodeIndexEntry = { name: string; kind: "crn" | "ccn" };

function buildNodeIndex(nodeState: NodeState | undefined) {
  const byAddress = new Map<string, NodeIndexEntry[]>();
  if (!nodeState) return byAddress;
  const push = (addr: string, entry: NodeIndexEntry) => {
    if (!entry.name) return;
    const list = byAddress.get(addr);
    if (list) list.push(entry);
    else byAddress.set(addr, [entry]);
  };
  for (const crn of nodeState.crns.values()) {
    const addr = crn.reward || crn.owner;
    push(addr, { name: crn.name, kind: "crn" });
  }
  for (const ccn of nodeState.ccns.values()) {
    const addr = ccn.reward || ccn.owner;
    push(addr, { name: ccn.name, kind: "ccn" });
  }
  return byAddress;
}

function buildColumns(
  distributedAleph: number,
  matchedNodeNamesByAddress: Map<string, string[]>,
): Column<RecipientTotal>[] {
  return [
    {
      header: "Address",
      accessor: (r) => (
        <CopyableText
          text={r.address}
          startChars={8}
          endChars={8}
          size="sm"
          href={`/wallet?address=${r.address}`}
        />
      ),
      sortable: true,
      sortValue: (r) => r.address,
    },
    {
      header: "Sources",
      accessor: (r) => {
        const badges = buildSourceBadges(r);
        const matchedNames = matchedNodeNamesByAddress.get(r.address) ?? [];
        const firstName = matchedNames[0];
        const extra = matchedNames.length - 1;
        if (badges.length === 0 && matchedNames.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap items-center gap-1">
            {badges.map((b) => (
              <Badge key={b.key} fill="outline" variant={b.variant} size="sm">
                {b.label}
              </Badge>
            ))}
            {firstName ? (
              <Badge
                fill="outline"
                variant="info"
                size="sm"
                title={matchedNames.join(", ")}
              >
                <span className="max-w-[12ch] truncate">
                  Matched: {firstName}
                </span>
                {extra > 0 ? <>&nbsp;+{extra}</> : null}
              </Badge>
            ) : null}
          </div>
        );
      },
      sortable: true,
      sortValue: (r) => r.crnCount * 1000 + r.ccnCount,
    },
    {
      header: "CRN",
      accessor: (r) => (
        <span className="tabular-nums">
          {r.crnAleph > 0 ? formatAleph(r.crnAleph) : "—"}
        </span>
      ),
      sortable: true,
      sortValue: (r) => r.crnAleph,
      align: "right",
    },
    {
      header: "CCN",
      accessor: (r) => (
        <span className="tabular-nums">
          {r.ccnAleph > 0 ? formatAleph(r.ccnAleph) : "—"}
        </span>
      ),
      sortable: true,
      sortValue: (r) => r.ccnAleph,
      align: "right",
    },
    {
      header: "Staking",
      accessor: (r) => (
        <span className="tabular-nums">
          {r.stakerAleph > 0 ? formatAleph(r.stakerAleph) : "—"}
        </span>
      ),
      sortable: true,
      sortValue: (r) => r.stakerAleph,
      align: "right",
    },
    {
      header: "Total",
      accessor: (r) => (
        <span className="tabular-nums font-bold">
          {formatAleph(r.totalAleph)}
        </span>
      ),
      sortable: true,
      sortValue: (r) => r.totalAleph,
      align: "right",
    },
    {
      header: "%",
      accessor: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {distributedAleph > 0
            ? `${((r.totalAleph / distributedAleph) * 100).toFixed(1)}%`
            : "—"}
        </span>
      ),
      sortable: true,
      sortValue: (r) => distributedAleph > 0 ? r.totalAleph / distributedAleph : 0,
      align: "right",
    },
  ];
}

type Props = {
  summary: DistributionSummary;
  nodeState?: NodeState | undefined;
};

export function CreditRecipientTable({ summary, nodeState }: Props) {
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<string | undefined>();
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("asc");

  const nodeIndex = useMemo(() => buildNodeIndex(nodeState), [nodeState]);

  const roleCounts = useMemo(() => {
    const counts: Record<RoleFilter, number> = { all: 0, crn: 0, ccn: 0, staker: 0 };
    for (const r of summary.recipients) {
      counts.all++;
      for (const role of r.roles) {
        if (role in counts) counts[role as RoleFilter]++;
      }
    }
    return counts;
  }, [summary.recipients]);

  const { filtered, matchedNodeNamesByAddress } = useMemo(() => {
    let items = summary.recipients;
    if (roleFilter !== "all") {
      items = items.filter((r) => r.roles.includes(roleFilter));
    }
    const matches = new Map<string, string[]>();
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((r) => {
        const addressMatch = r.address.toLowerCase().includes(q);
        const nodes = nodeIndex.get(r.address);
        const nodeMatches = nodes
          ? nodes
              .filter((n) => n.name.toLowerCase().includes(q))
              .map((n) => n.name)
          : [];
        if (!addressMatch && nodeMatches.length === 0) return false;
        if (!addressMatch && nodeMatches.length > 0) {
          matches.set(r.address, nodeMatches);
        }
        return true;
      });
    }
    return { filtered: items, matchedNodeNamesByAddress: matches };
  }, [summary.recipients, roleFilter, search, nodeIndex]);

  const columns = useMemo(
    () => buildColumns(summary.distributedAleph, matchedNodeNamesByAddress),
    [summary.distributedAleph, matchedNodeNamesByAddress],
  );

  const sortedFiltered = useMemo(
    () => applySort(filtered, columns, sortColumn, sortDirection),
    [filtered, columns, sortColumn, sortDirection],
  );

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
  } = usePagination(sortedFiltered);

  return (
    <div>
      <FilterToolbar
        statuses={ROLE_PILLS}
        activeStatus={roleFilter}
        onStatusChange={(s) => { setRoleFilter(s); setPage(1); }}
        formatCount={(s) => String(roleCounts[s])}
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search address or node name..."
      />

      <Table
        columns={columns}
        data={pageItems}
        keyExtractor={(r) => r.address}
        emptyState="No recipients found"
        onRowClick={(r) => router.push(`/wallet?address=${r.address}`)}
        {...(sortColumn ? { sortColumn } : {})}
        sortDirection={sortDirection}
        onSortChange={(col, dir) => {
          setSortColumn(col);
          setSortDirection(dir);
        }}
      />

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
    </div>
  );
}
