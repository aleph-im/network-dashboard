import type { RewardSource } from "@/api/rewards-types";

/** Ordered reward-source vocabulary for the revenue-history chart + legend.
 *  Mirrors the wallet RewardSourceBar (Credits / Holder / Wage subsidy) so the
 *  source colors and labels stay consistent. Bars stack bottom→top in this order.
 *  (A future cleanup can have RewardSourceBar import this too — see BACKLOG.) */
export const REWARD_SOURCE_META: {
  key: RewardSource;
  label: string;
  cssVar: string;
  dotClass: string;
}[] = [
  { key: "credit_revenue", label: "Credits", cssVar: "var(--color-success-500)", dotClass: "bg-success-500" },
  { key: "holder_tier", label: "Holder", cssVar: "var(--color-primary-500)", dotClass: "bg-primary-500" },
  { key: "wage_subsidy", label: "Wage subsidy", cssVar: "var(--color-warning-500)", dotClass: "bg-warning-500" },
];
