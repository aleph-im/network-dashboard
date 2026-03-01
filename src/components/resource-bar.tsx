"use client";

type ResourceBarProps = {
  value: number;
  label: string;
};

function barColor(pct: number): string {
  if (pct >= 90) return "var(--color-error-500)";
  if (pct >= 70) return "var(--color-warning-500)";
  return "var(--color-success-500)";
}

export function ResourceBar({ value, label }: ResourceBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
        title={`${label}: ${value}%`}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(value, 100)}%`,
            backgroundColor: barColor(value),
            transitionDuration: "var(--duration-normal)",
          }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {value}%
      </span>
    </div>
  );
}
