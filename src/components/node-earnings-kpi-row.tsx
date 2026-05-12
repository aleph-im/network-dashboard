"use client";

import { Card } from "@aleph-front/ds/card";

export type KpiCard = {
  label: string;
  primary: string;
  secondary: string;
  /** Optional tone for the secondary text (controls colour). */
  tone?: "default" | "up" | "down" | "warning";
};

const TONE_CLASS: Record<NonNullable<KpiCard["tone"]>, string> = {
  default: "text-muted-foreground",
  up: "text-success-500",
  down: "text-warning-500",
  warning: "text-warning-500",
};

export function NodeEarningsKpiRow({ cards }: { cards: KpiCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, i) => (
        <Card key={`${c.label}-${i}`} padding="md">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {c.label}
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {c.primary}
          </div>
          <div className={`mt-0.5 text-xs ${TONE_CLASS[c.tone ?? "default"]}`}>
            {c.secondary}
          </div>
        </Card>
      ))}
    </div>
  );
}
