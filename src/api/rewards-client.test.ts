import { describe, it, expect, vi, afterEach } from "vitest";
import { getRewardsTimeSeries } from "@/api/rewards-client";

const SAMPLE = {
  request: { addresses: ["0xabc"], detail: 2 },
  algoVersion: "v2",
  total: {
    totals: { aleph: 254680.79 },
    bySource: { credit_revenue: 194246.77, holder_tier: 15635.22, wage_subsidy: 44798.79 },
    full: {
      credit_revenue: { execution_ccn: 60722.2, execution_crn: 128083.3, execution_staker: 5433.0, storage_ccn: 7.8, storage_staker: 0.35 },
      holder_tier: { execution_ccn: 6627.7, execution_crn: 8460.6, execution_staker: 546.7, storage_ccn: 0.13, storage_staker: 0.006 },
      wage_subsidy: { ccn: 23693.2, crn: 18020.0, staker: 3085.5 },
    },
  },
  buckets: [],
};

afterEach(() => vi.restoreAllMocks());

describe("getRewardsTimeSeries", () => {
  it("maps the total block to AddressRewards", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(SAMPLE), { status: 200 }));

    const r = await getRewardsTimeSeries("0xABC", 1777593611, 1780306643);

    expect(r.address).toBe("0xabc");
    expect(r.totalAleph).toBeCloseTo(254680.79);
    expect(r.bySource.wage_subsidy).toBeCloseTo(44798.79);
    expect(r.full.credit_revenue.execution_crn).toBeCloseTo(128083.3);

    const url = (fetchSpy.mock.calls[0]![0] as string);
    expect(url).toContain("/api/v0/rewards/time-series");
    expect(url).toContain("address=0xabc"); // lowercased
    expect(url).toContain("detail=2");
  });

  it("throws on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    await expect(getRewardsTimeSeries("0xabc", 1, 2)).rejects.toThrow(/Rewards API error: 500/);
  });
});
