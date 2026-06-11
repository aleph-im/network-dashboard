"use client";

import { formatAleph } from "@/lib/format";
import type { BySource, RewardSource } from "@/api/rewards-types";

const SOURCE_META: { key: RewardSource; label: string; bar: string }[] = [
  { key: "credit_revenue", label: "Credits", bar: "bg-success-500" },
  { key: "holder_tier", label: "Holder", bar: "bg-primary-500" },
  { key: "wage_subsidy", label: "Min. wage", bar: "bg-warning-500" },
];

/** Three-segment reward-source bar + caption. Shared by the wallet revenue
 *  card and the Node Earnings KPI so the source vocabulary can't drift. */
export function RewardSourceBar({ bySource }: { bySource: BySource }) {
  return (
    <>
      <div className="my-2 flex h-2 overflow-hidden rounded">
        {SOURCE_META.map((m) =>
          bySource[m.key] > 0 ? (
            <div key={m.key} className={m.bar} style={{ flex: bySource[m.key] }} />
          ) : null,
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {SOURCE_META.map((m, i) => (
          <span key={m.key} className="inline-flex items-center gap-1">
            {i > 0 ? <span> · </span> : null}
            <span className={`inline-block h-2 w-2 rounded-full ${m.bar}`} />
            {m.label} {formatAleph(bySource[m.key])}
          </span>
        ))}
      </div>
    </>
  );
}
