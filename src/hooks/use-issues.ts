import { useMemo } from "react";
import { useVMs } from "@/hooks/use-vms";
import { useNodes } from "@/hooks/use-nodes";
import type { VM, Node, VmStatus } from "@/api/types";

export type DiscrepancyStatus = "orphaned" | "missing" | "unschedulable";

const DISCREPANCY_STATUSES = new Set<VmStatus>([
  "orphaned",
  "missing",
  "unschedulable",
]);

export type IssueVM = VM & {
  issueDescription: string;
};

export type IssueNode = {
  node: Node;
  orphanedCount: number;
  missingCount: number;
  totalVmCount: number;
  lastUpdated: string;
  discrepancyVMs: IssueVM[];
};

const ISSUE_DESCRIPTIONS: Record<DiscrepancyStatus, string> = {
  orphaned:
    "Running without schedule. Possible causes: failed migration cleanup, scheduler bug, or unauthorized execution.",
  missing:
    "Scheduled but not running. The VM should be active on its allocated node but cannot be found.",
  unschedulable:
    "Cannot be placed. No available node meets the resource requirements for this VM.",
};

const ISSUE_SHORT: Record<DiscrepancyStatus, string> = {
  orphaned: "Running without schedule",
  missing: "Scheduled but not running",
  unschedulable: "Cannot be placed",
};

export function getIssueDescription(status: DiscrepancyStatus): string {
  return ISSUE_DESCRIPTIONS[status];
}

export function getIssueShort(status: DiscrepancyStatus): string {
  return ISSUE_SHORT[status];
}

function isDiscrepancyStatus(
  status: VmStatus,
): status is DiscrepancyStatus {
  return DISCREPANCY_STATUSES.has(status);
}

export function useIssues() {
  const { data: allVMs, isLoading: vmsLoading } = useVMs();
  const { data: allNodes, isLoading: nodesLoading } = useNodes();

  const isLoading = vmsLoading || nodesLoading;

  const result = useMemo(() => {
    const vms = allVMs ?? [];
    const nodes = allNodes ?? [];
    const nodeMap = new Map(nodes.map((n) => [n.hash, n]));

    const issueVMs: IssueVM[] = vms
      .filter((v) => isDiscrepancyStatus(v.status))
      .map((v) => ({
        ...v,
        issueDescription: getIssueShort(
          v.status as DiscrepancyStatus,
        ),
      }));

    const issueNodeMap = new Map<string, IssueNode>();

    function getOrCreateIssueNode(hash: string): IssueNode | null {
      const existing = issueNodeMap.get(hash);
      if (existing) return existing;
      const node = nodeMap.get(hash);
      if (!node) return null;
      const entry: IssueNode = {
        node,
        orphanedCount: 0,
        missingCount: 0,
        totalVmCount: node.vmCount,
        lastUpdated: "",
        discrepancyVMs: [],
      };
      issueNodeMap.set(hash, entry);
      return entry;
    }

    for (const vm of issueVMs) {
      if (vm.status === "orphaned") {
        for (const nodeHash of vm.observedNodes) {
          const entry = getOrCreateIssueNode(nodeHash);
          if (entry) {
            entry.orphanedCount++;
            entry.discrepancyVMs.push(vm);
            if (!entry.lastUpdated || vm.updatedAt > entry.lastUpdated) {
              entry.lastUpdated = vm.updatedAt;
            }
          }
        }
      } else if (vm.status === "missing" && vm.allocatedNode) {
        const entry = getOrCreateIssueNode(vm.allocatedNode);
        if (entry) {
          entry.missingCount++;
          entry.discrepancyVMs.push(vm);
          if (!entry.lastUpdated || vm.updatedAt > entry.lastUpdated) {
            entry.lastUpdated = vm.updatedAt;
          }
        }
      }
    }

    const issueNodes = [...issueNodeMap.values()];

    const counts = {
      orphaned: 0,
      missing: 0,
      unschedulable: 0,
    };
    for (const vm of issueVMs) {
      counts[vm.status as DiscrepancyStatus]++;
    }

    return {
      issueVMs,
      issueNodes,
      counts,
      affectedNodeCount: issueNodeMap.size,
    };
  }, [allVMs, allNodes]);

  return { ...result, isLoading };
}
