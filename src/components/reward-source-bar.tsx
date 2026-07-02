"use client";

import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { formatAleph } from "@/lib/format";
import type { BySource, RewardSource } from "@/api/rewards-types";

const SOURCE_META: { key: RewardSource; label: string; bar: string; tip?: string }[] = [
  { key: "credit_revenue", label: "Credits", bar: "bg-success-500" },
  { key: "holder_tier", label: "Holder", bar: "bg-primary-500" },
  {
    key: "wage_subsidy",
    label: "Wage subsidy",
    bar: "bg-warning-500",
    tip: "The minimum-wage emission actually paid over this window. It decays toward zero over time, so it reads lower than the undecayed “min wage” figure in the economics calculator.",
  },
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
      <TooltipProvider>
        <div className="text-xs text-muted-foreground">
          {SOURCE_META.map((m, i) => (
            <span key={m.key} className="inline-flex items-center gap-1">
              {i > 0 ? <span> · </span> : null}
              <span className={`inline-block h-2 w-2 rounded-full ${m.bar}`} />
              {m.tip ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                      {m.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px]">{m.tip}</TooltipContent>
                </Tooltip>
              ) : (
                m.label
              )}{" "}
              {formatAleph(bySource[m.key])}
            </span>
          ))}
        </div>
      </TooltipProvider>
    </>
  );
}
