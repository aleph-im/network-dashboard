import { describe, expect, it } from "vitest";
import { routeTitle } from "./route-title";

describe("routeTitle", () => {
  it.each([
    ["/", "Overview"],
    ["/nodes", "Nodes"],
    ["/vms", "VMs"],
    ["/credits", "Credit Expenses"],
    ["/network", "Network Graph"],
    ["/status", "Network Health"],
    ["/issues", "Issues"],
    ["/wallet", "Wallet"],
    ["/changelog", "Changelog"],
  ])("returns the right title for %s", (path, expected) => {
    expect(routeTitle(path)).toBe(expected);
  });

  it("humanises unknown routes via leading segment", () => {
    expect(routeTitle("/unknown")).toBe("Unknown");
  });

  it("returns 'Overview' for unknown empty/null inputs", () => {
    expect(routeTitle("")).toBe("Overview");
  });
});
