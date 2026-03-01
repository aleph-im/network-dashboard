"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/nodes": "Nodes",
  "/vms": "Virtual Machines",
};

export function AppHeader() {
  const pathname = usePathname();
  const title = ROUTE_TITLES[pathname] ?? "Dashboard";

  return (
    <header className="flex h-14 items-center justify-between border-b border-edge bg-card px-6">
      <h1 className="text-lg font-bold">{title}</h1>
      <div className="flex items-center gap-3">
        <ThemeToggle />
      </div>
    </header>
  );
}
