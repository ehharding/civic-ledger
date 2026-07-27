"use client";

import { ExternalLink } from "lucide-react";
import {
  type FocusEvent,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  bioguideUrl,
  type ChamberComposition,
  type CongressChamber,
  type CongressComposition,
  type CongressMember,
  chamberLabels,
  chamberShortLabels,
  formatMemberParty,
  formatMemberSeat,
  formatMemberSummary,
  isNonVotingJurisdiction,
  type PartyTally,
  partyGroupLabels,
} from "@/lib/congress/members";
import { buildChamberSeating, type ChamberSeat, type ChamberSeating } from "@/lib/congress/seating";
import { formatOrdinal } from "@/lib/format";

/** How far PageUp/PageDown jump along the arc, in seats. */
const PAGE_STEP: number = 10;

const PANEL_ID: string = "seating-panel";
const CHART_HELP_ID: string = "seating-chart-help";

/** The id of one chamber's tab, referenced by the panel so it stays labeled by whichever chamber is showing. */
function tabId(chamber: CongressChamber): string {
  return `seating-tab-${chamber}`;
}

/**
 * Reads the seat index off whatever element an event landed on. Every seat carries `data-seat-index`, so one handler on
 * the chart covers all ~540 of them — meaningfully cheaper than attaching separate listeners per seat, and it keeps
 * hover, focus, and keyboard movement on a single code path.
 */
function seatIndexFromEvent(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;

  const raw: string | null = target.getAttribute("data-seat-index");
  if (raw === null) return null;

  const index: number = Number(raw);
  return Number.isInteger(index) ? index : null;
}

/** The share of a chamber's seats a party holds, to one decimal place. */
export function formatSeatShare(count: number, total: number): string {
  if (total <= 0) return "0%";

  return `${(Math.round((count / total) * 1000) / 10).toFixed(1)}%`;
}

/**
 * Plain-English description of how a chamber's seats break down between voting members and, in the House, the six
 * Delegates and the Resident Commissioner who hold a seat but no floor vote — a distinction a chamber diagram otherwise
 * quietly erases by drawing all 441 seats identically.
 */
export function describeChamberSeats(chamber: ChamberComposition): string {
  const seats: string = `${chamber.members.length} ${chamber.members.length === 1 ? "seat" : "seats"}`;

  if (chamber.nonVotingSeats === 0) return seats;

  return `${seats} — ${chamber.votingSeats} voting, ${chamber.nonVotingSeats} non-voting`;
}

/** The read-out shown when a seat is hovered or focused. */
function SeatDetail({ chamber, member }: { chamber: CongressChamber; member: CongressMember }): JSX.Element {
  const seat: string = formatMemberSeat(member, chamber);
  const nonVoting: boolean = chamber === "house" && isNonVotingJurisdiction(member.state);

  return (
    <>
      <p className="seating-detail__name">{member.name}</p>
      <p className={`seating-detail__party seating-detail__party--${member.party}`}>{formatMemberParty(member)}</p>
      {seat.length > 0 ? <p className="seating-detail__seat">{seat}</p> : null}
      {nonVoting ? (
        <p className="seating-detail__note">
          Delegates and the Resident Commissioner debate, serve on committees, and vote in committee, but cannot vote on
          final passage on the House floor.
        </p>
      ) : null}
      {member.bioguideId ? (
        <a className="text-link seating-detail__link" href={bioguideUrl(member.bioguideId)}>
          Official Biography <ExternalLink aria-hidden="true" size={14} />
        </a>
      ) : null}
    </>
  );
}

/**
 * An interactive diagram of who currently holds each seat in a chamber of Congress: one dot per member, colored by
 * party and arranged in the conventional half-disc, with the party balance summarized alongside it.
 *
 * Pointing at (or focusing) a seat reads out that member's name, party, and the state or district they represent, with
 * a link to their entry in the Biographical Directory. Because a chart driven only by hover is unusable without a
 * mouse, every seat is also reachable from the keyboard: the chart takes a single tab stop and the arrow keys move
 * between seats from there (a roving tabindex, so nobody is forced through 441 tab stops to get past the chart). Each
 * seat additionally carries its full description as its accessible name, so the diagram reads as a list of
 * members to a screen reader rather than as an unlabeled picture.
 *
 * Seats are `<circle role="button">` rather than real buttons because an HTML `<button>` cannot be a child of `<svg>`.
 * A seat is genuinely an activatable control, so the role is declared explicitly and the roving tabindex supplies the
 * keyboard behavior a real button would otherwise have brought with it.
 */
export function CongressSeatingChart({ composition }: { composition: CongressComposition }): JSX.Element {
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

  function selectChamber(next: CongressChamber): void {
    setChamber(next);
    setHoveredIndex(null);
    setFocusedIndex(null);
    setSelectedIndex(null);
    setActiveIndex(0);
  }

  /** Moves the roving tab stop to `index` and follows it with real DOM focus, so the browser announces the seat. */
  function moveActiveSeat(index: number): void {
    const clamped: number = Math.max(0, Math.min(seating.seats.length - 1, index));

    setActiveIndex(clamped);
    chartRef.current?.querySelector<SVGCircleElement>(`[data-seat-index="${clamped}"]`)?.focus();
  }

  function handleChartKeyDown(event: KeyboardEvent<SVGSVGElement>): void {
    if (seating.seats.length === 0) return;

    // Add Enter and Space key support to lock the selection
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const targetIndex: number = focusedIndex ?? activeIndex;
      setSelectedIndex((prev: number | null): number | null => (prev === targetIndex ? null : targetIndex));
      return;
    }

    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      PageDown: PAGE_STEP,
      PageUp: -PAGE_STEP,
    };
    const step: number | undefined = steps[event.key];

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

  /** Left/right arrows move between chamber tabs, per the ARIA tabs pattern. */
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

  function handleSeatFocus(event: FocusEvent<SVGSVGElement>): void {
    const index: number | null = seatIndexFromEvent(event.target);
    if (index === null) return;

    setFocusedIndex(index);
    setActiveIndex(index);
  }

  function handleSeatClick(event: MouseEvent<SVGSVGElement>): void {
    const index: number | null = seatIndexFromEvent(event.target);
    if (index !== null) {
      // Toggle the selection: clicking the same seat deselects it, clicking a new seat selects it
      setSelectedIndex((prev: number | null): number | null => (prev === index ? null : index));
    }
  }

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
          arrow keys — to see who occupies it, which party they sit with, and where they were elected.
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
            Down to jump by ten, and Home or End to reach the first or last seat.
          </p>

          {seating.seats.length > 0 ? (
            <svg
              aria-describedby={CHART_HELP_ID}
              aria-label={`${chamberLabels[chamber]} seating chart`}
              className="seating__chart"
              onClick={handleSeatClick}
              onBlur={(): void => setFocusedIndex(null)}
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
                  // biome-ignore lint/a11y/useSemanticElements: an HTML <button> cannot be a child of <svg>.
                  <circle
                    aria-label={formatMemberSummary(seat.member, chamber)}
                    className={`seating__seat seating__seat--${seat.member.party}${
                      seat.index === shownIndex ? " is-active" : ""
                    }`}
                    // Fix: Normalize floating point numbers to avoid SSR hydration mismatches
                    cx={seat.position.x.toFixed(4)}
                    cy={seat.position.y.toFixed(4)}
                    data-seat-index={seat.index}
                    key={seat.key}
                    r={
                      Number.isFinite(seating.geometry.seatRadius)
                        ? seating.geometry.seatRadius.toFixed(4)
                        : seating.geometry.seatRadius
                    }
                    role="button"
                    tabIndex={seat.index === activeIndex ? 0 : -1}
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
              <span aria-hidden="true" className={`seating__swatch seating__swatch--${tally.party}`} />
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
