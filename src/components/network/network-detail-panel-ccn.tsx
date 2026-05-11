"use client";

import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import type { CCNInfo } from "@/api/credit-types";
import { countryFlag } from "@/lib/country-flag";
import { countryName } from "@/lib/network-address-info";

type Props = {
  info: CCNInfo;
  country?: string | undefined;
};

const ALEPH_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function ccnChipVariant(info: CCNInfo): "success" | "warning" | "default" {
  if (info.inactiveSince != null) return "default";
  if (info.status === "active") return "success";
  return "warning";
}

export function NetworkDetailPanelCCN({ info, country }: Props) {
  const crnCount = info.resourceNodes.length;
  const stakerCount = Object.keys(info.stakers).length;
  const flag = country ? countryFlag(country) : null;
  const land = country ? countryName(country) : null;

  return (
    <div className="space-y-4 px-4 py-3 text-sm">
      <dl className="space-y-1.5">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Type</dt>
          <dd className="font-medium">CCN</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge fill="outline" variant={ccnChipVariant(info)} size="sm">
              {info.status}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Score</dt>
          <dd className="font-mono text-xs">{info.score.toFixed(2)}</dd>
        </div>
        {land && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Location</dt>
            <dd className="flex items-center gap-1.5">
              {flag && <span aria-hidden>{flag}</span>}
              <span>{land}</span>
            </dd>
          </div>
        )}
      </dl>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] p-2.5">
          <div className="text-lg font-semibold leading-tight">{crnCount}</div>
          <div className="text-[11px] text-muted-foreground">CRNs attached</div>
        </div>
        <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] p-2.5">
          <div className="text-lg font-semibold leading-tight">
            {stakerCount}
          </div>
          <div className="text-[11px] text-muted-foreground">Stakers</div>
        </div>
      </div>

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Total staked
        </h4>
        <p className="font-mono text-sm">
          {ALEPH_FMT.format(info.totalStaked)} ALEPH
        </p>
      </div>

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Owner
        </h4>
        <CopyableText
          text={info.owner}
          startChars={8}
          endChars={8}
          size="sm"
          href={`/wallet?address=${info.owner}`}
        />
      </div>

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Reward
        </h4>
        <CopyableText
          text={info.reward}
          startChars={8}
          endChars={8}
          size="sm"
          href={`/wallet?address=${info.reward}`}
        />
      </div>
    </div>
  );
}
