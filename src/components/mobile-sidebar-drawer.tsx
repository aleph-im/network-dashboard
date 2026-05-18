"use client";

import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function MobileSidebarDrawer({ open, onClose, children }: Props) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}
      <div
        data-state={open ? "open" : "closed"}
        className={`
          max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50
          max-md:transition-transform
          ${open ? "max-md:translate-x-0" : "max-md:-translate-x-full"}
        `}
        style={{ transitionDuration: "var(--duration-default)" }}
      >
        {children}
      </div>
    </>
  );
}
