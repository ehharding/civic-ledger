"use client";

import { ArrowUpRight } from "lucide-react";
import {
  type FocusEvent,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  type RefObject,
  useMemo,
  useRef,
  useState,
} from "react";

import { OutboundLink } from "@/components/ui/outbound-link";
import { RecordLink } from "@/components/ui/record-link";
import {
  bioguideUrl,
  type ChamberComposition,
  type CongressChamber,
  type CongressComposition,
  type CongressMember,
  chamberLabels,
  chamberShortLabels,
  describeChamberSeats,
  formatMemberParty,
  formatMemberSeat,
  formatMemberSummary,
  formatSeatShare,
  isNonVotingJurisdiction,
  type PartyTally,
  partyGroupLabels,
  partyTintClass,
} from "@/lib/congress/members/model";
import { buildChamberSeating, type ChamberSeat, type ChamberSeating } from "@/lib/congress/members/seating";
import { formatOrdinal } from "@/lib/format";
import { memberHref } from "@/lib/routes";

/** How far PageUp/PageDown jump along the arc, in seats. */
const PAGE_STEP: number = 10;

/**
 * How many seats each movement key advances by. Hoisted to module scope so the table is allocated once rather than
 * rebuilt on every keystroke, and so the full set of supported keys is visible in one place.
 *
 * Up/Down mirror Left/Right deliberately: the seats form a single left-to-right sequence, so there is no meaningful
 * "row above" to move to, and a person pressing Down expects *something* rather than nothing.
 */
const SEAT_KEY_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  PageDown: PAGE_STEP,
  PageUp: -PAGE_STEP,
};

/** The tab panel's `id`, which every chamber tab controls. */
const PANEL_ID: string = "seating-panel";

/** The `id` of the visually hidden keyboard instructions the chart is described by. */
const CHART_HELP_ID: string = "seating-chart-help";

/**
 * The DOM id of one chamber's tab.
 *
 * @param chamber - The chamber whose tab to identify.
 * @returns The id, referenced by the panel's `aria-labelledby` so the panel stays labeled by whichever chamber is
 *   currently showing.
 */
function tabId(chamber: CongressChamber): string {
  return `seating-tab-${chamber}`;
}

/**
 * Reads the seat index off whatever element an event landed on.
 *
 * Every seat carries `data-seat-index`, so one delegated handler on the chart covers all ~540 of them — meaningfully
 * cheaper than attaching separate listeners per seat, and it keeps hover, focus, and keyboard movement on a single code
 * path.
 *
 * `closest` rather than a direct attribute read, because a seat that links to its member is an `<a>` wrapping the
 * `<circle>`: a pointer event lands on the circle while a focus event lands on the anchor. Walking up finds the seat
 * either way, so linked and unlinked seats share one code path.
 *
 * @param target - The event target, typically `event.target`.
 * @returns The seat index, or `null` when the event landed somewhere that isn't a seat.
 */
function seatIndexFromEvent(target: EventTarget | null): number | null {
  /* v8 ignore start -- React only dispatches these handlers with an Element target; the narrowing is for the type. */
  if (!(target instanceof Element)) return null;
  /* v8 ignore stop */

  const raw: string | null = target.closest("[data-seat-index]")?.getAttribute("data-seat-index") ?? null;
  if (raw === null) return null;

  const index: number = Number(raw);
  /* v8 ignore start -- this component writes every `data-seat-index` itself, always from a loop index. */
  return Number.isInteger(index) ? index : null;
  /* v8 ignore stop */
}

/** Props for {@link Seat}. */
type SeatProps = {
  /** The seat to draw, carrying its member and resolved position. */
  seat: ChamberSeat;
  /** The chamber it belongs to, which decides how the accessible name describes it. */
  chamber: CongressChamber;
  /** The chart's shared seat radius. */
  radius: number;
  /** Whether this seat is the one currently read out, which draws the active ring. */
  isShown: boolean;
  /** Whether this seat holds the chart's single tab stop. */
  isActive: boolean;
};

/**
 * One drawn seat. With a Bioguide ID it's a real SVG `<a>` to the member's page (not `next/link`, which can't work in
 * the SVG namespace); without one, as in preview mode, it's a `<circle>` that only locks the read-out.
 * `data-seat-index` is on the outer element either way, for the chart's delegated handlers.
 *
 * Memoized because every hover or keypress changes the parent's state and the House draws 441 seats. Props are
 * primitives plus `seat`, whose identity is stable (`buildChamberSeating` is memoized on the roster).
 *
 * @param props - {@link SeatProps}.
 * @returns The seat element.
 * @see seatIndexFromEvent
 */
const Seat = memo(function Seat({ seat, chamber, radius, isShown, isActive }: SeatProps): JSX.Element {
  const label: string = formatMemberSummary(seat.member, chamber);
  const className: string = `seating__seat ${partyTintClass(seat.member.party)}${isShown ? " is-active" : ""}`;
  // Rounded to a fixed precision so the server's and the client's rendering of the same float agree exactly — an
  // unrounded trailing digit reads to React as a hydration mismatch.
  const cx: string = seat.position.x.toFixed(4);
  const cy: string = seat.position.y.toFixed(4);
  const r: string = radius.toFixed(4);

  if (seat.member.bioguideId) {
    return (
      <a
        aria-label={label}
        data-seat-index={seat.index}
        href={memberHref(seat.member.bioguideId) as string}
        tabIndex={isActive ? 0 : -1}
      >
        <circle className={className} cx={cx} cy={cy} r={r} />
      </a>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: an HTML <button> cannot be a child of <svg>.
    <circle
      aria-label={label}
      className={className}
      cx={cx}
      cy={cy}
      data-seat-index={seat.index}
      r={r}
      role="button"
      tabIndex={isActive ? 0 : -1}
    />
  );
});

/** Props for {@link SeatDetail}. */
type SeatDetailProps = {
  /** The chamber the seat belongs to, which decides how the seat is described. */
  chamber: CongressChamber;
  /** The member holding it. */
  member: CongressMember;
};

/**
 * The read-out shown when a seat is hovered, focused, or locked by a click.
 *
 * @param props - {@link SeatDetailProps}.
 * @returns The detail panel's contents: name, party, seat, the non-voting caveat where it applies, a link to the
 *   member's own page, and a link to the official biography when the record carries a real Bioguide ID.
 */
function SeatDetail({ chamber, member }: SeatDetailProps): JSX.Element {
  const seat: string = formatMemberSeat(member, chamber);
  const nonVoting: boolean = chamber === "house" && isNonVotingJurisdiction(member.state);
  // `undefined` for a placeholder seat, whose ID cannot resolve to a real person's biography. See bioguideUrl.
  const biographyUrl: string | undefined = member.bioguideId ? bioguideUrl(member.bioguideId) : undefined;

  return (
    <>
      <p className="seating-detail__name">{member.name}</p>
      <p className={`seating-detail__party ${partyTintClass(member.party)}`}>{formatMemberParty(member)}</p>
      {seat.length > 0 ? <p className="seating-detail__seat">{seat}</p> : null}
      {nonVoting ? (
        <p className="seating-detail__note">
          Delegates and the Resident Commissioner debate, serve on committees, and vote in committee, but cannot vote on
          final passage on the House floor.
        </p>
      ) : null}
      {member.bioguideId ? (
        <RecordLink className="text-link seating-detail__link" href={memberHref(member.bioguideId)}>
          View Full Profile <ArrowUpRight aria-hidden="true" size={14} />
        </RecordLink>
      ) : null}
      {biographyUrl ? (
        <OutboundLink className="text-link seating-detail__link" href={biographyUrl} iconSize={14}>
          Official Biography
        </OutboundLink>
      ) : null}
    </>
  );
}

/** Props for {@link CongressSeatingChart}. */
type CongressSeatingChartProps = {
  /** Both chambers' membership plus its live/preview provenance, resolved server-side. */
  composition: CongressComposition;
};

/**
 * An interactive diagram of who currently holds each seat in a chamber of Congress: one dot per member, colored by
 * party and arranged in the conventional half-disc, with the party balance summarized alongside it.
 *
 * Pointing at (or focusing) a seat reads out that member's name, party, and the state or district they represent, with
 * a link to their entry in the Biographical Directory. The chart takes a single tab stop and the arrow keys move
 * between seats from there (a roving tabindex, so nobody tabs through 441 seats to get past it). Each seat's accessible
 * name is its full description, so a screen reader hears a list of members rather than an unlabeled picture.
 *
 * A seat whose member has a Bioguide ID is an SVG `<a>` to that member's page, so it behaves like any other link. A
 * seat without one (every seat in preview mode, where the roster is deliberately unattributed) is a
 * `<circle role="button">` whose activation locks the read-out — the role declared explicitly because an HTML
 * `<button>` cannot be a child of `<svg>`.
 *
 * @param props - {@link CongressSeatingChartProps}.
 * @returns The chamber tabs, the SVG diagram, the seat read-out panel, the party legend, and the provenance line.
 */
export function CongressSeatingChart({ composition }: CongressSeatingChartProps): JSX.Element {
  const [chamber, setChamber] = useState<CongressChamber>("house");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const chartRef: RefObject<SVGSVGElement | null> = useRef<SVGSVGElement | null>(null);
  const tabsRef: RefObject<HTMLDivElement | null> = useRef<HTMLDivElement | null>(null);

  const selected: ChamberComposition = composition.chambers.find(
    (entry: ChamberComposition): boolean => entry.chamber === chamber,
  ) ?? { chamber, members: [], partyCounts: [], votingSeats: 0, nonVotingSeats: 0 };

  const members: CongressMember[] = selected.members;
  const seating: ChamberSeating = useMemo((): ChamberSeating => buildChamberSeating(members), [members]);

  const isPreview: boolean = composition.source === "preview";
  // Hover wins over focus, which wins over a locked click selection
  const shownIndex: number | null = hoveredIndex ?? focusedIndex ?? selectedIndex;
  const shownSeat: ChamberSeat | undefined = shownIndex === null ? undefined : seating.seats[shownIndex];

  /**
   * Switches chambers, clearing every seat-scoped piece of state so no read-out survives into a different chamber.
   *
   * @param next - The chamber to show.
   */
  function selectChamber(next: CongressChamber): void {
    setChamber(next);
    setHoveredIndex(null);
    setFocusedIndex(null);
    setSelectedIndex(null);
    setActiveIndex(0);
  }

  /**
   * Moves the roving tab stop to `index` and follows it with real DOM focus, so the browser announces the seat.
   *
   * Typed as `SVGElement` rather than `SVGCircleElement` because a seat is an `<a>` when its member has a page and a
   * bare `<circle>` when they don't — the focusable element differs, the lookup doesn't.
   *
   * @param index - The seat to move to, clamped to the chamber.
   */
  function moveActiveSeat(index: number): void {
    const clamped: number = Math.max(0, Math.min(seating.seats.length - 1, index));

    setActiveIndex(clamped);
    chartRef.current?.querySelector<SVGElement>(`[data-seat-index="${clamped}"]`)?.focus();
  }

  /**
   * Keyboard navigation within the chart: arrows, Page Up/Down, Home, and End move between seats; Enter and Space lock
   * the read-out on a seat with no page; Escape clears it.
   *
   * @param event - The chart's key event.
   */
  function handleChartKeyDown(event: KeyboardEvent<SVGSVGElement>): void {
    /* v8 ignore start -- the `<svg>` this is attached to only renders when there is at least one seat. */
    if (seating.seats.length === 0) return;
    /* v8 ignore stop */

    // Enter and Space lock the read-out on a seat that has nowhere to go. A seat whose member has a page is a real
    // link, so activation is left to the browser: intercepting it would break "Enter opens the link", and with it
    // opening the profile in a new tab or window.
    if (event.key === "Enter" || event.key === " ") {
      const targetIndex: number = focusedIndex ?? activeIndex;
      if (seating.seats[targetIndex]?.member.bioguideId) return;

      event.preventDefault();
      setSelectedIndex((prev: number | null): number | null => (prev === targetIndex ? null : targetIndex));
      return;
    }

    const step: number | undefined = SEAT_KEY_STEPS[event.key];

    if (step !== undefined) {
      event.preventDefault();
      moveActiveSeat((focusedIndex ?? activeIndex) + step);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      moveActiveSeat(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveActiveSeat(seating.seats.length - 1);
    } else if (event.key === "Escape") {
      setFocusedIndex(null);
      setHoveredIndex(null);
      setSelectedIndex(null);
    }
  }

  /**
   * Left/right arrows move between chamber tabs, per the ARIA tabs pattern.
   *
   * @param event - The tab list's key event.
   */
  function handleTabsKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step: number = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;

    event.preventDefault();

    const order: ChamberComposition[] = composition.chambers;
    const current: number = order.findIndex((entry: ChamberComposition): boolean => entry.chamber === chamber);
    const next: ChamberComposition | undefined = order[(current + step + order.length) % order.length];
    if (!next) return;

    selectChamber(next.chamber);
    tabsRef.current?.querySelector<HTMLButtonElement>(`[data-chamber="${next.chamber}"]`)?.focus();
  }

  /**
   * Clears the focus read-out only when focus actually leaves the chart.
   *
   * React's `onBlur` is delegated, so moving between seats fires blur-then-focus; clearing unconditionally made the
   * detail panel flicker back to its placeholder on every arrow keypress. `relatedTarget` is where focus is *going*, so
   * a move to another seat inside the chart is recognized and left alone.
   *
   * @param event - The chart's blur event.
   */
  function handleChartBlur(event: FocusEvent<SVGSVGElement>): void {
    const nextTarget: EventTarget | null = event.relatedTarget;
    if (nextTarget instanceof Node && chartRef.current?.contains(nextTarget)) return;

    setFocusedIndex(null);
  }

  /**
   * Shows the focused seat's read-out and makes it the roving tab stop.
   *
   * @param event - A focus event delegated from a seat.
   */
  function handleSeatFocus(event: FocusEvent<SVGSVGElement>): void {
    const index: number | null = seatIndexFromEvent(event.target);
    if (index === null) return;

    setFocusedIndex(index);
    setActiveIndex(index);
  }

  /**
   * Toggles the locked selection: clicking the selected seat clears it, clicking another selects that one.
   *
   * @param event - A click delegated from a seat.
   */
  function handleSeatClick(event: MouseEvent<SVGSVGElement>): void {
    const index: number | null = seatIndexFromEvent(event.target);
    if (index !== null) {
      setSelectedIndex((prev: number | null): number | null => (prev === index ? null : index));
    }
  }

  /**
   * Shows the hovered seat's read-out, or clears it when the pointer is between seats.
   *
   * @param event - A pointer event delegated from the chart.
   */
  function handleSeatHover(event: MouseEvent<SVGSVGElement>): void {
    setHoveredIndex(seatIndexFromEvent(event.target));
  }

  return (
    <section className="seating" aria-labelledby="seating-heading">
      <div className="seating__intro">
        <p className="section-kicker">The Current Chamber</p>
        <h2 id="seating-heading">Every Seat, and Who Holds It.</h2>
        <p className="seating__lede">
          Legislation is written by people, not institutions. Point at any seat — or tab into the chart and use the
          arrow keys — to see who occupies it, which party they sit with, and where they were elected. Open a seat to
          read that member&rsquo;s full record.
        </p>
      </div>

      <div
        aria-label="Chamber"
        className="seating__chambers"
        onKeyDown={handleTabsKeyDown}
        ref={tabsRef}
        role="tablist"
      >
        {composition.chambers.map(
          (entry: ChamberComposition): JSX.Element => (
            <button
              aria-controls={PANEL_ID}
              aria-selected={entry.chamber === chamber}
              className="seating__chamber-button"
              data-chamber={entry.chamber}
              id={tabId(entry.chamber)}
              key={entry.chamber}
              onClick={(): void => selectChamber(entry.chamber)}
              role="tab"
              tabIndex={entry.chamber === chamber ? 0 : -1}
              type="button"
            >
              <span className="seating__chamber-name">{chamberShortLabels[entry.chamber]}</span>
              <span className="seating__chamber-count">{describeChamberSeats(entry)}</span>
            </button>
          ),
        )}
      </div>

      <div aria-labelledby={tabId(chamber)} className="seating__layout" id={PANEL_ID} role="tabpanel">
        <div className="seating__chart-panel">
          <p className="sr-only" id={CHART_HELP_ID}>
            {chamberLabels[chamber]} of the {formatOrdinal(composition.congress)} Congress,{" "}
            {describeChamberSeats(selected)}. Use the left and right arrow keys to move between seats, Page Up and Page
            Down to jump by ten, and Home or End to reach the first or last seat. Press Enter on a seat to open that
            member&rsquo;s page.
          </p>

          {seating.seats.length > 0 ? (
            <svg
              aria-describedby={CHART_HELP_ID}
              aria-label={`${chamberLabels[chamber]} seating chart`}
              className="seating__chart"
              onClick={handleSeatClick}
              onBlur={handleChartBlur}
              onFocus={handleSeatFocus}
              onKeyDown={handleChartKeyDown}
              onMouseLeave={(): void => setHoveredIndex(null)}
              onMouseOver={handleSeatHover}
              ref={chartRef}
              viewBox={`0 0 ${seating.geometry.width} ${seating.geometry.height}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              {seating.seats.map(
                (seat: ChamberSeat): JSX.Element => (
                  <Seat
                    chamber={chamber}
                    isActive={seat.index === activeIndex}
                    isShown={seat.index === shownIndex}
                    key={seat.key}
                    radius={seating.geometry.seatRadius}
                    seat={seat}
                  />
                ),
              )}
            </svg>
          ) : (
            <p className="seating__empty">No membership records are available for this chamber right now.</p>
          )}

          <p className="seating__schematic-note">
            A schematic, not a floor plan. Congress.gov does not publish desk assignments, so seats are grouped by party
            in the way chamber composition is conventionally diagrammed.
          </p>
        </div>

        <aside className="seating-detail" aria-label="Selected seat">
          {shownSeat ? (
            <SeatDetail chamber={chamber} member={shownSeat.member} />
          ) : (
            <>
              <p className="seating-detail__name">{chamberLabels[chamber]}</p>
              <p className="seating-detail__seat">{describeChamberSeats(selected)}</p>
              <p className="seating-detail__note">
                {isPreview
                  ? "These are placeholder seats. Configure a Congress.gov API key to load the members actually serving."
                  : "Select a seat to see who holds it."}
              </p>
            </>
          )}
        </aside>
      </div>

      <ul className="seating__legend">
        {selected.partyCounts.map(
          (tally: PartyTally): JSX.Element => (
            <li className="seating__legend-item" key={tally.party}>
              <span aria-hidden="true" className={`seating__swatch ${partyTintClass(tally.party)}`} />
              <span className="seating__legend-party">{partyGroupLabels[tally.party]}</span>
              <span className="seating__legend-count">
                {tally.count}{" "}
                <span className="seating__legend-share">({formatSeatShare(tally.count, members.length)})</span>
              </span>
            </li>
          ),
        )}
      </ul>

      <p className={`seating__source seating__source--${composition.source}`}>
        {isPreview
          ? `Illustrative placeholder seats, not a real party breakdown. ${composition.notice ?? ""}`.trim()
          : "Membership from the Congress.gov member API, refreshed every five minutes. Vacant seats are simply absent."}
      </p>
    </section>
  );
}
