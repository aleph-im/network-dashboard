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
        <>
          {/* Backdrop — below lg only */}
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSelectedVM(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto bg-surface p-4 shadow-lg lg:static lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none">
            <VMDetailPanel
              hash={selectedVM}
              onClose={() => setSelectedVM(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
