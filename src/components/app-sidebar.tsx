"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogoFull } from "@aleph-front/ds/logo";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { useHealth } from "@/hooks/use-health";
import { CURRENT_VERSION } from "@/changelog";
import { getCreditExpenses, getNodeState } from "@/api/client";
import {
  RANGE_SECONDS,
  getStableExpenseRange,
} from "@/hooks/use-credit-expenses";

type NavItem = {
  label: string;
  href: string;
  icon: IconName;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Dashboard",
    items: [
      { label: "Overview", href: "/", icon: "grid" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Nodes", href: "/nodes", icon: "server" },
      { label: "VMs", href: "/vms", icon: "cpu" },
      { label: "Credits", href: "/credits", icon: "coins" },
    ],
  },
];

type IconName = "grid" | "server" | "cpu" | "warning" | "coins";

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
    case "warning":
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
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      );
    case "coins":
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
            d="M20 6c0 1.657-3.582 3-8 3S4 7.657 4 6m16 0c0-1.657-3.582-3-8-3S4 4.343 4 6m16 0v4c0 1.657-3.582 3-8 3S4 11.657 4 10V6m16 8c0 1.657-3.582 3-8 3s-8-1.343-8-3m16-4v8c0 1.657-3.582 3-8 3s-8-1.343-8-3v-8"
          />
        </svg>
      );
  }
}

function UtilityMenu({
  pathname,
  healthStatus,
}: {
  pathname: string;
  healthStatus: "healthy" | "error" | "unknown";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () =>
      document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen, close]);

  // Close menu on navigation
  useEffect(() => {
    close();
  }, [pathname, close]);

  const isUtilityPage =
    pathname === "/issues" || pathname === "/status";

  const linkClass = (href: string) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
      pathname === href
        ? "bg-primary-600/10 text-primary-400 font-medium"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    }`;

  return (
    <div
      ref={menuRef}
      className="relative border-t border-foreground/[0.06] px-3 py-4"
    >
      {/* Popover */}
      {menuOpen && (
        <div className="absolute bottom-full left-3 right-3 mb-2 space-y-1 rounded-xl border border-foreground/[0.06] bg-surface p-2 shadow-lg">
          <Link
            href="/issues"
            className={linkClass("/issues")}
            style={{
              transitionDuration: "var(--duration-fast)",
            }}
          >
            <NavIcon name="warning" />
            Issues
          </Link>
          <Link
            href="/status"
            className={linkClass("/status")}
            style={{
              transitionDuration: "var(--duration-fast)",
            }}
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
                d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
            Network Health
            <span className="relative ml-auto flex size-5 items-center justify-center">
              <StatusDot status={healthStatus} size="sm" />
              <svg
                className="absolute inset-0"
                viewBox="0 0 20 20"
                fill="none"
              >
                <circle
                  cx="10"
                  cy="10"
                  r="7.5"
                  stroke={
                    healthStatus === "healthy"
                      ? "var(--color-success-500)"
                      : healthStatus === "error"
                        ? "var(--color-error-500)"
                        : "var(--color-neutral-400)"
                  }
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="47.12"
                  className="poll-ring opacity-80"
                  transform="rotate(-90 10 10)"
                />
              </svg>
            </span>
          </Link>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
          isUtilityPage
            ? "text-primary-400"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
        style={{ transitionDuration: "var(--duration-fast)" }}
      >
        <svg
          className="size-4"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
        More
        <span className="relative ml-auto flex size-5 items-center justify-center">
          <StatusDot status={healthStatus} size="sm" />
        </span>
      </button>
    </div>
  );
}

type AppSidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: healthy, isLoading: healthLoading } = useHealth();
  const healthStatus = healthLoading ? "unknown" as const : healthy ? "healthy" as const : "error" as const;
  const prevPathname = useRef(pathname);
  const creditsPrefetchedRef = useRef(false);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Warm the credits query cache when the user signals intent to navigate.
  // Once per mount — repeated hovers don't refire.
  const prefetchCredits = useCallback(() => {
    if (creditsPrefetchedRef.current) return;
    creditsPrefetchedRef.current = true;
    const { start, end } = getStableExpenseRange(RANGE_SECONDS["24h"]);
    void queryClient.prefetchQuery({
      queryKey: ["credit-expenses", start, end],
      queryFn: () => getCreditExpenses(start, end),
      staleTime: 5 * 60_000,
    });
    void queryClient.prefetchQuery({
      queryKey: ["node-state"],
      queryFn: () => getNodeState(),
      staleTime: 60_000,
    });
  }, [queryClient]);

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
          bg-muted/40 dark:bg-surface
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:static md:z-auto md:translate-x-0 md:transition-none
        `}
      >
        <div className="flex h-14 shrink-0 items-center px-5">
          <LogoFull className="h-5 text-foreground" />
        </div>

        <nav className="flex-1 px-3 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const prefetchProps =
                    item.href === "/credits"
                      ? {
                          onMouseEnter: prefetchCredits,
                          onFocus: prefetchCredits,
                        }
                      : {};
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        {...prefetchProps}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive(item.href)
                            ? "bg-primary-600/10 text-primary-400 font-medium"
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
            </div>
          ))}
        </nav>

        {/* Bottom utility menu */}
        <UtilityMenu
          pathname={pathname}
          healthStatus={healthStatus}
        />

        {/* Version */}
        <div className="px-6 pb-4">
          <Link
            href="/changelog"
            className="text-[11px] tabular-nums text-muted-foreground/40 transition-colors hover:text-muted-foreground"
            style={{ transitionDuration: "var(--duration-fast)" }}
          >
            v{CURRENT_VERSION}
          </Link>
        </div>

      </aside>
    </>
  );
}
