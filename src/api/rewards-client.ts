import { getCreditApiBaseUrl } from "@/api/client";
import type { AddressRewards } from "@/api/rewards-types";

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
