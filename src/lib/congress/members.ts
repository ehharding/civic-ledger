import { formatOrdinal } from "@/lib/format";

/**
 * The party groupings this app renders. Congress.gov publishes a free-text `partyName` whose documented values are
 * "Democratic", "Independent", "Independent Democrat", "Libertarian", and "Republican" — this closed union is what the
 * rest of the app switches on, so a new or misspelled upstream label degrades to "other" instead of leaking an
 * unstyled, unlabeled value into the UI. The member's verbatim upstream label is preserved separately on
 * `CongressMember.partyName`, so nothing is *lost* by grouping — only normalized for color and tally purposes.
 */
export const partyGroups = ["democratic", "republican", "independent", "libertarian", "other"] as const;

export type PartyGroup = (typeof partyGroups)[number];

/** Human-readable labels for each PartyGroup, used anywhere a group needs to be displayed on its own. */
export const partyGroupLabels: Record<PartyGroup, string> = {
  democratic: "Democratic",
  republican: "Republican",
  independent: "Independent",
  libertarian: "Libertarian",
  other: "Other",
};

/**
 * The left-to-right order parties are seated in on the chart, matching the convention nearly every published
 * chamber diagram uses (Democratic caucus on the viewer's left, Republican on the right, everyone else between them).
 *
 * This is a *presentational* convention, not a record of where anyone actually sits — see the note on
 * `buildChamberSeating` in seating.ts, and the caption the chart renders alongside itself.
 */
export const partySeatingOrder: readonly PartyGroup[] = [
  "democratic",
  "independent",
  "libertarian",
  "other",
  "republican",
];

/**
 * Where `party` falls in {@link partySeatingOrder}.
 *
 * @param party - The party group to rank.
 * @returns Its index in the seating order, or one past the end for anything unlisted — so an unrecognized group sorts
 *   last rather than throwing or silently sorting first.
 */
export function partySeatingRank(party: PartyGroup): number {
  const rank: number = partySeatingOrder.indexOf(party);
  return rank === -1 ? partySeatingOrder.length : rank;
}

/**
 * Narrows Congress.gov's free-text party label to a {@link PartyGroup}.
 *
 * Prefix matching (rather than exact equality) is deliberate: the API's own documentation lists both "Democratic" and
 * "Democrat" across its member endpoints, describes "Independent Democrat" as a distinct value, and contains a
 * long-standing "Republication" typo in its element table. Matching on the stem absorbs all of those without needing
 * an exhaustive list of spellings. "Independent Democrat" is checked first so it groups as independent rather than
 * being swallowed by the democratic branch.
 *
 * @param partyName - The upstream `partyName`, if any.
 * @returns The matching group, or `"other"` for anything unrecognized — never a thrown error, since a new party label
 *   appearing upstream should degrade a color swatch, not take down the page.
 */
export function normalizePartyName(partyName?: string): PartyGroup {
  const value: string = (partyName ?? "").trim().toLowerCase();

  if (value.startsWith("independent")) return "independent";
  if (value.startsWith("democrat")) return "democratic";
  if (value.startsWith("republic")) return "republican";
  if (value.startsWith("libertarian")) return "libertarian";

  return "other";
}

/** The two chambers of Congress, as this app identifies them internally. */
export const congressChambers = ["house", "senate"] as const;

export type CongressChamber = (typeof congressChambers)[number];

/** Full chamber names, for headings and prose. */
export const chamberLabels: Record<CongressChamber, string> = {
  house: "House of Representatives",
  senate: "Senate",
};

/** Short chamber names, for the chart's chamber toggle and other tight spaces. */
export const chamberShortLabels: Record<CongressChamber, string> = {
  house: "House",
  senate: "Senate",
};

/**
 * Narrows Congress.gov's chamber string to a {@link CongressChamber}.
 *
 * @param chamber - The upstream chamber string ("House of Representatives" or "Senate"), if any.
 * @returns The matching chamber, or `null` for anything unrecognized — so callers drop the record rather than seat a
 *   member in a chamber that doesn't exist.
 */
export function normalizeChamberName(chamber?: string): CongressChamber | null {
  const value: string = (chamber ?? "").trim().toLowerCase();

  if (value === "house of representatives" || value === "house") return "house";
  if (value === "senate") return "senate";

  return null;
}

/**
 * The six jurisdictions whose House seat carries no floor vote — the five territorial Delegates plus Puerto Rico's
 * Resident Commissioner. Congress.gov's *list*-level member records don't include the `memberType` field that would say
 * so directly (that's item-level only, which would mean one extra request per member), but the represented jurisdiction
 * determines it unambiguously, so it's derived from `state` instead.
 *
 * Variant spellings are included because the represented-jurisdiction string is upstream free text, and a missed
 * variant would silently miscount a non-voting seat as a voting one.
 */
const NON_VOTING_HOUSE_JURISDICTIONS: ReadonlySet<string> = new Set<string>([
  "american samoa",
  "district of columbia",
  "guam",
  "northern mariana islands",
  "commonwealth of the northern mariana islands",
  "puerto rico",
  "virgin islands",
  "u.s. virgin islands",
  "us virgin islands",
  "united states virgin islands",
]);

/**
 * Whether a House seat representing `state` is one of the six non-voting seats.
 *
 * @param state - The represented state, territory, or district, by full name.
 * @returns `true` for the five territorial Delegates' jurisdictions and Puerto Rico. Only meaningful for House members
 *   — every Senate seat votes, so callers should not consult this for senators.
 */
export function isNonVotingJurisdiction(state?: string): boolean {
  return NON_VOTING_HOUSE_JURISDICTIONS.has((state ?? "").trim().toLowerCase());
}

/**
 * One seated member of Congress, normalized from the Congress.gov member list endpoint.
 *
 * Everything except `name` and `party` is optional because the list endpoint genuinely omits fields (`district` is
 * Senate-irrelevant; `bioguideId` is absent from the preview placeholders), and because this shape is serialized into
 * the page payload for every seat in the chamber — it deliberately carries only what the chart actually displays rather
 * than the full upstream record. Chamber isn't a field here: it's implied by the `ChamberComposition` a member is
 * grouped under.
 */
export type CongressMember = {
  /** Biographical Directory ID (e.g., "L000174") — the stable key for linking out to an official biography. */
  bioguideId?: string;
  /** The member's name in last-name-first order, exactly as Congress.gov publishes it. */
  name: string;
  party: PartyGroup;
  /** The upstream party label, kept verbatim so a nuance like "Independent Democrat" isn't flattened away. */
  partyName?: string;
  /** The represented state, territory, or district, by full name (e.g. "Vermont"). */
  state?: string;
  /** House only. `0` means the state, territory, or district has a single at-large seat. */
  district?: number;
};

/** How many seats one party holds in a chamber. */
export type PartyTally = {
  party: PartyGroup;
  count: number;
};

/** One chamber's membership: the seated members themselves plus the tallies the legend and summary line need. */
export type ChamberComposition = {
  chamber: CongressChamber;
  members: CongressMember[];
  /** Party tallies in `partySeatingOrder`, so the legend reads left-to-right in the same order the chart is drawn. */
  partyCounts: PartyTally[];
  /** Seats whose holder votes on the chamber floor. Equal to `members.length` for the Senate. */
  votingSeats: number;
  /** The House's non-voting Delegates and Resident Commissioner. Always `0` for the Senate. */
  nonVotingSeats: number;
};

/**
 * The makeup of both chambers of one Congress, plus the same live/preview provenance every other fetch in this app
 * reports. Mirrors `CongressSnapshot`'s shape deliberately: provenance travels with the data, never separately.
 */
export type CongressComposition = {
  congress: number;
  chambers: ChamberComposition[];
  source: "live" | "preview";
  retrievedAt: string;
  /** User-facing explanation shown when `source` is "preview" (no API key, or a transient upstream failure). */
  notice?: string;
};

/**
 * Tallies members by party.
 *
 * @param members - The chamber's members.
 * @returns One tally per party that actually holds a seat, ordered by {@link partySeatingOrder} so the legend reads
 *   left-to-right in the same order the chart is drawn. Parties with no seats are omitted rather than rendered as a row
 *   of zeroes.
 */
export function tallyPartyCounts(members: CongressMember[]): PartyTally[] {
  const counts: Map<PartyGroup, number> = new Map<PartyGroup, number>();

  for (const member of members) counts.set(member.party, (counts.get(member.party) ?? 0) + 1);

  return partySeatingOrder
    .map((party: PartyGroup): PartyTally => ({ party, count: counts.get(party) ?? 0 }))
    .filter((tally: PartyTally): boolean => tally.count > 0);
}

/**
 * Assembles one chamber's {@link ChamberComposition}.
 *
 * @param chamber - Which chamber these members sit in.
 * @param members - Its members, already normalized.
 * @returns The composition: the members themselves, their party tallies, and the voting/non-voting seat split the House
 *   needs and the Senate doesn't.
 */
export function buildChamberComposition(chamber: CongressChamber, members: CongressMember[]): ChamberComposition {
  const nonVotingSeats: number =
    chamber === "house"
      ? members.filter((member: CongressMember): boolean => isNonVotingJurisdiction(member.state)).length
      : 0;

  return {
    chamber,
    members,
    partyCounts: tallyPartyCounts(members),
    votingSeats: members.length - nonVotingSeats,
    nonVotingSeats,
  };
}

/**
 * The member's party as it should read on screen.
 *
 * @param member - The member to describe.
 * @returns The verbatim upstream label when there is one — so a nuance like "Independent Democrat" survives to the
 *   page — otherwise the normalized group's label.
 */
export function formatMemberParty(member: CongressMember): string {
  const upstream: string = (member.partyName ?? "").trim();
  return upstream.length > 0 ? upstream : partyGroupLabels[member.party];
}

/**
 * Describes the seat a member holds, in plain English.
 *
 * @param member - The member whose seat to describe.
 * @param chamber - The chamber they sit in, which decides whether a district is meaningful at all.
 * @returns "Vermont" for a senator, "Ohio's 9th district" for a representative, "Alaska at-large" for a single-seat
 *   state, and "… (non-voting seat)" for the six House seats that carry no floor vote. An empty string when the
 *   upstream record has no jurisdiction, so callers can omit the line rather than print a placeholder.
 */
export function formatMemberSeat(member: CongressMember, chamber: CongressChamber): string {
  const state: string = (member.state ?? "").trim();
  if (state.length === 0) return "";

  if (chamber === "senate") return state;
  if (isNonVotingJurisdiction(state)) return `${state} (non-voting seat)`;
  if (member.district === undefined || member.district === 0) return `${state} at-large`;

  return `${state}'s ${formatOrdinal(member.district)} district`;
}

/**
 * The full one-line description of a seat.
 *
 * Used as each seat's accessible name in the chamber chart and as the heading of the detail panel's read-out. Kept in
 * the model rather than the component so the exact wording a screen reader announces is unit-tested alongside
 * everything else, instead of only reachable through a rendered chart.
 *
 * @param member - The member holding the seat.
 * @param chamber - The chamber they sit in.
 * @returns e.g. `"Bennett, Marcus T., Democratic, Ohio's 9th district"`, or name and party alone when the record
 *   carries no jurisdiction.
 */
export function formatMemberSummary(member: CongressMember, chamber: CongressChamber): string {
  const seat: string = formatMemberSeat(member, chamber);
  const party: string = formatMemberParty(member);

  return seat.length > 0 ? `${member.name}, ${party}, ${seat}` : `${member.name}, ${party}`;
}

/**
 * The member's page in the Biographical Directory of the United States Congress.
 *
 * Preferred over a congress.gov member URL because that form embeds a name slug that can change; a Bioguide ID never
 * does. This is the same directory Congress.gov's own member pages cite.
 *
 * @param bioguideId - The member's Biographical Directory ID, e.g. `"L000174"`.
 * @returns The absolute URL of their official biography.
 */
export function bioguideUrl(bioguideId: string): string {
  return `https://bioguide.congress.gov/search/bio/${bioguideId}`;
}

/**
 * The share of a chamber's seats a party holds, to one decimal place.
 *
 * @param count - Seats held by the party.
 * @param total - Seats in the chamber.
 * @returns A percentage string, e.g., `"49.9%"`. Returns `"0%"` for an empty chamber rather than dividing by zero.
 */
export function formatSeatShare(count: number, total: number): string {
  if (total <= 0) return "0%";

  return `${(Math.round((count / total) * 1000) / 10).toFixed(1)}%`;
}

/**
 * Plain-English description of how a chamber's seats break down.
 *
 * In the House this spells out the split between voting members and the six Delegates and Resident Commissioner who
 * hold a seat but no floor vote — a distinction a chamber diagram otherwise quietly erases by drawing all 441 seats
 * identically.
 *
 * @param chamber - The chamber composition to describe.
 * @returns e.g., `"441 seats — 435 voting, 6 non-voting"`, or simply `"100 seats"` where every seat votes.
 */
export function describeChamberSeats(chamber: ChamberComposition): string {
  const seats: string = `${chamber.members.length} ${chamber.members.length === 1 ? "seat" : "seats"}`;

  if (chamber.nonVotingSeats === 0) return seats;

  return `${seats} — ${chamber.votingSeats} voting, ${chamber.nonVotingSeats} non-voting`;
}
