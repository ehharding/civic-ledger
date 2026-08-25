/** Covers BillCard's derived href (lowercased bill type), displayed fields, the dated action, and the policy area's
 * absence on every live list-level record. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BillCard } from "@/components/bills/bill-card";
import type { LegislativeBill } from "@/lib/congress/bills/model";
import { firstPreviewBill } from "@/lib/congress/upstream/fixtures";

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

  // The list endpoint every one of this card's surfaces reads from publishes no `policyArea`, so this is the live case
  // rather than an edge one — and what it must not do is print a placeholder standing in for a value nothing is
  // fetching. @see BillCard.
  it("says nothing about the policy area when the record carries none", (): void => {
    const bill: LegislativeBill = { ...firstPreviewBill, policyArea: undefined };
    const { container } = render(<BillCard bill={bill} />);

    expect(screen.queryByText("Policy Area Pending")).not.toBeInTheDocument();
    expect(container.querySelector(".bill-card__footer > span")).toBeNull();
  });

  it("shows the real policy area when present", (): void => {
    const bill: LegislativeBill = firstPreviewBill;
    render(<BillCard bill={bill} />);

    expect(screen.getByText(bill.policyArea as string)).toBeInTheDocument();
  });

  // Every surface this card appears on is ordered by recency, so an undated action asks the reader to take that
  // ordering on trust. Asserted through the rendered text rather than the raw ISO value, since `formatDate` is what
  // stands between the two.
  it("dates the latest action, in the same words the bill page uses", (): void => {
    const bill: LegislativeBill = { ...firstPreviewBill, latestAction: { date: "2026-07-14", text: "Referred." } };
    const { container } = render(<BillCard bill={bill} />);

    expect(container.querySelector(".bill-card__action-date")).toHaveTextContent("Recorded July 14, 2026");
  });

  it("omits the date line entirely when the action carries no date", (): void => {
    const bill: LegislativeBill = { ...firstPreviewBill, latestAction: { text: "Referred." } };
    const { container } = render(<BillCard bill={bill} />);

    expect(container.querySelector(".bill-card__action-date")).toBeNull();
  });

  it("labels the trailing icon link with the bill identity for screen readers", (): void => {
    const bill: LegislativeBill = firstPreviewBill;
    render(<BillCard bill={bill} />);

    expect(screen.getByRole("link", { name: `Open ${bill.type} ${bill.number}` })).toBeInTheDocument();
  });
});
