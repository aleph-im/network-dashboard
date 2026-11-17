import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getVMs, getCreditExpenses, getExecutionExpenses } from "@/api/client";
import type { PaginatedResponse, ApiVmRow } from "@/api/types";

function emptyPage(): PaginatedResponse<ApiVmRow> {
  return {
    items: [],
    pagination: {
      page: 1,
      page_size: 200,
      total_items: 0,
      total_pages: 1,
    },
  };
}

describe("getVMs URL construction", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(emptyPage()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    // Pin the base URL so we don't depend on env state.
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function lastUrl(): string {
    const call = fetchSpy.mock.calls.at(-1);
    if (!call) throw new Error("fetch not called");
    return String(call[0]);
  }

  it("hits /api/v1/vms with no query string when no filters set", async () => {
    await getVMs();
    expect(lastUrl()).toBe(
      "http://api.test/api/v1/vms?page=1&page_size=200",
    );
  });

  it("appends owners= when owner is set", async () => {
    await getVMs({ owner: "0xabc" });
    const url = new URL(lastUrl());
    expect(url.pathname).toBe("/api/v1/vms");
    expect(url.searchParams.get("owners")).toBe("0xabc");
  });

  it("appends scheduling_status= when schedulingStatus is set", async () => {
    await getVMs({ schedulingStatus: "dispatched" });
    const url = new URL(lastUrl());
    expect(url.searchParams.get("scheduling_status")).toBe("dispatched");
  });

  it("appends status= when status is set", async () => {
    await getVMs({ status: "missing" });
    const url = new URL(lastUrl());
    expect(url.searchParams.get("status")).toBe("missing");
  });

  it("combines owner + status + schedulingStatus", async () => {
    await getVMs({
      owner: "0xdeadbeef",
      status: "missing",
      schedulingStatus: "dispatched",
    });
    const url = new URL(lastUrl());
    expect(url.searchParams.get("owners")).toBe("0xdeadbeef");
    expect(url.searchParams.get("status")).toBe("missing");
    expect(url.searchParams.get("scheduling_status")).toBe("dispatched");
  });

  it("does not append owners= when owner is empty string", async () => {
    await getVMs({ owner: "" });
    const url = new URL(lastUrl());
    expect(url.searchParams.has("owners")).toBe(false);
  });
});

const EXPENSE_SENDER_HISTORICAL =
  "0x6aeaEEb08720DEc9d6dae1A8fc49344Dd99391Ac";
const EXPENSE_SENDER_CURRENT =
  "0x7173A783Fa40c609d78aD450Ee4b4aFb697cE254";
const EXPENSE_SENDERS = EXPENSE_SENDER_CURRENT;
const ROTATION_SEC = Date.UTC(2026, 9, 22) / 1000;

function expenseMessage(
  sender: string,
  time: number,
  tag: string,
  extra: { ref?: string; contentTime?: number } = {},
) {
  return {
    item_hash: `${sender}-${time}-${tag}`,
    sender,
    time,
    content: {
      ref: extra.ref,
      time: extra.contentTime,
      content: {
        tags: [tag],
        expense: {
          amount: 1,
          count: 1,
          credit_price_aleph: 1,
          credit_price_usdc: 1,
          credits: [],
          start_date: 0,
          end_date: 0,
        },
      },
    },
  };
}

function firstFetchUrl(fetchSpy: ReturnType<typeof vi.spyOn>): URL {
  const call = fetchSpy.mock.calls[0];
  if (!call) throw new Error("fetch not called");
  return new URL(String(call[0]));
}

describe("getExecutionExpenses", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requests only execution-tagged expense messages with a bounded window", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );
    await getExecutionExpenses(1781000000, 1781086400);
    const url = firstFetchUrl(fetchSpy);
    expect(url.searchParams.get("tags")).toBe("type_execution");
    expect(url.searchParams.get("contentTypes")).toBe("aleph_credit_expense");
    expect(url.searchParams.get("startDate")).toBe("1781000000");
    expect(url.searchParams.get("endDate")).toBe("1781086400");
    expect(url.searchParams.get("addresses")).toBe(EXPENSE_SENDERS);
  });

  it("drops messages from the previous signer", async () => {
    const messages = [
      expenseMessage(
        EXPENSE_SENDER_HISTORICAL,
        ROTATION_SEC - 3600,
        "type_execution",
      ),
      expenseMessage(
        EXPENSE_SENDER_HISTORICAL,
        ROTATION_SEC + 3600,
        "type_execution",
      ),
      expenseMessage(
        EXPENSE_SENDER_CURRENT,
        ROTATION_SEC + 3600,
        "type_execution",
      ),
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages }), { status: 200 }),
    );
    const expenses = await getExecutionExpenses(
      ROTATION_SEC - 86400,
      ROTATION_SEC + 86400,
    );
    expect(expenses.map((e) => e.hash)).toEqual([
      `${EXPENSE_SENDER_CURRENT}-${ROTATION_SEC + 3600}-type_execution`,
    ]);
  });
});

describe("getCreditExpenses", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requests only the current expense signer", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );
    await getCreditExpenses(1781000000, 1781086400);
    const url = firstFetchUrl(fetchSpy);
    expect(url.pathname).toBe("/api/v0/messages.json");
    expect(url.searchParams.get("contentTypes")).toBe("aleph_credit_expense");
    expect(url.searchParams.get("startDate")).toBe("1781000000");
    expect(url.searchParams.get("endDate")).toBe("1781086400");
    expect(url.searchParams.get("addresses")).toBe(EXPENSE_SENDERS);
  });

  it("drops messages from the previous signer", async () => {
    const messages = [
      expenseMessage(
        EXPENSE_SENDER_HISTORICAL,
        ROTATION_SEC - 3600,
        "type_storage",
      ),
      expenseMessage(
        EXPENSE_SENDER_HISTORICAL,
        ROTATION_SEC + 3600,
        "type_storage",
      ),
      expenseMessage(
        EXPENSE_SENDER_CURRENT,
        ROTATION_SEC + 3600,
        "type_storage",
      ),
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages }), { status: 200 }),
    );
    const expenses = await getCreditExpenses(
      ROTATION_SEC - 86400,
      ROTATION_SEC + 86400,
    );
    expect(expenses.map((e) => e.hash)).toEqual([
      `${EXPENSE_SENDER_CURRENT}-${ROTATION_SEC + 3600}-type_storage`,
    ]);
  });

  it("drops new-signer copies that were stamped with the posting time", async () => {
    const messages = [
      expenseMessage(
        EXPENSE_SENDER_CURRENT,
        ROTATION_SEC + 3600,
        "type_storage",
        { ref: "misdated", contentTime: ROTATION_SEC - 3600 },
      ),
      expenseMessage(
        EXPENSE_SENDER_CURRENT,
        ROTATION_SEC - 3600,
        "type_storage",
        { ref: "backdated", contentTime: ROTATION_SEC - 3600 },
      ),
      expenseMessage(
        EXPENSE_SENDER_CURRENT,
        ROTATION_SEC + 7200,
        "type_storage",
      ),
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages }), { status: 200 }),
    );
    const expenses = await getCreditExpenses(
      ROTATION_SEC - 86400,
      ROTATION_SEC + 86400,
    );
    expect(expenses.map((e) => e.hash)).toEqual([
      `${EXPENSE_SENDER_CURRENT}-${ROTATION_SEC - 3600}-type_storage`,
      `${EXPENSE_SENDER_CURRENT}-${ROTATION_SEC + 7200}-type_storage`,
    ]);
  });
});
