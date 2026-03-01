"use client";

import { useState } from "react";
import { NodeTable } from "@/components/node-table";
import { NodeDetailPanel } from "@/components/node-detail-panel";

export default function NodesPage() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <NodeTable onSelectNode={setSelectedNode} />
      </div>
      {selectedNode && (
        <div className="shrink-0">
          <NodeDetailPanel
            hash={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      )}
    </div>
  );
}
