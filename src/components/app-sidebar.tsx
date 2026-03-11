"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoFull } from "@aleph-front/ds/logo";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { useHealth } from "@/hooks/use-health";
import { useOverviewStats } from "@/hooks/use-overview-stats";

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
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Issues", href: "/issues", icon: "warning" },
    ],
  },
];

type IconName = "grid" | "server" | "cpu" | "warning";

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
  }
}

type AppSidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const { data: healthy, isLoading: healthLoading } = useHealth();
  const healthStatus = healthLoading ? "unknown" as const : healthy ? "healthy" as const : "error" as const;
  const prevPathname = useRef(pathname);

  const { data: stats } = useOverviewStats();
  const issueCount =
    (stats?.orphanedVMs ?? 0) +
    (stats?.missingVMs ?? 0) +
    (stats?.unschedulableVMs ?? 0);

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
          bg-muted/40 dark:bg-background
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
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
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
                      {item.href === "/issues" && issueCount > 0 && (
                        <span className="ml-auto rounded-full bg-warning-400/15 px-2 py-0.5 text-[10px] font-bold tabular-nums text-warning-400">
                          {issueCount}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Bottom utility link */}
        <div className="border-t border-white/[0.06] px-3 py-4">
          <Link
            href="/status"
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname === "/status"
                ? "bg-primary-600/10 text-primary-400 font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            style={{ transitionDuration: "var(--duration-fast)" }}
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
            API Status
            <span className="relative ml-auto flex size-5 items-center justify-center">
              <StatusDot
                status={healthStatus}
                size="sm"
              />
              <svg
                className="absolute inset-0"
                viewBox="0 0 20 20"
                fill="none"
              >
                <circle
                  cx="10"
                  cy="10"
                  r="7.5"
                  stroke={healthStatus === "healthy" ? "var(--color-success-500)" : healthStatus === "error" ? "var(--color-error-500)" : "var(--color-neutral-400)"}
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

      </aside>
    </>
  );
}
