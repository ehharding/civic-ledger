import { type ZodCatch, type ZodNumber, type ZodOptional, type ZodString, z } from "zod";

/**
 * Runtime shapes for the Congress.gov v3 responses this app reads, so every payload is inspected before the mappers
 * touch it. Validation only ever narrows — it never fails a payload the app could have used:
 *
 * - **Objects are loose**, since Congress.gov returns (and adds) far more fields than this app reads.
 * - **Fields are optional and `.catch(undefined)`**, so one mistyped field degrades to `undefined` rather than
 *   rejecting the record. Only a non-object payload fails outright.
 *
 * What counts as a *usable* record is decided by the mappers.
 *
 * @see mapCongressBill
 */

// Shared field shapes.

/** An optional string that degrades to `undefined` rather than failing validation. */
const optionalString: ZodCatch<ZodOptional<ZodString>> = z.string().optional().catch(undefined);

/** An optional number that degrades to `undefined` rather than failing validation. */
const optionalNumber: ZodCatch<ZodOptional<ZodNumber>> = z.number().optional().catch(undefined);

/** A record's most recent action, as bill, amendment, and nomination entries all carry it. */
const congressApiLatestActionSchema = z.looseObject({ actionDate: optionalString, text: optionalString });

/**
 * The record count every paginated Congress.gov collection reports. Read rather than inferred from the returned array's
 * length, which only ever describes the page in hand.
 */
const congressApiPaginationSchema = z.looseObject({ count: optionalNumber });

// Bills.

/** Shape of one entry in a detail-endpoint bill's `sponsors` array. */
const congressApiSponsorSchema = z.looseObject({
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
 * and a classifier can be wrong in a way a published field cannot.
 *
 * @see mapCongressBill, which prefers it.
 */
const congressApiLawSchema = z.looseObject({
  number: optionalString,
  type: optionalString,
});

/**
 * Subset of a Congress.gov API bill object actually used by this app — both the list and detail endpoint shapes, since
 * `mapCongressBill` handles either.
 */
const congressApiBillSchema = z.looseObject({
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
  latestAction: congressApiLatestActionSchema.optional().catch(undefined),
  // Only populated on the detail endpoint — the list endpoint doesn't return any of these.
  sponsors: z.array(congressApiSponsorSchema).optional().catch(undefined),
  /**
   * The cosponsor count, and the count including withdrawals.
   *
   * @see BillCosponsorTally
   */
  cosponsors: z
    .looseObject({ count: optionalNumber, countIncludingWithdrawnCosponsors: optionalNumber })
    .optional()
    .catch(undefined),
  laws: z.array(congressApiLawSchema).optional().catch(undefined),
  /**
   * The collections fetched separately, each `{ count, url }`. Only the published counts are read; the `url` is an API
   * link, and the app builds its own path from the validated identity.
   *
   * @see BillCollectionCounts
   */
  actions: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  committees: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  summaries: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  textVersions: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  relatedBills: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  amendments: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
  /**
   * The record's *public* congress.gov page, as opposed to the self-referential API `url` above.
   *
   * Added to the item-level endpoint in August 2025, which is after `congressGovBillUrl` was written to derive the same
   * string from the bill's identity. The derivation is still needed — the list endpoint does not send this — so the two
   * coexist, with the published value preferred wherever it arrives.
   *
   * @see mapCongressBill
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

// Bill sub-resources.

/** Shape of one entry in `GET /v3/bill/{congress}/{type}/{number}/summaries`. */
const congressApiSummarySchema = z.looseObject({
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
const congressApiTextFormatSchema = z.looseObject({
  type: optionalString,
  url: optionalString,
});

/** One stage-specific version of a bill's text, with links to each of its renderings. */
const congressApiTextVersionSchema = z.looseObject({
  type: optionalString,
  date: optionalString,
  formats: z.array(congressApiTextFormatSchema).optional().catch(undefined),
});

/** Shape of `GET /v3/bill/{congress}/{type}/{number}/text`. */
export const congressApiTextResponseSchema = z.looseObject({
  textVersions: z.array(congressApiTextVersionSchema).optional().catch(undefined),
});

/**
 * One roll-call vote referenced by a bill action — a reference with a link to the chamber's tally, never the tally. The
 * only place recorded votes reach this app, since Congress.gov has no Senate vote resource.
 */
const congressApiRecordedVoteSchema = z.looseObject({
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
 * `actionCode` stays a string: it mixes `"8000"` with `"H37300"` and `"Intro-H"`. Each event is reported by several
 * source systems, so the list has near-duplicates; only Library of Congress rows carry the standardized codes.
 */
const congressApiActionSchema = z.looseObject({
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
 * on a large share of rows, the literal string `"Unknown"`.
 *
 * @see mapBillCommitteeActivity for what becomes of those.
 */
const congressApiBillCommitteeActivitySchema = z.looseObject({
  name: optionalString,
  date: optionalString,
});

/** One subcommittee a bill reached, nested inside its parent committee's entry. */
const congressApiBillSubcommitteeSchema = z.looseObject({
  systemCode: optionalString,
  name: optionalString,
  activities: z.array(congressApiBillCommitteeActivitySchema).optional().catch(undefined),
});

/**
 * Shape of one entry in `GET /v3/bill/{congress}/{type}/{number}/committees` — a bill–committee relationship, not a
 * committee, so not {@link congressApiCommitteeSchema}. It states the chamber, which lets the bill page link inward.
 */
const congressApiBillCommitteeSchema = z.looseObject({
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
 * Shape of one entry in `GET /v3/bill/{congress}/{type}/{number}/cosponsors`. `isOriginalCosponsor` is read rather than
 * inferred from dates. `sponsorshipWithdrawnDate` is rare but documented.
 */
const congressApiCosponsorSchema = z.looseObject({
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
 * One statement of how two measures are related, and who said so (`identifiedBy`).
 *
 * @see RelatedBillRelationship
 */
const congressApiRelationshipDetailSchema = z.looseObject({
  type: optionalString,
  identifiedBy: optionalString,
});

/**
 * Shape of one entry in `GET /v3/bill/{congress}/{type}/{number}/relatedbills` — a reference with identity, title, and
 * latest action, not a full bill.
 */
const congressApiRelatedBillSchema = z.looseObject({
  congress: optionalNumber,
  type: optionalString,
  number: z.union([z.string(), z.number()]).optional().catch(undefined),
  title: optionalString,
  latestAction: congressApiLatestActionSchema.optional().catch(undefined),
  relationshipDetails: z.array(congressApiRelationshipDetailSchema).optional().catch(undefined),
});

/** Shape of `GET /v3/bill/{congress}/{type}/{number}/relatedbills`. */
export const congressApiRelatedBillsResponseSchema = z.looseObject({
  relatedBills: z.array(congressApiRelatedBillSchema).optional().catch(undefined),
});

/**
 * Shape of one entry in `GET /v3/bill/{congress}/{type}/{number}/amendments`.
 *
 * Mostly references: on heavily amended bills only about one entry in fifteen has a `purpose` or `latestAction`, and
 * fewer than one in fifty a `description`; every entry has `congress`, `type`, and `number`. `purpose` is the
 * amendment's own statement; `description` is the House's longer note, and the mapper prefers `purpose`.
 *
 * @see mapBillAmendment
 */
export const congressApiBillAmendmentSchema = z.looseObject({
  congress: optionalNumber,
  type: optionalString,
  number: z.union([z.string(), z.number()]).optional().catch(undefined),
  purpose: optionalString,
  description: optionalString,
  updateDate: optionalString,
  latestAction: congressApiLatestActionSchema.optional().catch(undefined),
});

/** Shape of `GET /v3/bill/{congress}/{type}/{number}/amendments`. */
export const congressApiBillAmendmentsResponseSchema = z.looseObject({
  amendments: z.array(congressApiBillAmendmentSchema).optional().catch(undefined),
});

// Members.

/**
 * One term entry inside a *list*-level member record: chamber and years only, with no `memberType` or `congress`. Hence
 * chamber comes from the last term and non-voting seats from the jurisdiction.
 *
 * @see isNonVotingJurisdiction
 */
const congressApiMemberTermSchema = z.looseObject({
  chamber: optionalString,
  startYear: optionalNumber,
  endYear: optionalNumber,
});

/**
 * A member's official portrait and its required credit line, published on both list and item records (so a roster can
 * show faces without per-member requests). `attribution` is genuinely absent on a few records.
 */
const congressApiDepictionSchema = z.looseObject({
  imageUrl: optionalString,
  /** An HTML fragment, sometimes carrying a link to the holding archive — sanitize before rendering. */
  attribution: optionalString,
});

/**
 * Shape of one entry in `GET /v3/member/congress/{congress}` (the member *list* endpoint).
 *
 * @see congressApiDepictionSchema for why `depiction` is read here and not only on the item record.
 */
const congressApiMemberSchema = z.looseObject({
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
  pagination: congressApiPaginationSchema.optional().catch(undefined),
});

/**
 * One term entry inside an *item*-level member record, which adds the `congress` and the `memberType` (distinguishing
 * Delegates and the Resident Commissioner) that list-level terms lack.
 */
const congressApiMemberDetailTermSchema = z.looseObject({
  chamber: optionalString,
  congress: optionalNumber,
  startYear: optionalNumber,
  endYear: optionalNumber,
  memberType: optionalString,
  stateName: optionalString,
  district: optionalNumber,
});

/** One leadership office inside an item-level member record. */
const congressApiLeadershipSchema = z.looseObject({
  type: optionalString,
  congress: optionalNumber,
});

/**
 * Shape of `GET /v3/member/{bioguideId}` (the member *item* endpoint). `terms` is a bare array here but nested under
 * `terms.item[]` on the list endpoint; both are accepted. `birthYear` arrives as a string (`"1940"`).
 */
const congressApiMemberDetailSchema = z.looseObject({
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

// Committees.

/**
 * A committee named from inside another committee's record — a `parent` on a subcommittee, or an entry in a parent's
 * `subcommittees` array. Both spellings carry the same three fields, so one schema covers both.
 */
const congressApiCommitteeRefSchema = z.looseObject({
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
const congressApiCommitteeSchema = z.looseObject({
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
  pagination: congressApiPaginationSchema.optional().catch(undefined),
});

/**
 * One recorded name-and-span in a committee's history.
 *
 * @see CommitteeHistoryEntry for why this is worth rendering.
 */
const congressApiCommitteeHistorySchema = z.looseObject({
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
 * committee's current formal name.
 *
 * @see mapCommitteeProfile, which is where both of those are resolved.
 */
const congressApiCommitteeDetailSchema = z.looseObject({
  systemCode: optionalString,
  type: optionalString,
  isCurrent: z.boolean().optional().catch(undefined),
  /**
   * The committee's own site (e.g., `https://agriculture.house.gov/`), added to this endpoint in December 2025.
   *
   * Read rather than derived, which is the whole reason it can be linked at all: congress.gov's own committee URLs
   * embed a name slug this API has never published, and guessing one produces an authoritative-looking 404.
   *
   * @see docs/data-policy.md, "The Committee Page Has No Roster, and No Deep Link".
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

// Committee records.

/**
 * Shape of one entry in `GET /v3/committee/{chamber}/{systemCode}/bills` — a bill–committee relationship with a
 * `relationshipType` and no title, so not {@link congressApiBillSchema}.
 */
const congressApiCommitteeBillSchema = z.looseObject({
  congress: optionalNumber,
  type: optionalString,
  number: z.union([z.string(), z.number()]).optional().catch(undefined),
  /** e.g., `"Referred To"`, `"Reported By"`. */
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
 * Shape of one entry in `GET /v3/committee/{chamber}/{systemCode}/reports`. `updateDate` uses a space instead of `T`;
 * the mapper normalizes it.
 */
const congressApiCommitteeReportSchema = z.looseObject({
  citation: optionalString,
  congress: optionalNumber,
  chamber: optionalString,
  /** The report-series code, e.g., `"HRPT"` — not a bill type. */
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
const congressApiCommitteeNominationSchema = z.looseObject({
  citation: optionalString,
  congress: optionalNumber,
  description: optionalString,
  number: optionalNumber,
  partNumber: optionalString,
  receivedDate: optionalString,
  latestAction: congressApiLatestActionSchema.optional().catch(undefined),
  updateDate: optionalString,
});

/** Shape of `GET /v3/committee/{chamber}/{systemCode}/nominations`. */
export const congressApiCommitteeNominationsResponseSchema = z.looseObject({
  nominations: z.array(congressApiCommitteeNominationSchema).optional().catch(undefined),
  pagination: congressApiPaginationSchema.optional().catch(undefined),
});

// Parsed shapes, one per schema.

/** The parsed shape of {@link congressApiPaginationSchema}. */
export type CongressApiPagination = z.infer<typeof congressApiPaginationSchema>;

/** The parsed shape of {@link congressApiSponsorSchema}. */
export type CongressApiSponsor = z.infer<typeof congressApiSponsorSchema>;

/** The parsed shape of {@link congressApiLawSchema}. */
export type CongressApiLaw = z.infer<typeof congressApiLawSchema>;

/** The parsed shape of {@link congressApiBillSchema}. */
export type CongressApiBill = z.infer<typeof congressApiBillSchema>;

/** The parsed shape of {@link congressApiListResponseSchema}. */
export type CongressApiListResponse = z.infer<typeof congressApiListResponseSchema>;

/** The parsed shape of {@link congressApiDetailResponseSchema}. */
export type CongressApiDetailResponse = z.infer<typeof congressApiDetailResponseSchema>;

/** The parsed shape of {@link congressApiSummarySchema}. */
export type CongressApiSummary = z.infer<typeof congressApiSummarySchema>;

/** The parsed shape of {@link congressApiSummariesResponseSchema}. */
export type CongressApiSummariesResponse = z.infer<typeof congressApiSummariesResponseSchema>;

/** The parsed shape of {@link congressApiTextFormatSchema}. */
export type CongressApiTextFormat = z.infer<typeof congressApiTextFormatSchema>;

/** The parsed shape of {@link congressApiTextVersionSchema}. */
export type CongressApiTextVersion = z.infer<typeof congressApiTextVersionSchema>;

/** The parsed shape of {@link congressApiTextResponseSchema}. */
export type CongressApiTextResponse = z.infer<typeof congressApiTextResponseSchema>;

/** The parsed shape of {@link congressApiRecordedVoteSchema}. */
export type CongressApiRecordedVote = z.infer<typeof congressApiRecordedVoteSchema>;

/** The parsed shape of {@link congressApiActionSchema}. */
export type CongressApiAction = z.infer<typeof congressApiActionSchema>;

/** The parsed shape of {@link congressApiActionsResponseSchema}. */
export type CongressApiActionsResponse = z.infer<typeof congressApiActionsResponseSchema>;

/** The parsed shape of {@link congressApiBillCommitteeActivitySchema}. */
export type CongressApiBillCommitteeActivity = z.infer<typeof congressApiBillCommitteeActivitySchema>;

/** The parsed shape of {@link congressApiBillSubcommitteeSchema}. */
export type CongressApiBillSubcommittee = z.infer<typeof congressApiBillSubcommitteeSchema>;

/** The parsed shape of {@link congressApiBillCommitteeSchema}. */
export type CongressApiBillCommittee = z.infer<typeof congressApiBillCommitteeSchema>;

/** The parsed shape of {@link congressApiBillCommitteesResponseSchema}. */
export type CongressApiBillCommitteesResponse = z.infer<typeof congressApiBillCommitteesResponseSchema>;

/** The parsed shape of {@link congressApiCosponsorSchema}. */
export type CongressApiCosponsor = z.infer<typeof congressApiCosponsorSchema>;

/** The parsed shape of {@link congressApiCosponsorsResponseSchema}. */
export type CongressApiCosponsorsResponse = z.infer<typeof congressApiCosponsorsResponseSchema>;

/** The parsed shape of {@link congressApiRelationshipDetailSchema}. */
export type CongressApiRelationshipDetail = z.infer<typeof congressApiRelationshipDetailSchema>;

/** The parsed shape of {@link congressApiRelatedBillSchema}. */
export type CongressApiRelatedBill = z.infer<typeof congressApiRelatedBillSchema>;

/** The parsed shape of {@link congressApiRelatedBillsResponseSchema}. */
export type CongressApiRelatedBillsResponse = z.infer<typeof congressApiRelatedBillsResponseSchema>;

/** The parsed shape of {@link congressApiBillAmendmentSchema}. */
export type CongressApiBillAmendment = z.infer<typeof congressApiBillAmendmentSchema>;

/** The parsed shape of {@link congressApiBillAmendmentsResponseSchema}. */
export type CongressApiBillAmendmentsResponse = z.infer<typeof congressApiBillAmendmentsResponseSchema>;

/** The parsed shape of {@link congressApiDepictionSchema}. */
export type CongressApiDepiction = z.infer<typeof congressApiDepictionSchema>;

/** The parsed shape of {@link congressApiMemberTermSchema}. */
export type CongressApiMemberTerm = z.infer<typeof congressApiMemberTermSchema>;

/** The parsed shape of {@link congressApiMemberSchema}. */
export type CongressApiMember = z.infer<typeof congressApiMemberSchema>;

/** The parsed shape of {@link congressApiMemberListResponseSchema}. */
export type CongressApiMemberListResponse = z.infer<typeof congressApiMemberListResponseSchema>;

/** The parsed shape of {@link congressApiMemberDetailTermSchema}. */
export type CongressApiMemberDetailTerm = z.infer<typeof congressApiMemberDetailTermSchema>;

/** The parsed shape of {@link congressApiLeadershipSchema}. */
export type CongressApiLeadership = z.infer<typeof congressApiLeadershipSchema>;

/** The parsed shape of {@link congressApiMemberDetailSchema}. */
export type CongressApiMemberDetail = z.infer<typeof congressApiMemberDetailSchema>;

/** The parsed shape of {@link congressApiMemberDetailResponseSchema}. */
export type CongressApiMemberDetailResponse = z.infer<typeof congressApiMemberDetailResponseSchema>;

/** The parsed shape of {@link congressApiSponsoredLegislationResponseSchema}. */
export type CongressApiSponsoredLegislationResponse = z.infer<typeof congressApiSponsoredLegislationResponseSchema>;

/** The parsed shape of {@link congressApiCosponsoredLegislationResponseSchema}. */
export type CongressApiCosponsoredLegislationResponse = z.infer<typeof congressApiCosponsoredLegislationResponseSchema>;

/** The parsed shape of {@link congressApiCommitteeRefSchema}. */
export type CongressApiCommitteeRef = z.infer<typeof congressApiCommitteeRefSchema>;

/** The parsed shape of {@link congressApiCommitteeSchema}. */
export type CongressApiCommittee = z.infer<typeof congressApiCommitteeSchema>;

/** The parsed shape of {@link congressApiCommitteeListResponseSchema}. */
export type CongressApiCommitteeListResponse = z.infer<typeof congressApiCommitteeListResponseSchema>;

/** The parsed shape of {@link congressApiCommitteeHistorySchema}. */
export type CongressApiCommitteeHistory = z.infer<typeof congressApiCommitteeHistorySchema>;

/** The parsed shape of {@link congressApiCommitteeDetailSchema}. */
export type CongressApiCommitteeDetail = z.infer<typeof congressApiCommitteeDetailSchema>;

/** The parsed shape of {@link congressApiCommitteeDetailResponseSchema}. */
export type CongressApiCommitteeDetailResponse = z.infer<typeof congressApiCommitteeDetailResponseSchema>;

/** The parsed shape of {@link congressApiCommitteeBillSchema}. */
export type CongressApiCommitteeBill = z.infer<typeof congressApiCommitteeBillSchema>;

/** The parsed shape of {@link congressApiCommitteeBillsResponseSchema}. */
export type CongressApiCommitteeBillsResponse = z.infer<typeof congressApiCommitteeBillsResponseSchema>;

/** The parsed shape of {@link congressApiCommitteeReportSchema}. */
export type CongressApiCommitteeReport = z.infer<typeof congressApiCommitteeReportSchema>;

/** The parsed shape of {@link congressApiCommitteeReportsResponseSchema}. */
export type CongressApiCommitteeReportsResponse = z.infer<typeof congressApiCommitteeReportsResponseSchema>;

/** The parsed shape of {@link congressApiCommitteeNominationSchema}. */
export type CongressApiCommitteeNomination = z.infer<typeof congressApiCommitteeNominationSchema>;

/** The parsed shape of {@link congressApiCommitteeNominationsResponseSchema}. */
export type CongressApiCommitteeNominationsResponse = z.infer<typeof congressApiCommitteeNominationsResponseSchema>;
