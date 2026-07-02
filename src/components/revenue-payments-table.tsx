"use client";

import { useMemo } from "react";
import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import {
  formatAleph,
  formatUsd,
  relativeTimeFromUnix,
  truncateHash,
} from "@/lib/format";
import type { BuyflowChainEvent } from "@/api/buyflow-types";

const AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const columns: Column<BuyflowChainEvent>[] = [
  {
    header: "When",
    accessor: (e) => relativeTimeFromUnix(e.timestamp / 1000),
    sortable: true,
    sortValue: (e) => e.timestamp,
  },
  {
    header: "Paid in",
    accessor: (e) => (
      <Badge variant={e.tokenSymbol === "ALEPH" ? "success" : "default"}>
        {e.tokenSymbol}
      </Badge>
    ),
    sortable: true,
    sortValue: (e) => e.tokenSymbol,
  },
  {
    header: "Amount",
    accessor: (e) => (
      <span className="tabular-nums text-muted-foreground">
        {AMOUNT_FORMAT.format(e.amountIn)}
      </span>
    ),
    sortable: true,
    sortValue: (e) => e.amountIn,
    align: "right",
  },
  {
    header: "≈ USD",
    accessor: (e) => (
      <span className="font-semibold tabular-nums">
        {e.usdValue != null ? formatUsd(e.usdValue) : "—"}
      </span>
    ),
    sortable: true,
    sortValue: (e) => e.usdValue ?? 0,
    align: "right",
  },
  {
    header: "To network",
    accessor: (e) => (
      <span className="tabular-nums text-muted-foreground">
        {formatAleph(e.alephToDistribution)}
      </span>
    ),
    sortable: true,
    sortValue: (e) => e.alephToDistribution,
    align: "right",
  },
  {
    header: "Type",
    accessor: (e) => (
      <Badge variant={e.marketBuy ? "default" : "success"}>
        {e.marketBuy ? "market buy" : "direct ALEPH"}
      </Badge>
    ),
    sortable: true,
    sortValue: (e) => (e.marketBuy ? 1 : 0),
  },
  {
    header: "Tx",
    accessor: (e) => (
      <a
        href={`https://etherscan.io/tx/${e.txHash}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-primary hover:underline"
        onClick={(ev) => ev.stopPropagation()}
      >
        {truncateHash(e.txHash, 10)}
      </a>
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
  // Newest first.
  const rows = useMemo(
    () => [...events].sort((a, b) => b.blockNumber - a.blockNumber),
    [events],
  );

  return (
    <Table
      columns={columns}
      data={rows}
      keyExtractor={(e) => e.txHash}
      emptyState="No payments processed yet"
    />
  );
}
