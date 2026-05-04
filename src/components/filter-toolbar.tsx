import { type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";
import { Button } from "@aleph-front/ds/button";
import { Input } from "@aleph-front/ds/input";


const ALL_SENTINEL = "__all__";

type StatusPill<S> = {
  value: S;
  label: string;
  tooltip?: string;
};

type FilterToolbarProps<S> = {
  statuses: StatusPill<S>[];
  activeStatus: S;
  onStatusChange: (status: S) => void;
  formatCount: (status: S) => string;
  filtersOpen?: boolean;
  onFiltersToggle?: () => void;
  activeFilterCount?: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  leading?: ReactNode;
  maxVisibleStatuses?: number;
};

function toTabValue<S>(value: S): string {
  return value == null ? ALL_SENTINEL : String(value);
}

export function FilterToolbar<S>({
  statuses,
  activeStatus,
  onStatusChange,
  formatCount,
  filtersOpen,
  onFiltersToggle,
  activeFilterCount,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  leading,
  maxVisibleStatuses,
}: FilterToolbarProps<S>): ReactNode {
  function handleTabChange(tabValue: string) {
    const match = statuses.find((s) => toTabValue(s.value) === tabValue);
    if (match) onStatusChange(match.value);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {leading && (
        <>
          {leading}
          <div className="mx-2 h-6 w-px bg-white/[0.08]" />
        </>
      )}
      <Tabs value={toTabValue(activeStatus)} onValueChange={handleTabChange} className="min-w-0 flex-1">
        <TabsList
          variant="underline"
          size="sm"
          overflow="collapse"
          {...(maxVisibleStatuses != null ? { maxVisible: maxVisibleStatuses } : {})}
        >
          {statuses.map((s, i) => (
            <TabsTrigger
              key={i}
              value={toTabValue(s.value)}
              title={s.tooltip}
            >
              {s.label}{" "}
              <span className="tabular-nums opacity-60">
                ({formatCount(s.value)})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {onFiltersToggle && (
        <Button
          variant="text"
          size="xs"
          onClick={onFiltersToggle}
          className="relative"
          aria-label="Toggle filters"
        >
          <svg
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4h18M6 8h12M9 12h6M11 16h2"
            />
          </svg>
          {activeFilterCount != null && activeFilterCount > 0 && !filtersOpen && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary-500" />
          )}
        </Button>
      )}
      <div className="relative ml-auto w-64">
        <svg
          className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <Input
          size="sm"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-12 pr-10"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
