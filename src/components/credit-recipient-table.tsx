"use client";

import { useState, useMemo } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { FilterToolbar } from "@/components/filter-toolbar";
import { applySort, type SortDirection } from "@/lib/sort";
import { formatAleph } from "@/lib/format";
import type { RecipientTotal, DistributionSummary } from "@/api/credit-types";

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

function buildColumns(distributedAleph: number): Column<RecipientTotal>[] {
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
        if (badges.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {badges.map((b) => (
              <Badge key={b.key} fill="outline" variant={b.variant} size="sm">
                {b.label}
              </Badge>
            ))}
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
};

export function CreditRecipientTable({ summary }: Props) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<string | undefined>();
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("asc");

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
      items = items.filter((r) => r.address.toLowerCase().includes(q));
    }
    return items;
  }, [summary.recipients, roleFilter, search]);

  const columns = useMemo(
    () => buildColumns(summary.distributedAleph),
    [summary.distributedAleph],
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
        searchPlaceholder="Search address..."
      />

      <Table
        columns={columns}
        data={pageItems}
        keyExtractor={(r) => r.address}
        emptyState="No recipients found"
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
