import { type ReactNode } from "react";
import { Button } from "@aleph-front/ds/button";
import { Card } from "@aleph-front/ds/card";
import { CollapsibleSection } from "@/components/collapsible-section";

type FilterPanelProps = {
  open: boolean;
  activeCount: number;
  onReset: () => void;
  children: ReactNode;
};

export function FilterPanel({
  open,
  activeCount,
  onReset,
  children,
}: FilterPanelProps) {
  return (
    <CollapsibleSection open={open}>
      <Card className="mb-4">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Advanced Filters
          </span>
          <Button
            variant="text"
            size="xs"
            onClick={onReset}
            disabled={activeCount === 0}
            className="disabled:opacity-30"
          >
            Reset
            {activeCount > 0 && (
              <span className="ml-1 tabular-nums">
                ({activeCount})
              </span>
            )}
          </Button>
        </div>
        {children}
      </Card>
    </CollapsibleSection>
  );
}
