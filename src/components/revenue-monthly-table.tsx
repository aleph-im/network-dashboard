"use client";

import { useMemo } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { formatUsd } from "@/lib/format";
import type { BuyflowMonth } from "@/api/buyflow-types";

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatMonth(month: string): string {
  const [year, mon] = month.split("-").map((n) => Number(n));
  return MONTH_LABEL.format(new Date(Date.UTC(year ?? 1970, (mon ?? 1) - 1, 1)));
}

const columns: Column<BuyflowMonth>[] = [
  {
    header: "Month",
    accessor: (m) => formatMonth(m.month),
    sortable: true,
    sortValue: (m) => m.month,
  },
  {
    header: "Purchases",
    accessor: (m) => m.purchases.toLocaleString("en-US"),
    sortable: true,
    sortValue: (m) => m.purchases,
    align: "right",
  },
  {
    header: "Purchased",
    accessor: (m) => <span className="tabular-nums">{formatUsd(m.usd)}</span>,
    sortable: true,
    sortValue: (m) => m.usd,
    align: "right",
  },
  {
    header: "Revenue Processed",
    accessor: (m) => (
      <span className="font-semibold tabular-nums">
        {formatUsd(m.processedUsd ?? 0)}
      </span>
    ),
    sortable: true,
    sortValue: (m) => m.processedUsd ?? 0,
    align: "right",
  },
];

export function RevenueMonthlyTable({ monthly }: { monthly: BuyflowMonth[] }) {
  // Newest month first.
  const rows = useMemo(
    () => [...monthly].sort((a, b) => b.month.localeCompare(a.month)),
    [monthly],
  );

  return (
    <Table
      columns={columns}
      data={rows}
      keyExtractor={(m) => m.month}
      emptyState="No monthly data"
    />
  );
}
