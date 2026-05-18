import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CreditFlowList } from "./credit-flow-list";
import type { DistributionSummary } from "@/api/credit-types";

const SUMMARY: DistributionSummary = {
  totalAleph: 100,
  storageAleph: 40,
  executionAleph: 60,
  devFundAleph: 5,
  distributedAleph: 95,
  expenseCount: 10,
  recipients: [],
  expenses: [],
  perVm: new Map(),
  perNode: new Map(),
};

describe("CreditFlowList", () => {
  it("renders Storage and Execution section headers when both totals > 0", () => {
    render(<CreditFlowList summary={SUMMARY} />);
    expect(screen.getByText(/Storage/)).toBeInTheDocument();
    expect(screen.getByText(/Execution/)).toBeInTheDocument();
  });

  it("renders three rows under Storage (CCN 75% / Stakers 20% / Dev fund 5%)", () => {
    const { container } = render(<CreditFlowList summary={SUMMARY} />);
    const storageSection = container.querySelector("[data-section='storage']");
    expect(storageSection).toBeTruthy();
    const rows = storageSection!.querySelectorAll("[data-row]");
    expect(rows).toHaveLength(3);
  });

  it("renders four rows under Execution (CRN 60% / Stakers 20% / CCN 15% / Dev fund 5%)", () => {
    const { container } = render(<CreditFlowList summary={SUMMARY} />);
    const executionSection = container.querySelector("[data-section='execution']");
    expect(executionSection).toBeTruthy();
    const rows = executionSection!.querySelectorAll("[data-row]");
    expect(rows).toHaveLength(4);
  });

  it("hides empty sections silently", () => {
    const onlyExecution: DistributionSummary = { ...SUMMARY, storageAleph: 0 };
    const { container } = render(<CreditFlowList summary={onlyExecution} />);
    expect(container.querySelector("[data-section='storage']")).toBeNull();
    expect(container.querySelector("[data-section='execution']")).toBeTruthy();
  });

  it("renders a loading skeleton when summary is undefined", () => {
    const { container } = render(<CreditFlowList summary={undefined} />);
    expect(
      container.querySelector("[data-slot='skeleton'], .animate-pulse"),
    ).toBeTruthy();
  });
});
