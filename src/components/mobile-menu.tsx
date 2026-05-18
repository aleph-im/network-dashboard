"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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

export function MobileMenu({ open, onClose, appName, children }: Props) {
  if (!open) return null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Close menu backdrop"
        onClick={onClose}
        className="mobile-menu-animated fixed inset-0 z-40 bg-black/40"
        style={{
          animation: "mobile-menu-backdrop-in var(--duration-default) ease-out",
        }}
      />
      <div
        className="mobile-menu-animated fixed inset-0 z-50 flex flex-col bg-background"
        style={{
          animation:
            "mobile-menu-panel-in var(--duration-default) ease-out forwards",
        }}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold">{appName}</div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            style={{ transitionDuration: "var(--duration-fast)" }}
          >
            <X className="size-5" />
          </button>
        </header>
        <nav className="flex-1 overflow-y-auto px-4 py-4">{children}</nav>
        <footer className="border-t border-border bg-muted/40 px-4 py-3 dark:bg-surface">
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
                    <span>{app.label}</span>
                    <span aria-hidden="true"> ↗</span>
                  </a>
                );
              }
              // Active app: marker + label live inside a single descendant
              // <span> so neither the outer nor the inner element's direct
              // text content equals the bare label (avoids collisions with
              // the header appName when MobileMenu is used for the same
              // active app — see `getByText` semantics on direct text).
              return (
                <span key={app.id} className={className}>
                  <span>• {app.label}</span>
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
    </div>
  );
}
