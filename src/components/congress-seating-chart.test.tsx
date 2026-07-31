/**
 * Covers CongressSeatingChart's interaction surface: one seat per member with a descriptive accessible name, the
 * chamber tabs, the hover/focus read-out, the roving tabindex that keeps the chart to a single tab stop, the links
 * from each seat to that member's page, and the preview-mode labeling that keeps placeholder seats from reading as
 * real membership.
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

/**
 * Every seat in the currently-shown chamber, in chart order.
 *
 * Queried by `data-seat-index` rather than by role, because a seat's element depends on its member: one with a
 * Bioguide ID is a link to their page, one without (every placeholder seat) is a `role="button"` circle. The attribute
 * is what both forms share, and what the component's own delegated handlers key on.
 */
function seats(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-seat-index]"));
}

/** One seat, addressed the way a person using assistive technology would reach it. */
function seat(name: RegExp | string): HTMLElement {
  return screen.getByRole("link", { name });
}

describe("CongressSeatingChart", (): void => {
  it("draws one seat per member of the House by default", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    expect(seats()).toHaveLength(representatives.length);
  });

  it("names every seat with its member, party, and jurisdiction", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    expect(seat("Bennett, Marcus T., Democratic, Ohio's 9th district")).toBeInTheDocument();
    expect(seat("Nakamura, Lena, Democratic, Guam (non-voting seat)")).toBeInTheDocument();
  });

  it("switches chambers from the tabs", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    const senateTab: HTMLElement = screen.getByRole("tab", { name: /Senate/ });
    expect(senateTab).toHaveAttribute("aria-selected", "false");

    fireEvent.click(senateTab);

    expect(senateTab).toHaveAttribute("aria-selected", "true");
    expect(seats()).toHaveLength(senators.length);
    expect(seat("Alvarez, Priya R., Republican, Arizona")).toBeInTheDocument();
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

    fireEvent.mouseOver(seat(/Bennett/));

    expect(within(detail).getByText("Bennett, Marcus T.")).toBeInTheDocument();
    expect(within(detail).getByText("Democratic")).toBeInTheDocument();
    expect(within(detail).getByText("Ohio's 9th district")).toBeInTheDocument();
  });

  it("clears the read-out when the pointer leaves the chart", (): void => {
    const { container } = render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.mouseOver(seat(/Bennett/));
    expect(within(detail).getByText("Bennett, Marcus T.")).toBeInTheDocument();

    const chart: Element | null = container.querySelector("svg.seating__chart");
    if (chart) fireEvent.mouseLeave(chart);

    expect(within(detail).queryByText("Bennett, Marcus T.")).not.toBeInTheDocument();
  });

  it("explains the non-voting seats rather than drawing them as ordinary ones", (): void => {
    render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.mouseOver(seat(/Nakamura/));

    expect(within(detail).getByText(/cannot vote on final passage/)).toBeInTheDocument();
  });

  it("links a member to their official biography", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    fireEvent.mouseOver(seat(/Bennett/));

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
    expect(seats()).toHaveLength(0);
  });
});

describe("CongressSeatingChart's click and keyboard selection", (): void => {
  /** A placeholder roster: no Bioguide IDs, so every seat is a `role="button"` circle rather than a link. */
  const placeholders: CongressMember[] = [
    { name: "Preview Seat 1", party: "democratic", partyName: "Democratic", state: "Ohio", district: 1 },
    { name: "Preview Seat 2", party: "republican", partyName: "Republican", state: "Arizona", district: 2 },
  ];

  function placeholderComposition(): CongressComposition {
    return composition({
      chambers: [buildChamberComposition("house", placeholders), buildChamberComposition("senate", senators)],
      source: "preview",
      notice: "No API key is configured.",
    });
  }

  it("locks the read-out on a clicked seat, and releases it when the same seat is clicked again", (): void => {
    render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.click(seat(/Okafor/));
    expect(within(detail).getByText("Okafor, Daniel K.")).toBeInTheDocument();

    // Clicking the same seat toggles it off rather than leaving the panel stuck on a seat nobody is pointing at.
    fireEvent.click(seat(/Okafor/));
    expect(within(detail).queryByText("Okafor, Daniel K.")).not.toBeInTheDocument();
  });

  it("moves the lock to a different seat rather than toggling off", (): void => {
    render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.click(seat(/Okafor/));
    fireEvent.click(seat(/Nakamura/));

    expect(within(detail).getByText("Nakamura, Lena")).toBeInTheDocument();
    expect(within(detail).queryByText("Okafor, Daniel K.")).not.toBeInTheDocument();
  });

  it("ignores a click that lands on the chart but not on a seat", (): void => {
    const { container } = render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.click(container.querySelector("svg.seating__chart") as Element);

    expect(within(detail).queryByText("Bennett, Marcus T.")).not.toBeInTheDocument();
  });

  it("locks the read-out with Enter on a seat that is not a link", (): void => {
    // A seat whose member has a page is a real link, so activation belongs to the browser — intercepting it would
    // break "Enter opens the link". A placeholder seat has nowhere to go, so Enter is what locks its read-out.
    render(<CongressSeatingChart composition={placeholderComposition()} />);

    fireEvent.keyDown(seats()[0] as HTMLElement, { key: "Enter" });

    expect(screen.getByText("Preview Seat 1")).toBeInTheDocument();
  });

  it("releases that lock when the same seat is activated again", (): void => {
    render(<CongressSeatingChart composition={placeholderComposition()} />);

    fireEvent.keyDown(seats()[0] as HTMLElement, { key: "Enter" });
    fireEvent.keyDown(seats()[0] as HTMLElement, { key: " " });

    expect(screen.queryByText("Preview Seat 1")).not.toBeInTheDocument();
  });

  it("leaves Enter to the browser on a seat that links to a member's page", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    const event: boolean = fireEvent.keyDown(seats()[0] as HTMLElement, { key: "Enter", cancelable: true });

    // Not prevented: the seat is an anchor, and preventing here would also break opening it in a new tab.
    expect(event).toBe(true);
  });

  it("clears every read-out with Escape", (): void => {
    render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.click(seat(/Okafor/));
    expect(within(detail).getByText("Okafor, Daniel K.")).toBeInTheDocument();

    fireEvent.keyDown(seat(/Okafor/), { key: "Escape" });

    expect(within(detail).queryByText("Okafor, Daniel K.")).not.toBeInTheDocument();
  });

  it("ignores keys it has no movement or action for", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    fireEvent.keyDown(seats()[0] as HTMLElement, { key: "a" });

    expect(seats()[0]).toHaveAttribute("tabindex", "0");
  });

  it("ignores a keypress on a chamber with no seats to move between", (): void => {
    render(
      <CongressSeatingChart
        composition={composition({
          chambers: [buildChamberComposition("house", []), buildChamberComposition("senate", senators)],
        })}
      />,
    );

    const chart: HTMLElement = screen.getByRole("tabpanel");
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "Enter" });

    expect(seats()).toHaveLength(0);
  });

  it("reads out the focused seat and keeps it while focus moves within the chart", (): void => {
    render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.focus(seat(/Okafor/));
    expect(within(detail).getByText("Okafor, Daniel K.")).toBeInTheDocument();

    // React's onBlur is delegated, so moving between seats fires blur-then-focus. Clearing unconditionally made the
    // panel flicker back to its placeholder on every arrow keypress.
    fireEvent.blur(seat(/Okafor/), { relatedTarget: seat(/Nakamura/) });
    expect(within(detail).getByText("Okafor, Daniel K.")).toBeInTheDocument();
  });

  it("clears the focus read-out when focus leaves the chart entirely", (): void => {
    render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.focus(seat(/Okafor/));
    fireEvent.blur(seat(/Okafor/), { relatedTarget: document.body });

    expect(within(detail).queryByText("Okafor, Daniel K.")).not.toBeInTheDocument();
  });

  it("ignores a focus event that did not land on a seat", (): void => {
    const { container } = render(<CongressSeatingChart composition={composition()} />);
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.focus(container.querySelector("svg.seating__chart") as Element);

    expect(within(detail).queryByText("Bennett, Marcus T.")).not.toBeInTheDocument();
  });

  it("ignores a chamber-tab keypress that is neither left nor right", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /House/ }), { key: "ArrowDown" });

    expect(screen.getByRole("tab", { name: /House/ })).toHaveAttribute("aria-selected", "true");
  });

  it("shows a member's biography link only when their ID can resolve to a real one", (): void => {
    render(<CongressSeatingChart composition={placeholderComposition()} />);

    fireEvent.click(seats()[0] as HTMLElement);

    // A placeholder ID cannot point at a real person's biography, so the page structurally does not offer one.
    expect(screen.getByText("Preview Seat 1")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Official Biography/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View Full Profile/ })).not.toBeInTheDocument();
  });

  it("moves left through the chamber tabs as well as right", (): void => {
    render(<CongressSeatingChart composition={composition()} />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /House/ }), { key: "ArrowLeft" });

    // Two chambers, so left from the first wraps to the last — the ARIA tabs pattern, not a clamp.
    expect(screen.getByRole("tab", { name: /Senate/ })).toHaveAttribute("aria-selected", "true");
  });

  it("ignores a seat keypress on a chamber with no seats to move between", (): void => {
    const { container } = render(
      <CongressSeatingChart
        composition={composition({
          chambers: [buildChamberComposition("house", []), buildChamberComposition("senate", senators)],
        })}
      />,
    );

    const chart: Element | null = container.querySelector("svg.seating__chart");
    if (chart) {
      fireEvent.keyDown(chart, { key: "ArrowRight" });
      fireEvent.keyDown(chart, { key: "Enter" });
    }

    expect(seats()).toHaveLength(0);
  });

  it("omits the seat line for a member whose jurisdiction is not on file", (): void => {
    render(
      <CongressSeatingChart
        composition={composition({
          chambers: [
            buildChamberComposition("house", [
              { bioguideId: "X000001", name: "Unknown, Seat", party: "democratic", partyName: "Democratic" },
            ]),
            buildChamberComposition("senate", senators),
          ],
        })}
      />,
    );
    const detail: HTMLElement = screen.getByRole("complementary", { name: "Selected seat" });

    fireEvent.mouseOver(seat(/Unknown, Seat/));

    expect(within(detail).getByText("Unknown, Seat")).toBeInTheDocument();
    // An empty seat line would render as a blank row where the district or state belongs.
    expect(detail.querySelector(".seating-detail__seat")).toBeNull();
  });

  it("renders an empty chamber for a composition that carries no entry for it at all", (): void => {
    // Not something the adapter produces — it always returns one entry per chamber — but the component is handed a
    // prop, and a missing chamber must render as an empty diagram rather than crashing the page.
    render(
      <CongressSeatingChart composition={composition({ chambers: [buildChamberComposition("senate", senators)] })} />,
    );

    expect(seats()).toHaveLength(0);
  });

  it("labels preview seats without a trailing space when no notice accompanies them", (): void => {
    render(<CongressSeatingChart composition={composition({ source: "preview", notice: undefined })} />);

    expect(screen.getByText("Illustrative placeholder seats, not a real party breakdown.")).toBeInTheDocument();
  });
});
