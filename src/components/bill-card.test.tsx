/** Covers BillCard's derived href (lowercased bill type), displayed fields, and the missing-policy-area fallback. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BillCard } from "@/components/bill-card";
import { firstPreviewBill } from "@/lib/congress/fixtures";
import type { LegislativeBill } from "@/lib/congress/types";

describe("BillCard", (): void => {
  it("links to the lowercased bill-type route", (): void => {
    const bill: LegislativeBill = firstPreviewBill;
    render(<BillCard bill={bill} />);

    const titleLink = screen.getByRole("link", { name: bill.title });
    expect(titleLink).toHaveAttribute("href", `/bills/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}`);
  });

  it("shows the bill id, stage label, and latest action", (): void => {
    const bill: LegislativeBill = firstPreviewBill;
    const { container } = render(<BillCard bill={bill} />);

    expect(screen.getByText(`${bill.type} ${bill.number}`)).toBeInTheDocument();
    expect(container.querySelector(".stage-label")).toHaveTextContent("In Committee");
    expect(screen.getByText(bill.latestAction.text)).toBeInTheDocument();
  });

  it("falls back to a placeholder when policyArea is missing", (): void => {
    const bill: LegislativeBill = { ...firstPreviewBill, policyArea: undefined };
    render(<BillCard bill={bill} />);

    expect(screen.getByText("Policy Area Pending")).toBeInTheDocument();
  });

  it("shows the real policy area when present", (): void => {
    const bill: LegislativeBill = firstPreviewBill;
    render(<BillCard bill={bill} />);

    expect(screen.getByText(bill.policyArea as string)).toBeInTheDocument();
    expect(screen.queryByText("Policy Area Pending")).not.toBeInTheDocument();
  });

  it("labels the trailing icon link with the bill identity for screen readers", (): void => {
    const bill: LegislativeBill = firstPreviewBill;
    render(<BillCard bill={bill} />);

    expect(screen.getByRole("link", { name: `Open ${bill.type} ${bill.number}` })).toBeInTheDocument();
  });
});
