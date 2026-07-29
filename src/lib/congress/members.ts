import { formatOrdinal, toTitleCase } from "@/lib/format";

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
 * Normalizes the free-text jurisdiction Congress.gov publishes into one canonical spelling.
 *
 * This is the same kind of boundary normalization {@link normalizePartyName} performs, and it exists for a concrete
 * reason rather than a cosmetic one: the represented jurisdiction is the value the member directory's filter is keyed
 * on, so `"NEW YORK"` and `"New York"` arriving on different records would split one state into two options that each
 * return half the delegation. Casing it once, here, means the model holds one spelling and every downstream
 * consumer — the facet list, the filter comparison, the card, the seat description — agrees by construction.
 *
 * Applied only to full jurisdiction *names*. Two-letter postal codes (which is what a bill's sponsor record carries)
 * are deliberately left alone elsewhere; title-casing `"OH"` would produce `"Oh"`.
 *
 * @param state - The upstream state, territory, or district name, if any.
 * @returns The title-cased name, or `undefined` when the record carries nothing usable — so an absent jurisdiction
 *   stays absent rather than becoming an empty string that reads as a real, blank option.
 */
export function normalizeJurisdiction(state?: string): string | undefined {
  const normalized: string = toTitleCase(state ?? "");
  return normalized.length > 0 ? normalized : undefined;
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
  /** The represented state, territory, or district, by full name (e.g., "Vermont"). */
  state?: string;
  /** House only. `0` means the state, territory, or district has a single at-large seat. */
  district?: number;
};

/**
 * The party fields the display helpers below read.
 *
 * Declared structurally rather than as `CongressMember` so the same helpers serve both the compact list-level
 * {@link CongressMember} the chart draws and the fuller {@link MemberProfile} the member page renders — one definition
 * of how a party reads on screen, not two that can drift apart.
 */
export type MemberPartyFields = {
  party: PartyGroup;
  partyName?: string;
};

/** The jurisdiction fields the display helpers below read. @see MemberPartyFields for why this is structural. */
export type MemberSeatFields = {
  state?: string;
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
 * The full one-line description of a seat.
 *
 * Used as each seat's accessible name in the chamber chart and as the heading of the detail panel's read-out. Kept in
 * the model rather than the component so the exact wording a screen reader announces is unit-tested alongside
 * everything else, instead of only reachable through a rendered chart.
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
 * The shape of a real Biographical Directory ID: one letter followed by six digits (e.g., `"L000174"`).
 *
 * Used both as a route guard — these arrive from the URL bar, so they're untrusted by definition — and to decide
 * whether an official-biography link can honestly be offered. The preview fixtures deliberately use IDs that *cannot*
 * match this pattern (see `previewMemberProfiles`), so a placeholder member can never be handed a link to a real
 * person's biography.
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
 * The member's page in the Biographical Directory of the United States Congress.
 *
 * Preferred over a congress.gov member URL because that form embeds a name slug that can change; a Bioguide ID never
 * does. This is the same directory Congress.gov's own member pages cite.
 *
 * @param bioguideId - The member's Biographical Directory ID, e.g., `"L000174"`.
 * @returns The absolute URL of their official biography, or `undefined` when the ID isn't one the Biographical
 *   Directory could resolve — which is how a preview placeholder is prevented from linking out as though it were a
 *   real person.
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

/**
 * One term a member has served.
 *
 * Only available from the *item*-level member endpoint — the list endpoint's term entries carry chamber and years but
 * no congress number and no `memberType`, which is why the chart derives what it can from the jurisdiction instead
 * (see {@link isNonVotingJurisdiction}).
 */
export type MemberTerm = {
  chamber: CongressChamber;
  congress?: number;
  startYear?: number;
  /** Absent for a term still being served. */
  endYear?: number;
  /** e.g., `"Senator"`, `"Representative"`, `"Delegate"`, `"Resident Commissioner"`. */
  memberType?: string;
  state?: string;
  district?: number;
};

/**
 * Everything the individual member page renders about one person.
 *
 * A superset of {@link CongressMember} rather than a replacement for it: the chart serializes one `CongressMember` per
 * seat into the home page's payload, ~540 of them, so that shape stays deliberately minimal. This one is fetched for a
 * single member at a time and can afford the full record.
 */
export type MemberProfile = {
  bioguideId: string;
  /** Last-name-first, as Congress.gov's `invertedOrderName` — the form that sorts and matches the chart's labels. */
  name: string;
  /** Reading order (`"Patrick J. Leahy"`), preferred wherever the name is displayed as prose rather than sorted. */
  directOrderName?: string;
  party: PartyGroup;
  partyName?: string;
  state?: string;
  district?: number;
  /** The chamber of their most recent term. */
  chamber: CongressChamber;
  /** Whether they currently hold a seat. A former member's page is a valid, useful page — just not a current one. */
  currentMember: boolean;
  /** Their official portrait, when Congress.gov publishes one. */
  depiction?: {
    imageUrl: string;
    /**
     * Credit line for the portrait, required by the API's terms whenever it's shown. A sanitized HTML fragment (see
     * `sanitizeSummaryHtml`) — Congress.gov returns it as a link to the holding archive — so it's safe to render
     * directly.
     */
    attribution?: string;
  };
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
 * One row of the browsable member directory (`/members`).
 *
 * A third member shape, deliberately, sitting between the other two: {@link CongressMember} is what the chamber chart
 * draws (no chamber field — it's implied by the composition a member is grouped under — and no guaranteed ID, since a
 * placeholder seat has none), while {@link MemberProfile} is the whole item-level record and far more than a list row
 * needs. A directory row is the small set of facts a person scans and filters on, plus the two things a list of
 * *links* can't do without: a chamber to filter by and an ID to open.
 *
 * `bioguideId` is required here for that reason. A row nobody can open is dead weight in a directory whose entire
 * purpose is to reach a person's page, so a record without one is dropped at the boundary rather than rendered as an
 * inert entry.
 * @see buildMemberDirectory
 */
export type MemberDirectoryEntry = {
  bioguideId: string;
  /** Last-name-first, as Congress.gov publishes it — the form that sorts correctly without re-parsing a name. */
  name: string;
  party: PartyGroup;
  partyName?: string;
  state?: string;
  district?: number;
  chamber: CongressChamber;
};

/**
 * Orders members alphabetically by their last-name-first name.
 *
 * `localeCompare` rather than `<`, so names carrying diacritics or apostrophes (Núñez, O'Halleran) sort where a reader
 * expects rather than where their code points fall.
 *
 * Declared structurally so it can order any named member shape — a directory entry, a `CongressMember`, a profile —
 * rather than only the one it was written for.
 *
 * @param a - One member to compare.
 * @param b - The other member to compare.
 * @returns A standard comparator result.
 */
export function compareMembersByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}

/**
 * The title a member holds, for headings and prose.
 *
 * @param profile - The member to title.
 * @returns Congress.gov's own `memberType` from the most recent term when there is one — which is the only thing that
 *   distinguishes a Delegate or the Resident Commissioner from a Representative — otherwise the chamber's generic
 *   title.
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
 * @returns Their reading-order name when the record carries one, otherwise the last-name-first form — never an empty
 *   string, since a page with no name on it is worse than one with an awkwardly ordered name.
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
 * How long a member has served, across every term on file.
 *
 * Deliberately reports the *span* from their earliest term to now (or to their last term's end) rather than summing
 * term lengths: service can be non-contiguous, and "in Congress since 1975" is both the more useful fact and the one
 * that can't be quietly wrong about a gap the way a summed total can.
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
