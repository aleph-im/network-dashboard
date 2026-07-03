"use client";

import { useMemo, useState } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { MobileTableCardRow } from "@/components/mobile-table-card-row";
import { applySort, type SortDirection } from "@/lib/sort";
import {
  etherscanTxUrl,
  formatAleph,
  formatUsd,
  relativeTimeFromUnix,
} from "@/lib/format";
import type { BuyflowChainEvent } from "@/api/buyflow-types";

const AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function PaidInBadge({ event }: { event: BuyflowChainEvent }) {
  return (
    <Badge
      fill="outline"
      variant={event.tokenSymbol === "ALEPH" ? "success" : "default"}
      size="sm"
    >
      {event.tokenSymbol}
    </Badge>
  );
}

function TypeBadge({ event }: { event: BuyflowChainEvent }) {
  return (
    <Badge
      fill="outline"
      variant={event.marketBuy ? "default" : "success"}
      size="sm"
    >
      {event.marketBuy ? "market buy" : "direct ALEPH"}
    </Badge>
  );
}

function AmountCell({ event }: { event: BuyflowChainEvent }) {
  return (
    <span className="tabular-nums text-muted-foreground">
      {AMOUNT_FORMAT.format(event.amountIn)}
    </span>
  );
}

function UsdCell({ event }: { event: BuyflowChainEvent }) {
  return (
    <span className="font-semibold tabular-nums">
      {event.usdValue != null ? formatUsd(event.usdValue) : "—"}
    </span>
  );
}

function ToNetworkCell({ event }: { event: BuyflowChainEvent }) {
  return (
    <span className="tabular-nums text-muted-foreground">
      {formatAleph(event.alephToDistribution)}
    </span>
  );
}

const columns: Column<BuyflowChainEvent>[] = [
  {
    header: "When",
    accessor: (e) => relativeTimeFromUnix(e.timestamp / 1000),
    sortable: true,
    sortValue: (e) => e.timestamp,
  },
  {
    header: "Paid in",
    accessor: (e) => <PaidInBadge event={e} />,
    sortable: true,
    sortValue: (e) => e.tokenSymbol,
  },
  {
    header: "Amount",
    accessor: (e) => <AmountCell event={e} />,
    sortable: true,
    sortValue: (e) => e.amountIn,
    align: "right",
  },
  {
    header: "≈ USD",
    accessor: (e) => <UsdCell event={e} />,
    sortable: true,
    sortValue: (e) => e.usdValue ?? 0,
    align: "right",
  },
  {
    header: "To network",
    accessor: (e) => <ToNetworkCell event={e} />,
    sortable: true,
    sortValue: (e) => e.alephToDistribution,
    align: "right",
  },
  {
    header: "Type",
    accessor: (e) => <TypeBadge event={e} />,
    sortable: true,
    sortValue: (e) => (e.marketBuy ? 1 : 0),
  },
  {
    header: "Tx",
    accessor: (e) => (
      <CopyableText
        text={e.txHash}
        startChars={8}
        endChars={8}
        size="sm"
        href={etherscanTxUrl(e.txHash)}
      />
    ),
  },
];

/**
 * On-chain processing runs from the payment contract — the payments the
 * Total Revenue headline is summed from. This includes the direct ALEPH
 * transfers (consolidated PAYG / off-API revenue) that never appear in the
 * Credit-API purchases table.
 */
export function RevenuePaymentsTable({
  events,
}: {
  events: BuyflowChainEvent[];
}) {
  const [sortColumn, setSortColumn] = useState<string | undefined>();
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Newest first by default; header clicks re-sort the full dataset
  // before pagination so all pages participate.
  const rows = useMemo(
    () => [...events].sort((a, b) => b.blockNumber - a.blockNumber),
    [events],
  );
  const sorted = useMemo(
    () => applySort(rows, columns, sortColumn, sortDirection),
    [rows, sortColumn, sortDirection],
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
  } = usePagination(sorted);

  return (
    <div>
      <div className="hidden md:block">
        <Table
          columns={columns}
          data={pageItems}
          keyExtractor={(e) => e.txHash}
          emptyState="No payments processed yet"
          {...(sortColumn ? { sortColumn } : {})}
          sortDirection={sortDirection}
          onSortChange={(col, dir) => {
            setSortColumn(col);
            setSortDirection(dir);
          }}
        />
      </div>

      <div className="space-y-3 md:hidden">
        {pageItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payments processed yet
          </p>
        ) : (
          pageItems.map((e) => (
            <MobileTableCardRow
              key={e.txHash}
              primary={
                <CopyableText
                  text={e.txHash}
                  startChars={8}
                  endChars={8}
                  size="sm"
                  href={etherscanTxUrl(e.txHash)}
                />
              }
              fields={[
                { label: "When", value: relativeTimeFromUnix(e.timestamp / 1000) },
                { label: "Paid in", value: <PaidInBadge event={e} /> },
                { label: "Amount", value: <AmountCell event={e} /> },
                { label: "≈ USD", value: <UsdCell event={e} /> },
                { label: "To network", value: <ToNetworkCell event={e} /> },
                { label: "Type", value: <TypeBadge event={e} /> },
              ]}
            />
          ))
        )}
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
    </div>
  );
}
