import {
  type BillAction,
  type BillAmendment,
  type BillCollectionCounts,
  type BillCosponsor,
  type BillCosponsorTally,
  type BillSponsor,
  type BillSummary,
  type BillTextFormat,
  type BillTextVersion,
  congressGovAmendmentUrl,
  congressGovBillUrl,
  type EnactedLaw,
  type LegislativeBill,
  NO_LATEST_ACTION_TEXT,
  type RecordedVote,
  type RelatedBill,
  type RelatedBillRelationship,
} from "@/lib/congress/bills/model";
import { sanitizeSummaryHtml } from "@/lib/congress/bills/sanitize-summary";
import { inferBillStage } from "@/lib/congress/bills/stage";
import {
  type BillCommittee,
  type BillCommitteeActivity,
  type BillSubcommittee,
  type CommitteeChamber,
  type CommitteeHistoryEntry,
  type CommitteeProfile,
  type CommitteeRef,
  type CommitteeSummary,
  compareCommitteesByName,
  normalizeCommitteeChamber,
  normalizeCommitteeType,
  type Subcommittee,
} from "@/lib/congress/committees/model";
import type { CommitteeBillReferral, CommitteeNomination, CommitteeReport } from "@/lib/congress/committees/records";
import {
  type CongressChamber,
  type CongressMember,
  type MemberDepiction,
  type MemberLeadershipRole,
  type MemberProfile,
  type MemberTerm,
  normalizeChamberName,
  normalizeJurisdiction,
  normalizePartyName,
} from "@/lib/congress/members/model";
import type {
  CongressApiAction,
  CongressApiBill,
  CongressApiBillAmendment,
  CongressApiBillCommittee,
  CongressApiBillCommitteeActivity,
  CongressApiBillSubcommittee,
  CongressApiCommittee,
  CongressApiCommitteeBill,
  CongressApiCommitteeDetail,
  CongressApiCommitteeHistory,
  CongressApiCommitteeNomination,
  CongressApiCommitteeRef,
  CongressApiCommitteeReport,
  CongressApiCosponsor,
  CongressApiDepiction,
  CongressApiLaw,
  CongressApiLeadership,
  CongressApiMember,
  CongressApiMemberDetail,
  CongressApiMemberDetailTerm,
  CongressApiMemberTerm,
  CongressApiRecordedVote,
  CongressApiRelatedBill,
  CongressApiRelationshipDetail,
  CongressApiSponsor,
  CongressApiSummary,
  CongressApiTextFormat,
  CongressApiTextVersion,
} from "@/lib/congress/upstream/api-schema";
import { compareIsoDatesDesc } from "@/lib/format";

/**
 * Translation from Congress.gov's wire shapes into this app's internal model. Each mapper returns `null` when a record
 * lacks something the app genuinely needs (a title, yes; a policy area, no), so callers filter it out. No I/O, so it's
 * unit-testable without stubbing `fetch`.
 */

/** A member paired with the chamber they sit in — the shape `mapCongressMember` returns before grouping. */
export type SeatedMember = {
  /** The chamber the member sits in. */
  chamber: CongressChamber;
  /** The mapped member. */
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
 * Maps a raw Congress.gov bill into {@link LegislativeBill}. Accepts both the list endpoint's `type`/`number` and the
 * detail endpoint's `billType`/`billNumber`, so one mapper defines a complete record.
 *
 * @param bill - A validated bill object from either the list or detail endpoint.
 * @returns The mapped bill, or `null` when it lacks a congress, title, type, or number.
 */
export function mapCongressBill(bill: CongressApiBill): LegislativeBill | null {
  const type: string | undefined = bill.type ?? bill.billType;
  const number: string | number | undefined = bill.number ?? bill.billNumber;

  if (!bill.congress || !bill.title || !type || !number) return null;

  const actionText: string = bill.latestAction?.text ?? NO_LATEST_ACTION_TEXT;
  const sponsor: CongressApiSponsor | undefined = bill.sponsors?.[0];
  // A bill is enacted at most once; the array is how the endpoint spells an optional field, not a collection to page.
  const enactedLaw: EnactedLaw | undefined = mapUsable(bill.laws, mapEnactedLaw)[0];
  const originChamber: LegislativeBill["originChamber"] = asOriginChamber(bill.originChamber);

  return {
    congress: bill.congress,
    type: type.toUpperCase(),
    number: String(number),
    title: bill.title,
    originChamber,
    introducedDate: bill.introducedDate,
    latestAction: {
      date: bill.latestAction?.actionDate ?? bill.updateDate,
      text: actionText,
    },
    policyArea: bill.policyArea?.name,
    // A published law outranks a phrase match. `inferBillStage` reaches `"law"` by recognizing "became public law" in
    // one line of prose, which is right whenever that sentence is the latest action and silent whenever a later one
    // displaced it; `laws` is the record stating the outcome regardless of what the newest row happens to say.
    stage: enactedLaw ? "law" : inferBillStage(actionText, originChamber),
    // `legislationUrl` is the public congress.gov page, published by the item-level endpoint since August 2025;
    // `congressGovBillUrl` derives the same string and still covers the list endpoint, which does not send it. What is
    // deliberately never used is `bill.url` — that field is the record's own *API* endpoint, which serves JSON (and
    // 403s without a key of the reader's own). See congressGovBillUrl.
    officialUrl: bill.legislationUrl ?? congressGovBillUrl({ congress: bill.congress, type, number: String(number) }),
    sponsor: sponsor?.fullName
      ? ({
          fullName: sponsor.fullName,
          party: sponsor.party,
          state: sponsor.state,
          bioguideId: sponsor.bioguideId,
        } satisfies BillSponsor)
      : undefined,
    cosponsorTally: mapCosponsorTally(bill),
    enactedLaw,
    collectionCounts: mapBillCollectionCounts(bill),
  };
}

/**
 * Reads the publisher's own sizes for the collections hanging off a bill.
 *
 * @param bill - A validated bill object from either endpoint.
 * @returns The counts, or `undefined` when none were published (every list-endpoint bill) — not an object of
 *   `undefined`s, since the page distinguishes "never asked" from "asked".
 */
function mapBillCollectionCounts(bill: CongressApiBill): BillCollectionCounts | undefined {
  const counts: BillCollectionCounts = {
    actions: bill.actions?.count,
    committees: bill.committees?.count,
    summaries: bill.summaries?.count,
    textVersions: bill.textVersions?.count,
    relatedBills: bill.relatedBills?.count,
    amendments: bill.amendments?.count,
  };

  return Object.values(counts).some((count: number | undefined): boolean => count !== undefined) ? counts : undefined;
}

/**
 * Reads the publisher's two cosponsor figures — a pair whose difference matters, unlike the collection lengths in
 * {@link mapBillCollectionCounts}.
 *
 * @param bill - A validated bill object from either endpoint.
 * @returns The tally, or `undefined` when neither figure was published (every list-endpoint bill).
 */
function mapCosponsorTally(bill: CongressApiBill): BillCosponsorTally | undefined {
  const tally: BillCosponsorTally = {
    current: bill.cosponsors?.count,
    includingWithdrawn: bill.cosponsors?.countIncludingWithdrawnCosponsors,
  };

  return tally.current === undefined && tally.includingWithdrawn === undefined ? undefined : tally;
}

/**
 * Maps one entry from a bill's `/cosponsors` collection.
 *
 * @param cosponsor - A validated cosponsor entry.
 * @returns The mapped cosponsor, or `null` without a name. A missing `bioguideId` only costs the link.
 */
export function mapBillCosponsor(cosponsor: CongressApiCosponsor): BillCosponsor | null {
  if (!cosponsor.fullName) return null;

  return {
    fullName: cosponsor.fullName,
    bioguideId: cosponsor.bioguideId,
    party: cosponsor.party,
    state: cosponsor.state,
    sponsorshipDate: cosponsor.sponsorshipDate,
    withdrawnDate: cosponsor.sponsorshipWithdrawnDate,
    // Defaulted to false rather than carried as optional: every consumer wants a boolean, and "the record didn't say"
    // and "the record said no" are not distinguishable in anything this app would print.
    isOriginal: cosponsor.isOriginalCosponsor === true,
  };
}

/**
 * Maps one statement of how two measures relate.
 *
 * @param detail - A validated relationship entry.
 * @returns The mapped relationship, or `null` without a type. An attribution with nothing attributed to it — "CRS
 *   said…" and then nothing — is not a row.
 */
export function mapRelatedBillRelationship(detail: CongressApiRelationshipDetail): RelatedBillRelationship | null {
  const type: string = (detail.type ?? "").trim();
  if (type.length === 0) return null;

  return { type, identifiedBy: detail.identifiedBy };
}

/**
 * Maps one entry from a bill's `/relatedbills` collection.
 *
 * @param related - A validated related-bill entry.
 * @returns The mapped reference, or `null` without the congress, type, number, or title its link and label need.
 */
export function mapRelatedBill(related: CongressApiRelatedBill): RelatedBill | null {
  if (!related.congress || !related.type || related.number === undefined || !related.title) return null;

  const actionText: string | undefined = related.latestAction?.text;

  return {
    congress: related.congress,
    type: related.type.toUpperCase(),
    number: String(related.number),
    title: related.title,
    // Carried only when it says something, like `mapCommitteeNomination`'s: a latest action with a date and no text
    // renders as a stray date rather than as a sentence.
    latestAction: actionText ? { date: related.latestAction?.actionDate, text: actionText } : undefined,
    relationships: mapUsable(related.relationshipDetails, mapRelatedBillRelationship),
  };
}

/**
 * Maps one entry from a bill's `/amendments` collection.
 *
 * Only identity is required — lower than {@link mapRelatedBill}'s bar — because an amendment is labeled by its citation
 * ("S.Amdt. 2849"). Requiring more would drop about fourteen in fifteen entries.
 *
 * @param amendment - A validated amendment entry.
 * @returns The mapped reference, or `null` without the congress, type, and number its citation and its link are both
 *   built from.
 */
export function mapBillAmendment(amendment: CongressApiBillAmendment): BillAmendment | null {
  if (!amendment.congress || !amendment.type || amendment.number === undefined) return null;

  const type: string = amendment.type.toUpperCase();
  const number: string = String(amendment.number);
  // `purpose` is the amendment's own statement of what it does; `description` is the House's longer contextual note on
  // an amendment printed in a report. Preferring the first keeps the row in the amendment's voice where it has one.
  const purpose: string | undefined = amendment.purpose?.trim() || amendment.description?.trim() || undefined;
  const actionText: string | undefined = amendment.latestAction?.text;

  return {
    congress: amendment.congress,
    type,
    number,
    purpose,
    // Carried only when it says something, like `mapRelatedBill`'s: a latest action with a date and no text renders as
    // a stray date rather than as a sentence.
    latestAction: actionText ? { date: amendment.latestAction?.actionDate, text: actionText } : undefined,
    officialUrl: congressGovAmendmentUrl({ congress: amendment.congress, type, number }),
  };
}

/**
 * Maps the law a bill became.
 *
 * @param law - A validated entry from a detail-endpoint bill's `laws` array.
 * @returns The mapped law, or `null` unless it carries both the type and the number. The action codes can still
 *   establish the stage without it.
 */
export function mapEnactedLaw(law: CongressApiLaw): EnactedLaw | null {
  const type: string = (law.type ?? "").trim();
  const number: string = (law.number ?? "").trim();

  if (type.length === 0 || number.length === 0) return null;

  return { type, number };
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
 * @returns The mapped reference, or `null` without a recognizable chamber, roll number, congress, and the chamber's
 *   URL — everything needed to name and reach the vote.
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
 * Collects every distinct roll-call vote in a bill's action history. Congress.gov reports each event from several
 * source systems, so one roll call can arrive on two or three actions; listing it twice would read as two votes.
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
 * Maps a member-list entry into {@link CongressMember}, paired with their chamber — taken from the *last* recognizable
 * term, so a member who moved from the House to the Senate sits in the Senate. (List-level terms carry no Congress to
 * match on.)
 *
 * @param member - A validated entry from the member list endpoint.
 * @returns The member and their chamber, or `null` without a name or a recognizable chamber.
 */
export function mapCongressMember(member: CongressApiMember): SeatedMember | null {
  const name: string | undefined = member.name?.trim();
  if (!name) return null;

  // Annotated for the same reason `mapMemberProfile` annotates its own: the list endpoint's term entries are a
  // genuinely smaller shape than the item endpoint's, and naming which of the two is in hand is what stops a future
  // edit from reaching for the `congress` or `memberType` only the richer one carries.
  const terms: CongressApiMemberTerm[] = member.terms?.item ?? [];

  let chamber: CongressChamber | null = null;
  for (const term of terms) {
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
      depiction: mapMemberDepiction(member.depiction),
    },
  };
}

/**
 * Maps a member's portrait and its credit line, for both member endpoints. The credit is sanitized here so no
 * unsanitized markup exists in the model; it's HTML because some credits link to the holding archive.
 *
 * @param depiction - The validated `depiction` object, if the record carried one.
 * @returns The portrait, or `undefined` without an image URL. A portrait with no credit is kept.
 */
export function mapMemberDepiction(depiction: CongressApiDepiction | undefined): MemberDepiction | undefined {
  const imageUrl: string = (depiction?.imageUrl ?? "").trim();
  if (imageUrl.length === 0) return undefined;

  const attribution: string = (depiction?.attribution ?? "").trim();

  return {
    imageUrl,
    attribution: attribution.length > 0 ? sanitizeSummaryHtml(attribution) : undefined,
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
 * Maps a member item-endpoint record into {@link MemberProfile}. Terms are sorted newest first and supply the chamber,
 * title, and (when the top-level fields are absent) the jurisdiction.
 *
 * @param member - A validated record from the member item endpoint.
 * @param bioguideId - The ID that was looked up, used when the payload itself omits one.
 * @returns The mapped profile, or `null` without a name or a recognizable term.
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
    depiction: mapMemberDepiction(member.depiction),
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
 * Maps a committee reference (a `parent` or a `subcommittees` entry). Also the identity rule every other committee
 * mapper starts from.
 *
 * @param ref - A validated committee reference.
 * @returns The mapped reference, or `null` without a code (can't open it) or a name (can't label it).
 */
export function mapCommitteeRef(ref: Pick<CongressApiCommitteeRef, "systemCode" | "name">): CommitteeRef | null {
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
  const ref: CommitteeRef | null = mapCommitteeRef(committee);
  const chamber: CommitteeChamber | null = normalizeCommitteeChamber(committee.chamber);

  if (!ref || !chamber) return null;

  const { systemCode, name } = ref;

  const typeName: string | undefined = committee.committeeTypeCode ?? committee.type;
  const parent: CommitteeRef | null = committee.parent ? mapCommitteeRef(committee.parent) : null;

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
 * Maps a committee item-endpoint record into {@link CommitteeProfile}. The item record has no chamber (it's in the
 * requested path) and no `name` (its current name is the latest `history` entry's), so both are supplied here.
 *
 * @param committee - A validated record from the committee item endpoint.
 * @param systemCode - The code that was looked up, used when the payload itself omits one.
 * @param chamber - The chamber whose endpoint was asked, since the record doesn't say.
 * @returns The mapped profile, or `null` when no history entry names the committee.
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

  const parent: CommitteeRef | null = committee.parent ? mapCommitteeRef(committee.parent) : null;
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
 * The activity name Congress.gov uses when it recorded that *something* happened but not what. Common, and useless to a
 * reader, so those activity rows are dropped; the committee itself still appears.
 */
const UNNAMED_COMMITTEE_ACTIVITY: string = "unknown";

/**
 * Maps one recorded committee activity.
 *
 * @param activity - A validated entry from a bill's committee record.
 * @returns The mapped activity, or `null` when it names nothing — including the endpoint's literal `"Unknown"`.
 * @see UNNAMED_COMMITTEE_ACTIVITY
 */
export function mapBillCommitteeActivity(activity: CongressApiBillCommitteeActivity): BillCommitteeActivity | null {
  const name: string = (activity.name ?? "").trim();

  if (name.length === 0 || name.toLowerCase() === UNNAMED_COMMITTEE_ACTIVITY) return null;

  return { name, date: activity.date };
}

/**
 * Maps one subcommittee a bill reached.
 *
 * @param subcommittee - A validated entry from a committee's `subcommittees` array on a bill record.
 * @returns The mapped subcommittee, or `null` without a code and a name — the same bar {@link mapCommitteeRef} holds,
 *   and for the same reason: one that cannot be opened or labeled is not a row.
 */
export function mapBillSubcommittee(subcommittee: CongressApiBillSubcommittee): BillSubcommittee | null {
  const ref: CommitteeRef | null = mapCommitteeRef(subcommittee);
  if (!ref) return null;

  return { ...ref, activities: mapUsable(subcommittee.activities, mapBillCommitteeActivity) };
}

/**
 * Maps one committee a bill was before.
 *
 * @param committee - A validated entry from `GET /v3/bill/{congress}/{type}/{number}/committees`.
 * @returns The mapped committee, or `null` without a code, a name, or a recognizable chamber — the code and chamber
 *   form the inward link.
 */
export function mapBillCommittee(committee: CongressApiBillCommittee): BillCommittee | null {
  const ref: CommitteeRef | null = mapCommitteeRef(committee);
  const chamber: CommitteeChamber | null = normalizeCommitteeChamber(committee.chamber);

  if (!ref || !chamber) return null;

  const { systemCode, name } = ref;

  return {
    systemCode,
    name,
    chamber,
    type: normalizeCommitteeType(committee.type),
    typeName: committee.type,
    // Left in the publisher's order rather than sorted by date. The endpoint lists a committee's activities newest
    // first, but its *committees* in referral order — primary committee first — and that ordering is meaningful, so
    // neither level is re-sorted into an order this app would then be claiming to have established.
    activities: mapUsable(committee.activities, mapBillCommitteeActivity),
    subcommittees: mapUsable(committee.subcommittees, mapBillSubcommittee).sort(compareCommitteesByName),
  };
}

/**
 * Maps one entry in a committee's bill list.
 *
 * @param referral - A validated entry from the committee-bills endpoint.
 * @returns The mapped referral, or `null` without a congress, type, or number — with no title, those are the record.
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
 * @returns The mapped report, or `null` without a citation, which is how a report is named everywhere.
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

  const action: CongressApiCommitteeNomination["latestAction"] = nomination.latestAction;

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
 * Normalizes a Congress.gov timestamp to ISO 8601. The committee-reports endpoint sends `"2015-03-20 00:05:31+00:00"`
 * with a space, which `formatDate` would misread as a bare date.
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
 * @param items - The records to order. Left untouched — `toSorted` copies before ordering, which is what lets the
 *   parameter be `readonly` and so lets callers hand over a list they intend to keep.
 * @param key - Which field holds the date (`"actionDate"` for summaries, `"date"` for text versions).
 * @returns A new array, most recent first.
 */
export function sortByDateDesc<Item>(items: readonly Item[], key: keyof Item): Item[] {
  return items.toSorted((a: Item, b: Item): number => compareIsoDatesDesc(String(a[key] ?? ""), String(b[key] ?? "")));
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
