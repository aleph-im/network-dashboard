"use client";

import { usePageHeader } from "@aleph-front/ds/page-header";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useBuyflow } from "@/hooks/use-buyflow";
import { formatUsd } from "@/lib/format";
import { RevenueSummaryBar } from "@/components/revenue-summary-bar";
import { RevenuePurchasesTable } from "@/components/revenue-purchases-table";
import { RevenueMonthlyTable } from "@/components/revenue-monthly-table";

export default function RevenuePage() {
  usePageHeader({ title: "Revenue" });
  const { data, isLoading, isError } = useBuyflow();

  const byCurrency = data?.credits.byCurrency ?? {};
  const currencies = Object.entries(byCurrency).sort((a, b) => b[1].usd - a[1].usd);

  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-4xl">Revenue</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Payments flowing into Aleph Cloud — credit purchases and consolidated
          pay-as-you-go revenue, paid in ALEPH or stable coins, swapped to
          ALEPH, then distributed to the network.
        </p>
      </div>

      {isError ? (
        <p className="rounded-lg border border-edge bg-muted/30 p-6 text-sm text-muted-foreground">
          Revenue data is temporarily unavailable.
        </p>
      ) : (
        <>
          {/* Summary cards */}
          <RevenueSummaryBar data={data} isLoading={isLoading} />

          {/* Paid-in split */}
          {!isLoading && currencies.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
              <span className="uppercase tracking-widest text-muted-foreground/70">
                Paid in
              </span>
              {currencies.map(([currency, totals]) => (
                <span key={currency} className="tabular-nums">
                  <span className="font-semibold text-foreground">{currency}</span>{" "}
                  {formatUsd(totals.usd)}
                  <span className="text-muted-foreground/60">
                    {" "}
                    · {totals.purchases.toLocaleString("en-US")} purchases
                  </span>
                </span>
              ))}
            </div>
          ) : null}

          {/* Recent purchases */}
          <section className="mt-12">
            <h2 className="mb-4 font-heading text-xl font-bold tracking-tight">
              Recent purchases
            </h2>
            {isLoading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : (
              <RevenuePurchasesTable purchases={data?.credits.latest ?? []} />
            )}
          </section>

          {/* Monthly breakdown */}
          <section className="mt-12">
            <h2 className="mb-4 font-heading text-xl font-bold tracking-tight">
              Monthly
            </h2>
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : (
              <RevenueMonthlyTable monthly={data?.monthly ?? []} />
            )}
          </section>

          {/* Watermark — matches the spend-side Credits page */}
          {!isLoading && data ? (
            <p className="mt-12 text-center text-[10px] uppercase tracking-[0.3em] text-foreground/10">
              Powered by Aleph Cloud
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
