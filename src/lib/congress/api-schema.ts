import { type ZodCatch, type ZodNumber, type ZodOptional, type ZodString, z } from "zod";

/**
 * Runtime shapes for the Congress.gov v3 responses this app reads.
 *
 * `src/lib/congress` is the layer whose stated job is to treat upstream fields as untrusted (see
 * `docs/architecture.md`), and a bare `as CongressApiListResponse` cast does nothing at runtime — it only tells
 * TypeScript to stop asking. These schemas make that boundary real: every payload is actually inspected before the
 * mappers touch it.
 *
 * Two conventions run through every schema here, and both exist so validation can only ever narrow what reaches the
 * mappers — never turn a payload the app could have coped with into a failed read:
 *
 * - **Objects are loose.** Congress.gov returns far more fields than this app reads, and adds new ones over time.
 *   Unknown keys are preserved rather than treated as errors.
 * - **Fields are optional and `.catch(undefined)`.** A single field arriving as the wrong type (a `null` title, a
 *   string where a number belongs) degrades that one field to `undefined` — which every mapper already handles — rather
 *   than rejecting the whole record. Only a payload that isn't an object at all fails outright, which is the one case
 *   where there was never anything usable to salvage.
 *
 * @see mapCongressBill and its siblings in `mappers.ts`, which decide what a *usable* record is once the shape is
 *   known.
 */

/** An optional string that degrades to `undefined` rather than failing validation. */
const optionalString: ZodCatch<ZodOptional<ZodString>> = z.string().optional().catch(undefined);

/** An optional number that degrades to `undefined` rather than failing validation. */
const optionalNumber: ZodCatch<ZodOptional<ZodNumber>> = z.number().optional().catch(undefined);

/** Shape of one entry in a detail-endpoint bill's `sponsors` array. */
export const congressApiSponsorSchema = z.looseObject({
  bioguideId: optionalString,
  fullName: optionalString,
  party: optionalString,
  state: optionalString,
});

/**
 * One law a bill became, as the detail endpoint publishes it: `{ "type": "Public Law", "number": "119-21" }`.
 *
 * The API's own statement that a measure was enacted, and the only place the public law number appears at all. Read
 * rather than inferred: every other route to "this became law" in this app is a classifier over prose or action codes,
 * and a classifier can be wrong in a way a published field cannot. @see mapCongressBill, which prefers it.
 */
export const congressApiLawSchema = z.looseObject({
  number: optionalString,
  type: optionalString,
});

/**
 * Subset of a Congress.gov API bill object actually used by this app — both the list and detail endpoint shapes, since
 * `mapCongressBill` handles either.
 */
export const congressApiBillSchema = z.looseObject({
  congress: optionalNumber,
  // The list endpoint uses `type`/`number`; the single-bill detail endpoint uses `billType`/`billNumber`. Both are
  // accepted so one mapper covers both.
  type: optionalString,
  billType: optionalString,
  number: z.union([z.string(), z.number()]).optional().catch(undefined),
  billNumber: z.union([z.string(), z.number()]).optional().catch(undefined),
  title: optionalString,
  originChamber: optionalString,
  introducedDate: optionalString,
  updateDate: optionalString,
  url: optionalString,
  policyArea: z.looseObject({ name: optionalString }).optional().catch(undefined),
  latestAction: z.looseObject({ actionDate: optionalString, text: optionalString }).optional().catch(undefined),
  // Only populated on the detail endpoint — the list endpoint doesn't return any of these.
  sponsors: z.array(congressApiSponsorSchema).optional().catch(undefined),
  /**
   * The cosponsor count, and separately the count *including* anyone who later withdrew.
   *
   * Two figures rather than one because a withdrawal is a real event on the record, and the `/cosponsors` collection
   * lists only who is currently signed on. Where the two disagree, someone took their name off — a fact the bill page
   * states in words rather than leaving as an unexplained gap between a heading and a list.
   * @see BillCosponsorTally
   */
  cosponsors: z
    .looseObject({ count: optionalNumber, countIncludingWithdrawnCosponsors: optionalNumber })
    .optional()
    .catch(undefined),
  laws: z.array(congressApiLawSchema).optional().catch(undefined),
  /**
   * The four collections this app fetches separately, each described here as `{ count, url }`.
   *
   * Only the counts are read. The `url` is the collection's own *API* endpoint and is skipped for exactly the reason
   * `bill.url` is — it serves JSON, and 403s without a key of the reader's own — while the path this app requests is
   * built from the bill's already-validated identity instead. @see fetchBillSubResource
   *
   * The counts matter because they are the publisher's own answer to "how many of these are there", and until they
   * were read the bill page could only offer its own tally of the rows it managed to fetch and map. Those agree almost
   * always and not quite always: a row the mapper drops, or a collection longer than the one 250-record page this app
   * requests, makes the two diverge — and the sentence stating the number attributed it to Congress.gov either way.
   * @see BillCollectionCounts
   */
  actions: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  committees: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  summaries: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  textVersions: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  relatedBills: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  /**
   * The record's *public* congress.gov page, as opposed to the self-referential API `url` above.
   *
   * Added to the item-level endpoint in August 2025, which is after `congressGovBillUrl` was written to derive the same
   * string from the bill's identity. The derivation is still needed — the list endpoint does not send this — so the two
   * coexist, with the published value preferred wherever it arrives. @see mapCongressBill
   */
  legislationUrl: optionalString,
});

/** Shape of `GET /v3/bill/{congress}` (the list endpoint). */
export const congressApiListResponseSchema = z.looseObject({
  bills: z.array(congressApiBillSchema).optional().catch(undefined),
});

/** Shape of `GET /v3/bill/{congress}/{type}/{number}` (the single-bill detail endpoint). */
export const congressApiDetailResponseSchema = z.looseObject({
  bill: congressApiBillSchema.optional().catch(undefined),
});

/** Shape of one entry in `GET /v3/bill/{congress}/{type}/{number}/summaries`. */
export const congressApiSummarySchema = z.looseObject({
  versionCode: optionalString,
  actionDesc: optionalString,
  actionDate: optionalString,
  text: optionalString,
});

/** Shape of `GET /v3/bill/{congress}/{type}/{number}/summaries`. */
export const congressApiSummariesResponseSchema = z.looseObject({
  summaries: z.array(congressApiSummarySchema).optional().catch(undefined),
});

/** One downloadable rendering (Formatted Text, PDF, XML) of a bill text version. */
export const congressApiTextFormatSchema = z.looseObject({
  type: optionalString,
  url: optionalString,
});

/** One stage-specific version of a bill's text, with links to each of its renderings. */
export const congressApiTextVersionSchema = z.looseObject({
  type: optionalString,
  date: optionalString,
  formats: z.array(congressApiTextFormatSchema).optional().catch(undefined),
});

/** Shape of `GET /v3/bill/{congress}/{type}/{number}/text`. */
export const congressApiTextResponseSchema = z.looseObject({
  textVersions: z.array(congressApiTextVersionSchema).optional().catch(undefined),
});

/**
 * One roll-call vote referenced by a bill action.
 *
 * This is the *only* place either chamber's recorded votes reach this app. Congress.gov publishes a dedicated
 * `/house-vote` resource, but there is no `senate-vote` counterpart (the path 404s), so a bill's own action record is
 * the one surface where a Senate roll call can be named at all. What arrives here is a reference — chamber, roll
 * number, and a link to the chamber's own tally — never the tally itself.
 */
export const congressApiRecordedVoteSchema = z.looseObject({
  chamber: optionalString,
  congress: optionalNumber,
  date: optionalString,
  rollNumber: optionalNumber,
  sessionNumber: optionalNumber,
  url: optionalString,
});

/**
 * Shape of one entry in `GET /v3/bill/{congress}/{type}/{number}/actions`.
 *
 * `actionCode` is typed as a string because the endpoint mixes numeric-looking codes (`"8000"`) with alphanumeric ones
 * (`"H37300"`, `"Intro-H"`) in the same field, and quietly coercing the first kind to a number would break equality
 * against the codes {@link inferStageFromActions} matches on.
 *
 * `sourceSystem` matters more than it looks: the same event is reported by several systems at once — the Library of
 * Congress (code 9), House floor actions (code 2), and committee systems — so a bill's action list contains deliberate
 * near-duplicates rather than a clean sequence. Only the Library of Congress rows carry the standardized codes.
 */
export const congressApiActionSchema = z.looseObject({
  actionCode: optionalString,
  actionDate: optionalString,
  actionTime: optionalString,
  text: optionalString,
  type: optionalString,
  sourceSystem: z.looseObject({ code: optionalNumber, name: optionalString }).optional().catch(undefined),
  recordedVotes: z.array(congressApiRecordedVoteSchema).optional().catch(undefined),
});

/** Shape of `GET /v3/bill/{congress}/{type}/{number}/actions`. */
export const congressApiActionsResponseSchema = z.looseObject({
  actions: z.array(congressApiActionSchema).optional().catch(undefined),
});

/**
 * One thing a committee did with a bill, as `GET /v3/bill/{congress}/{type}/{number}/committees` records it.
 *
 * `name` is the committee's own vocabulary — `"Referred To"`, `"Reported By"`, `"Markup By"`, `"Hearings By"` — and is
 * the reason this endpoint is worth reading rather than parsing the same fact back out of the action prose. It is also,
 * on a large share of rows, the literal string `"Unknown"`; @see mapBillCommitteeActivity for what becomes of those.
 */
export const congressApiBillCommitteeActivitySchema = z.looseObject({
  name: optionalString,
  date: optionalString,
});

/** One subcommittee a bill reached, nested inside its parent committee's entry. */
export const congressApiBillSubcommitteeSchema = z.looseObject({
  systemCode: optionalString,
  name: optionalString,
  activities: z.array(congressApiBillCommitteeActivitySchema).optional().catch(undefined),
});

/**
 * Shape of one entry in `GET /v3/bill/{congress}/{type}/{number}/committees`.
 *
 * Deliberately *not* {@link congressApiCommitteeSchema}, on the same reasoning that keeps
 * {@link congressApiCommitteeBillSchema} separate from {@link congressApiBillSchema}: this describes a *relationship
 * between a bill and a committee*, not a committee. It carries `activities` and nested `subcommittees` that no
 * committee record has, and none of the `parent`/`committeeTypeCode` fields a directory row is built from.
 *
 * Unlike the committee item endpoint, this one *does* state the chamber, which is what lets a bill page link straight
 * to this app's own `/committees/{chamber}/{systemCode}` page without a second request to discover where the committee
 * sits.
 */
export const congressApiBillCommitteeSchema = z.looseObject({
  systemCode: optionalString,
  name: optionalString,
  chamber: optionalString,
  type: optionalString,
  activities: z.array(congressApiBillCommitteeActivitySchema).optional().catch(undefined),
  subcommittees: z.array(congressApiBillSubcommitteeSchema).optional().catch(undefined),
});

/** Shape of `GET /v3/bill/{congress}/{type}/{number}/committees`. */
export const congressApiBillCommitteesResponseSchema = z.looseObject({
  committees: z.array(congressApiBillCommitteeSchema).optional().catch(undefined),
});

/**
 * Shape of one entry in `GET /v3/bill/{congress}/{type}/{number}/cosponsors`.
 *
 * `isOriginalCosponsor` is the field that makes this collection worth listing rather than counting. A member who signed
 * on the day a bill was introduced and one who joined eight months later are both "cosponsors", and only the record
 * distinguishes them — so the distinction is read here rather than inferred from whether `sponsorshipDate` happens to
 * match the bill's `introducedDate`, which is a comparison this app would be making up.
 *
 * `sponsorshipWithdrawnDate` is documented and is genuinely rare — no bill sampled while this was written carried one.
 * It is read anyway, on the same rule as everything else in this file: a field that arrives is mapped, and a field that
 * doesn't degrades to `undefined` rather than to a wrong claim. @see congressApiBillSchema's `cosponsors` for the
 * counts that say a withdrawal happened even when the collection no longer lists the member.
 */
export const congressApiCosponsorSchema = z.looseObject({
  bioguideId: optionalString,
  fullName: optionalString,
  party: optionalString,
  state: optionalString,
  district: optionalNumber,
  sponsorshipDate: optionalString,
  sponsorshipWithdrawnDate: optionalString,
  isOriginalCosponsor: z.boolean().optional().catch(undefined),
});

/** Shape of `GET /v3/bill/{congress}/{type}/{number}/cosponsors`. */
export const congressApiCosponsorsResponseSchema = z.looseObject({
  cosponsors: z.array(congressApiCosponsorSchema).optional().catch(undefined),
});

/**
 * One statement of *how* two measures are related, and — crucially — who said so.
 *
 * `identifiedBy` is the reason this endpoint fits a provenance-first product at all. A relationship between two bills
 * is an editorial judgment, not a legislative act, and this field names the body that made it: the Congressional
 * Research Service, or the House, or the Senate. The bill page prints the attribution beside the relationship rather
 * than presenting "related" as a property the measures simply have. @see RelatedBillRelationship
 */
export const congressApiRelationshipDetailSchema = z.looseObject({
  type: optionalString,
  identifiedBy: optionalString,
});

/**
 * Shape of one entry in `GET /v3/bill/{congress}/{type}/{number}/relatedbills`.
 *
 * A bill reference rather than a bill: it carries enough identity to build this app's own link
 * (`congress`/`type`/`number`), the title to label it, and the other measure's latest action — but none of the sponsor,
 * policy-area, or collection-count fields {@link congressApiBillSchema} describes. Kept separate for the same reason
 * {@link congressApiBillCommitteeSchema} is: this describes a *relationship between two bills*, not a bill.
 */
export const congressApiRelatedBillSchema = z.looseObject({
  congress: optionalNumber,
  type: optionalString,
  number: z.union([z.string(), z.number()]).optional().catch(undefined),
  title: optionalString,
  latestAction: z.looseObject({ actionDate: optionalString, text: optionalString }).optional().catch(undefined),
  relationshipDetails: z.array(congressApiRelationshipDetailSchema).optional().catch(undefined),
});

/** Shape of `GET /v3/bill/{congress}/{type}/{number}/relatedbills`. */
export const congressApiRelatedBillsResponseSchema = z.looseObject({
  relatedBills: z.array(congressApiRelatedBillSchema).optional().catch(undefined),
});

/**
 * One term entry inside a *list*-level member record.
 *
 * List-level member records are a smaller shape than item-level ones: there's no `memberType` ("Representative" /
 * "Delegate" / "Senator") and no per-term `congress`, and `terms.item[]` carries only chamber/startYear/endYear. That's
 * why chamber is read from the last recognizable term rather than from a term matched on congress number, and why
 * non-voting House seats are derived from the represented jurisdiction (see `isNonVotingJurisdiction`) — the
 * alternative is one extra request per member, ~540 of them.
 */
export const congressApiMemberTermSchema = z.looseObject({
  chamber: optionalString,
  startYear: optionalNumber,
  endYear: optionalNumber,
});

/**
 * A member's official portrait and the credit line the API's terms require alongside it.
 *
 * Shared by the list and item endpoints, which publish the same two fields — and that is worth stating plainly, because
 * it is the one place the list record is *not* the poorer of the two. Almost everything else the member page shows
 * (`memberType`, per-term `congress`, leadership, the legislation counts) is item-level only; the portrait is not, so a
 * roster can show faces without the one-request-per-member that rule usually implies.
 *
 * `attribution` is separately optional from `imageUrl` rather than bundled with it, because the API genuinely ships
 * portraits without one — three of the 500 members sampled in August 2026 (list *and* item alike, so it is a fact about
 * those records rather than about an endpoint). Anything rendering the image has to handle a missing credit.
 */
export const congressApiDepictionSchema = z.looseObject({
  imageUrl: optionalString,
  /** An HTML fragment, sometimes carrying a link to the holding archive — sanitize before rendering. */
  attribution: optionalString,
});

/**
 * Shape of one entry in `GET /v3/member/congress/{congress}` (the member *list* endpoint).
 *
 * @see congressApiDepictionSchema for why `depiction` is read here and not only on the item record.
 */
export const congressApiMemberSchema = z.looseObject({
  bioguideId: optionalString,
  name: optionalString,
  partyName: optionalString,
  state: optionalString,
  district: optionalNumber,
  depiction: congressApiDepictionSchema.optional().catch(undefined),
  terms: z
    .looseObject({ item: z.array(congressApiMemberTermSchema).optional().catch(undefined) })
    .optional()
    .catch(undefined),
});

/** Shape of `GET /v3/member/congress/{congress}`. */
export const congressApiMemberListResponseSchema = z.looseObject({
  members: z.array(congressApiMemberSchema).optional().catch(undefined),
  pagination: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
});

/**
 * One term entry inside an *item*-level member record.
 *
 * Richer than its list-level counterpart above: item-level terms carry the `congress` they belong to and the
 * `memberType` that distinguishes a Delegate or the Resident Commissioner from a Representative — neither of which the
 * list endpoint returns. That difference is the whole reason the member page fetches the item endpoint rather than
 * reusing what the chamber chart already has.
 */
export const congressApiMemberDetailTermSchema = z.looseObject({
  chamber: optionalString,
  congress: optionalNumber,
  startYear: optionalNumber,
  endYear: optionalNumber,
  memberType: optionalString,
  stateName: optionalString,
  district: optionalNumber,
});

/** One leadership office inside an item-level member record. */
export const congressApiLeadershipSchema = z.looseObject({
  type: optionalString,
  congress: optionalNumber,
});

/**
 * Shape of `GET /v3/member/{bioguideId}` (the member *item* endpoint).
 *
 * Note the `terms` shape: the list endpoint nests them under `terms.item[]`, while this endpoint returns a bare array.
 * Both forms are accepted here rather than assumed, so a future upstream alignment in either direction can't silently
 * empty out a member's service history.
 *
 * `birthYear` is typed as a string because that is how the API returns it (`"1940"`), and coercing it here would only
 * move the parsing somewhere less obvious.
 */
export const congressApiMemberDetailSchema = z.looseObject({
  bioguideId: optionalString,
  invertedOrderName: optionalString,
  directOrderName: optionalString,
  honorificName: optionalString,
  partyName: optionalString,
  partyHistory: z
    .array(z.looseObject({ partyName: optionalString, partyAbbreviation: optionalString, startYear: optionalNumber }))
    .optional()
    .catch(undefined),
  state: optionalString,
  district: optionalNumber,
  birthYear: optionalString,
  currentMember: z.boolean().optional().catch(undefined),
  officialWebsiteUrl: optionalString,
  depiction: congressApiDepictionSchema.optional().catch(undefined),
  leadership: z.array(congressApiLeadershipSchema).optional().catch(undefined),
  sponsoredLegislation: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  cosponsoredLegislation: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  terms: z
    .union([
      z.array(congressApiMemberDetailTermSchema),
      z.looseObject({ item: z.array(congressApiMemberDetailTermSchema).optional().catch(undefined) }),
    ])
    .optional()
    .catch(undefined),
});

/** Shape of `GET /v3/member/{bioguideId}`. */
export const congressApiMemberDetailResponseSchema = z.looseObject({
  member: congressApiMemberDetailSchema.optional().catch(undefined),
});

/**
 * Shape of `GET /v3/member/{bioguideId}/sponsored-legislation`.
 *
 * Entries reuse {@link congressApiBillSchema}: the fields are the same bill fields the list endpoint returns, minus
 * `originChamber`, which `mapCongressBill` already degrades to `"Unknown"`. Sharing the schema means sponsored
 * legislation is mapped by exactly the same rules — and so renders in exactly the same `BillCard` — as any other bill.
 */
export const congressApiSponsoredLegislationResponseSchema = z.looseObject({
  sponsoredLegislation: z.array(congressApiBillSchema).optional().catch(undefined),
});

/** Shape of `GET /v3/member/{bioguideId}/cosponsored-legislation`. */
export const congressApiCosponsoredLegislationResponseSchema = z.looseObject({
  cosponsoredLegislation: z.array(congressApiBillSchema).optional().catch(undefined),
});

/**
 * A committee named from inside another committee's record — a `parent` on a subcommittee, or an entry in a parent's
 * `subcommittees` array. Both spellings carry the same three fields, so one schema covers both.
 */
export const congressApiCommitteeRefSchema = z.looseObject({
  systemCode: optionalString,
  name: optionalString,
  url: optionalString,
});

/**
 * Shape of one entry in `GET /v3/committee/{congress}` (the committee *list* endpoint).
 *
 * `committeeTypeCode` is the list endpoint's spelling of what the item endpoint calls `type`; both are accepted here so
 * one schema and one mapper cover a committee arriving from either.
 */
export const congressApiCommitteeSchema = z.looseObject({
  systemCode: optionalString,
  name: optionalString,
  chamber: optionalString,
  committeeTypeCode: optionalString,
  type: optionalString,
  parent: congressApiCommitteeRefSchema.optional().catch(undefined),
  subcommittees: z.array(congressApiCommitteeRefSchema).optional().catch(undefined),
});

/** Shape of `GET /v3/committee/{congress}`. */
export const congressApiCommitteeListResponseSchema = z.looseObject({
  committees: z.array(congressApiCommitteeSchema).optional().catch(undefined),
  pagination: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
});

/** One recorded name-and-span in a committee's history. @see CommitteeHistoryEntry for why this is worth rendering. */
export const congressApiCommitteeHistorySchema = z.looseObject({
  officialName: optionalString,
  libraryOfCongressName: optionalString,
  startDate: optionalString,
  endDate: optionalString,
  establishingAuthority: optionalString,
});

/** A count-and-link collection on a committee record (`bills`, `reports`, `nominations`). */
const congressApiCommitteeCollectionSchema = z.looseObject({
  count: optionalNumber,
  url: optionalString,
});

/**
 * Shape of `GET /v3/committee/{chamber}/{systemCode}` (the committee *item* endpoint).
 *
 * Note what this record does *not* carry: a `chamber`, and — unlike every list entry — a `name`. The chamber is known
 * from the path that was requested, and the name has to be read out of `history`, whose most recent entry is the
 * committee's current formal name. @see mapCommitteeProfile, which is where both of those are resolved.
 */
export const congressApiCommitteeDetailSchema = z.looseObject({
  systemCode: optionalString,
  type: optionalString,
  isCurrent: z.boolean().optional().catch(undefined),
  /**
   * The committee's own site (e.g., `https://agriculture.house.gov/`), added to this endpoint in December 2025.
   *
   * Read rather than derived, which is the whole reason it can be linked at all: congress.gov's own committee URLs
   * embed a name slug this API has never published, and guessing one produces an authoritative-looking 404.
   * @see docs/data-policy.md, "The Committee Page Has No Roster".
   */
  committeeWebsiteUrl: optionalString,
  history: z.array(congressApiCommitteeHistorySchema).optional().catch(undefined),
  parent: congressApiCommitteeRefSchema.optional().catch(undefined),
  subcommittees: z.array(congressApiCommitteeRefSchema).optional().catch(undefined),
  bills: congressApiCommitteeCollectionSchema.optional().catch(undefined),
  reports: congressApiCommitteeCollectionSchema.optional().catch(undefined),
  nominations: congressApiCommitteeCollectionSchema.optional().catch(undefined),
});

/** Shape of `GET /v3/committee/{chamber}/{systemCode}`. */
export const congressApiCommitteeDetailResponseSchema = z.looseObject({
  committee: congressApiCommitteeDetailSchema.optional().catch(undefined),
});

/**
 * The record count every paginated Congress.gov collection reports.
 *
 * Read rather than inferred from the returned array's length, which only ever describes the page in hand. The committee
 * sub-resource endpoints below are the first place this app pages *within* a record's own collection, so the total is
 * what tells the page how many pages there are.
 */
const congressApiPaginationSchema = z.looseObject({ count: optionalNumber });

/**
 * Shape of one entry in `GET /v3/committee/{chamber}/{systemCode}/bills`.
 *
 * Deliberately *not* {@link congressApiBillSchema}, which the member endpoints' legislation lists reuse. That schema
 * describes a bill; this describes a *relationship between a bill and a committee*, and the two differ in both
 * directions — there is no `title`, `sponsors`, `latestAction`, or `policyArea` here, and `relationshipType` appears on
 * nothing else. Sharing a schema across the two would have meant a type promising a title that this endpoint never
 * sends.
 */
export const congressApiCommitteeBillSchema = z.looseObject({
  congress: optionalNumber,
  type: optionalString,
  number: z.union([z.string(), z.number()]).optional().catch(undefined),
  /** e.g. `"Referred To"`, `"Reported By"`. */
  relationshipType: optionalString,
  actionDate: optionalString,
  updateDate: optionalString,
});

/**
 * Shape of `GET /v3/committee/{chamber}/{systemCode}/bills`.
 *
 * Note the hyphen: this endpoint nests its collection under `committee-bills`, which is why the key is quoted here and
 * read through a bracket access rather than a dotted one. Its sibling endpoints (`/reports`, `/nominations`) return
 * their arrays at the top level instead, so the three cannot share a response schema even though they share a purpose.
 */
export const congressApiCommitteeBillsResponseSchema = z.looseObject({
  "committee-bills": z
    .looseObject({
      bills: z.array(congressApiCommitteeBillSchema).optional().catch(undefined),
      count: optionalNumber,
    })
    .optional()
    .catch(undefined),
  pagination: congressApiPaginationSchema.optional().catch(undefined),
});

/**
 * Shape of one entry in `GET /v3/committee/{chamber}/{systemCode}/reports`.
 *
 * `updateDate` arrives in this endpoint's own spelling — `"2015-03-20 00:05:31+00:00"`, a space where every other
 * endpoint in this API sends a `T`. Typed as a plain string and normalized in the mapper rather than parsed here, on
 * the same rule the rest of this file follows: a schema describes what arrives, and deciding what a value *means* is
 * the mappers' job.
 */
export const congressApiCommitteeReportSchema = z.looseObject({
  citation: optionalString,
  congress: optionalNumber,
  chamber: optionalString,
  /** The report-series code, e.g. `"HRPT"` — not a bill type. */
  type: optionalString,
  number: optionalNumber,
  part: optionalNumber,
  updateDate: optionalString,
});

/** Shape of `GET /v3/committee/{chamber}/{systemCode}/reports`. */
export const congressApiCommitteeReportsResponseSchema = z.looseObject({
  reports: z.array(congressApiCommitteeReportSchema).optional().catch(undefined),
  pagination: congressApiPaginationSchema.optional().catch(undefined),
});

/**
 * Shape of one entry in `GET /v3/committee/{chamber}/{systemCode}/nominations`.
 *
 * The richest of the three sub-resources: `description` carries the full nomination text ("… of Ohio, to be United
 * States Marshal for …") inline, so — unlike the bills list — a nomination row needs no second request to say what it
 * is about.
 */
export const congressApiCommitteeNominationSchema = z.looseObject({
  citation: optionalString,
  congress: optionalNumber,
  description: optionalString,
  number: optionalNumber,
  partNumber: optionalString,
  receivedDate: optionalString,
  latestAction: z.looseObject({ actionDate: optionalString, text: optionalString }).optional().catch(undefined),
  updateDate: optionalString,
});

/** Shape of `GET /v3/committee/{chamber}/{systemCode}/nominations`. */
export const congressApiCommitteeNominationsResponseSchema = z.looseObject({
  nominations: z.array(congressApiCommitteeNominationSchema).optional().catch(undefined),
  pagination: congressApiPaginationSchema.optional().catch(undefined),
});

export type CongressApiSponsor = z.infer<typeof congressApiSponsorSchema>;
export type CongressApiLaw = z.infer<typeof congressApiLawSchema>;
export type CongressApiBill = z.infer<typeof congressApiBillSchema>;
export type CongressApiListResponse = z.infer<typeof congressApiListResponseSchema>;
export type CongressApiDetailResponse = z.infer<typeof congressApiDetailResponseSchema>;
export type CongressApiSummary = z.infer<typeof congressApiSummarySchema>;
export type CongressApiSummariesResponse = z.infer<typeof congressApiSummariesResponseSchema>;
export type CongressApiTextFormat = z.infer<typeof congressApiTextFormatSchema>;
export type CongressApiTextVersion = z.infer<typeof congressApiTextVersionSchema>;
export type CongressApiTextResponse = z.infer<typeof congressApiTextResponseSchema>;
export type CongressApiRecordedVote = z.infer<typeof congressApiRecordedVoteSchema>;
export type CongressApiAction = z.infer<typeof congressApiActionSchema>;
export type CongressApiActionsResponse = z.infer<typeof congressApiActionsResponseSchema>;
export type CongressApiBillCommitteeActivity = z.infer<typeof congressApiBillCommitteeActivitySchema>;
export type CongressApiBillSubcommittee = z.infer<typeof congressApiBillSubcommitteeSchema>;
export type CongressApiBillCommittee = z.infer<typeof congressApiBillCommitteeSchema>;
export type CongressApiBillCommitteesResponse = z.infer<typeof congressApiBillCommitteesResponseSchema>;
export type CongressApiCosponsor = z.infer<typeof congressApiCosponsorSchema>;
export type CongressApiCosponsorsResponse = z.infer<typeof congressApiCosponsorsResponseSchema>;
export type CongressApiRelationshipDetail = z.infer<typeof congressApiRelationshipDetailSchema>;
export type CongressApiRelatedBill = z.infer<typeof congressApiRelatedBillSchema>;
export type CongressApiRelatedBillsResponse = z.infer<typeof congressApiRelatedBillsResponseSchema>;
export type CongressApiDepiction = z.infer<typeof congressApiDepictionSchema>;
export type CongressApiMemberTerm = z.infer<typeof congressApiMemberTermSchema>;
export type CongressApiMember = z.infer<typeof congressApiMemberSchema>;
export type CongressApiMemberListResponse = z.infer<typeof congressApiMemberListResponseSchema>;
export type CongressApiMemberDetailTerm = z.infer<typeof congressApiMemberDetailTermSchema>;
export type CongressApiLeadership = z.infer<typeof congressApiLeadershipSchema>;
export type CongressApiMemberDetail = z.infer<typeof congressApiMemberDetailSchema>;
export type CongressApiMemberDetailResponse = z.infer<typeof congressApiMemberDetailResponseSchema>;
export type CongressApiSponsoredLegislationResponse = z.infer<typeof congressApiSponsoredLegislationResponseSchema>;
export type CongressApiCosponsoredLegislationResponse = z.infer<typeof congressApiCosponsoredLegislationResponseSchema>;
export type CongressApiCommitteeRef = z.infer<typeof congressApiCommitteeRefSchema>;
export type CongressApiCommittee = z.infer<typeof congressApiCommitteeSchema>;
export type CongressApiCommitteeListResponse = z.infer<typeof congressApiCommitteeListResponseSchema>;
export type CongressApiCommitteeHistory = z.infer<typeof congressApiCommitteeHistorySchema>;
export type CongressApiCommitteeDetail = z.infer<typeof congressApiCommitteeDetailSchema>;
export type CongressApiCommitteeDetailResponse = z.infer<typeof congressApiCommitteeDetailResponseSchema>;
export type CongressApiCommitteeBill = z.infer<typeof congressApiCommitteeBillSchema>;
export type CongressApiCommitteeBillsResponse = z.infer<typeof congressApiCommitteeBillsResponseSchema>;
export type CongressApiCommitteeReport = z.infer<typeof congressApiCommitteeReportSchema>;
export type CongressApiCommitteeReportsResponse = z.infer<typeof congressApiCommitteeReportsResponseSchema>;
export type CongressApiCommitteeNomination = z.infer<typeof congressApiCommitteeNominationSchema>;
export type CongressApiCommitteeNominationsResponse = z.infer<typeof congressApiCommitteeNominationsResponseSchema>;
