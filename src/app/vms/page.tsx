"use client";

import { useState } from "react";
import { VMTable } from "@/components/vm-table";
import { VMDetailPanel } from "@/components/vm-detail-panel";

export default function VMsPage() {
  const [selectedVM, setSelectedVM] = useState<string | null>(null);

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <VMTable onSelectVM={setSelectedVM} />
      </div>
      {selectedVM && (
        <div className="shrink-0">
          <VMDetailPanel
            hash={selectedVM}
            onClose={() => setSelectedVM(null)}
          />
        </div>
      )}
    </div>
  );
}
