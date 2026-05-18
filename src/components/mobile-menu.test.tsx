import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileMenu } from "./mobile-menu";

// ThemeToggle reads from localStorage on mount; Node 25's experimental
// localStorage global shadows jsdom's, which breaks getItem inside vitest.
// Stub it out — this test exercises MobileMenu, not the theme toggle.
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">theme</button>,
}));

describe("MobileMenu", () => {
  it("does not render the panel when closed", () => {
    render(
      <MobileMenu open={false} onClose={() => {}} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    expect(screen.queryByText("NAV")).not.toBeInTheDocument();
  });

  it("renders header, children, and footer when open", () => {
    render(
      <MobileMenu open={true} onClose={() => {}} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("NAV")).toBeInTheDocument();
    expect(screen.getByLabelText("Close menu")).toBeInTheDocument();
  });

  it("× button triggers onClose", () => {
    const onClose = vi.fn();
    render(
      <MobileMenu open={true} onClose={onClose} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    fireEvent.click(screen.getByLabelText("Close menu"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("backdrop click triggers onClose", () => {
    const onClose = vi.fn();
    render(
      <MobileMenu open={true} onClose={onClose} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    fireEvent.click(screen.getByLabelText("Close menu backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders all product tabs in the footer", () => {
    render(
      <MobileMenu open={true} onClose={() => {}} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    expect(screen.getByText("Cloud")).toBeInTheDocument();
    expect(screen.getAllByText("Network").length).toBeGreaterThan(0);
    expect(screen.getByText("Explorer")).toBeInTheDocument();
    expect(screen.getByText("Swap")).toBeInTheDocument();
  });

  it("renders the version link", () => {
    render(
      <MobileMenu open={true} onClose={() => {}} appName="Network">
        <span>NAV</span>
      </MobileMenu>,
    );
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument();
  });
});
