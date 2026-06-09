import {
  getCreditApiBaseUrl,
  getAlephBaseUrl,
  FOUNDATION_DISTRIBUTION_SENDER,
  DISTRIBUTION_POST_TYPE,
} from "@/api/client";
import type { AddressRewards, DistributionCycle } from "@/api/rewards-types";

type TimeSeriesResponse = {
  total: {
    totals: { aleph: number };
    bySource: AddressRewards["bySource"];
    full: AddressRewards["full"];
  };
};

/** Authoritative per-address rewards over [fromSec, toSec]. Single address only. */
export async function getRewardsTimeSeries(
  address: string,
  fromSec: number,
  toSec: number,
): Promise<AddressRewards> {
  const addr = address.toLowerCase();
  const params = new URLSearchParams({
    from: String(Math.floor(fromSec)),
    to: String(Math.floor(toSec)),
    address: addr,
    detail: "2",
    bucketSize: "1y", // single aggregate bucket; we read `total`
  });
  const url = `${getCreditApiBaseUrl()}/api/v0/rewards/time-series?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Rewards API error: ${res.status}`);
  const data = (await res.json()) as TimeSeriesResponse;
  const t = data.total;
  return {
    address: addr,
    totalAleph: t.totals.aleph,
    bySource: t.bySource,
    full: t.full,
  };
}

type DistMessage = {
  time: number;
  content: {
    type: string;
    content: {
      status?: string;
      start_time: number;
      end_time: number;
      rewards: Record<string, number>;
      targets?: {
        status?: string;
        tx?: string | null;
        targets: Record<string, number>;
      }[];
    };
  };
};

function normalizeStatus(s: string | undefined): "pending" | "confirmed" | "failed" {
  if (s === "confirmed" || s === "success") return "confirmed";
  if (s === "failed") return "failed";
  return "pending";
}

/** Latest credit-rewards-distribution cycle, or null if none published yet. */
export async function getDistributions(): Promise<DistributionCycle | null> {
  const params = new URLSearchParams({
    msgType: "POST",
    addresses: FOUNDATION_DISTRIBUTION_SENDER,
    pagination: "20",
    sort_order: "-1",
  });
  const url = `${getAlephBaseUrl()}/api/v0/messages.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Aleph API error: ${res.status}`);
  const data = (await res.json()) as { messages: DistMessage[] };

  const latest = data.messages.find(
    (m) =>
      m.content?.type === DISTRIBUTION_POST_TYPE &&
      m.content?.content?.status === "distribution",
  );
  if (!latest) return null;

  const inner = latest.content.content;
  const rewards = new Map<string, number>();
  for (const [addr, aleph] of Object.entries(inner.rewards ?? {})) {
    rewards.set(addr.toLowerCase(), aleph);
  }
  const onChain = new Map<
    string,
    { txHash: string | null; status: "pending" | "confirmed" | "failed" }
  >();
  for (const batch of inner.targets ?? []) {
    const status = normalizeStatus(batch.status);
    const txHash = batch.tx ?? null;
    for (const addr of Object.keys(batch.targets ?? {})) {
      onChain.set(addr.toLowerCase(), { txHash, status });
    }
  }
  return {
    startSec: inner.start_time,
    endSec: inner.end_time,
    rewards,
    onChain,
  };
}
