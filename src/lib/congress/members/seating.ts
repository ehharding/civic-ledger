import { type CongressMember, compareMembersByName, partySeatingRank } from "@/lib/congress/members/model";
import { compareText } from "@/lib/format";

/**
 * Pure geometry for the chamber seating chart: lay out seats in concentric arcs across a half-disc, then pair them with
 * members in party order. Free of React so the arithmetic can be unit-tested and shared by both chambers.
 */

/** Radius of the outermost arc, in user units. Every other dimension is derived from this. */
const OUTER_RADIUS: number = 470;

/**
 * Innermost arc radius, as a fraction of `OUTER_RADIUS`, leaving the empty well a chamber diagram is expected to have.
 */
const INNER_RADIUS_RATIO: number = 0.42;

/** Breathing room between the outermost seats and the edge of the viewBox, so focus rings aren't clipped. */
const EDGE_PADDING: number = 7;

/** A seat's largest radius as a fraction of the gap between arcs. */
const ROW_FILL_RATIO: number = 0.4;

/** A seat's largest radius as a fraction of its own arc's per-seat spacing. */
const ARC_FILL_RATIO: number = 0.42;

/** The largest seat radius, so a 100-seat chamber doesn't render absurdly large dots. */
const MAX_SEAT_RADIUS: number = 13;

/** The smallest seat radius, so a huge chamber's seats stay visible. */
const MIN_SEAT_RADIUS: number = 1.5;

/** The fewest arcs a chamber is drawn on, whatever its seat count. */
const MIN_ROWS: number = 3;

/** The most arcs a chamber is drawn on, whatever its seat count. */
const MAX_ROWS: number = 16;

/** One seat's placement: which arc it sits on, its polar coordinates, and the resolved center point to draw at. */
export type SeatPosition = {
  /** Arc index, 0 = innermost. */
  row: number;
  /** Radians, measured from the positive x-axis: `Math.PI` is the viewer's left, `0` the viewer's right. */
  angle: number;
  /** The arc's radius, in user units. */
  radius: number;
  /** The seat center's x coordinate within the viewBox. */
  x: number;
  /** The seat center's y coordinate within the viewBox. */
  y: number;
};

/** A complete laid-out half-disc of seats, plus the viewBox dimensions needed to render it. */
export type SeatingGeometry = {
  /** The viewBox width. */
  width: number;
  /** The viewBox height. */
  height: number;
  /** The x coordinate every arc is centered on. */
  centerX: number;
  /** The y coordinate every arc is centered on — the half-disc's flat edge. */
  centerY: number;
  /** The radius every seat is drawn at. */
  seatRadius: number;
  /** How many arcs the seats are spread across. */
  rows: number;
  /** Every seat position, ordered left to right across the half-disc. */
  positions: SeatPosition[];
};

/**
 * How many arcs to draw for a given number of seats.
 *
 * Grows with the square root of the count so the arcs stay roughly as far apart as the seats along them are — 435 House
 * seats land on 12 arcs, 100 Senate seats on 6.
 *
 * @param seatCount - Seats to lay out.
 * @returns The arc count, clamped between {@link MIN_ROWS} and {@link MAX_ROWS} (and never more than the seat count) so
 *   a very small chamber still reads as a half-disc rather than a single thin line. `0` for an empty chamber.
 */
export function defaultRowCount(seatCount: number): number {
  if (seatCount <= 0) return 0;

  const scaled: number = Math.round(Math.sqrt(seatCount / 3));
  return Math.min(seatCount, Math.max(MIN_ROWS, Math.min(MAX_ROWS, scaled)));
}

/**
 * Splits seats across arcs in proportion to each arc's radius, so density is even across the half-disc. Uses the
 * largest-remainder method so the counts sum to *exactly* `seatCount` — rounding would leave an empty chair or an
 * unseated member.
 *
 * @param seatCount - Total seats to distribute.
 * @param radii - Each arc's radius, innermost first.
 * @returns Seats per arc, in the same order, summing to `seatCount`. No arc is left at zero while another has two or
 *   more to spare, since an empty arc renders as a visible gap in the half-disc.
 */
export function distributeSeatsAcrossRows(seatCount: number, radii: number[]): number[] {
  if (radii.length === 0 || seatCount <= 0) return radii.map((): number => 0);

  const totalRadius: number = radii.reduce((sum: number, radius: number): number => sum + radius, 0);
  const exactShares: number[] = radii.map((radius: number): number => (seatCount * radius) / totalRadius);
  const counts: number[] = exactShares.map((share: number): number => Math.floor(share));

  const assigned: number = counts.reduce((sum: number, count: number): number => sum + count, 0);
  const byLargestRemainder: number[] = exactShares
    .map((share: number, index: number): { index: number; remainder: number } => ({
      index,
      remainder: share - Math.floor(share),
    }))
    .sort(
      (a: { index: number; remainder: number }, b: { index: number; remainder: number }): number =>
        b.remainder - a.remainder,
    )
    .map((entry: { index: number; remainder: number }): number => entry.index);

  // Flooring each share loses less than one seat per arc, so there are always fewer leftovers than arcs to hand them
  // to; the modulo is belt-and-braces against a caller passing pathological radii. Every `?? 0` below indexes at a
  // position already proven valid; they exist only for `noUncheckedIndexedAccess`, and sit on their own `v8 ignore`d
  // lines so the real control flow stays measured.
  const leftover: number = seatCount - assigned;
  for (let seat: number = 0; seat < leftover; seat++) {
    /* v8 ignore start */
    const target: number = byLargestRemainder[seat % byLargestRemainder.length] ?? 0;
    counts[target] = (counts[target] ?? 0) + 1;
    /* v8 ignore stop */
  }

  // An arc allocated zero seats would render as a visible gap in the half-disc. Since `defaultRowCount` never returns
  // more arcs than there are seats, there is always a donor arc with at least two.
  for (let row: number = 0; row < counts.length; row++) {
    /* v8 ignore start */
    const current: number = counts[row] ?? 0;
    /* v8 ignore stop */
    if (current > 0) continue;

    const donor: number = counts.reduce(
      /* v8 ignore start */
      (best: number, count: number, index: number): number => (count > (counts[best] ?? 0) ? index : best),
      /* v8 ignore stop */
      0,
    );
    /* v8 ignore start */
    const donorCount: number = counts[donor] ?? 0;
    /* v8 ignore stop */
    if (donorCount < 2) break;

    counts[donor] = donorCount - 1;
    counts[row] = 1;
  }

  return counts;
}

/**
 * Lays out seats across a half-disc. Each seat sits mid-slice on its arc (even end margins, no divide-by-zero for one
 * seat), and the result is sorted left to right so party-ordered members form blocks across the whole chart.
 *
 * @param seatCount - How many seats to place.
 * @param rowOverride - Force a specific arc count instead of {@link defaultRowCount}'s. Mainly for tests and for
 *   exploring the layout.
 * @returns The complete geometry: viewBox dimensions, center, seat radius, arc count, and every seat position ordered
 *   left to right. An empty but validly-sized geometry when there are no seats to draw.
 */
export function computeSeatingGeometry(seatCount: number, rowOverride?: number): SeatingGeometry {
  const rows: number = Math.max(0, rowOverride ?? defaultRowCount(seatCount));

  if (seatCount <= 0 || rows === 0) {
    const emptySize: number = 2 * (OUTER_RADIUS + EDGE_PADDING);
    return {
      width: emptySize,
      height: emptySize / 2,
      centerX: emptySize / 2,
      centerY: emptySize / 2,
      seatRadius: 0,
      rows: 0,
      positions: [],
    };
  }

  const innerRadius: number = OUTER_RADIUS * INNER_RADIUS_RATIO;
  const rowSpacing: number = rows > 1 ? (OUTER_RADIUS - innerRadius) / (rows - 1) : OUTER_RADIUS - innerRadius;
  const radii: number[] = Array.from({ length: rows }, (_unused: unknown, row: number): number =>
    rows > 1 ? innerRadius + rowSpacing * row : (innerRadius + OUTER_RADIUS) / 2,
  );

  const seatsPerRow: number[] = distributeSeatsAcrossRows(seatCount, radii);

  // A seat has to fit both between its neighbors along its own arc and between the arc it's on and the next one out.
  const tightestArcSpacing: number = radii.reduce((tightest: number, radius: number, row: number): number => {
    /* v8 ignore start -- `distributeSeatsAcrossRows` returns one entry per radius, so this index always resolves. */
    const count: number = seatsPerRow[row] ?? 0;
    /* v8 ignore stop */
    return count > 0 ? Math.min(tightest, (Math.PI * radius) / count) : tightest;
  }, Number.POSITIVE_INFINITY);

  const seatRadius: number = Math.max(
    MIN_SEAT_RADIUS,
    Math.min(MAX_SEAT_RADIUS, rowSpacing * ROW_FILL_RATIO, tightestArcSpacing * ARC_FILL_RATIO),
  );

  const centerX: number = OUTER_RADIUS + seatRadius + EDGE_PADDING;
  const centerY: number = OUTER_RADIUS + seatRadius + EDGE_PADDING;

  const positions: SeatPosition[] = [];
  for (let row: number = 0; row < rows; row++) {
    /* v8 ignore start -- both arrays are exactly `rows` long, so the loop bound has already proven these resolve. */
    const radius: number = radii[row] ?? 0;
    const count: number = seatsPerRow[row] ?? 0;
    /* v8 ignore stop */

    for (let seat: number = 0; seat < count; seat++) {
      const angle: number = Math.PI - (Math.PI * (seat + 0.5)) / count;
      positions.push({
        row,
        angle,
        radius,
        x: centerX + radius * Math.cos(angle),
        y: centerY - radius * Math.sin(angle),
      });
    }
  }

  // Left to right; ties (a seat at the same angle on two arcs) fall inner-arc-first so the order is deterministic.
  positions.sort((a: SeatPosition, b: SeatPosition): number => b.angle - a.angle || a.radius - b.radius);

  return {
    width: 2 * centerX,
    height: centerY + seatRadius + EDGE_PADDING,
    centerX,
    centerY,
    seatRadius,
    rows,
    positions,
  };
}

/** One drawn seat: the member who holds it, where it sits, and a stable key for React. */
export type ChamberSeat = {
  /** A React key, unique within the chamber. */
  key: string;
  /** The seat's place in left-to-right order. */
  index: number;
  /** Who holds the seat. */
  member: CongressMember;
  /** Where the seat is drawn. */
  position: SeatPosition;
};

/** A chamber's complete seating chart. */
export type ChamberSeating = {
  /** The laid-out half-disc. */
  geometry: SeatingGeometry;
  /** One seat per member, left to right. */
  seats: ChamberSeat[];
};

/**
 * Orders members for seating: by party, then state (keeping delegations adjacent), then name — fully deterministic.
 * Uses the locale-pinned `compareText`, since the chart is laid out on both server and client and must match.
 *
 * @param a - One member to compare.
 * @param b - The other member to compare.
 * @returns A standard comparator result.
 */
export function compareMembersForSeating(a: CongressMember, b: CongressMember): number {
  const partyDelta: number = partySeatingRank(a.party) - partySeatingRank(b.party);
  if (partyDelta !== 0) return partyDelta;

  const stateDelta: number = compareText(a.state ?? "", b.state ?? "");
  if (stateDelta !== 0) return stateDelta;

  return compareMembersByName(a, b);
}

/**
 * Builds a chamber's seating chart: one seat per member, left to right, each party in a contiguous block. A schematic,
 * not a floor plan — Congress.gov publishes no desk assignments, and the chart's caption says so.
 *
 * @param members - The chamber's members, in any order. Not mutated.
 * @param rowOverride - Force a specific arc count.
 * @returns The geometry plus one seat per member. A member with no position available (only possible if a caller forces
 *   an arc count too small to hold everyone) is omitted rather than drawn on top of someone else.
 * @see computeSeatingGeometry
 */
export function buildChamberSeating(members: readonly CongressMember[], rowOverride?: number): ChamberSeating {
  const ordered: CongressMember[] = members.toSorted(compareMembersForSeating);
  const geometry: SeatingGeometry = computeSeatingGeometry(ordered.length, rowOverride);

  const seats: ChamberSeat[] = ordered.flatMap((member: CongressMember, index: number): ChamberSeat[] => {
    const position: SeatPosition | undefined = geometry.positions[index];
    if (!position) return [];

    return [{ key: `${member.bioguideId ?? "seat"}-${index}`, index, member, position }];
  });

  return { geometry, seats };
}
