"use client";

import { Logo } from "@aleph-front/ds/logo";

export function AppMark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Logo className="h-4 text-foreground shrink-0" />
      {!collapsed && (
        <span className="font-semibold text-sm text-foreground tracking-tight">
          Network
        </span>
      )}
    </div>
  );
}
