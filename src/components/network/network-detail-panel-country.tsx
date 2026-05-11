"use client";

import { countryFlag } from "@/lib/country-flag";

type Props = {
  code: string;
  name: string;
  ccnCount: number;
  crnCount: number;
  uniqueOwners: number;
  inactiveCount: number;
};

export function NetworkDetailPanelCountry({
  code,
  name,
  ccnCount,
  crnCount,
  uniqueOwners,
  inactiveCount,
}: Props) {
  const total = ccnCount + crnCount;
  return (
    <div className="space-y-4 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          {countryFlag(code)}
        </span>
        <h4 className="text-base font-semibold">{name}</h4>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Total nodes" value={total} />
        <StatTile label="Unique owners" value={uniqueOwners} />
        <StatTile label="CCNs" value={ccnCount} />
        <StatTile label="CRNs" value={crnCount} />
      </div>

      {inactiveCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {inactiveCount} inactive node{inactiveCount === 1 ? "" : "s"} not
          shown here.
        </p>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] p-2.5">
      <div className="text-lg font-semibold leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
