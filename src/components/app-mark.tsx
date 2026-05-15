"use client";

export function AppMark({ collapsed }: { collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <span className="font-semibold text-sm text-foreground tracking-tight">
      Network
    </span>
  );
}
