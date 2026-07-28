import type {
  CongressApiBill,
  CongressApiMember,
  CongressApiSponsor,
  CongressApiSummary,
  CongressApiTextFormat,
  CongressApiTextVersion,
} from "@/lib/congress/api-schema";
import {
  type CongressChamber,
  type CongressMember,
  normalizeChamberName,
  normalizePartyName,
} from "@/lib/congress/members";
import { sanitizeSummaryHtml } from "@/lib/congress/sanitize-summary";
import { inferBillStage } from "@/lib/congress/stage";
import type { BillSponsor, BillSummary, BillTextFormat, BillTextVersion, LegislativeBill } from "@/lib/congress/types";

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
    officialUrl: bill.url ?? "https://www.congress.gov/",
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
      state: member.state,
      district: member.district,
    },
  };
}

/**
 * Sorts date-stamped records newest first, leaving the input array untouched.
 *
 * Plain string comparison is enough for every date this adapter sorts on: bare `YYYY-MM-DD` dates (summaries) and full
 * ISO 8601 timestamps (text versions) both sort correctly as strings, so there's no need to construct a `Date` per
 * comparison. Records with no date sort last rather than being dropped — an undated summary is still a real summary.
 *
 * @typeParam Item - Any record carrying an optional ISO date under `key`.
 * @param items - The records to order.
 * @param key - Which field holds the date (`"actionDate"` for summaries, `"date"` for text versions).
 * @returns A new array, most recent first.
 */
export function sortByDateDesc<Item>(items: Item[], key: keyof Item): Item[] {
  return [...items].sort((a: Item, b: Item): number => String(b[key] ?? "").localeCompare(String(a[key] ?? "")));
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
