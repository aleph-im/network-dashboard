import { useQuery } from "@tanstack/react-query";
import { getVM, getVMs } from "@/api/client";
import type { VMFilters } from "@/api/types";

export function useVMs(filters?: VMFilters) {
  return useQuery({
    queryKey: ["vms", filters],
    queryFn: () => getVMs(filters),
    refetchInterval: 30_000,
  });
}

export function useVM(hash: string) {
  return useQuery({
    queryKey: ["vm", hash],
    queryFn: () => getVM(hash),
    refetchInterval: 15_000,
    enabled: hash.length > 0,
  });
}
