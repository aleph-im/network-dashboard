import {
  getCreditApiBaseUrl,
  getAlephBaseUrl,
  FOUNDATION_DISTRIBUTION_SENDER,
  DISTRIBUTION_POST_TYPE,
} from "@/api/client";
import type {
  AddressRewards,
  BySource,
  CreditRoleFull,
  DistributionCycle,
  WageRoleFull,
} from "@/api/rewards-types";

/** The API omits breakdown keys (or whole role objects) when a source is zero —
 *  e.g. an address with no credit revenue gets `full: { credit_revenue: {} }`.
 *  The wire shape is sparse; we normalize to dense zeros before it reaches the app. */
type TimeSeriesResponse = {
  total: {
    totals?: { aleph?: number };
    bySource?: Partial<BySource>;
    full?: {
      credit_revenue?: Partial<CreditRoleFull>;
      holder_tier?: Partial<CreditRoleFull>;
      wage_subsidy?: Partial<WageRoleFull>;
    };
  };
};

function denseCreditRole(r: Partial<CreditRoleFull> | undefined): CreditRoleFull {
  return {
    execution_crn: r?.execution_crn ?? 0,
    execution_ccn: r?.execution_ccn ?? 0,
    execution_staker: r?.execution_staker ?? 0,
    storage_ccn: r?.storage_ccn ?? 0,
    storage_staker: r?.storage_staker ?? 0,
  };
}

function denseWageRole(r: Partial<WageRoleFull> | undefined): WageRoleFull {
  return { crn: r?.crn ?? 0, ccn: r?.ccn ?? 0, staker: r?.staker ?? 0 };
}

/**
 * Truncate an epoch-seconds bound to whole-hour granularity (`YYYY-MM-DDTHH`).
 * credit.aleph.im caches results on hour boundaries; sending sub-hour precision
 * (`…T09:37:23.000Z`) forces it to compute intra-hour sub-ranges, which is slow.
 * An hour-granular bound is served from cache and returns instantly.
 */
function toHourBound(sec: number): string {
  return new Date(Math.floor(sec) * 1000).toISOString().slice(0, 13);
}

/** Authoritative per-address rewards over [fromSec, toSec]. Single address only. */
export async function getRewardsTimeSeries(
  address: string,
  fromSec: number,
  toSec: number,
): Promise<AddressRewards> {
  const addr = address.toLowerCase();
  const params = new URLSearchParams({
    from: toHourBound(fromSec),
    to: toHourBound(toSec),
    address: addr,
    detail: "2",
    bucketSize: "1y", // single aggregate bucket; we read `total`
  });
  const url = `${getCreditApiBaseUrl()}/api/v0/rewards/time-series?${params}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new Error("Rewards API (credit.aleph.im) unreachable (timeout)");
  }
  if (!res.ok) throw new Error(`Rewards API error: ${res.status}`);
  const data = (await res.json()) as TimeSeriesResponse;
  const t = data.total;
  return {
    address: addr,
    totalAleph: t.totals?.aleph ?? 0,
    bySource: {
      credit_revenue: t.bySource?.credit_revenue ?? 0,
      holder_tier: t.bySource?.holder_tier ?? 0,
      wage_subsidy: t.bySource?.wage_subsidy ?? 0,
    },
    full: {
      credit_revenue: denseCreditRole(t.full?.credit_revenue),
      holder_tier: denseCreditRole(t.full?.holder_tier),
      wage_subsidy: denseWageRole(t.full?.wage_subsidy),
    },
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
    contentTypes: DISTRIBUTION_POST_TYPE,
    pagination: "50",
    sort_order: "-1",
  });
  const url = `${getAlephBaseUrl()}/api/v0/messages.json?${params}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new Error("Aleph API (distribution messages) unreachable (timeout)");
  }
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
