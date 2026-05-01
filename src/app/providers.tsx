"use client";

import { QueryClient, type Query } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useState, type ReactNode } from "react";
import { CURRENT_VERSION } from "@/changelog";

const PERSIST_KEY = "scheduler-dashboard-rq";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Only persist credit-expenses — it's the slow ~20s query.
// node-state is excluded because its data contains Map instances
// that don't survive JSON serialization (Maps roundtrip as {}, losing
// entries and .get()/.values() methods). It's a small/fast request that
// refetches on each page load anyway.
const PERSISTED_QUERY_PREFIXES: ReadonlyArray<string> = [
  "credit-expenses",
];

function shouldDehydrateQuery(query: Query): boolean {
  // Only persist successful queries that we explicitly opted into. Skipping
  // pending/error states avoids rehydrating partial state objects that
  // React Query's optimistic-result path can produce while a query is
  // still in flight.
  if (query.state.status !== "success") return false;
  const head = query.queryKey[0];
  return typeof head === "string" && PERSISTED_QUERY_PREFIXES.includes(head);
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 2,
          },
        },
      }),
  );

  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      key: PERSIST_KEY,
    }),
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: ONE_DAY_MS,
        buster: CURRENT_VERSION,
        dehydrateOptions: {
          shouldDehydrateQuery,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
