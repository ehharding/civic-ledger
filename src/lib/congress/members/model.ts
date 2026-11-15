import { compareText, formatOrdinal, pluralize, toTitleCase } from "@/lib/format";

/**
 * The party groupings this app renders. Congress.gov's `partyName` is free text, so a new or misspelled label groups as
 * "other" rather than reaching the UI unstyled. The verbatim label is kept on `CongressMember.partyName`.
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
 * The left-to-right order parties are seated in on the chart, following the usual chamber-diagram convention. A
 * presentational choice, not where anyone actually sits. @see buildChamberSeating
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
 * @returns Its index in the seating order, or one past the end for anything unlisted.
 */
export function partySeatingRank(party: PartyGroup): number {
  const rank: number = partySeatingOrder.indexOf(party);
  return rank === -1 ? partySeatingOrder.length : rank;
}

/**
 * The class that tints an element by party. It sets a `--party-color` custom property, which seats, swatches, and party
 * lines each apply to whichever property they need (`fill`, `color`, `background`). The only place that knows the class
 * prefix.
 *
 * @param party - The group to tint for.
 * @returns The tint class, e.g., `"party-tint--democratic"`. @see src/styles/party.css for the mapping itself.
 */
export function partyTintClass(party: PartyGroup): string {
  return `party-tint--${party}`;
}

/**
 * Narrows Congress.gov's free-text party label to a {@link PartyGroup}.
 *
 * Matches on prefixes because the API uses both "Democratic" and "Democrat" and documents a "Republication" typo.
 * "Independent" is checked first so "Independent Democrat" groups as independent.
 *
 * @param partyName - The upstream `partyName`, if any.
 * @returns The matching group, or `"other"` for anything unrecognized.
 */
export function normalizePartyName(partyName?: string): PartyGroup {
  const value: string = (partyName ?? "").trim().toLowerCase();

  if (value.startsWith("independent")) return "independent";
  if (value.startsWith("democrat")) return "democratic";
  if (value.startsWith("republic")) return "republican";
  if (value.startsWith("libertarian")) return "libertarian";

  return "other";
}

/** The one-letter party abbreviations the sponsor and cosponsor records use, mapped to their groups. */
const partyCodes: Readonly<Record<string, PartyGroup>> = {
  d: "democratic",
  r: "republican",
  i: "independent",
  l: "libertarian",
};

/**
 * Narrows a party value that may be a one-letter code. Sponsor and cosponsor records send `"D"` where member records
 * send `"Democratic"`.
 *
 * @param party - The upstream party value, in either form.
 * @returns The matching group. Longer values go through {@link normalizePartyName}; an unknown letter is `"other"`.
 */
export function normalizePartyCode(party?: string): PartyGroup {
  const value: string = (party ?? "").trim().toLowerCase();

  return value.length === 1 ? (partyCodes[value] ?? "other") : normalizePartyName(value);
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
 * @returns The matching chamber, or `null` for anything unrecognized, so callers drop the record.
 */
export function normalizeChamberName(chamber?: string): CongressChamber | null {
  const value: string = (chamber ?? "").trim().toLowerCase();

  if (value === "house of representatives" || value === "house") return "house";
  if (value === "senate") return "senate";

  return null;
}

/**
 * The six jurisdictions whose House seat carries no floor vote — five territorial Delegates and Puerto Rico's Resident
 * Commissioner. List-level records lack `memberType`, but the jurisdiction determines it. Variant spellings are listed
 * because the jurisdiction is free text.
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
 * @returns `true` for the five territorial Delegates' jurisdictions and Puerto Rico. Only meaningful for House
 *   members — every Senate seat votes, so callers should not consult this for senators.
 */
export function isNonVotingJurisdiction(state?: string): boolean {
  return NON_VOTING_HOUSE_JURISDICTIONS.has((state ?? "").trim().toLowerCase());
}

/**
 * Normalizes a free-text jurisdiction name to one spelling, so `"NEW YORK"` and `"New York"` don't become two filter
 * options. For full names only — title-casing a postal code like `"OH"` would give `"Oh"`.
 *
 * @param state - The upstream state, territory, or district name, if any.
 * @returns The title-cased name, or `undefined` when there's nothing usable.
 */
export function normalizeJurisdiction(state?: string): string | undefined {
  const normalized: string = toTitleCase(state ?? "");
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * A member's official portrait, with the credit line Congress.gov's terms require wherever it is shown. The same on
 * list- and item-level records. `attribution` is genuinely absent on a few records, so renderers must handle that.
 */
export type MemberDepiction = {
  /** The portrait's URL. */
  imageUrl: string;
  /**
   * Credit line for the portrait. A sanitized HTML fragment (see `sanitizeSummaryHtml`) — Congress.gov returns it as
   * prose that sometimes links the holding archive — so it is safe to render directly.
   */
  attribution?: string;
};

/**
 * One seated member of Congress, from the member list endpoint.
 *
 * Kept small because it's serialized once per seat: only what the chamber chart and member directory display. Most
 * fields are optional because the list endpoint omits them (and placeholders have no `bioguideId`). Chamber is implied
 * by the `ChamberComposition` the member sits in. The chart receives it without `depiction`
 * @see compositionForSeating.
 */
export type CongressMember = {
  /** Biographical Directory ID (e.g., "L000174") — the stable key for linking out to an official biography. */
  bioguideId?: string;
  /** The member's name in last-name-first order, exactly as Congress.gov publishes it. */
  name: string;
  /** The member's party, grouped for display. */
  party: PartyGroup;
  /** The upstream party label, kept verbatim so a nuance like "Independent Democrat" isn't flattened away. */
  partyName?: string;
  /** The represented state, territory, or district, by full name (e.g., "Vermont"). */
  state?: string;
  /** House only. `0` means the state, territory, or district has a single at-large seat. */
  district?: number;
  /**
   * Their official portrait, when Congress.gov publishes one. Never set on a preview placeholder: a real face would
   * make fiction look like the record. @see docs/data-policy.md, "Preview Data Is Labeled Fiction".
   */
  depiction?: MemberDepiction;
};

/** The party fields the display helpers below read — structural, so they serve every member shape. */
export type MemberPartyFields = {
  /** The member's party, grouped for display. */
  party: PartyGroup;
  /** The upstream party label, verbatim. */
  partyName?: string;
};

/** The jurisdiction fields the display helpers below read. @see MemberPartyFields for why this is structural. */
export type MemberSeatFields = {
  /** The represented state, territory, or district, by full name. */
  state?: string;
  /** House only. `0` means a single at-large seat. */
  district?: number;
};

/** How many seats one party holds in a chamber. */
export type PartyTally = {
  /** The party. */
  party: PartyGroup;
  /** How many seats it holds. */
  count: number;
};

/** One chamber's membership: the seated members themselves plus the tallies the legend and summary line need. */
export type ChamberComposition = {
  /** Which chamber this is. */
  chamber: CongressChamber;
  /** Every seated member, in no particular order. */
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
  /** The Congress described. */
  congress: number;
  /** One composition per chamber, in `congressChambers` order. */
  chambers: ChamberComposition[];
  /** Whether these are live records or labeled placeholders. */
  source: "live" | "preview";
  /** When the read happened, as an ISO timestamp. */
  retrievedAt: string;
  /** User-facing explanation shown when `source` is "preview" (no API key, or a transient upstream failure). */
  notice?: string;
};

/**
 * The same composition without portraits — what the seating chart is handed. The chart is a client component that draws
 * seats, not faces, so ~540 portraits would only bloat the home page's payload.
 *
 * @param composition - The full composition, as resolved server-side.
 * @returns A copy without `depiction` on any member. Everything else is untouched.
 */
export function compositionForSeating(composition: CongressComposition): CongressComposition {
  return {
    ...composition,
    chambers: composition.chambers.map(
      (chamber: ChamberComposition): ChamberComposition => ({
        ...chamber,
        members: chamber.members.map(({ depiction: _depiction, ...member }: CongressMember): CongressMember => member),
      }),
    ),
  };
}

/**
 * Tallies members by party.
 *
 * @param members - The chamber's members.
 * @returns One tally per party holding a seat, in {@link partySeatingOrder} so the legend matches the chart.
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
export function formatMemberParty(member: MemberPartyFields): string {
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
export function formatMemberSeat(member: MemberSeatFields, chamber: CongressChamber): string {
  const state: string = (member.state ?? "").trim();
  if (state.length === 0) return "";

  if (chamber === "senate") return state;
  if (isNonVotingJurisdiction(state)) return `${state} (non-voting seat)`;
  if (member.district === undefined || member.district === 0) return `${state} at-large`;

  return `${state}'s ${formatOrdinal(member.district)} district`;
}

/**
 * The full one-line description of a seat — each chart seat's accessible name and the read-out's heading.
 *
 * @param member - The member holding the seat.
 * @param chamber - The chamber they sit in.
 * @returns e.g., `"Bennett, Marcus T., Democratic, Ohio's 9th district"`, or name and party alone when the record
 *   carries no jurisdiction.
 */
export function formatMemberSummary(
  member: MemberPartyFields & MemberSeatFields & { name: string },
  chamber: CongressChamber,
): string {
  const seat: string = formatMemberSeat(member, chamber);
  const party: string = formatMemberParty(member);

  return seat.length > 0 ? `${member.name}, ${party}, ${seat}` : `${member.name}, ${party}`;
}

/**
 * The shape of a real Biographical Directory ID: one letter and six digits (e.g., `"L000174"`). Guards the member route
 * and official-biography links; preview fixture IDs deliberately can't match it.
 */
const BIOGUIDE_ID_PATTERN: RegExp = /^[A-Z]\d{6}$/;

/**
 * Whether `value` is a well-formed Biographical Directory ID.
 *
 * @param value - The candidate ID, in any case.
 * @returns `true` only for the letter-plus-six-digits form Congress.gov actually issues.
 */
export function isBioguideId(value: string | undefined): boolean {
  return BIOGUIDE_ID_PATTERN.test((value ?? "").trim().toUpperCase());
}

/**
 * The member's page in the Biographical Directory of the United States Congress — stable, unlike congress.gov member
 * URLs, which embed a name slug.
 *
 * @param bioguideId - The member's Biographical Directory ID, e.g., `"L000174"`.
 * @returns The biography URL, or `undefined` for an ID that isn't well-formed (including every preview placeholder).
 */
export function bioguideUrl(bioguideId: string): string | undefined {
  if (!isBioguideId(bioguideId)) return undefined;

  return `https://bioguide.congress.gov/search/bio/${bioguideId.trim().toUpperCase()}`;
}

/** One office a member has held in the leadership of their chamber, as Congress.gov records it. */
export type MemberLeadershipRole = {
  /** e.g., `"President Pro Tempore"`, `"Minority Whip"`. */
  type: string;
  /** The Congress they held it in. */
  congress?: number;
};

/** One term a member has served. Item-level endpoint only; list-level terms lack the Congress and `memberType`. */
export type MemberTerm = {
  /** The chamber served in. */
  chamber: CongressChamber;
  /** The Congress the term belongs to. */
  congress?: number;
  /** The calendar year the term began. */
  startYear?: number;
  /** Absent for a term still being served. */
  endYear?: number;
  /** e.g., `"Senator"`, `"Representative"`, `"Delegate"`, `"Resident Commissioner"`. */
  memberType?: string;
  /** The represented state, territory, or district, by full name. */
  state?: string;
  /** House only. `0` means a single at-large seat. */
  district?: number;
};

/** Everything the member page renders about one person — the full item-level record, fetched one at a time. */
export type MemberProfile = {
  /** Biographical Directory ID, e.g., `"L000174"`. */
  bioguideId: string;
  /** Last-name-first, as Congress.gov's `invertedOrderName` — the form that sorts and matches the chart's labels. */
  name: string;
  /** Reading order (`"Patrick J. Leahy"`), preferred wherever the name is displayed as prose rather than sorted. */
  directOrderName?: string;
  /** The member's party, grouped for display. */
  party: PartyGroup;
  /** The upstream party label, verbatim. */
  partyName?: string;
  /** The represented state, territory, or district, by full name. */
  state?: string;
  /** House only. `0` means a single at-large seat. */
  district?: number;
  /** The chamber of their most recent term. */
  chamber: CongressChamber;
  /** Whether they currently hold a seat. A former member's page is a valid, useful page — just not a current one. */
  currentMember: boolean;
  /** Their official portrait, when Congress.gov publishes one. @see MemberDepiction */
  depiction?: MemberDepiction;
  /** Their own house.gov / senate.gov site, when the record carries one. */
  officialWebsiteUrl?: string;
  /** Every term on file, most recent first. */
  terms: MemberTerm[];
  /** Every leadership office on file, most recent first. */
  leadership: MemberLeadershipRole[];
  /** Total bills sponsored across their whole service, as Congress.gov counts them. */
  sponsoredCount?: number;
  /** Total bills cosponsored across their whole service. */
  cosponsoredCount?: number;
};

/**
 * One row of the member directory (`/members`): what a reader scans and filters on, plus a chamber and an ID to open.
 * `bioguideId` is required because a row that can't be opened is dropped. @see buildMemberDirectory
 */
export type MemberDirectoryEntry = {
  /** Biographical Directory ID, e.g., `"L000174"`. */
  bioguideId: string;
  /** Last-name-first, as Congress.gov publishes it — the form that sorts correctly without re-parsing a name. */
  name: string;
  /** The member's party, grouped for display. */
  party: PartyGroup;
  /** The upstream party label, verbatim. */
  partyName?: string;
  /** The represented state, territory, or district, by full name. */
  state?: string;
  /** House only. `0` means a single at-large seat. */
  district?: number;
  /** The chamber they sit in. */
  chamber: CongressChamber;
  /** Their official portrait, when published. @see MemberDepiction */
  depiction?: MemberDepiction;
};

/**
 * Orders any member shape alphabetically by last-name-first name, through the app's collator so names like Núñez and
 * O'Halleran sort as a reader expects.
 * @see compareText
 *
 * @param a - One member to compare.
 * @param b - The other member to compare.
 * @returns A standard comparator result.
 */
export function compareMembersByName(a: { name: string }, b: { name: string }): number {
  return compareText(a.name, b.name);
}

/**
 * The title a member holds, for headings and prose.
 *
 * @param profile - The member to title.
 * @returns The most recent term's `memberType` (which distinguishes Delegates and the Resident Commissioner), otherwise
 *   the chamber's generic title.
 */
export function formatMemberTitle(profile: MemberProfile): string {
  const memberType: string = (profile.terms[0]?.memberType ?? "").trim();
  if (memberType.length > 0) return memberType;

  return profile.chamber === "senate" ? "Senator" : "Representative";
}

/**
 * The member's name as it should read in prose.
 *
 * @param profile - The member to name.
 * @returns Their reading-order name when published, otherwise the last-name-first form.
 */
export function formatMemberName(profile: MemberProfile): string {
  const direct: string = (profile.directOrderName ?? "").trim();
  return direct.length > 0 ? direct : profile.name;
}

/**
 * One term's calendar span, in plain English.
 *
 * @param term - The term to describe.
 * @returns e.g., `"2019–2021"`, or `"2025–present"` for a term still being served. An empty string when the record
 *   carries no start year, so callers can omit the line rather than print a dash with nothing around it.
 */
export function formatTermYears(term: MemberTerm): string {
  if (term.startYear === undefined) return "";

  return `${term.startYear}–${term.endYear ?? "present"}`;
}

/**
 * How long a member has served: the span from their earliest term, not a sum of term lengths, since service can have
 * gaps.
 *
 * @param profile - The member whose service to describe.
 * @returns e.g., `"Serving since 2019"` or `"Served 1975–2023"`. An empty string when no term carries a start year.
 */
export function describeMemberService(profile: MemberProfile): string {
  const startYears: number[] = profile.terms
    .map((term: MemberTerm): number | undefined => term.startYear)
    .filter((year: number | undefined): year is number => year !== undefined);

  if (startYears.length === 0) return "";

  const earliest: number = Math.min(...startYears);
  if (profile.currentMember) return `Serving since ${earliest}`;

  const endYears: number[] = profile.terms
    .map((term: MemberTerm): number | undefined => term.endYear)
    .filter((year: number | undefined): year is number => year !== undefined);

  return endYears.length > 0 ? `Served ${earliest}–${Math.max(...endYears)}` : `Served from ${earliest}`;
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
 * Plain-English description of how a chamber's seats break down, including the House's six non-voting seats, which the
 * diagram draws like any other.
 *
 * @param chamber - The chamber composition to describe.
 * @returns e.g., `"441 seats — 435 voting, 6 non-voting"`, or simply `"100 seats"` where every seat votes.
 */
export function describeChamberSeats(chamber: ChamberComposition): string {
  const seats: string = `${chamber.members.length} ${pluralize(chamber.members.length, "seat")}`;

  if (chamber.nonVotingSeats === 0) return seats;

  return `${seats} — ${chamber.votingSeats} voting, ${chamber.nonVotingSeats} non-voting`;
}
