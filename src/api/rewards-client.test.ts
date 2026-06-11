import { describe, it, expect, vi, afterEach } from "vitest";
import { getRewardsTimeSeries, getDistributions } from "@/api/rewards-client";

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
    expect(url).not.toContain("from=1777593611"); // must not send epoch seconds
    // Bounds are truncated to whole-hour granularity (`YYYY-MM-DDTHH`) so the
    // upstream hour-cache is hit instead of computing intra-hour sub-ranges.
    expect(url).toContain("from=2026-05-01T00");
    expect(url).toContain("to=2026-06-01T09");
    expect(url).not.toContain("%3A"); // no sub-hour precision (encoded colon) leaks
  });

  it("normalizes sparse full breakdowns to dense zeros", async () => {
    // Live shape for an address with zero credit revenue: the API returns
    // `credit_revenue: {}` and omits the other roles' missing keys. Reading
    // those as undefined produced NaN per-node figures downstream.
    const sparse = {
      total: {
        totals: { aleph: 3170.56 },
        bySource: { credit_revenue: 0, holder_tier: 1444.79, wage_subsidy: 1725.77 },
        full: {
          credit_revenue: {},
          holder_tier: { execution_crn: 1444.79 },
          wage_subsidy: { crn: 1725.77 },
        },
      },
      buckets: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(sparse), { status: 200 }),
    );

    const r = await getRewardsTimeSeries("0xabc", 1777593611, 1780306643);

    expect(r.full.credit_revenue.execution_crn).toBe(0);
    expect(r.full.credit_revenue.storage_staker).toBe(0);
    expect(r.full.holder_tier.execution_crn).toBeCloseTo(1444.79);
    expect(r.full.holder_tier.execution_ccn).toBe(0);
    expect(r.full.wage_subsidy.crn).toBeCloseTo(1725.77);
    expect(r.full.wage_subsidy.ccn).toBe(0);
    expect(r.full.wage_subsidy.staker).toBe(0);
  });

  it("throws on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    await expect(getRewardsTimeSeries("0xabc", 1, 2)).rejects.toThrow(/Rewards API error: 500/);
  });

  it("names the upstream in timeout errors (credit.aleph.im vs api2)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expect(getRewardsTimeSeries("0xabc", 1, 2)).rejects.toThrow(/credit\.aleph\.im/);
    await expect(getDistributions()).rejects.toThrow(/distribution messages/);
  });
});

const DIST_MSG = {
  messages: [
    {
      item_hash: "h1",
      time: 1780312916,
      channel: "FOUNDATION",
      content: {
        type: "credit-rewards-distribution",
        content: {
          status: "distribution",
          start_time: 1777593611,
          end_time: 1780306643,
          rewards: { "0x0062D7a318E64B4DF6563490F8DB2177bDADfc5F": 82.28 },
          targets: [
            {
              chain: "ETH",
              status: "pending",
              success: true,
              tx: "0xtx",
              targets: { "0x0062D7a318E64B4DF6563490F8DB2177bDADfc5F": 82.28 },
            },
          ],
        },
      },
    },
    {
      item_hash: "h0",
      time: 1779000000,
      channel: "FOUNDATION",
      content: { type: "staking-rewards-distribution", content: { status: "distribution" } },
    },
  ],
};

describe("getDistributions", () => {
  it("returns the latest credit-rewards-distribution cycle, ignoring legacy type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(DIST_MSG), { status: 200 }),
    );
    const cycle = await getDistributions();
    expect(cycle).not.toBeNull();
    expect(cycle!.startSec).toBe(1777593611);
    expect(cycle!.endSec).toBe(1780306643);
    expect(cycle!.rewards.get("0x0062d7a318e64b4df6563490f8db2177bdadfc5f")).toBeCloseTo(82.28);
    const oc = cycle!.onChain.get("0x0062d7a318e64b4df6563490f8db2177bdadfc5f");
    expect(oc!.txHash).toBe("0xtx");
    expect(oc!.status).toBe("pending");
  });

  it("returns null when no credit-rewards-distribution exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [DIST_MSG.messages[1]!] }), { status: 200 }),
    );
    expect(await getDistributions()).toBeNull();
  });
});
