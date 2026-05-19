"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import { ThemeToggle } from "@/components/theme-toggle";
import { ACTIVE_APP_ID, APPS } from "@/config/apps";
import { CURRENT_VERSION } from "@/changelog";

type Props = {
  open: boolean;
  onClose: () => void;
  appName: string;
  children: ReactNode;
};

type Phase = "closed" | "open" | "closing";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MobileMenu({ open, onClose, appName, children }: Props) {
  const [phase, setPhase] = useState<Phase>(open ? "open" : "closed");

  useEffect(() => {
    if (open) {
      setPhase("open");
      return;
    }
    setPhase((p) => {
      if (p !== "open") return p;
      return prefersReducedMotion() ? "closed" : "closing";
    });
  }, [open]);

  if (phase === "closed") return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close menu backdrop"
        onClick={onClose}
        data-state={phase}
        className="mobile-menu-backdrop fixed inset-0 z-40 bg-black/40 md:hidden"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-title"
        data-state={phase}
        onAnimationEnd={(e) => {
          if (e.target !== e.currentTarget) return;
          if (phase === "closing") setPhase("closed");
        }}
        className="mobile-menu-panel fixed inset-0 z-50 flex flex-col bg-background md:hidden"
      >
        <header className="flex items-center justify-between px-4 py-3">
          <div id="mobile-menu-title" className="text-sm font-semibold">{appName}</div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            autoFocus
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            style={{ transitionDuration: "var(--duration-fast)" }}
          >
            <X className="size-5" />
          </button>
        </header>
        <nav className="flex-1 overflow-y-auto px-4 py-4">{children}</nav>
        <footer className="bg-muted/40 px-4 py-3 dark:bg-surface">
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {APPS.map((app) => {
              const isActive = app.id === ACTIVE_APP_ID;
              const className = isActive
                ? "font-semibold"
                : "text-muted-foreground";
              if (app.external) {
                return (
                  <a
                    key={app.id}
                    href={app.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={className}
                  >
                    {app.label} ↗
                  </a>
                );
              }
              return (
                <span
                  key={app.id}
                  className={className}
                  aria-current="page"
                >
                  {app.label}
                </span>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <Link
              href="/changelog"
              className="font-mono text-[11px] tabular-nums text-muted-foreground"
            >
              v{CURRENT_VERSION}
            </Link>
            <ThemeToggle />
          </div>
        </footer>
      </div>
    </>
  );
}
