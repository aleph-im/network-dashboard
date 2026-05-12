import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getVMs } from "@/api/client";
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
