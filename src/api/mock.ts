import type {
  Node,
  NodeDetail,
  OverviewStats,
  SchedulerEvent,
  VM,
  VMDetail,
  VMSummary,
} from "@/api/types";

// --- Nodes (15 total: 9 healthy, 3 degraded, 2 offline, 1 unknown) ---

export const mockNodes: Node[] = [
  {
    hash: "a1b2c3d4e5f6",
    address: "https://node-01.aleph.cloud",
    status: "healthy",
    resources: {
      cpu: 32,
      memory: 128,
      disk: 2000,
      cpuUsage: 45,
      memoryUsage: 62,
      diskUsage: 38,
    },
    vmCount: 5,
    lastSeen: "2026-03-01T14:30:00Z",
  },
  {
    hash: "b2c3d4e5f6a7",
    address: "https://node-02.aleph.cloud",
    status: "healthy",
    resources: {
      cpu: 64,
      memory: 256,
      disk: 4000,
      cpuUsage: 28,
      memoryUsage: 41,
      diskUsage: 22,
    },
    vmCount: 8,
    lastSeen: "2026-03-01T14:29:55Z",
  },
  {
    hash: "c3d4e5f6a7b8",
    address: "https://node-03.aleph.cloud",
    status: "healthy",
    resources: {
      cpu: 16,
      memory: 64,
      disk: 1000,
      cpuUsage: 72,
      memoryUsage: 85,
      diskUsage: 55,
    },
    vmCount: 3,
    lastSeen: "2026-03-01T14:30:02Z",
  },
  {
    hash: "d4e5f6a7b8c9",
    address: "https://node-04.aleph.cloud",
    status: "healthy",
    resources: {
      cpu: 32,
      memory: 128,
      disk: 2000,
      cpuUsage: 15,
      memoryUsage: 22,
      diskUsage: 18,
    },
    vmCount: 2,
    lastSeen: "2026-03-01T14:29:58Z",
  },
  {
    hash: "e5f6a7b8c9d0",
    address: "https://node-05.aleph.cloud",
    status: "healthy",
    resources: {
      cpu: 48,
      memory: 192,
      disk: 3000,
      cpuUsage: 55,
      memoryUsage: 48,
      diskUsage: 42,
    },
    vmCount: 6,
    lastSeen: "2026-03-01T14:30:01Z",
  },
  {
    hash: "f6a7b8c9d0e1",
    address: "https://node-06.aleph.cloud",
    status: "healthy",
    resources: {
      cpu: 32,
      memory: 128,
      disk: 2000,
      cpuUsage: 38,
      memoryUsage: 55,
      diskUsage: 30,
    },
    vmCount: 4,
    lastSeen: "2026-03-01T14:29:50Z",
  },
  {
    hash: "a7b8c9d0e1f2",
    address: "https://node-07.aleph.cloud",
    status: "healthy",
    resources: {
      cpu: 64,
      memory: 256,
      disk: 4000,
      cpuUsage: 20,
      memoryUsage: 35,
      diskUsage: 15,
    },
    vmCount: 3,
    lastSeen: "2026-03-01T14:30:00Z",
  },
  {
    hash: "b8c9d0e1f2a3",
    address: "https://node-08.aleph.cloud",
    status: "healthy",
    resources: {
      cpu: 16,
      memory: 64,
      disk: 1000,
      cpuUsage: 88,
      memoryUsage: 92,
      diskUsage: 70,
    },
    vmCount: 4,
    lastSeen: "2026-03-01T14:29:45Z",
  },
  {
    hash: "c9d0e1f2a3b4",
    address: "https://node-09.aleph.cloud",
    status: "healthy",
    resources: {
      cpu: 32,
      memory: 128,
      disk: 2000,
      cpuUsage: 60,
      memoryUsage: 70,
      diskUsage: 45,
    },
    vmCount: 5,
    lastSeen: "2026-03-01T14:30:03Z",
  },
  {
    hash: "d0e1f2a3b4c5",
    address: "https://node-10.aleph.cloud",
    status: "degraded",
    resources: {
      cpu: 32,
      memory: 128,
      disk: 2000,
      cpuUsage: 95,
      memoryUsage: 88,
      diskUsage: 82,
    },
    vmCount: 3,
    lastSeen: "2026-03-01T14:28:30Z",
  },
  {
    hash: "e1f2a3b4c5d6",
    address: "https://node-11.aleph.cloud",
    status: "degraded",
    resources: {
      cpu: 16,
      memory: 64,
      disk: 1000,
      cpuUsage: 78,
      memoryUsage: 95,
      diskUsage: 90,
    },
    vmCount: 2,
    lastSeen: "2026-03-01T14:27:00Z",
  },
  {
    hash: "f2a3b4c5d6e7",
    address: "https://node-12.aleph.cloud",
    status: "degraded",
    resources: {
      cpu: 48,
      memory: 192,
      disk: 3000,
      cpuUsage: 92,
      memoryUsage: 85,
      diskUsage: 78,
    },
    vmCount: 1,
    lastSeen: "2026-03-01T14:25:00Z",
  },
  {
    hash: "a3b4c5d6e7f8",
    address: "https://node-13.aleph.cloud",
    status: "offline",
    resources: {
      cpu: 32,
      memory: 128,
      disk: 2000,
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 45,
    },
    vmCount: 0,
    lastSeen: "2026-03-01T12:00:00Z",
  },
  {
    hash: "b4c5d6e7f8a9",
    address: "https://node-14.aleph.cloud",
    status: "offline",
    resources: {
      cpu: 16,
      memory: 64,
      disk: 1000,
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 30,
    },
    vmCount: 0,
    lastSeen: "2026-02-28T22:15:00Z",
  },
  {
    hash: "c5d6e7f8a9b0",
    address: "https://node-15.aleph.cloud",
    status: "unknown",
    resources: {
      cpu: 32,
      memory: 128,
      disk: 2000,
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
    },
    vmCount: 0,
    lastSeen: "2026-02-28T18:00:00Z",
  },
];

// --- VMs (40 total) ---
// 25 scheduled+observed (normal)
// 5 scheduled-only
// 3 orphaned
// 4 missing
// 3 unschedulable

function makeResources(
  cpu: number,
  memory: number,
  disk: number,
): VM["requirements"] {
  return { cpu, memory, disk, cpuUsage: 0, memoryUsage: 0, diskUsage: 0 };
}

export const mockVMs: VM[] = [
  // 25 normal VMs (scheduled + observed)
  ...[
    { h: "vm01a2b3c4d5e6", node: "a1b2c3d4e5f6", type: "instance" },
    { h: "vm02b3c4d5e6f7", node: "a1b2c3d4e5f6", type: "instance" },
    { h: "vm03c4d5e6f7a8", node: "a1b2c3d4e5f6", type: "program" },
    { h: "vm04d5e6f7a8b9", node: "a1b2c3d4e5f6", type: "instance" },
    { h: "vm05e6f7a8b9c0", node: "a1b2c3d4e5f6", type: "program" },
    { h: "vm06f7a8b9c0d1", node: "b2c3d4e5f6a7", type: "instance" },
    { h: "vm07a8b9c0d1e2", node: "b2c3d4e5f6a7", type: "instance" },
    { h: "vm08b9c0d1e2f3", node: "b2c3d4e5f6a7", type: "program" },
    { h: "vm09c0d1e2f3a4", node: "b2c3d4e5f6a7", type: "instance" },
    { h: "vm10d1e2f3a4b5", node: "b2c3d4e5f6a7", type: "instance" },
    { h: "vm11e2f3a4b5c6", node: "b2c3d4e5f6a7", type: "program" },
    { h: "vm12f3a4b5c6d7", node: "b2c3d4e5f6a7", type: "instance" },
    { h: "vm13a4b5c6d7e8", node: "b2c3d4e5f6a7", type: "program" },
    { h: "vm14b5c6d7e8f9", node: "c3d4e5f6a7b8", type: "instance" },
    { h: "vm15c6d7e8f9a0", node: "c3d4e5f6a7b8", type: "instance" },
    { h: "vm16d7e8f9a0b1", node: "c3d4e5f6a7b8", type: "program" },
    { h: "vm17e8f9a0b1c2", node: "d4e5f6a7b8c9", type: "instance" },
    { h: "vm18f9a0b1c2d3", node: "d4e5f6a7b8c9", type: "instance" },
    { h: "vm19a0b1c2d3e4", node: "e5f6a7b8c9d0", type: "instance" },
    { h: "vm20b1c2d3e4f5", node: "e5f6a7b8c9d0", type: "program" },
    { h: "vm21c2d3e4f5a6", node: "e5f6a7b8c9d0", type: "instance" },
    { h: "vm22d3e4f5a6b7", node: "e5f6a7b8c9d0", type: "instance" },
    { h: "vm23e4f5a6b7c8", node: "e5f6a7b8c9d0", type: "program" },
    { h: "vm24f5a6b7c8d9", node: "e5f6a7b8c9d0", type: "instance" },
    { h: "vm25a6b7c8d9e0", node: "f6a7b8c9d0e1", type: "instance" },
  ].map(
    (v): VM => ({
      hash: v.h,
      type: v.type,
      assignedNode: v.node,
      scheduledStatus: "scheduled",
      observedStatus: "observed",
      requirements: makeResources(
        v.type === "instance" ? 4 : 2,
        v.type === "instance" ? 8 : 4,
        v.type === "instance" ? 100 : 50,
      ),
    }),
  ),

  // 5 scheduled-only (not yet observed)
  ...[
    { h: "vm26b7c8d9e0f1", node: "f6a7b8c9d0e1", type: "instance" },
    { h: "vm27c8d9e0f1a2", node: "a7b8c9d0e1f2", type: "program" },
    { h: "vm28d9e0f1a2b3", node: "a7b8c9d0e1f2", type: "instance" },
    { h: "vm29e0f1a2b3c4", node: "b8c9d0e1f2a3", type: "program" },
    { h: "vm30f1a2b3c4d5", node: "c9d0e1f2a3b4", type: "instance" },
  ].map(
    (v): VM => ({
      hash: v.h,
      type: v.type,
      assignedNode: v.node,
      scheduledStatus: "scheduled",
      observedStatus: null,
      requirements: makeResources(
        v.type === "instance" ? 4 : 2,
        v.type === "instance" ? 8 : 4,
        v.type === "instance" ? 100 : 50,
      ),
    }),
  ),

  // 3 orphaned (observed on node but not in schedule)
  ...[
    { h: "vm31a2b3c4d5e6", node: "d0e1f2a3b4c5", type: "instance" },
    { h: "vm32b3c4d5e6f7", node: "d0e1f2a3b4c5", type: "program" },
    { h: "vm33c4d5e6f7a8", node: "e1f2a3b4c5d6", type: "instance" },
  ].map(
    (v): VM => ({
      hash: v.h,
      type: v.type,
      assignedNode: v.node,
      scheduledStatus: "orphaned",
      observedStatus: "observed",
      requirements: makeResources(4, 8, 100),
    }),
  ),

  // 4 missing (scheduled but node reports them absent)
  ...[
    { h: "vm34d5e6f7a8b9", node: "a3b4c5d6e7f8", type: "instance" },
    { h: "vm35e6f7a8b9c0", node: "a3b4c5d6e7f8", type: "program" },
    { h: "vm36f7a8b9c0d1", node: "b4c5d6e7f8a9", type: "instance" },
    { h: "vm37a8b9c0d1e2", node: "e1f2a3b4c5d6", type: "instance" },
  ].map(
    (v): VM => ({
      hash: v.h,
      type: v.type,
      assignedNode: v.node,
      scheduledStatus: "missing",
      observedStatus: null,
      requirements: makeResources(4, 8, 100),
    }),
  ),

  // 3 unschedulable (no node can satisfy requirements)
  ...[
    { h: "vm38b9c0d1e2f3", type: "instance" },
    { h: "vm39c0d1e2f3a4", type: "instance" },
    { h: "vm40d1e2f3a4b5", type: "program" },
  ].map(
    (v): VM => ({
      hash: v.h,
      type: v.type,
      assignedNode: null,
      scheduledStatus: "unschedulable",
      observedStatus: null,
      requirements: makeResources(128, 512, 10000),
    }),
  ),
];

// --- Events (50 total, across all categories) ---

export const mockEvents: SchedulerEvent[] = [
  // Registry events
  {
    id: "evt-001",
    type: "node_registered",
    category: "registry",
    timestamp: "2026-03-01T14:30:00Z",
    payload: { nodeHash: "a1b2c3d4e5f6", address: "https://node-01.aleph.cloud" },
  },
  {
    id: "evt-002",
    type: "node_deregistered",
    category: "registry",
    timestamp: "2026-03-01T14:28:00Z",
    payload: { nodeHash: "a3b4c5d6e7f8", reason: "staking_expired" },
  },
  {
    id: "evt-003",
    type: "node_staking_updated",
    category: "registry",
    timestamp: "2026-03-01T14:25:00Z",
    payload: {
      nodeHash: "b2c3d4e5f6a7",
      previousStake: 200000,
      newStake: 250000,
    },
  },
  {
    id: "evt-004",
    type: "node_registered",
    category: "registry",
    timestamp: "2026-03-01T14:20:00Z",
    payload: { nodeHash: "c5d6e7f8a9b0", address: "https://node-15.aleph.cloud" },
  },
  {
    id: "evt-005",
    type: "node_address_updated",
    category: "registry",
    timestamp: "2026-03-01T14:15:00Z",
    payload: {
      nodeHash: "e5f6a7b8c9d0",
      oldAddress: "https://node-05-old.aleph.cloud",
      newAddress: "https://node-05.aleph.cloud",
    },
  },

  // Node events
  {
    id: "evt-006",
    type: "node_status_changed",
    category: "node",
    timestamp: "2026-03-01T14:29:00Z",
    payload: {
      nodeHash: "d0e1f2a3b4c5",
      previousStatus: "healthy",
      newStatus: "degraded",
    },
  },
  {
    id: "evt-007",
    type: "node_resources_updated",
    category: "node",
    timestamp: "2026-03-01T14:28:30Z",
    payload: {
      nodeHash: "a1b2c3d4e5f6",
      cpuUsage: 45,
      memoryUsage: 62,
    },
  },
  {
    id: "evt-008",
    type: "node_status_changed",
    category: "node",
    timestamp: "2026-03-01T14:27:00Z",
    payload: {
      nodeHash: "a3b4c5d6e7f8",
      previousStatus: "degraded",
      newStatus: "offline",
    },
  },
  {
    id: "evt-009",
    type: "node_heartbeat_missed",
    category: "node",
    timestamp: "2026-03-01T14:26:00Z",
    payload: {
      nodeHash: "b4c5d6e7f8a9",
      missedCount: 5,
    },
  },
  {
    id: "evt-010",
    type: "node_resources_updated",
    category: "node",
    timestamp: "2026-03-01T14:25:30Z",
    payload: {
      nodeHash: "b2c3d4e5f6a7",
      cpuUsage: 28,
      memoryUsage: 41,
    },
  },
  {
    id: "evt-011",
    type: "node_status_changed",
    category: "node",
    timestamp: "2026-03-01T14:24:00Z",
    payload: {
      nodeHash: "e1f2a3b4c5d6",
      previousStatus: "healthy",
      newStatus: "degraded",
    },
  },
  {
    id: "evt-012",
    type: "node_heartbeat_missed",
    category: "node",
    timestamp: "2026-03-01T14:23:00Z",
    payload: {
      nodeHash: "a3b4c5d6e7f8",
      missedCount: 10,
    },
  },
  {
    id: "evt-013",
    type: "node_resources_updated",
    category: "node",
    timestamp: "2026-03-01T14:22:00Z",
    payload: {
      nodeHash: "c3d4e5f6a7b8",
      cpuUsage: 72,
      memoryUsage: 85,
    },
  },
  {
    id: "evt-014",
    type: "node_status_changed",
    category: "node",
    timestamp: "2026-03-01T14:21:00Z",
    payload: {
      nodeHash: "f2a3b4c5d6e7",
      previousStatus: "healthy",
      newStatus: "degraded",
    },
  },
  {
    id: "evt-015",
    type: "node_resources_updated",
    category: "node",
    timestamp: "2026-03-01T14:20:30Z",
    payload: {
      nodeHash: "d4e5f6a7b8c9",
      cpuUsage: 15,
      memoryUsage: 22,
    },
  },
  {
    id: "evt-016",
    type: "node_status_changed",
    category: "node",
    timestamp: "2026-03-01T14:19:00Z",
    payload: {
      nodeHash: "b4c5d6e7f8a9",
      previousStatus: "degraded",
      newStatus: "offline",
    },
  },
  {
    id: "evt-017",
    type: "node_heartbeat_missed",
    category: "node",
    timestamp: "2026-03-01T14:18:00Z",
    payload: {
      nodeHash: "c5d6e7f8a9b0",
      missedCount: 20,
    },
  },
  {
    id: "evt-018",
    type: "node_resources_updated",
    category: "node",
    timestamp: "2026-03-01T14:17:00Z",
    payload: {
      nodeHash: "e5f6a7b8c9d0",
      cpuUsage: 55,
      memoryUsage: 48,
    },
  },

  // VM events
  {
    id: "evt-019",
    type: "vm_scheduled",
    category: "vm",
    timestamp: "2026-03-01T14:29:30Z",
    payload: {
      vmHash: "vm26b7c8d9e0f1",
      nodeHash: "f6a7b8c9d0e1",
      vmType: "instance",
    },
  },
  {
    id: "evt-020",
    type: "vm_observed",
    category: "vm",
    timestamp: "2026-03-01T14:29:15Z",
    payload: { vmHash: "vm01a2b3c4d5e6", nodeHash: "a1b2c3d4e5f6" },
  },
  {
    id: "evt-021",
    type: "vm_orphaned_detected",
    category: "vm",
    timestamp: "2026-03-01T14:28:45Z",
    payload: { vmHash: "vm31a2b3c4d5e6", nodeHash: "d0e1f2a3b4c5" },
  },
  {
    id: "evt-022",
    type: "vm_missing_detected",
    category: "vm",
    timestamp: "2026-03-01T14:28:15Z",
    payload: { vmHash: "vm34d5e6f7a8b9", nodeHash: "a3b4c5d6e7f8" },
  },
  {
    id: "evt-023",
    type: "vm_unschedulable",
    category: "vm",
    timestamp: "2026-03-01T14:27:30Z",
    payload: {
      vmHash: "vm38b9c0d1e2f3",
      reason: "insufficient_resources",
      requiredCpu: 128,
      requiredMemory: 512,
    },
  },
  {
    id: "evt-024",
    type: "vm_scheduled",
    category: "vm",
    timestamp: "2026-03-01T14:26:30Z",
    payload: {
      vmHash: "vm27c8d9e0f1a2",
      nodeHash: "a7b8c9d0e1f2",
      vmType: "program",
    },
  },
  {
    id: "evt-025",
    type: "vm_observed",
    category: "vm",
    timestamp: "2026-03-01T14:26:00Z",
    payload: { vmHash: "vm06f7a8b9c0d1", nodeHash: "b2c3d4e5f6a7" },
  },
  {
    id: "evt-026",
    type: "vm_rescheduled",
    category: "vm",
    timestamp: "2026-03-01T14:25:00Z",
    payload: {
      vmHash: "vm14b5c6d7e8f9",
      fromNode: "d0e1f2a3b4c5",
      toNode: "c3d4e5f6a7b8",
      reason: "node_degraded",
    },
  },
  {
    id: "evt-027",
    type: "vm_missing_detected",
    category: "vm",
    timestamp: "2026-03-01T14:24:30Z",
    payload: { vmHash: "vm35e6f7a8b9c0", nodeHash: "a3b4c5d6e7f8" },
  },
  {
    id: "evt-028",
    type: "vm_orphaned_detected",
    category: "vm",
    timestamp: "2026-03-01T14:24:00Z",
    payload: { vmHash: "vm32b3c4d5e6f7", nodeHash: "d0e1f2a3b4c5" },
  },
  {
    id: "evt-029",
    type: "vm_scheduled",
    category: "vm",
    timestamp: "2026-03-01T14:23:30Z",
    payload: {
      vmHash: "vm28d9e0f1a2b3",
      nodeHash: "a7b8c9d0e1f2",
      vmType: "instance",
    },
  },
  {
    id: "evt-030",
    type: "vm_observed",
    category: "vm",
    timestamp: "2026-03-01T14:22:30Z",
    payload: { vmHash: "vm19a0b1c2d3e4", nodeHash: "e5f6a7b8c9d0" },
  },
  {
    id: "evt-031",
    type: "vm_unschedulable",
    category: "vm",
    timestamp: "2026-03-01T14:22:00Z",
    payload: {
      vmHash: "vm39c0d1e2f3a4",
      reason: "insufficient_resources",
      requiredCpu: 128,
      requiredMemory: 512,
    },
  },
  {
    id: "evt-032",
    type: "vm_missing_detected",
    category: "vm",
    timestamp: "2026-03-01T14:21:30Z",
    payload: { vmHash: "vm36f7a8b9c0d1", nodeHash: "b4c5d6e7f8a9" },
  },
  {
    id: "evt-033",
    type: "vm_scheduled",
    category: "vm",
    timestamp: "2026-03-01T14:20:00Z",
    payload: {
      vmHash: "vm29e0f1a2b3c4",
      nodeHash: "b8c9d0e1f2a3",
      vmType: "program",
    },
  },
  {
    id: "evt-034",
    type: "vm_orphaned_detected",
    category: "vm",
    timestamp: "2026-03-01T14:19:30Z",
    payload: { vmHash: "vm33c4d5e6f7a8", nodeHash: "e1f2a3b4c5d6" },
  },
  {
    id: "evt-035",
    type: "vm_observed",
    category: "vm",
    timestamp: "2026-03-01T14:19:00Z",
    payload: { vmHash: "vm17e8f9a0b1c2", nodeHash: "d4e5f6a7b8c9" },
  },
  {
    id: "evt-036",
    type: "vm_scheduled",
    category: "vm",
    timestamp: "2026-03-01T14:18:30Z",
    payload: {
      vmHash: "vm30f1a2b3c4d5",
      nodeHash: "c9d0e1f2a3b4",
      vmType: "instance",
    },
  },
  {
    id: "evt-037",
    type: "vm_unschedulable",
    category: "vm",
    timestamp: "2026-03-01T14:18:00Z",
    payload: {
      vmHash: "vm40d1e2f3a4b5",
      reason: "insufficient_disk",
      requiredDisk: 10000,
    },
  },
  {
    id: "evt-038",
    type: "vm_missing_detected",
    category: "vm",
    timestamp: "2026-03-01T14:17:30Z",
    payload: { vmHash: "vm37a8b9c0d1e2", nodeHash: "e1f2a3b4c5d6" },
  },
  {
    id: "evt-039",
    type: "vm_rescheduled",
    category: "vm",
    timestamp: "2026-03-01T14:16:00Z",
    payload: {
      vmHash: "vm25a6b7c8d9e0",
      fromNode: "e1f2a3b4c5d6",
      toNode: "f6a7b8c9d0e1",
      reason: "load_balancing",
    },
  },
  {
    id: "evt-040",
    type: "vm_observed",
    category: "vm",
    timestamp: "2026-03-01T14:15:30Z",
    payload: { vmHash: "vm10d1e2f3a4b5", nodeHash: "b2c3d4e5f6a7" },
  },

  // More registry events
  {
    id: "evt-041",
    type: "node_staking_updated",
    category: "registry",
    timestamp: "2026-03-01T14:14:00Z",
    payload: {
      nodeHash: "c3d4e5f6a7b8",
      previousStake: 150000,
      newStake: 175000,
    },
  },
  {
    id: "evt-042",
    type: "node_registered",
    category: "registry",
    timestamp: "2026-03-01T14:12:00Z",
    payload: { nodeHash: "f6a7b8c9d0e1", address: "https://node-06.aleph.cloud" },
  },
  {
    id: "evt-043",
    type: "node_address_updated",
    category: "registry",
    timestamp: "2026-03-01T14:10:00Z",
    payload: {
      nodeHash: "a7b8c9d0e1f2",
      oldAddress: "https://node-07-v1.aleph.cloud",
      newAddress: "https://node-07.aleph.cloud",
    },
  },

  // More node events
  {
    id: "evt-044",
    type: "node_resources_updated",
    category: "node",
    timestamp: "2026-03-01T14:08:00Z",
    payload: {
      nodeHash: "f6a7b8c9d0e1",
      cpuUsage: 38,
      memoryUsage: 55,
    },
  },
  {
    id: "evt-045",
    type: "node_status_changed",
    category: "node",
    timestamp: "2026-03-01T14:06:00Z",
    payload: {
      nodeHash: "c5d6e7f8a9b0",
      previousStatus: "healthy",
      newStatus: "unknown",
    },
  },
  {
    id: "evt-046",
    type: "node_resources_updated",
    category: "node",
    timestamp: "2026-03-01T14:04:00Z",
    payload: {
      nodeHash: "b8c9d0e1f2a3",
      cpuUsage: 88,
      memoryUsage: 92,
    },
  },

  // More VM events
  {
    id: "evt-047",
    type: "vm_observed",
    category: "vm",
    timestamp: "2026-03-01T14:02:00Z",
    payload: { vmHash: "vm22d3e4f5a6b7", nodeHash: "e5f6a7b8c9d0" },
  },
  {
    id: "evt-048",
    type: "vm_scheduled",
    category: "vm",
    timestamp: "2026-03-01T14:00:00Z",
    payload: {
      vmHash: "vm15c6d7e8f9a0",
      nodeHash: "c3d4e5f6a7b8",
      vmType: "instance",
    },
  },
  {
    id: "evt-049",
    type: "vm_rescheduled",
    category: "vm",
    timestamp: "2026-03-01T13:58:00Z",
    payload: {
      vmHash: "vm08b9c0d1e2f3",
      fromNode: "d0e1f2a3b4c5",
      toNode: "b2c3d4e5f6a7",
      reason: "node_degraded",
    },
  },
  {
    id: "evt-050",
    type: "vm_observed",
    category: "vm",
    timestamp: "2026-03-01T13:56:00Z",
    payload: { vmHash: "vm03c4d5e6f7a8", nodeHash: "a1b2c3d4e5f6" },
  },
];

// --- Overview Stats (computed from arrays) ---

export const mockOverviewStats: OverviewStats = {
  totalNodes: mockNodes.length,
  healthyNodes: mockNodes.filter((n) => n.status === "healthy").length,
  degradedNodes: mockNodes.filter((n) => n.status === "degraded").length,
  offlineNodes: mockNodes.filter((n) => n.status === "offline").length,
  totalVMs: mockVMs.length,
  scheduledVMs: mockVMs.filter(
    (v) => v.scheduledStatus === "scheduled",
  ).length,
  observedVMs: mockVMs.filter((v) => v.observedStatus === "observed").length,
  orphanedVMs: mockVMs.filter(
    (v) => v.scheduledStatus === "orphaned",
  ).length,
  missingVMs: mockVMs.filter(
    (v) => v.scheduledStatus === "missing",
  ).length,
  unschedulableVMs: mockVMs.filter(
    (v) => v.scheduledStatus === "unschedulable",
  ).length,
};

// --- Detail helpers ---

export function getMockNodeDetail(hash: string): NodeDetail {
  const node = mockNodes.find((n) => n.hash === hash);
  if (!node) {
    throw new Error(`Mock node not found: ${hash}`);
  }

  const vms: VMSummary[] = mockVMs
    .filter((v) => v.assignedNode === hash)
    .map((v) => ({
      hash: v.hash,
      type: v.type,
      scheduledStatus: v.scheduledStatus,
    }));

  const recentEvents = mockEvents
    .filter(
      (e) =>
        (e.payload["nodeHash"] as string | undefined) === hash,
    )
    .slice(0, 10);

  return {
    ...node,
    stakedAmount: 200000,
    vms,
    recentEvents,
  };
}

export function getMockVMDetail(hash: string): VMDetail {
  const vm = mockVMs.find((v) => v.hash === hash);
  if (!vm) {
    throw new Error(`Mock VM not found: ${hash}`);
  }

  const recentEvents = mockEvents
    .filter(
      (e) =>
        (e.payload["vmHash"] as string | undefined) === hash,
    )
    .slice(0, 10);

  const schedulingHistory = mockEvents
    .filter(
      (e) =>
        (e.payload["vmHash"] as string | undefined) === hash &&
        (e.type === "vm_scheduled" ||
          e.type === "vm_rescheduled" ||
          e.type === "vm_unschedulable"),
    );

  return {
    ...vm,
    schedulingHistory,
    recentEvents,
  };
}
