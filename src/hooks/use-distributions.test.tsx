import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDistributions } from "@/hooks/use-distributions";
import * as client from "@/api/rewards-client";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useDistributions", () => {
  it("returns the latest cycle", async () => {
    vi.spyOn(client, "getDistributions").mockResolvedValue({
      startSec: 1,
      endSec: 2,
      rewards: new Map([["0xa", 5]]),
      onChain: new Map(),
    });
    const { result } = renderHook(() => useDistributions(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.endSec).toBe(2);
  });

  it("returns null when no distribution is published", async () => {
    vi.spyOn(client, "getDistributions").mockResolvedValue(null);
    const { result } = renderHook(() => useDistributions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("surfaces error state when the API call rejects", async () => {
    vi.spyOn(client, "getDistributions").mockRejectedValue(
      new Error("Aleph API error: 500"),
    );
    const { result } = renderHook(() => useDistributions(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
