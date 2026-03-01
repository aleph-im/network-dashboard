"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/nodes": "Nodes",
  "/vms": "Virtual Machines",
};

type AppHeaderProps = {
  onMenuClick: () => void;
};

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const pathname = usePathname();
  const title = ROUTE_TITLES[pathname] ?? "Dashboard";

  return (
    <header className="flex h-14 items-center justify-between border-b border-edge bg-surface px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Open menu"
        >
          <svg
            className="size-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
      </div>
    </header>
  );
}
