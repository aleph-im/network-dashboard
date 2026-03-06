"use client";

import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden bg-muted/40 dark:bg-background">
        <AppHeader onMenuClick={openSidebar} />
        <main ref={mainRef} className="main-glow relative flex-1 overflow-x-clip overflow-y-auto rounded-tl-2xl bg-surface p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
