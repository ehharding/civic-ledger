/**
 * Covers CongressSeatingChart's interaction surface: one seat per member with a descriptive accessible name, the
 * chamber tabs, the hover/focus read-out, the roving tabindex that keeps the chart to a single tab stop, and the
 * preview-mode labeling that keeps placeholder seats from reading as real membership.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CongressSeatingChart } from "@/components/congress-seating-chart";
import {
  buildChamberComposition,
  type ChamberComposition,
  type CongressComposition,
  type CongressMember,
} from "@/lib/congress/members";

const representatives: CongressMember[] = [
  {
    bioguideId: "B000001",
    name: "Bennett, Marcus T.",
    party: "democratic",
    partyName: "Democratic",
    state: "Ohio",
    district: 9,
  },
  {
    bioguideId: "O000002",
    name: "Okafor, Daniel K.",
    party: "republican",
    partyName: "Republican",
    state: "Georgia",
    district: 4,
  },
  {
    bioguideId: "N000003",
    name: "Nakamura, Lena",
    party: "democratic",
    partyName: "Democratic",
    state: "Guam",
    district: 0,
  },
];

const senators: CongressMember[] = [
  { bioguideId: "A000004", name: "Alvarez, Priya R.", party: "republican", partyName: "Republican", state: "Arizona" },
  { bioguideId: "K000005", name: "King, Sam", party: "independent", partyName: "Independent Democrat", state: "Maine" },
];

function composition(overrides: Partial<CongressComposition> = {}): CongressComposition {
  return {
    congress: 119,
    chambers: [buildChamberComposition("house", representatives), buildChamberComposition("senate", senators)],
    source: "live",
    retrievedAt: "2026-07-14T00:00:00Z",
    ...overrides,
  };
}

/** Every seat in the currently-shown chamber. Seats are the only role="button" elements; the tabs are role="tab". */
function seats(): HTMLElement[] {
  return screen.getAllByRole("button");
}

describe("CongressSeatingChart", (): void => {
  it("draws one seat per member of the House by default", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    expect(seats()).toHaveLength(representatives.length);
  });

  it("names every seat with its member, party, and jurisdiction", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    expect(
      screen.getByRole("button", { name: "Bennett, Marcus T., Democratic, Ohio's 9th district" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Nakamura, Lena, Democratic, Guam (non-voting seat)" }),
    ).toBeInTheDocument();
  });

  it("switches chambers from the tabs", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    const senateTab: HTMLElement = screen.getByRole("tab", { name: /Senate/ });
    expect(senateTab).toHaveAttribute("aria-selected", "false");

    fireEvent.click(senateTab);

    expect(senateTab).toHaveAttribute("aria-selected", "true");
    expect(seats()).toHaveLength(senators.length);
    expect(screen.getByRole("button", { name: "Alvarez, Priya R., Republican, Arizona" })).toBeInTheDocument();
  });

  it("moves between chambers with the arrow keys, per the ARIA tabs pattern", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: /Senate/ })).toHaveAttribute("aria-selected", "true");
  });

  it("reads out the member under the pointer", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });
    // Before any interaction the panel summarizes the chamber rather than sitting empty.
    expect(within(detail).getByText("House of Representatives")).toBeInTheDocument();

    fireEvent.mouseOver(screen.getByRole("button", { name: /Bennett/ }));

    expect(within(detail).getByText("Bennett, Marcus T.")).toBeInTheDocument();
    expect(within(detail).getByText("Democratic")).toBeInTheDocument();
    expect(within(detail).getByText("Ohio's 9th district")).toBeInTheDocument();
  });

  it("clears the read-out when the pointer leaves the chart", (): void => {
    const { container } = render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.mouseOver(screen.getByRole("button", { name: /Bennett/ }));
    expect(within(detail).getByText("Bennett, Marcus T.")).toBeInTheDocument();

    const chart: Element | null = container.querySelector("svg.seating__chart");
    if (chart) fireEvent.mouseLeave(chart);

    expect(within(detail).queryByText("Bennett, Marcus T.")).not.toBeInTheDocument();
  });

  it("explains the non-voting seats rather than drawing them as ordinary ones", (): void => {
    render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.mouseOver(screen.getByRole("button", { name: /Nakamura/ }));

    expect(within(detail).getByText(/cannot vote on final passage/)).toBeInTheDocument();
  });

  it("links a member to their official biography", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    fireEvent.mouseOver(screen.getByRole("button", { name: /Bennett/ }));

    expect(screen.getByRole("link", { name: /Official Biography/ })).toHaveAttribute(
      "href",
      "https://bioguide.congress.gov/search/bio/B000001",
    );
  });

  it("keeps the whole chart to one tab stop and moves within it using the arrow keys", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    const initial: HTMLElement[] = seats();
    expect(initial.filter((seat: HTMLElement): boolean => seat.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(initial[0]).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(initial[0] as HTMLElement, { key: "ArrowRight" });

    const moved: HTMLElement[] = seats();
    expect(moved[0]).toHaveAttribute("tabindex", "-1");
    expect(moved[1]).toHaveAttribute("tabindex", "0");
    expect(moved.filter((seat: HTMLElement): boolean => seat.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("jumps to the first and last seat with Home and End, and clamps at the ends", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    fireEvent.keyDown(seats()[0] as HTMLElement, { key: "End" });
    expect(seats()[representatives.length - 1]).toHaveAttribute("tabindex", "0");

    // Already at the last seat: moving further right should stay put rather than wrap or run off the end.
    fireEvent.keyDown(seats()[representatives.length - 1] as HTMLElement, { key: "ArrowRight" });
    expect(seats()[representatives.length - 1]).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(seats()[representatives.length - 1] as HTMLElement, { key: "Home" });
    expect(seats()[0]).toHaveAttribute("tabindex", "0");
  });

  it("resets the tab stop when the chamber changes", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    fireEvent.keyDown(seats()[0] as HTMLElement, { key: "End" });
    fireEvent.click(screen.getByRole("tab", { name: /Senate/ }));

    expect(seats()[0]).toHaveAttribute("tabindex", "0");
  });

  it("tallies each party's seats and share in the legend", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    const legend: HTMLElement = screen.getByRole("list");
    expect(within(legend).getByText("Democratic")).toBeInTheDocument();
    expect(within(legend).getByText("66.7%", { exact: false })).toBeInTheDocument();
  });

  it("labels live membership with its provenance", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    expect(screen.getByText(/Membership from the Congress.gov member API/)).toBeInTheDocument();
  });

  it("labels preview seats as placeholders rather than letting them read as real membership", (): void => {
    render(
      <CongressSeatingChart composition={composition({ source: "preview", notice: "No API key is configured." })} />,
    );

    expect(screen.getByText(/Illustrative placeholder seats, not a real party breakdown/)).toBeInTheDocument();
    expect(screen.getByText(/No API key is configured./)).toBeInTheDocument();
    expect(screen.getByText(/These are placeholder seats/)).toBeInTheDocument();
  });

  it("always says the arrangement is a schematic, not a floor plan", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    expect(screen.getByText(/does not publish desk assignments/)).toBeInTheDocument();
  });

  it("renders an honest empty state for a chamber with no membership records", (): void => {
    render(
      <CongressSeatingChart
        composition={composition({
          chambers: [
            buildChamberComposition("house", []) as ChamberComposition,
            buildChamberComposition("senate", senators),
          ],
        })}
      />,
    );

    expect(screen.getByText(/No membership records are available/)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
