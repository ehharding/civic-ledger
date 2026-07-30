import { type ZodCatch, type ZodNumber, type ZodOptional, type ZodString, z } from "zod";

/**
 * Runtime shapes for the Congress.gov v3 responses this app reads.
 *
 * `src/lib/congress` is the layer whose stated job is to treat upstream fields as untrusted (see
 * `docs/architecture.md`), and a bare `as CongressApiListResponse` cast does nothing at runtime — it only tells
 * TypeScript to stop asking. These schemas make that boundary real: every payload is actually inspected before the
 * mappers touch it.
 *
 * Two conventions run through every schema here, and both exist so validation can only ever *improve* on the previous
 * unchecked casts, never make the app fail where it used to cope:
 *
 * - **Objects are loose.** Congress.gov returns far more fields than this app reads, and adds new ones over time.
 *   Unknown keys are preserved rather than treated as errors.
 * - **Fields are optional and `.catch(undefined)`.** A single field arriving as the wrong type (a `null` title, a
 *   string where a number belongs) degrades that one field to `undefined` — which every mapper already handles — rather
 *   than rejecting the whole record. Only a payload that isn't an object at all fails outright, which is the one case
 *   where there was never anything usable to salvage.
 *
 * @see mapCongressBill and its siblings in `mappers.ts`, which decide what a *usable* record is once the shape is known.
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
 * Subset of a Congress.gov API bill object actually used by this app — both the list and detail endpoint shapes, since
 * `mapCongressBill` handles either.
 */
export const congressApiBillSchema = z.looseObject({
  congress: optionalNumber,
  // The list endpoint uses `type`/`number`; the single-bill detail endpoint uses `billType`/`billNumber`.
  // Both are accepted so one mapper covers both.
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
  // Only populated on the detail endpoint — the list endpoint doesn't return either field.
  sponsors: z.array(congressApiSponsorSchema).optional().catch(undefined),
  cosponsors: z.looseObject({ count: optionalNumber }).optional().catch(undefined),
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
 * One term entry inside a *list*-level member record.
 *
 * List-level member records are a smaller shape than item-level ones: there's no `memberType`
 * ("Representative" / "Delegate" / "Senator") and no per-term `congress`, and `terms.item[]` carries only
 * chamber/startYear/endYear. That's why chamber is read from the last recognizable term rather than from a term matched
 * on congress number, and why non-voting House seats are derived from the represented jurisdiction (see
 * `isNonVotingJurisdiction`) — the alternative is one extra request per member, ~540 of them.
 */
export const congressApiMemberTermSchema = z.looseObject({
  chamber: optionalString,
  startYear: optionalNumber,
  endYear: optionalNumber,
});

/** Shape of one entry in `GET /v3/member/congress/{congress}` (the member *list* endpoint). */
export const congressApiMemberSchema = z.looseObject({
  bioguideId: optionalString,
  name: optionalString,
  partyName: optionalString,
  state: optionalString,
  district: optionalNumber,
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
 * Note the `terms` shape: the list endpoint nests them under `terms.item[]`, while this endpoint returns a bare
 * array. Both forms are accepted here rather than assumed, so a future upstream alignment in either direction can't
 * silently empty out a member's service history.
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
  depiction: z.looseObject({ imageUrl: optionalString, attribution: optionalString }).optional().catch(undefined),
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

export type CongressApiSponsor = z.infer<typeof congressApiSponsorSchema>;
export type CongressApiBill = z.infer<typeof congressApiBillSchema>;
export type CongressApiListResponse = z.infer<typeof congressApiListResponseSchema>;
export type CongressApiDetailResponse = z.infer<typeof congressApiDetailResponseSchema>;
export type CongressApiSummary = z.infer<typeof congressApiSummarySchema>;
export type CongressApiSummariesResponse = z.infer<typeof congressApiSummariesResponseSchema>;
export type CongressApiTextFormat = z.infer<typeof congressApiTextFormatSchema>;
export type CongressApiTextVersion = z.infer<typeof congressApiTextVersionSchema>;
export type CongressApiTextResponse = z.infer<typeof congressApiTextResponseSchema>;
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
