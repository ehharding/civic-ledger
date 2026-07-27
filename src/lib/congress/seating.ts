import { type CongressMember, partySeatingRank } from "@/lib/congress/members";

/**
 * Pure geometry for the chamber seating chart: given a seat count, lay out that many seats in concentric arcs across a
 * half-disc, then pair them with members in party order.
 *
 * Everything here is deliberately free of React and of any Congress.gov concern so the arithmetic — which is the part
 * that's easy to get subtly wrong — can be unit-tested directly, and so both chambers share one implementation rather
 * than two hand-tuned ones.
 */

/** Radius of the outermost arc, in user units. Every other dimension is derived from this. */
const OUTER_RADIUS: number = 470;

/**
 * Innermost arc radius, as a fraction of `OUTER_RADIUS`. Leaves an empty well at the center of the half-disc — the
 * shape a chamber diagram is expected to have, and room for the rostrum the arcs face.
 */
const INNER_RADIUS_RATIO: number = 0.42;

/** Breathing room between the outermost seats and the edge of the viewBox, so focus rings aren't clipped. */
const EDGE_PADDING: number = 7;

/** A seat's radius as a fraction of the gap between arcs, and of its own arc's per-seat spacing. */
const ROW_FILL_RATIO: number = 0.4;
const ARC_FILL_RATIO: number = 0.42;

/** Bounds on seat size, so a 100-seat chamber doesn't render absurdly large dots and a huge one stays visible. */
const MAX_SEAT_RADIUS: number = 13;
const MIN_SEAT_RADIUS: number = 1.5;

/** Bounds on the number of arcs, independent of seat count. */
const MIN_ROWS: number = 3;
const MAX_ROWS: number = 16;

/** One seat's placement: which arc it sits on, its polar coordinates, and the resolved center point to draw at. */
export type SeatPosition = {
  /** Arc index, 0 = innermost. */
  row: number;
  /** Radians, measured from the positive x-axis: `Math.PI` is the viewer's left, `0` the viewer's right. */
  angle: number;
  radius: number;
  x: number;
  y: number;
};

/** A complete laid-out half-disc of seats, plus the viewBox dimensions needed to render it. */
export type SeatingGeometry = {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  seatRadius: number;
  rows: number;
  /** Every seat position, ordered left to right across the half-disc. */
  positions: SeatPosition[];
};

/**
 * How many arcs to draw for `seatCount` seats. Grows with the square root of the count so the arcs stay roughly as
 * far apart as the seats along them are — 435 House seats land on 12 arcs, 100 Senate seats on 6 — and is clamped so
 * a very small chamber still reads as a half-disc rather than a single thin line.
 */
export function defaultRowCount(seatCount: number): number {
  if (seatCount <= 0) return 0;

  const scaled: number = Math.round(Math.sqrt(seatCount / 3));
  return Math.min(seatCount, Math.max(MIN_ROWS, Math.min(MAX_ROWS, scaled)));
}

/**
 * Splits `seatCount` seats across arcs in proportion to each arc's radius, so seat density is even across the half-disc
 * instead of crowding the short inner arcs.
 *
 * Uses the largest-remainder method: floor every proportional share, then hand the leftover seats to the arcs with the
 * largest fractional parts. That guarantees the returned counts sum to exactly `seatCount` — a plain round-and-hope
 * would drift by a seat or two, which for a chamber diagram means either an unseated member or an empty chair.
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
  // to; the modulo is belt-and-braces against a caller passing pathological radii.
  const leftover: number = seatCount - assigned;
  for (let seat: number = 0; seat < leftover; seat++) {
    const target: number = byLargestRemainder[seat % byLargestRemainder.length] ?? 0;
    counts[target] = (counts[target] ?? 0) + 1;
  }

  // An arc allocated zero seats would render as a visible gap in the half-disc. Since `defaultRowCount` never returns
  // more arcs than there are seats, there is always a donor arc with at least two.
  for (let row: number = 0; row < counts.length; row++) {
    if ((counts[row] ?? 0) > 0) continue;

    const donor: number = counts.reduce(
      (best: number, count: number, index: number): number => (count > (counts[best] ?? 0) ? index : best),
      0,
    );
    if ((counts[donor] ?? 0) < 2) break;

    counts[donor] = (counts[donor] ?? 0) - 1;
    counts[row] = 1;
  }

  return counts;
}

/**
 * Lays out `seatCount` seats across a half-disc and returns them ordered left to right.
 *
 * Seats are placed at the midpoint of an equal angular slice of their arc (rather than at slice boundaries), which
 * keeps a consistent margin at both ends of every arc and handles a single-seat arc without dividing by zero. The final
 * sort is by angle descending — left to right from the viewer's perspective — so that assigning members in party order
 * produces contiguous party blocks across the whole chart, not per-arc ones.
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
    const count: number = seatsPerRow[row] ?? 0;
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
    const radius: number = radii[row] ?? 0;
    const count: number = seatsPerRow[row] ?? 0;

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
  key: string;
  index: number;
  member: CongressMember;
  position: SeatPosition;
};

export type ChamberSeating = {
  geometry: SeatingGeometry;
  seats: ChamberSeat[];
};

/**
 * Orders members for seating: by party (see `partySeatingOrder`), then by represented jurisdiction, then by name.
 * Sorting within a party by state keeps a delegation adjacent on the chart and — more importantly — makes the order
 * fully deterministic, so the same membership always produces the same picture rather than one that reshuffles
 * whenever the upstream list comes back in a different order.
 */
export function compareMembersForSeating(a: CongressMember, b: CongressMember): number {
  const partyDelta: number = partySeatingRank(a.party) - partySeatingRank(b.party);
  if (partyDelta !== 0) return partyDelta;

  const stateDelta: number = (a.state ?? "").localeCompare(b.state ?? "");
  if (stateDelta !== 0) return stateDelta;

  return a.name.localeCompare(b.name);
}

/**
 * Builds a chamber's complete seating chart: one seat per member, laid out left to right with each party in a
 * contiguous block.
 *
 * **This is a schematic, not a floor plan.** Congress.gov publishes no desk assignments, and neither chamber seats its
 * members in a tidy party-ordered arc in reality. The arrangement here is the conventional way chamber composition is
 * *diagrammed* — it communicates how many seats each party holds and lets a person reach any individual member, and the
 * chart says as much in its own caption rather than leaving a reader to assume otherwise.
 */
export function buildChamberSeating(members: CongressMember[], rowOverride?: number): ChamberSeating {
  const ordered: CongressMember[] = [...members].sort(compareMembersForSeating);
  const geometry: SeatingGeometry = computeSeatingGeometry(ordered.length, rowOverride);

  const seats: ChamberSeat[] = ordered.flatMap((member: CongressMember, index: number): ChamberSeat[] => {
    const position: SeatPosition | undefined = geometry.positions[index];
    if (!position) return [];

    return [{ key: `${member.bioguideId ?? "seat"}-${index}`, index, member, position }];
  });

  return { geometry, seats };
}
