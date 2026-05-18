import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileSidebarDrawer } from "./mobile-sidebar-drawer";

describe("MobileSidebarDrawer", () => {
  it("renders children regardless of open state", () => {
    render(
      <MobileSidebarDrawer open={false} onClose={() => {}}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    expect(screen.getByText("SIDEBAR")).toBeInTheDocument();
  });

  it("renders backdrop when open=true", () => {
    render(
      <MobileSidebarDrawer open={true} onClose={() => {}}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    expect(screen.getByLabelText("Close sidebar")).toBeInTheDocument();
  });

  it("does not render backdrop when open=false", () => {
    render(
      <MobileSidebarDrawer open={false} onClose={() => {}}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    expect(screen.queryByLabelText("Close sidebar")).not.toBeInTheDocument();
  });

  it("clicking the backdrop triggers onClose", () => {
    const onClose = vi.fn();
    render(
      <MobileSidebarDrawer open={true} onClose={onClose}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    fireEvent.click(screen.getByLabelText("Close sidebar"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("exposes open state via data-state for testing", () => {
    const { rerender, container } = render(
      <MobileSidebarDrawer open={false} onClose={() => {}}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    expect(
      container.querySelector("[data-state]")?.getAttribute("data-state"),
    ).toBe("closed");
    rerender(
      <MobileSidebarDrawer open={true} onClose={() => {}}>
        <span>SIDEBAR</span>
      </MobileSidebarDrawer>,
    );
    expect(
      container.querySelector("[data-state]")?.getAttribute("data-state"),
    ).toBe("open");
  });
});
