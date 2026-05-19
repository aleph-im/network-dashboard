import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileTableCardRow } from "./mobile-table-card-row";

describe("MobileTableCardRow", () => {
  it("renders the primary slot and label/value pairs", () => {
    render(
      <MobileTableCardRow
        primary={<span>0xABCD…1234</span>}
        fields={[
          { label: "Status", value: "active" },
          { label: "VMs", value: "3" },
        ]}
      />,
    );
    expect(screen.getByText("0xABCD…1234")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("VMs")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("wraps in a link when href is provided", () => {
    render(
      <MobileTableCardRow
        href="/wallet?address=0xABCD"
        primary={<span>0xABCD</span>}
        fields={[]}
      />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/wallet?address=0xABCD");
  });

  it("does not wrap in a link when href is omitted", () => {
    render(
      <MobileTableCardRow primary={<span>0xABCD</span>} fields={[]} />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});
