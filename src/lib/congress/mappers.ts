import type {
  CongressApiAction,
  CongressApiBill,
  CongressApiCommittee,
  CongressApiCommitteeBill,
  CongressApiCommitteeDetail,
  CongressApiCommitteeHistory,
  CongressApiCommitteeNomination,
  CongressApiCommitteeRef,
  CongressApiCommitteeReport,
  CongressApiLeadership,
  CongressApiMember,
  CongressApiMemberDetail,
  CongressApiMemberDetailTerm,
  CongressApiRecordedVote,
  CongressApiSponsor,
  CongressApiSummary,
  CongressApiTextFormat,
  CongressApiTextVersion,
} from "@/lib/congress/api-schema";
import type { CommitteeBillReferral, CommitteeNomination, CommitteeReport } from "@/lib/congress/committee-records";
import {
  type CommitteeChamber,
  type CommitteeHistoryEntry,
  type CommitteeProfile,
  type CommitteeSummary,
  compareCommitteesByName,
  normalizeCommitteeChamber,
  normalizeCommitteeType,
  type Subcommittee,
} from "@/lib/congress/committees";
import {
  type CongressChamber,
  type CongressMember,
  type MemberLeadershipRole,
  type MemberProfile,
  type MemberTerm,
  normalizeChamberName,
  normalizeJurisdiction,
  normalizePartyName,
} from "@/lib/congress/members";
import { sanitizeSummaryHtml } from "@/lib/congress/sanitize-summary";
import { inferBillStage } from "@/lib/congress/stage";
import {
  type BillAction,
  type BillSponsor,
  type BillSummary,
  type BillTextFormat,
  type BillTextVersion,
  congressGovBillUrl,
  type LegislativeBill,
  type RecordedVote,
} from "@/lib/congress/types";
import { compareIsoDatesDesc } from "@/lib/format";

/**
 * Translation from Congress.gov's wire shapes into this app's stable internal model.
 *
 * Every mapper here follows the same contract: it returns `null` when a record is missing something the app genuinely
 * depends on, so callers can filter incomplete records out rather than render a broken card. "Genuinely depends on" is
 * deliberately narrow — a bill with no policy area is fine, a bill with no title is not.
 *
 * Nothing in this module performs I/O, which is what makes the interesting half of the adapter (what counts as a usable
 * record, how a chamber is inferred, how summaries are ordered) directly unit-testable without stubbing a fetch.
 */

/** A member paired with the chamber they sit in — the shape `mapCongressMember` returns before grouping. */
export type SeatedMember = {
  chamber: CongressChamber;
  member: CongressMember;
};

/**
 * Narrows an arbitrary API string to the app's closed `originChamber` union.
 *
 * @param value - The upstream `originChamber` string, if any.
 * @returns `"House"`, `"Senate"`, or `"Unknown"` for anything unexpected — including a missing value.
 */
export function asOriginChamber(value?: string): LegislativeBill["originChamber"] {
  if (value === "House" || value === "Senate") return value;
  return "Unknown";
}

/**
 * Maps a raw Congress.gov API bill into the app's stable {@link LegislativeBill} shape.
 *
 * Handles both endpoint dialects: the list endpoint spells the identifier `type`/`number`, the single-bill detail
 * endpoint spells it `billType`/`billNumber`. Accepting either is what lets one mapper — and so one definition of a
 * complete record — cover every bill this app displays.
 *
 * @param bill - A validated bill object from either the list or detail endpoint.
 * @returns The mapped bill, or `null` when it lacks a congress, title, type, or number.
 */
export function mapCongressBill(bill: CongressApiBill): LegislativeBill | null {
  const type: string | undefined = bill.type ?? bill.billType;
  const number: string | number | undefined = bill.number ?? bill.billNumber;

  if (!bill.congress || !bill.title || !type || !number) return null;

  const actionText: string = bill.latestAction?.text ?? "No action text has been published yet.";
  const sponsor: CongressApiSponsor | undefined = bill.sponsors?.[0];

  return {
    congress: bill.congress,
    type: type.toUpperCase(),
    number: String(number),
    title: bill.title,
    originChamber: asOriginChamber(bill.originChamber),
    introducedDate: bill.introducedDate,
    latestAction: {
      date: bill.latestAction?.actionDate ?? bill.updateDate,
      text: actionText,
    },
    policyArea: bill.policyArea?.name,
    stage: inferBillStage(actionText),
    // `legislationUrl` is the public congress.gov page, published by the item-level endpoint since August 2025;
    // `congressGovBillUrl` derives the same string and still covers the list endpoint, which does not send it. What is
    // deliberately never used is `bill.url` — that field is the record's own *API* endpoint, which serves JSON (and
    // 403s without a key of the reader's own). @see congressGovBillUrl
    officialUrl: bill.legislationUrl ?? congressGovBillUrl({ congress: bill.congress, type, number: String(number) }),
    sponsor: sponsor?.fullName
      ? ({
          fullName: sponsor.fullName,
          party: sponsor.party,
          state: sponsor.state,
          bioguideId: sponsor.bioguideId,
        } satisfies BillSponsor)
      : undefined,
    cosponsorCount: bill.cosponsors?.count,
  };
}

/**
 * Maps a raw summaries-endpoint entry into the app's {@link BillSummary} shape, sanitizing its HTML on the way through
 * so no unsanitized markup ever exists inside the app's own model.
 *
 * @param summary - A validated entry from the summaries endpoint.
 * @returns The mapped summary, or `null` when it has no text or no action description.
 */
export function mapCongressSummary(summary: CongressApiSummary): BillSummary | null {
  if (!summary.text || !summary.actionDesc) return null;

  return {
    versionCode: summary.versionCode ?? "00",
    actionDesc: summary.actionDesc,
    actionDate: summary.actionDate,
    html: sanitizeSummaryHtml(summary.text),
  };
}

/**
 * Maps a raw text-endpoint entry into the app's {@link BillTextVersion} shape.
 *
 * @param version - A validated entry from the text endpoint.
 * @returns The mapped version, or `null` when it has no type or no format that carries both a label and a URL — a
 *   version with nothing to link to is a heading with no content behind it.
 */
export function mapCongressTextVersion(version: CongressApiTextVersion): BillTextVersion | null {
  if (!version.type) return null;

  const formats: BillTextFormat[] = (version.formats ?? []).filter(
    (format: CongressApiTextFormat): format is BillTextFormat => Boolean(format.type && format.url),
  );
  if (formats.length === 0) return null;

  return { type: version.type, date: version.date, formats };
}

/**
 * Maps a raw recorded-vote reference from a bill action.
 *
 * @param vote - A validated `recordedVotes[]` entry.
 * @returns The mapped reference, or `null` unless it carries everything needed to *name and reach* the vote — a
 *   recognizable chamber, a roll number, a congress, and the chamber's own URL. A row missing any of those can't be
 *   rendered as a link to a specific tally, and a roll call a reader can't open is worse than one not listed.
 */
export function mapRecordedVote(vote: CongressApiRecordedVote): RecordedVote | null {
  const chamber: CongressChamber | null = normalizeChamberName(vote.chamber);
  if (!chamber || typeof vote.rollNumber !== "number" || typeof vote.congress !== "number" || !vote.url) return null;

  return {
    chamber: chamber === "house" ? "House" : "Senate",
    rollNumber: vote.rollNumber,
    congress: vote.congress,
    sessionNumber: vote.sessionNumber,
    date: vote.date,
    url: vote.url,
  };
}

/**
 * Maps a raw actions-endpoint entry into the app's {@link BillAction} shape.
 *
 * @param action - A validated entry from the actions endpoint.
 * @returns The mapped action, or `null` when it has no text — an undated, untitled row is a bullet with nothing in it.
 */
export function mapCongressAction(action: CongressApiAction): BillAction | null {
  const text: string | undefined = action.text?.trim();
  if (!text) return null;

  return {
    date: action.actionDate,
    text,
    type: action.type,
    actionCode: action.actionCode,
    recordedVotes: mapUsable(action.recordedVotes, mapRecordedVote),
  };
}

/**
 * Collects every distinct roll-call vote referenced anywhere in a bill's action history.
 *
 * Deduplication is the point rather than a tidy-up. Congress.gov reports the same event from several source systems at
 * once, so a single roll call arrives attached to two or three separate actions — HR 1 in the 119th Congress lists roll
 * 190 twice, once from House floor actions and once from the Library of Congress. Listing it twice would read as two
 * votes on the same question.
 *
 * @param actions - The bill's actions, in any order.
 * @returns One entry per distinct vote, most recent first.
 */
export function collectRecordedVotes(actions: readonly BillAction[]): RecordedVote[] {
  const byIdentity: Map<string, RecordedVote> = new Map<string, RecordedVote>();

  for (const action of actions) {
    for (const vote of action.recordedVotes) {
      byIdentity.set(`${vote.congress}-${vote.chamber}-${vote.sessionNumber ?? ""}-${vote.rollNumber}`, vote);
    }
  }

  return sortByDateDesc([...byIdentity.values()], "date");
}

/**
 * Maps a raw member-list entry into the app's {@link CongressMember} shape, paired with the chamber that member sits
 * in.
 *
 * Chamber comes from the *last* recognizable entry in `terms.item[]` — a member who moved from the House to the Senate
 * should be seated in the Senate. List-level term entries don't carry a congress number to match on, so "most recent
 * term" is the closest available reading, and it's the correct one for a request already scoped to the members
 * currently serving in one Congress.
 *
 * @param member - A validated entry from the member list endpoint.
 * @returns The member and their chamber, or `null` when the record has no name or no recognizable chamber — either way
 *   there's no defensible seat to draw.
 */
export function mapCongressMember(member: CongressApiMember): SeatedMember | null {
  const name: string | undefined = member.name?.trim();
  if (!name) return null;

  let chamber: CongressChamber | null = null;
  for (const term of member.terms?.item ?? []) {
    chamber = normalizeChamberName(term.chamber) ?? chamber;
  }
  if (!chamber) return null;

  return {
    chamber,
    member: {
      bioguideId: member.bioguideId,
      name,
      party: normalizePartyName(member.partyName),
      partyName: member.partyName,
      state: normalizeJurisdiction(member.state),
      district: member.district,
    },
  };
}

/**
 * Maps one item-level term entry.
 *
 * @param term - A validated term from the member item endpoint.
 * @returns The mapped term, or `null` when its chamber isn't recognizable — a term that names no chamber can't be
 *   placed in a service history, and dropping it is better than rendering a blank row.
 */
export function mapMemberTerm(term: CongressApiMemberDetailTerm): MemberTerm | null {
  const chamber: CongressChamber | null = normalizeChamberName(term.chamber);
  if (!chamber) return null;

  return {
    chamber,
    congress: term.congress,
    startYear: term.startYear,
    endYear: term.endYear,
    memberType: term.memberType,
    state: normalizeJurisdiction(term.stateName),
    district: term.district,
  };
}

/**
 * Maps a raw member item-endpoint record into the app's {@link MemberProfile} shape.
 *
 * Terms are sorted newest first and drive three separate things the rest of the page depends on — the member's chamber,
 * their title, and their represented jurisdiction — so a member who moved between chambers, or whose state is only
 * recorded per-term, still reads correctly. The top-level `state`/`district` fields are preferred when present and the
 * most recent term fills in for them when they aren't.
 *
 * @param member - A validated record from the member item endpoint.
 * @param bioguideId - The ID that was looked up, used when the payload itself omits one.
 * @returns The mapped profile, or `null` when the record carries no name or no recognizable term — without a chamber
 *   there's no way to describe the seat, and without a name there's nothing to title the page with.
 */
export function mapMemberProfile(member: CongressApiMemberDetail, bioguideId: string): MemberProfile | null {
  const name: string = (member.invertedOrderName ?? member.directOrderName ?? "").trim();
  if (!name) return null;

  const rawTerms: CongressApiMemberDetailTerm[] = Array.isArray(member.terms)
    ? member.terms
    : (member.terms?.item ?? []);

  // Newest first, so `terms[0]` is "their current (or final) seat" everywhere it's read below and on the page itself.
  const terms: MemberTerm[] = sortByDateDesc(mapUsable(rawTerms, mapMemberTerm), "startYear");
  const latestTerm: MemberTerm | undefined = terms[0];
  if (!latestTerm) return null;

  // The API reports the party only as a history; the most recent entry is the one that describes them now.
  const partyName: string | undefined = member.partyName ?? member.partyHistory?.at(-1)?.partyName;
  const imageUrl: string | undefined = member.depiction?.imageUrl;

  return {
    bioguideId: (member.bioguideId ?? bioguideId).trim().toUpperCase(),
    name,
    directOrderName: member.directOrderName,
    party: normalizePartyName(partyName),
    partyName,
    state: normalizeJurisdiction(member.state) ?? latestTerm.state,
    district: member.district ?? latestTerm.district,
    chamber: latestTerm.chamber,
    // Absent means "the API didn't say", which for a member record it only does for former members.
    currentMember: member.currentMember ?? false,
    depiction: imageUrl
      ? {
          imageUrl,
          // Congress.gov returns the credit line as an HTML fragment containing a link to the holding archive.
          // Sanitized here rather than at render time, so — exactly as with CRS summaries — no unsanitized markup ever
          // exists inside the app's own model.
          attribution: member.depiction?.attribution ? sanitizeSummaryHtml(member.depiction.attribution) : undefined,
        }
      : undefined,
    officialWebsiteUrl: member.officialWebsiteUrl,
    terms,
    leadership: mapUsable(member.leadership, mapLeadershipRole),
    sponsoredCount: member.sponsoredLegislation?.count,
    cosponsoredCount: member.cosponsoredLegislation?.count,
  };
}

/**
 * Maps one leadership entry.
 *
 * @param role - A validated leadership entry from the member item endpoint.
 * @returns The mapped role, or `null` when it names no office — a congress number on its own says nothing.
 */
export function mapLeadershipRole(role: CongressApiLeadership): MemberLeadershipRole | null {
  const type: string = (role.type ?? "").trim();
  if (!type) return null;

  return { type, congress: role.congress };
}

/**
 * Maps a reference to a committee named from inside another committee's record — a `parent`, or an entry in a
 * `subcommittees` array.
 *
 * @param ref - A validated committee reference.
 * @returns The mapped reference, or `null` when it carries no code or no name. A subcommittee with no code cannot be
 *   opened and one with no name cannot be labeled, and either way there is nothing to put in a list.
 */
export function mapCommitteeRef(ref: CongressApiCommitteeRef): Subcommittee | null {
  const systemCode: string = (ref.systemCode ?? "").trim().toLowerCase();
  const name: string = (ref.name ?? "").trim();

  if (systemCode.length === 0 || name.length === 0) return null;

  return { systemCode, name };
}

/**
 * Maps a raw committee-list entry into the app's {@link CommitteeSummary} shape.
 *
 * @param committee - A validated entry from the committee list endpoint.
 * @returns The mapped summary, or `null` when the record has no system code, no name, or no recognizable chamber. The
 *   chamber check is what drops the API's `"NoChamber"` records, which are not committees of either body.
 */
export function mapCongressCommittee(committee: CongressApiCommittee): CommitteeSummary | null {
  const systemCode: string = (committee.systemCode ?? "").trim().toLowerCase();
  const name: string = (committee.name ?? "").trim();
  const chamber: CommitteeChamber | null = normalizeCommitteeChamber(committee.chamber);

  if (systemCode.length === 0 || name.length === 0 || !chamber) return null;

  const typeName: string | undefined = committee.committeeTypeCode ?? committee.type;
  const parent: Subcommittee | null = committee.parent ? mapCommitteeRef(committee.parent) : null;

  return {
    systemCode,
    name,
    chamber,
    type: normalizeCommitteeType(typeName),
    typeName,
    parent: parent ?? undefined,
    subcommitteeCount: mapUsable(committee.subcommittees, mapCommitteeRef).length,
  };
}

/**
 * Maps one entry in a committee's history.
 *
 * @param entry - A validated history entry from the committee item endpoint.
 * @returns The mapped entry, or `null` when it names the committee neither formally nor by its Library of Congress
 *   name — a span with no name on it says only that time passed.
 */
export function mapCommitteeHistory(entry: CongressApiCommitteeHistory): CommitteeHistoryEntry | null {
  const official: string = (entry.officialName ?? "").trim();
  const library: string = (entry.libraryOfCongressName ?? "").trim();
  const name: string = official.length > 0 ? official : library;

  if (name.length === 0) return null;

  return {
    name,
    // Only carried when it says something the formal name didn't, so the page isn't printing one string twice.
    libraryName: library.length > 0 && library !== name ? library : undefined,
    startDate: entry.startDate,
    endDate: entry.endDate,
    establishingAuthority: entry.establishingAuthority,
  };
}

/**
 * Maps a raw committee item-endpoint record into the app's {@link CommitteeProfile} shape.
 *
 * Two of this record's fields don't come from the record. The **chamber** is taken from the path that was requested,
 * because the item endpoint doesn't return one — the chamber is in the URL, so the response doesn't restate it. The
 * **name** is read out of `history`, for the same reason: unlike every list entry, an item record carries no `name`
 * field at all, and its current formal name is the most recent history entry's. Both are resolved here rather than in
 * the fetcher so one definition of "what is this committee called" covers every page that renders one.
 *
 * @param committee - A validated record from the committee item endpoint.
 * @param systemCode - The code that was looked up, used when the payload itself omits one.
 * @param chamber - The chamber whose endpoint was asked, since the record doesn't say.
 * @returns The mapped profile, or `null` when no history entry names the committee — with no name there is nothing to
 *   title the page with, and inventing one from the system code would be a guess printed as a fact.
 */
export function mapCommitteeProfile(
  committee: CongressApiCommitteeDetail,
  systemCode: string,
  chamber: CommitteeChamber,
): CommitteeProfile | null {
  // Newest first, so `history[0]` is "what it is called now" both here and on the page itself.
  const history: CommitteeHistoryEntry[] = sortByDateDesc(
    mapUsable(committee.history, mapCommitteeHistory),
    "startDate",
  );

  const current: CommitteeHistoryEntry | undefined = history[0];
  if (!current) return null;

  const parent: Subcommittee | null = committee.parent ? mapCommitteeRef(committee.parent) : null;
  const subcommittees: Subcommittee[] = mapUsable(committee.subcommittees, mapCommitteeRef).sort(
    compareCommitteesByName,
  );

  return {
    systemCode: (committee.systemCode ?? systemCode).trim().toLowerCase(),
    name: current.name,
    chamber,
    type: normalizeCommitteeType(committee.type),
    typeName: committee.type,
    parent: parent ?? undefined,
    subcommitteeCount: subcommittees.length,
    // Absent means "the API didn't say", which for a committee record it only does for bodies no longer constituted.
    isCurrent: committee.isCurrent ?? false,
    history,
    subcommittees,
    billCount: committee.bills?.count,
    reportCount: committee.reports?.count,
    nominationCount: committee.nominations?.count,
    websiteUrl: committee.committeeWebsiteUrl,
  };
}

/**
 * Maps one entry in a committee's bill list.
 *
 * @param referral - A validated entry from the committee-bills endpoint.
 * @returns The mapped referral, or `null` when it names no congress, type, or number. Those three *are* the record
 *   here: unlike a bill from the bill endpoints, this one carries no title to fall back on, so a referral missing any
 *   part of its identifier names nothing at all and could neither be linked nor labeled.
 */
export function mapCommitteeBillReferral(referral: CongressApiCommitteeBill): CommitteeBillReferral | null {
  const number: string | number | undefined = referral.number;

  if (!referral.congress || !referral.type || number === undefined) return null;

  return {
    congress: referral.congress,
    // Upper-cased here rather than at the view, so this reads and keys identically to a `LegislativeBill.type` — which
    // matters because the two sit in the same row once the title lookup fills one in.
    type: referral.type.trim().toUpperCase(),
    number: String(number),
    relationship: referral.relationshipType,
    actionDate: referral.actionDate,
  };
}

/**
 * Maps one entry in a committee's report list.
 *
 * @param report - A validated entry from the committee-reports endpoint.
 * @returns The mapped report, or `null` when it carries no citation. The citation is how a report is named everywhere
 *   it is referred to — in a bill's history, in the *Congressional Record*, on Congress.gov's own page for it — so a
 *   report without one is a row this app has no honest way to label.
 */
export function mapCommitteeReport(report: CongressApiCommitteeReport): CommitteeReport | null {
  const citation: string = (report.citation ?? "").trim();
  if (citation.length === 0) return null;

  return {
    citation,
    congress: report.congress,
    type: report.type,
    number: report.number,
    part: report.part,
    updateDate: normalizeApiTimestamp(report.updateDate),
  };
}

/**
 * Maps one entry in a committee's nomination list.
 *
 * @param nomination - A validated entry from the committee-nominations endpoint.
 * @returns The mapped nomination, or `null` when it carries no citation — the printed nomination number ("PN1201-7") is
 *   this record's identifier for the same reason a report's citation is.
 */
export function mapCommitteeNomination(nomination: CongressApiCommitteeNomination): CommitteeNomination | null {
  const citation: string = (nomination.citation ?? "").trim();
  if (citation.length === 0) return null;

  const action: { actionDate?: string; text?: string } | undefined = nomination.latestAction;

  return {
    citation,
    congress: nomination.congress,
    description: nomination.description,
    receivedDate: nomination.receivedDate,
    // Carried only when it says something: an object holding two `undefined`s renders as an empty line rather than as
    // no line, and "the API reported no action" is a fact the page states in words instead.
    latestAction: action?.text ? { date: action.actionDate, text: action.text } : undefined,
  };
}

/**
 * Normalizes a Congress.gov timestamp to the ISO 8601 spelling the rest of this app assumes.
 *
 * The committee-reports endpoint is the one place in this API that sends `"2015-03-20 00:05:31+00:00"` — a space where
 * every other endpoint sends a `T`. That is not a cosmetic difference: `formatDate` splits on the presence of a `T` to
 * decide whether it is holding a bare date or a datetime, so the space form takes the bare-date branch, has
 * `"T12:00:00Z"` appended to a string that already carries a time, and renders as the unparsed original. One `replace`
 * at the boundary is the whole fix, and it belongs here on the rule the rest of this module follows: normalization
 * happens where the upstream shape is translated, never at the view.
 *
 * @param value - The upstream timestamp, if any.
 * @returns The timestamp with its date and time joined by `T`, or `undefined` when there was none.
 */
function normalizeApiTimestamp(value: string | undefined): string | undefined {
  const trimmed: string = (value ?? "").trim();
  if (trimmed.length === 0) return undefined;

  return trimmed.replace(" ", "T");
}

/**
 * Sorts date-stamped records newest first, leaving the input array untouched.
 *
 * Ordering is {@link compareIsoDatesDesc}, shared with every other date-ordered list in the app. All this adds is
 * reading the date off an arbitrary field, which is what lets one function serve summaries (`actionDate`) and text
 * versions (`date`) alike. Records with no date sort last rather than being dropped — an undated summary is still a
 * real summary.
 *
 * @typeParam Item - Any record carrying an optional ISO date under `key`.
 * @param items - The records to order.
 * @param key - Which field holds the date (`"actionDate"` for summaries, `"date"` for text versions).
 * @returns A new array, most recent first.
 */
export function sortByDateDesc<Item>(items: Item[], key: keyof Item): Item[] {
  return [...items].sort((a: Item, b: Item): number => compareIsoDatesDesc(String(a[key] ?? ""), String(b[key] ?? "")));
}

/**
 * Maps a list of raw records and drops the ones that didn't survive mapping.
 *
 * @typeParam Raw - The upstream record shape.
 * @typeParam Mapped - The app's internal shape.
 * @param records - Raw records, or `undefined` when the payload omitted the collection entirely.
 * @param map - A mapper from this module, returning `null` for an unusable record.
 * @returns Only the records that mapped successfully.
 */
export function mapUsable<Raw, Mapped>(records: Raw[] | undefined, map: (record: Raw) => Mapped | null): Mapped[] {
  return (records ?? []).flatMap((record: Raw): Mapped[] => {
    const mapped: Mapped | null = map(record);
    return mapped === null ? [] : [mapped];
  });
}
