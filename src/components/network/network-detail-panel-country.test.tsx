import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetworkDetailPanelCountry } from "./network-detail-panel-country";

describe("NetworkDetailPanelCountry", () => {
  it("renders country name and flag", () => {
    render(
      <NetworkDetailPanelCountry
        code="FR"
        name="France"
        ccnCount={3}
        crnCount={8}
        uniqueOwners={2}
        inactiveCount={0}
      />,
    );
    expect(screen.getByText("France")).toBeTruthy();
    expect(screen.getByText("🇫🇷")).toBeTruthy();
  });

  it("renders stat tiles for CCN, CRN, total, and unique owners", () => {
    render(
      <NetworkDetailPanelCountry
        code="US"
        name="United States"
        ccnCount={2}
        crnCount={5}
        uniqueOwners={3}
        inactiveCount={0}
      />,
    );
    expect(screen.getByText("2")).toBeTruthy(); // CCN
    expect(screen.getByText("5")).toBeTruthy(); // CRN
    expect(screen.getByText("7")).toBeTruthy(); // total
    expect(screen.getByText("3")).toBeTruthy(); // owners
  });

  it("hides the inactive footnote when count is zero", () => {
    render(
      <NetworkDetailPanelCountry
        code="FR"
        name="France"
        ccnCount={1}
        crnCount={0}
        uniqueOwners={1}
        inactiveCount={0}
      />,
    );
    expect(screen.queryByText(/inactive/i)).toBeNull();
  });

  it("shows the inactive footnote when count is > 0", () => {
    render(
      <NetworkDetailPanelCountry
        code="FR"
        name="France"
        ccnCount={1}
        crnCount={0}
        uniqueOwners={1}
        inactiveCount={4}
      />,
    );
    expect(screen.getByText(/4 inactive/i)).toBeTruthy();
  });
});
