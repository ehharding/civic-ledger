/**
 * Covers seating.ts's geometry: that every member gets exactly one seat, that seats never overlap or escape the
 * viewBox, that arcs are filled in proportion to their radius, and that party blocks come out contiguous and in the
 * conventional left-to-right order.
 */
import { describe, expect, it } from "vitest";

import type { CongressMember, PartyGroup } from "@/lib/congress/members";
import {
  buildChamberSeating,
  type ChamberSeat,
  type ChamberSeating,
  compareMembersForSeating,
  computeSeatingGeometry,
  defaultRowCount,
  distributeSeatsAcrossRows,
  type SeatingGeometry,
  type SeatPosition,
} from "@/lib/congress/seating";

/** A realistic current-Congress House size: 435 voting seats plus the six non-voting ones. */
const HOUSE_SEATS: number = 441;
const SENATE_SEATS: number = 100;

function members(counts: Partial<Record<PartyGroup, number>>): CongressMember[] {
  const built: CongressMember[] = [];

  for (const [party, count] of Object.entries(counts)) {
    for (let seat: number = 0; seat < (count ?? 0); seat++) {
      built.push({ name: `Member ${built.length + 1}`, party: party as PartyGroup });
    }
  }

  return built;
}

describe("defaultRowCount", (): void => {
  it("scales the number of arcs with the seat count", (): void => {
    expect(defaultRowCount(HOUSE_SEATS)).toBe(12);
    expect(defaultRowCount(SENATE_SEATS)).toBe(6);
  });

  it("never returns more arcs than there are seats to fill them", (): void => {
    expect(defaultRowCount(2)).toBe(2);
    expect(defaultRowCount(1)).toBe(1);
  });

  it("returns no arcs for an empty chamber", (): void => {
    expect(defaultRowCount(0)).toBe(0);
  });
});

describe("distributeSeatsAcrossRows", (): void => {
  it("hands out exactly the requested number of seats", (): void => {
    const counts: number[] = distributeSeatsAcrossRows(441, [200, 250, 300, 350, 400, 450]);

    expect(counts.reduce((sum: number, count: number): number => sum + count, 0)).toBe(441);
  });

  it("gives the longer outer arcs more seats than the shorter inner ones", (): void => {
    const counts: number[] = distributeSeatsAcrossRows(100, [200, 300, 400]);

    expect(counts[0]).toBeLessThan(counts[1] ?? 0);
    expect(counts[1]).toBeLessThan(counts[2] ?? 0);
  });

  it("leaves no arc empty, since a gap would read as missing seats", (): void => {
    for (const count of distributeSeatsAcrossRows(5, [100, 200, 300, 400, 500])) {
      expect(count).toBeGreaterThan(0);
    }
  });

  it("handles the degenerate inputs without dividing by zero", (): void => {
    expect(distributeSeatsAcrossRows(0, [100, 200])).toEqual([0, 0]);
    expect(distributeSeatsAcrossRows(10, [])).toEqual([]);
  });
});

describe("computeSeatingGeometry", (): void => {
  it("produces one position per seat", (): void => {
    expect(computeSeatingGeometry(HOUSE_SEATS).positions).toHaveLength(HOUSE_SEATS);
    expect(computeSeatingGeometry(SENATE_SEATS).positions).toHaveLength(SENATE_SEATS);
  });

  it("keeps every seat, including its full radius, inside the viewBox", (): void => {
    const geometry: SeatingGeometry = computeSeatingGeometry(HOUSE_SEATS);

    for (const position of geometry.positions) {
      expect(position.x - geometry.seatRadius).toBeGreaterThanOrEqual(0);
      expect(position.x + geometry.seatRadius).toBeLessThanOrEqual(geometry.width);
      expect(position.y - geometry.seatRadius).toBeGreaterThanOrEqual(0);
      expect(position.y + geometry.seatRadius).toBeLessThanOrEqual(geometry.height);
    }
  });

  it("never overlaps two seats", (): void => {
    const geometry: SeatingGeometry = computeSeatingGeometry(HOUSE_SEATS);
    const positions: SeatPosition[] = geometry.positions;

    let closest: number = Number.POSITIVE_INFINITY;
    for (let a: number = 0; a < positions.length; a++) {
      for (let b: number = a + 1; b < positions.length; b++) {
        const first: SeatPosition = positions[a] as SeatPosition;
        const second: SeatPosition = positions[b] as SeatPosition;
        closest = Math.min(closest, Math.hypot(first.x - second.x, first.y - second.y));
      }
    }

    expect(closest).toBeGreaterThanOrEqual(geometry.seatRadius * 2);
  });

  it("draws the half-disc above the baseline, never below it", (): void => {
    const geometry: SeatingGeometry = computeSeatingGeometry(SENATE_SEATS);

    for (const position of geometry.positions) {
      expect(position.y).toBeLessThanOrEqual(geometry.centerY);
    }
  });

  it("orders positions left to right so party blocks come out contiguous across the whole chart", (): void => {
    const positions: SeatPosition[] = computeSeatingGeometry(HOUSE_SEATS).positions;

    for (let index: number = 1; index < positions.length; index++) {
      expect((positions[index] as SeatPosition).angle).toBeLessThanOrEqual(
        (positions[index - 1] as SeatPosition).angle,
      );
    }
  });

  it("returns an empty, still-renderable geometry for a chamber with no members", (): void => {
    const geometry: SeatingGeometry = computeSeatingGeometry(0);

    expect(geometry.positions).toEqual([]);
    expect(geometry.rows).toBe(0);
    expect(geometry.width).toBeGreaterThan(0);
  });

  it("honors an explicit row count", (): void => {
    expect(computeSeatingGeometry(SENATE_SEATS, 4).rows).toBe(4);
  });

  it("sizes seats from the arcs that actually hold them when an arc comes back empty", (): void => {
    // With more arcs than seats, the rebalancing loop gives up rather than emptying its only donor, so some arcs end up
    // with nothing on them. Seat size is derived from the tightest *occupied* arc; an empty one has no spacing to
    // contribute and must be skipped rather than divided by.
    const geometry: SeatingGeometry = computeSeatingGeometry(1, 3);

    expect(geometry.rows).toBe(3);
    expect(geometry.positions).toHaveLength(1);
    expect(geometry.seatRadius).toBeGreaterThan(0);
    expect(Number.isFinite(geometry.seatRadius)).toBe(true);
  });
});

describe("compareMembersForSeating", (): void => {
  it("orders by party first", (): void => {
    const unsorted: CongressMember[] = [
      { name: "R", party: "republican" },
      { name: "D", party: "democratic" },
      { name: "I", party: "independent" },
    ];
    const ordered: CongressMember[] = [...unsorted].sort(compareMembersForSeating);

    expect(ordered.map((entry: CongressMember): string => entry.name)).toEqual(["D", "I", "R"]);
  });

  it("keeps a state's delegation together within a party, then sorts by name", (): void => {
    const unsorted: CongressMember[] = [
      { name: "Zeta", party: "democratic", state: "Ohio" },
      { name: "Alpha", party: "democratic", state: "Ohio" },
      { name: "Beta", party: "democratic", state: "Alabama" },
    ];
    const ordered: CongressMember[] = [...unsorted].sort(compareMembersForSeating);

    expect(ordered.map((entry: CongressMember): string => entry.name)).toEqual(["Beta", "Alpha", "Zeta"]);
  });
});

describe("buildChamberSeating", (): void => {
  it("seats every member exactly once, with a unique key", (): void => {
    const seating: ChamberSeating = buildChamberSeating(members({ democratic: 220, republican: 221 }));

    expect(seating.seats).toHaveLength(HOUSE_SEATS);
    expect(new Set(seating.seats.map((seat: ChamberSeat): string => seat.key)).size).toBe(HOUSE_SEATS);
    expect(seating.seats.map((seat: ChamberSeat): number => seat.index)).toEqual(
      Array.from({ length: HOUSE_SEATS }, (_unused: unknown, index: number): number => index),
    );
  });

  it("lays parties out left to right in one contiguous block each", (): void => {
    const seating: ChamberSeating = buildChamberSeating(members({ democratic: 49, independent: 2, republican: 49 }));
    const parties: PartyGroup[] = seating.seats.map((seat: ChamberSeat): PartyGroup => seat.member.party);

    // Collapsing runs should leave exactly one run per party, in the conventional order.
    const runs: PartyGroup[] = parties.filter(
      (party: PartyGroup, index: number): boolean => index === 0 || party !== parties[index - 1],
    );
    expect(runs).toEqual(["democratic", "independent", "republican"]);
  });

  it("does not mutate the members array it was handed", (): void => {
    const original: CongressMember[] = members({ republican: 2, democratic: 1 });
    const before: string[] = original.map((entry: CongressMember): string => entry.name);

    buildChamberSeating(original);

    expect(original.map((entry: CongressMember): string => entry.name)).toEqual(before);
  });

  it("handles an empty chamber without throwing", (): void => {
    expect(buildChamberSeating([]).seats).toEqual([]);
  });
});

describe("single-arc and forced-arc geometry", (): void => {
  it("centers a single arc between the inner and outer radius rather than dividing by zero", (): void => {
    // The row-spacing formula divides by `rows - 1`, so one arc is the case that has to be special-cased. A chamber
    // small enough to need only one is not hypothetical — a committee-sized diagram would land here.
    const geometry: SeatingGeometry = computeSeatingGeometry(4, 1);

    expect(geometry.rows).toBe(1);
    expect(geometry.positions).toHaveLength(4);
    for (const position of geometry.positions) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }
    expect(geometry.seatRadius).toBeGreaterThan(0);
  });

  it("keeps a single arc's seats inside the viewBox like any other", (): void => {
    const geometry: SeatingGeometry = computeSeatingGeometry(12, 1);

    for (const position of geometry.positions) {
      expect(position.x - geometry.seatRadius).toBeGreaterThanOrEqual(0);
      expect(position.x + geometry.seatRadius).toBeLessThanOrEqual(geometry.width);
      expect(position.y - geometry.seatRadius).toBeGreaterThanOrEqual(0);
      expect(position.y + geometry.seatRadius).toBeLessThanOrEqual(geometry.height);
    }
  });

  it("fits everyone onto one arc rather than dropping members", (): void => {
    // Forcing a single arc doesn't reduce capacity — the distribution puts every seat on whatever arcs exist.
    const roster: CongressMember[] = members({ democratic: 30, republican: 30 });
    const seating: ChamberSeating = buildChamberSeating(roster, 1);

    expect(seating.seats).toHaveLength(roster.length);
    expect(seating.seats).toHaveLength(seating.geometry.positions.length);
    // Whoever is drawn is drawn once, in their own position.
    expect(new Set(seating.seats.map((seat: ChamberSeat): string => seat.key)).size).toBe(seating.seats.length);
  });

  it("omits members it cannot seat rather than drawing two people on one seat", (): void => {
    // Forcing zero arcs is the one input that yields fewer positions than members: the geometry short-circuits to an
    // empty half-disc while the roster is still full. The guard is what keeps that from indexing past the end and
    // seating people on `undefined`.
    const roster: CongressMember[] = members({ democratic: 30, republican: 30 });
    const seating: ChamberSeating = buildChamberSeating(roster, 0);

    expect(seating.geometry.positions).toEqual([]);
    expect(seating.seats).toEqual([]);
  });
});

describe("distributeSeatsAcrossRows with more arcs than seats", (): void => {
  it("stops redistributing rather than emptying a donor arc to fill another", (): void => {
    // The rebalancing loop hands a seat from the fullest arc to an empty one, but only while the donor has two to
    // spare — otherwise it would be trading one gap for another forever.
    const counts: number[] = distributeSeatsAcrossRows(2, [100, 200, 300, 400]);

    expect(counts.reduce((sum: number, count: number): number => sum + count, 0)).toBe(2);
    expect(counts).toHaveLength(4);
    expect(Math.max(...counts)).toBeLessThanOrEqual(2);
  });

  it("still places every seat when arcs outnumber them heavily", (): void => {
    const counts: number[] = distributeSeatsAcrossRows(1, [50, 100, 150, 200, 250]);

    expect(counts.reduce((sum: number, count: number): number => sum + count, 0)).toBe(1);
  });
});
