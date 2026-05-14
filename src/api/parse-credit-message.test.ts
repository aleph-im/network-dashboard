import { describe, expect, it } from "vitest";
import { parseCreditMessage } from "@/api/client";

type WireEntry = {
  address: string;
  amount: number;
  price: number;
  ref: string;
  time: number;
  node_id?: string;
  execution_id?: string;
};

function makeMessage(opts: {
  tags?: string[];
  creditPriceAleph?: number;
  credits?: WireEntry[];
  hold?: WireEntry[];
  holdPresent?: boolean;
}): Parameters<typeof parseCreditMessage>[0] {
  return {
    item_hash: "msg1",
    time: 1778779834,
    content: {
      content: {
        tags: opts.tags ?? ["credit_expense", "type_execution"],
        expense: {
          amount: 0,
          count: opts.credits?.length ?? 0,
          credit_price_aleph: opts.creditPriceAleph ?? 5e-5,
          credit_price_usdc: 1e-6,
          credits: opts.credits ?? [],
          ...(opts.holdPresent === false ? {} : { hold: opts.hold ?? [] }),
          start_date: 0,
          end_date: 0,
        },
      },
    },
  };
}

const sampleCredit: WireEntry = {
  ref: "exec-credit",
  time: 3600,
  price: 15.83,
  amount: 56_991,
  address: "0xCustomer",
  node_id: "crn1",
  execution_id: "vm-credit",
};

const sampleHold: WireEntry = {
  ref: "exec-hold",
  time: 3600,
  price: 6.11,
  amount: 21_996,
  address: "0xLegacyHolder",
  node_id: "crn1",
  execution_id: "vm-hold",
};

describe("parseCreditMessage", () => {
  it("returns null for messages without storage/execution tags", () => {
    const msg = makeMessage({ tags: ["credit_expense"] });
    expect(parseCreditMessage(msg)).toBeNull();
  });

  it("parses credit entries and tags them with source=credits", () => {
    const parsed = parseCreditMessage(
      makeMessage({ credits: [sampleCredit] }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.credits).toHaveLength(1);
    expect(parsed!.credits[0]!.source).toBe("credits");
    expect(parsed!.credits[0]!.alephCost).toBeCloseTo(56_991 * 5e-5);
    expect(parsed!.totalAleph).toBeCloseTo(56_991 * 5e-5);
  });

  it("merges hold entries into credits with source=hold", () => {
    const parsed = parseCreditMessage(
      makeMessage({ credits: [sampleCredit], hold: [sampleHold] }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.credits).toHaveLength(2);
    const sources = parsed!.credits.map((c) => c.source);
    expect(sources).toEqual(["credits", "hold"]);

    const expected = (56_991 + 21_996) * 5e-5;
    expect(parsed!.totalAleph).toBeCloseTo(expected);
  });

  it("treats missing hold key the same as empty array", () => {
    const parsed = parseCreditMessage(
      makeMessage({ credits: [sampleCredit], holdPresent: false }),
    );
    expect(parsed!.credits).toHaveLength(1);
    expect(parsed!.credits[0]!.source).toBe("credits");
  });

  it("converts hold entries with the same credit_price_aleph", () => {
    const parsed = parseCreditMessage(
      makeMessage({
        creditPriceAleph: 1e-4,
        hold: [sampleHold],
      }),
    );
    expect(parsed!.credits[0]!.alephCost).toBeCloseTo(21_996 * 1e-4);
    expect(parsed!.totalAleph).toBeCloseTo(21_996 * 1e-4);
  });

  it("ignores expense.rewards if it ever appears (defensive)", () => {
    // The amended schema removed `rewards`, but if a stale message slips
    // through we must not double-count it.
    const msg = makeMessage({ credits: [sampleCredit], hold: [sampleHold] });
    // Inject a bogus rewards field — should be ignored entirely.
    (
      msg.content.content.expense as unknown as { rewards: WireEntry[] }
    ).rewards = [sampleHold];

    const parsed = parseCreditMessage(msg);
    expect(parsed!.credits).toHaveLength(2);
  });

  it("propagates source through to executionId/nodeId for downstream attribution", () => {
    const parsed = parseCreditMessage(
      makeMessage({ credits: [sampleCredit], hold: [sampleHold] })
    );
    const holdEntry = parsed!.credits.find((c) => c.source === "hold");
    expect(holdEntry!.executionId).toBe("vm-hold");
    expect(holdEntry!.nodeId).toBe("crn1");
  });
});
