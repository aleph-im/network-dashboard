"use client";

import { ThemeToggle } from "@/components/theme-toggle";

type AppHeaderProps = {
  onMenuClick: () => void;
};

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between bg-muted/40 px-4 dark:bg-background md:px-6">
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
      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
      </div>
    </header>
  );
}
