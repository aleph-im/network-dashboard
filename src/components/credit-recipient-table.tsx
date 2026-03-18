"use client";

import { useState, useMemo } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { FilterToolbar } from "@/components/filter-toolbar";
import { formatAleph } from "@/lib/format";
import type { RecipientTotal, DistributionSummary } from "@/api/credit-types";

const ROLE_VARIANTS: Record<string, "success" | "default" | "warning"> = {
  crn: "success",
  ccn: "default",
  staker: "warning",
};

const ROLE_LABELS: Record<string, string> = {
  crn: "CRN",
  ccn: "CCN",
  staker: "Staker",
};

type RoleFilter = "all" | "crn" | "ccn" | "staker";

const ROLE_PILLS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "crn", label: "CRN" },
  { value: "ccn", label: "CCN" },
  { value: "staker", label: "Staker" },
];

function buildColumns(distributedAleph: number): Column<RecipientTotal>[] {
  return [
    {
      header: "Node",
      accessor: (r) =>
        r.nodeName ? (
          <span className="text-muted-foreground">{r.nodeName}</span>
        ) : r.nodeHash ? (
          <CopyableText
            text={r.nodeHash}
            startChars={8}
            endChars={8}
            size="sm"
            href={`/nodes?view=${r.nodeHash}`}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortable: true,
      sortValue: (r) => r.nodeName ?? r.nodeHash ?? "",
    },
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
      header: "Roles",
      accessor: (r) => (
        <div className="flex gap-1">
          {r.roles.map((role) => (
            <Badge
              key={role}
              fill="outline"
              variant={ROLE_VARIANTS[role]}
              size="sm"
            >
              {ROLE_LABELS[role]}
            </Badge>
          ))}
        </div>
      ),
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
};

export function CreditRecipientTable({ summary }: Props) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");

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

  const filtered = useMemo(() => {
    let items = summary.recipients;
    if (roleFilter !== "all") {
      items = items.filter((r) => r.roles.includes(roleFilter));
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          r.address.toLowerCase().includes(q) ||
          (r.nodeHash?.toLowerCase().includes(q) ?? false) ||
          (r.nodeName?.toLowerCase().includes(q) ?? false),
      );
    }
    return items;
  }, [summary.recipients, roleFilter, search]);

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
  } = usePagination(filtered);

  const columns = useMemo(
    () => buildColumns(summary.distributedAleph),
    [summary.distributedAleph],
  );

  return (
    <div>
      <FilterToolbar
        statuses={ROLE_PILLS}
        activeStatus={roleFilter}
        onStatusChange={(s) => { setRoleFilter(s); setPage(1); }}
        formatCount={(s) => String(roleCounts[s])}
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search address, node..."
      />

      <Table
        columns={columns}
        data={pageItems}
        keyExtractor={(r) => r.address}
        emptyState="No recipients found"
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
