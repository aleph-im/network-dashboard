"use client";

import { Table, type Column } from "@aleph-front/ds/table";
import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { etherscanTxUrl, formatUsd, relativeTimeFromUnix } from "@/lib/format";
import type { BuyflowPurchase } from "@/api/buyflow-types";

const CREDITS_COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function currencyVariant(currency: string): "success" | "default" {
  return currency === "ALEPH" ? "success" : "default";
}

const columns: Column<BuyflowPurchase>[] = [
  {
    header: "When",
    accessor: (p) => relativeTimeFromUnix(p.createdAt / 1000),
    sortable: true,
    sortValue: (p) => p.createdAt,
  },
  {
    header: "Paid in",
    accessor: (p) => (
      <Badge fill="outline" variant={currencyVariant(p.currency)} size="sm">
        {p.currency}
      </Badge>
    ),
    sortable: true,
    sortValue: (p) => p.currency,
  },
  {
    header: "Amount",
    accessor: (p) => (
      <span className="font-semibold tabular-nums">{formatUsd(p.usd)}</span>
    ),
    sortable: true,
    sortValue: (p) => p.usd,
    align: "right",
  },
  {
    header: "Credits",
    accessor: (p) => (
      <span className="tabular-nums text-muted-foreground">
        {CREDITS_COMPACT.format(p.credits)}
      </span>
    ),
    sortable: true,
    sortValue: (p) => p.credits,
    align: "right",
  },
  {
    header: "Tx",
    accessor: (p) => (
      <CopyableText
        text={p.txHash}
        startChars={8}
        endChars={8}
        size="sm"
        href={etherscanTxUrl(p.txHash)}
      />
    ),
  },
];

export function RevenuePurchasesTable({
  purchases,
}: {
  purchases: BuyflowPurchase[];
}) {
  return (
    <Table
      columns={columns}
      data={purchases}
      keyExtractor={(p) => `${p.txHash}-${p.createdAt}`}
      emptyState="No purchases yet"
    />
  );
}
