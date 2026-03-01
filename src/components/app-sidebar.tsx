"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Overview", href: "/", icon: "grid" },
  { label: "Nodes", href: "/nodes", icon: "server" },
  { label: "VMs", href: "/vms", icon: "cpu" },
] as const;

type IconName = (typeof NAV_ITEMS)[number]["icon"];

function NavIcon({ name }: { name: IconName }) {
  switch (name) {
    case "grid":
      return (
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
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      );
    case "server":
      return (
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
            d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
          />
        </svg>
      );
    case "cpu":
      return (
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
            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
          />
        </svg>
      );
  }
}

type AppSidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  return (
    <>
      {/* Backdrop — mobile only */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-64 flex-col
          border-r border-edge bg-surface
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:static md:z-auto md:translate-x-0 md:transition-none
        `}
      >
        <div className="flex items-center gap-2 border-b border-edge px-5 py-4">
          <div className="size-7 rounded-lg bg-gradient-brand" />
          <span className="text-sm font-bold tracking-tight text-foreground">
            Aleph Cloud
          </span>
        </div>

        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-primary-600/10 text-primary-500 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    style={{
                      transitionDuration: "var(--duration-fast)",
                    }}
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-edge px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Scheduler Dashboard
          </p>
        </div>
      </aside>
    </>
  );
}
