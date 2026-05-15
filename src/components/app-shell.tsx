"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ProductStrip } from "@aleph-front/ds/product-strip";
import {
  AccordionSection,
  AppShellSidebar,
  NavItem,
} from "@aleph-front/ds/app-shell-sidebar";
import { useSidebarCollapse } from "@aleph-front/ds/use-sidebar-collapse";
import { PageHeader } from "@aleph-front/ds/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppMark } from "@/components/app-mark";
import { NavIcon } from "@/components/nav-icon";
import { ACTIVE_APP_ID, APPS } from "@/config/apps";
import { NAV_SECTIONS } from "@/config/nav";
import { routeTitle } from "@/lib/route-title";
import { CURRENT_VERSION } from "@/changelog";
import { getCreditExpenses, getNodeState } from "@/api/client";
import {
  RANGE_SECONDS,
  getStableExpenseRange,
} from "@/hooks/use-credit-expenses";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const creditsPrefetchedRef = useRef(false);
  const { collapsed, toggle } = useSidebarCollapse();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  const isActive = useCallback(
    (href: string): boolean => {
      if (href === "/") return pathname === "/";
      return pathname.startsWith(href);
    },
    [pathname],
  );

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

  const sidebarCollapsed = collapsed === true;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ProductStrip
        apps={APPS}
        activeId={ACTIVE_APP_ID}
        logoHref="https://aleph.cloud"
        right={<ThemeToggle />}
        className="border-b-0"
      />
      <div className="flex flex-1 overflow-hidden">
        <AppShellSidebar
          appMark={<AppMark collapsed={sidebarCollapsed} />}
          collapsed={collapsed}
          onToggle={toggle}
          footer={
            <Link
              href="/changelog"
              className="font-mono text-[11px] tabular-nums text-muted-foreground/40 transition-colors hover:text-muted-foreground"
              style={{ transitionDuration: "var(--duration-fast)" }}
            >
              v{CURRENT_VERSION}
            </Link>
          }
        >
          {NAV_SECTIONS.map((section) => (
            <AccordionSection
              key={section.id}
              title={section.title}
              sectionId={section.id}
              {...(section.id === "operations" ? { defaultOpen: false } : {})}
            >
              {section.items.map((item) => {
                const prefetchProps =
                  item.href === "/credits"
                    ? {
                        onMouseEnter: prefetchCredits,
                        onFocus: prefetchCredits,
                      }
                    : {};
                return (
                  <NavItem
                    key={item.href}
                    asChild
                    icon={<NavIcon name={item.icon} />}
                    active={isActive(item.href)}
                    {...prefetchProps}
                  >
                    <Link href={item.href}>{item.label}</Link>
                  </NavItem>
                );
              })}
            </AccordionSection>
          ))}
        </AppShellSidebar>
        <div className="flex flex-1 flex-col overflow-hidden bg-muted/40 dark:bg-surface">
          <div className="main-glow relative flex flex-1 flex-col overflow-hidden rounded-tl-2xl bg-background">
            <PageHeader
              leading={<SidebarToggle onClick={toggle} />}
              fallbackTitle={routeTitle(pathname)}
              className="bg-transparent [&_.truncate]:text-xs [&_.truncate]:text-muted-foreground"
            />
            <main
              ref={mainRef}
              className="relative flex-1 overflow-x-clip overflow-y-auto p-4 md:p-6"
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Toggle sidebar"
      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
      style={{ transitionDuration: "var(--duration-fast)" }}
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
  );
}

