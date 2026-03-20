import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getWalletMessages,
  getAuthorizations,
} from "@/api/client";
import { useNodes } from "@/hooks/use-nodes";
import { useVMs } from "@/hooks/use-vms";
import type {
  AuthorizationResponse,
  VM,
} from "@/api/types";

export type WalletVM = {
  hash: string;
  name: string | null;
  type: string;
  chain: string;
  createdAt: number;
  schedulerStatus: VM["status"] | null;
  allocatedNode: string | null;
  updatedAt: string | null;
};

export type ActivityItem = {
  hash: string;
  type: string;
  name: string | null;
  chain: string;
  sender: string;
  time: number;
  paymentType: string | null;
  schedulerStatus: VM["status"] | null;
  explorerUrl: string;
};

export function useWalletNodes(address: string) {
  const { data: allNodes, isLoading } = useNodes();

  const nodes = useMemo(() => {
    if (!allNodes || !address) return [];
    return allNodes.filter(
      (n) =>
        n.owner?.toLowerCase() === address.toLowerCase(),
    );
  }, [allNodes, address]);

  return { nodes, isLoading };
}

export function useWalletVMs(address: string) {
  const { data: messages, isLoading: messagesLoading } =
    useQuery({
      queryKey: ["wallet-vms", address],
      queryFn: () =>
        getWalletMessages(address, [
          "INSTANCE",
          "PROGRAM",
        ]),
      enabled: address.length > 0,
      staleTime: 5 * 60_000,
      refetchInterval: false,
    });

  const { data: allVMs, isLoading: vmsLoading } = useVMs();

  const walletVMs = useMemo(() => {
    if (!messages) return [];
    const vmMap = new Map(
      (allVMs ?? []).map((v) => [v.hash, v]),
    );
    return messages.map(
      (msg): WalletVM => {
        const scheduled = vmMap.get(msg.item_hash);
        return {
          hash: msg.item_hash,
          name: msg.content?.metadata?.name ?? null,
          type: msg.type,
          chain: msg.chain,
          createdAt: msg.time,
          schedulerStatus: scheduled?.status ?? null,
          allocatedNode: scheduled?.allocatedNode ?? null,
          updatedAt: scheduled?.updatedAt ?? null,
        };
      },
    );
  }, [messages, allVMs]);

  return {
    walletVMs,
    isLoading: messagesLoading || vmsLoading,
  };
}

export function useWalletActivity(address: string) {
  const queryClient = useQueryClient();

  const {
    data: messages,
    isLoading,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["wallet-activity", address],
    queryFn: () => getWalletMessages(address),
    enabled: address.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });

  const { data: allVMs } = useVMs();

  const items = useMemo(() => {
    if (!messages) return [];
    const vmMap = new Map(
      (allVMs ?? []).map((v) => [v.hash, v]),
    );
    return messages
      .map(
        (msg): ActivityItem => {
          const isCompute =
            msg.type === "INSTANCE" ||
            msg.type === "PROGRAM";
          const scheduled = isCompute
            ? vmMap.get(msg.item_hash)
            : null;
          return {
            hash: msg.item_hash,
            type: msg.type,
            name: msg.content?.metadata?.name ?? null,
            chain: msg.chain,
            sender: msg.sender,
            time: msg.time,
            paymentType: msg.content?.payment?.type ?? null,
            schedulerStatus: scheduled?.status ?? null,
            explorerUrl: `https://explorer.aleph.cloud/address/${msg.chain}/${msg.sender}/message/${msg.type}/${msg.item_hash}`,
          };
        },
      )
      .sort((a, b) => b.time - a.time);
  }, [messages, allVMs]);

  function refresh() {
    queryClient.invalidateQueries({
      queryKey: ["wallet-activity", address],
    });
  }

  return { items, isLoading, refresh, dataUpdatedAt };
}

export function useAuthorizations(
  address: string,
  direction: "granted" | "received",
) {
  return useQuery<AuthorizationResponse>({
    queryKey: ["authorizations", direction, address],
    queryFn: () => getAuthorizations(address, direction),
    enabled: address.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });
}
