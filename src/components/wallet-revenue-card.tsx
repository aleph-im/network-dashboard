"use client";

import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { formatAleph } from "@/lib/format";
import { nextPaymentEstimate, cycleProgress } from "@/lib/payout-cycle";
import type { BySource, OwnerRewards, RewardSource } from "@/api/rewards-types";

const SOURCE_META: { key: RewardSource; label: string; bar: string; dot: string }[] = [
  { key: "credit_revenue", label: "Credits", bar: "bg-success-500", dot: "🟢" },
  { key: "holder_tier", label: "Holder", bar: "bg-primary-500", dot: "🟣" },
  { key: "wage_subsidy", label: "Min. wage", bar: "bg-warning-500", dot: "🟡" },
];

function SourceBar({ bySource }: { bySource: BySource }) {
  const total = SOURCE_META.reduce((s, m) => s + bySource[m.key], 0);
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
          <span key={m.key}>
            {i > 0 ? " · " : ""}
            {m.dot} {m.label} {formatAleph(bySource[m.key])}
          </span>
        ))}
        {total > 0 && bySource.wage_subsidy > 0 && (
          <span className="opacity-60"> (wage decaying → 0)</span>
        )}
      </div>
    </>
  );
}

function daysUntil(targetSec: number, nowSec: number): number {
  return Math.max(0, Math.round((targetSec - nowSec) / 86400));
}

const STATUS_LABEL = {
  pending: "⏳ on-chain pending",
  confirmed: "✓ on-chain confirmed",
  failed: "⚠ transfer failed",
} as const;

const STATUS_COLOR = { pending: "text-warning-500", confirmed: "text-success-500", failed: "text-error-500" } as const;

export function WalletRevenueCard({ rewards }: { rewards: OwnerRewards }) {
  if (rewards.totalAleph === 0 && !rewards.lastPaid) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const nextSec = rewards.cycleEndSec ? nextPaymentEstimate(rewards.cycleEndSec) : null;
  const progress = nextSec ? cycleProgress(rewards.cycleStartSec, nextSec, nowSec) : 0;

  return (
    <Card padding="md">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Node revenue
      </h3>

      <div className="flex flex-wrap gap-5">
        <div className="min-w-[240px] flex-[2]">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Owed this cycle <span className="text-success-500">● live</span>
          </div>
          <div className="font-mono text-3xl font-semibold tabular-nums">
            {formatAleph(rewards.totalAleph)}{" "}
            <span className="text-base text-muted-foreground">ALEPH</span>
          </div>
          <div className="my-2 h-2 overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-success-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {nextSec && (
            <div className="text-sm text-muted-foreground">
              ⏱ Next payment in ~{daysUntil(nextSec, nowSec)} days
            </div>
          )}
          <div className="text-[11px] text-muted-foreground opacity-60">
            Resets to 0 when the next distribution publishes.
          </div>
        </div>

        {rewards.lastPaid && (
          <div className="min-w-[180px] flex-1 border-l border-edge pl-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Last payment
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums">
              {formatAleph(rewards.lastPaid.aleph)}{" "}
              <span className="text-xs text-muted-foreground">ALEPH</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(rewards.lastPaid.timeSec * 1000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
            <div className={`mt-1 ${STATUS_COLOR[rewards.lastPaid.status]}`}>{STATUS_LABEL[rewards.lastPaid.status]}</div>
          </div>
        )}
      </div>

      <hr className="my-3 border-edge" />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        By source · this cycle
      </div>
      <SourceBar bySource={rewards.bySource} />

      {(rewards.byNode.length > 0 || rewards.stakingAleph > 0 || rewards.unattributedAleph > 0) && (
        <>
          <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            By node · this cycle
          </div>
          <table className="mt-1 w-full text-sm">
            <tbody className="divide-y divide-edge">
              {rewards.byNode.map((n) => (
                <tr key={`${n.hash}-${n.role}`}>
                  <td className="py-1.5 pr-4">
                    <div className="flex items-center gap-2">
                      <CopyableText
                        text={n.hash}
                        startChars={8}
                        endChars={8}
                        size="sm"
                        href={`/nodes?view=${n.hash}`}
                      />
                      {n.name && (
                        <span className="text-xs text-muted-foreground">{n.name}</span>
                      )}
                      <Badge
                        fill="outline"
                        variant={n.role === "crn" ? "info" : "default"}
                        size="sm"
                      >
                        {n.role.toUpperCase()}
                      </Badge>
                    </div>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {formatAleph(n.totalAleph)}
                  </td>
                </tr>
              ))}
              {rewards.stakingAleph > 0 && (
                <tr>
                  <td className="py-1.5 pr-4">
                    <Badge fill="outline" variant="warning" size="sm">
                      STAKING
                    </Badge>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {formatAleph(rewards.stakingAleph)}
                  </td>
                </tr>
              )}
              {rewards.unattributedAleph > 0 && (
                <tr>
                  <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                    Unattributed <span className="opacity-60">(no current node)</span>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{formatAleph(rewards.unattributedAleph)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <p className="mt-3 text-[11px] italic text-muted-foreground">
        Owed amounts accrued from the protocol&apos;s authoritative rewards feed (algoVersion v2),
        including the wage subsidy (which decays over time). Per-node figures for addresses with
        multiple nodes are apportioned. Last payment reflects the on-chain distribution status.
      </p>
    </Card>
  );
}
