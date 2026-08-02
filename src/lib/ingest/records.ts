import { createHash } from "node:crypto";
import { z } from "zod";

import { billHref } from "@/lib/bill-route";
import { committeeHref } from "@/lib/committee-route";
import {
  CONGRESS_GOV_COMMITTEES,
  type CommitteeSummary,
  committeeChambers,
  committeeTypes,
} from "@/lib/congress/committees";
import { bioguideUrl, congressChambers, type MemberDirectoryEntry, partyGroups } from "@/lib/congress/members";
import {
  billIdentityKey,
  billStages,
  CONGRESS_GOV_HOME,
  congressGovBillUrl,
  type LegislativeBill,
} from "@/lib/congress/types";
import { memberHref } from "@/lib/member-route";

/**
 * What an ingested record *is*: its identity, its normalized payload, and the provenance that keeps a copy legible as a
 * copy.
 *
 * This module is pure. It performs no I/O and knows nothing about Postgres or Congress.gov — which is what makes the
 * interesting half of ingestion (what identifies a record, what a stored payload has to look like to still be usable,
 * when two observations are the same observation) directly testable without either.
 *
 * @see store.ts for the reads and writes, datasets.ts for where records come from.
 */

/**
 * The three kinds of record this app ingests.
 *
 * The same three subjects the product already covers, and deliberately not one more. `docs/roadmap.md` is explicit that
 * the point is reliable history and freshness for the records this app already shows, not a second copy of the
 * register — so a collection this app has no page for has nothing to gain by being stored.
 */
export const recordTypes = ["bill", "member", "committee"] as const;

export type RecordType = (typeof recordTypes)[number];

/** Whether `value` names one of the three ingested record types. */
export function isRecordType(value: string): value is RecordType {
  return (recordTypes as readonly string[]).includes(value);
}

/**
 * One record as it is stored, with the payload still unvalidated.
 *
 * `payload` is `unknown` on purpose: a row can have been written by an older version of this app or edited by hand, so
 * reading it is a boundary crossing exactly like reading an upstream response. {@link parseStoredRecord} is where it
 * stops being unknown.
 */
export type StoredRecordRow = {
  recordType: string;
  recordKey: string;
  congress: number;
  title: string;
  payload: unknown;
  sourceUpdatedAt: Date | null;
  fetchedAt: Date;
  payloadHash: string;
  providerUrl: string;
};

/** A record whose payload has been validated, discriminated so a caller can narrow to the model it wants. */
export type StoredRecord =
  | { recordType: "bill"; recordKey: string; congress: number; fetchedAt: Date; payload: LegislativeBill }
  | { recordType: "member"; recordKey: string; congress: number; fetchedAt: Date; payload: MemberDirectoryEntry }
  | { recordType: "committee"; recordKey: string; congress: number; fetchedAt: Date; payload: CommitteeSummary };

/**
 * Payload schemas for the three normalized models.
 *
 * Note the contrast with `api-schema.ts`, which is deliberately loose — every field optional, every field
 * `.catch(undefined)` — because degrading one field of an upstream response beats discarding a whole page of records
 * this app did not write and cannot fix.
 *
 * These are the opposite, and for the mirror-image reason. A stored payload is something *this app wrote*, against a
 * model it owns. A row that no longer matches was written by a different model, and guessing which of its fields still
 * mean what they did is precisely how a copy quietly stops being a copy of anything. So a mismatched payload is dropped
 * whole, the record falls out of the stored set, and the app takes its next fallback — which is labeled preview data,
 * never a half-understood record wearing a live label.
 */
const billPayloadSchema = z.object({
  congress: z.number(),
  type: z.string(),
  number: z.string(),
  title: z.string(),
  originChamber: z.enum(["House", "Senate", "Unknown"]),
  introducedDate: z.string().optional(),
  latestAction: z.object({ date: z.string().optional(), text: z.string() }),
  policyArea: z.string().optional(),
  stage: z.enum(billStages),
  officialUrl: z.string(),
  sponsor: z
    .object({
      fullName: z.string(),
      party: z.string().optional(),
      state: z.string().optional(),
      bioguideId: z.string().optional(),
    })
    .optional(),
  cosponsorCount: z.number().optional(),
});

const memberPayloadSchema = z.object({
  bioguideId: z.string(),
  name: z.string(),
  party: z.enum(partyGroups),
  partyName: z.string().optional(),
  state: z.string().optional(),
  district: z.number().optional(),
  chamber: z.enum(congressChambers),
});

const committeePayloadSchema = z.object({
  systemCode: z.string(),
  name: z.string(),
  chamber: z.enum(committeeChambers),
  type: z.enum(committeeTypes),
  typeName: z.string().optional(),
  parent: z.object({ systemCode: z.string(), name: z.string() }).optional(),
  subcommitteeCount: z.number(),
});

/**
 * Validates one stored row into a usable record.
 *
 * @param row - The row as the database returned it.
 * @returns The validated record, or `null` when the row's type is unrecognized or its payload no longer matches the
 *   model — which callers filter out, on the same `mapUsable` rule the upstream mappers follow.
 */
export function parseStoredRecord(row: StoredRecordRow): StoredRecord | null {
  const common = { recordKey: row.recordKey, congress: row.congress, fetchedAt: row.fetchedAt };

  if (row.recordType === "bill") {
    const parsed = billPayloadSchema.safeParse(row.payload);
    return parsed.success ? { recordType: "bill", ...common, payload: parsed.data } : null;
  }

  if (row.recordType === "member") {
    const parsed = memberPayloadSchema.safeParse(row.payload);
    return parsed.success ? { recordType: "member", ...common, payload: parsed.data } : null;
  }

  if (row.recordType === "committee") {
    const parsed = committeePayloadSchema.safeParse(row.payload);
    return parsed.success ? { recordType: "committee", ...common, payload: parsed.data } : null;
  }

  return null;
}

/**
 * Serializes a value with its object keys in a fixed order, at every depth.
 *
 * `JSON.stringify` preserves insertion order, so two payloads carrying identical facts hash differently if a mapper
 * ever assembles their fields in a different order. That would make {@link recordPayloadHash} report a change on a
 * record that did not change — which is not merely wasteful: the hash is what decides whether a sync writes a row, so a
 * false "changed" moves `fetched_at` and, downstream, tells a reader the copy is fresher than the check that produced
 * it was meaningful.
 *
 * @param value - Any JSON-serializable value.
 * @returns The canonical JSON text.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";

  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const entries: string[] = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key: string): string => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);

  return `{${entries.join(",")}}`;
}

/**
 * Hashes a normalized payload.
 *
 * The hash covers the *normalized* payload rather than the raw upstream response, which is a deliberate departure from
 * the phrase "raw-response hash" in the original persistence sketch. A raw-response hash answers "did Congress.gov's
 * bytes change", and those bytes carry fields this app never reads — so it would report a change, and cause a write,
 * every time an unread field moved. Hashing what this app actually stores answers the question the sync is asking:
 * *does the copy still match?*
 *
 * @param payload - The normalized model about to be stored.
 * @returns A hex SHA-256 digest.
 */
export function recordPayloadHash(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

/**
 * Identifies one observed action, so re-observing it is recognizable as the same observation.
 *
 * Includes the record it belongs to, so the same boilerplate action text ("Referred to the Committee on the Judiciary")
 * appearing on two different bills is two events rather than one.
 *
 * @param input - The record's type and key, the date the action carries, and its verbatim text.
 * @returns A hex SHA-256 digest, unique per distinct observation.
 */
export function eventHashFor(input: {
  recordType: RecordType;
  recordKey: string;
  occurredOn?: string;
  summary: string;
}): string {
  return createHash("sha256")
    .update(canonicalJson([input.recordType, input.recordKey, input.occurredOn ?? "", input.summary]))
    .digest("hex");
}

/**
 * The record key for a bill: its natural identifier, `"119-HR-284"`.
 *
 * Delegates to {@link billIdentityKey} rather than formatting a third spelling of the same three fields, so a stored
 * record and a React list key and a preview-fixture lookup all agree about what identifies a bill.
 */
export function billRecordKey(bill: { congress: number | string; type: string; number: string }): string {
  return billIdentityKey(bill);
}

/** The record key for a member: their Bioguide ID, upper-cased — already unique and, unlike a name, stable. */
export function memberRecordKey(bioguideId: string): string {
  return bioguideId.trim().toUpperCase();
}

/**
 * The record key for a committee: chamber and system code, `"house-hsag00"`.
 *
 * The chamber is part of the key because it is part of the committee's route and of Congress.gov's own lookup — a key
 * carrying only the code would have to guess the chamber back before anything could be opened with it.
 */
export function committeeRecordKey(chamber: string, systemCode: string): string {
  return `${chamber.trim().toLowerCase()}-${systemCode.trim().toLowerCase()}`;
}

/**
 * The public Congress.gov URL for a record — the link that lets a reader check this app's copy against the original.
 *
 * Stored per row rather than derived at read time so that a record ingested today keeps pointing where it pointed when
 * it was read, even if the derivation rules later change. Each of the three follows the rule its own page already
 * follows: a bill deep-links, a member links to the Biographical Directory, and a committee links to the index rather
 * than to a guessed name slug (see `docs/data-policy.md`, "The Committee Page Has No Roster, and No Deep Link").
 */
export function providerUrlForBill(bill: LegislativeBill): string {
  return congressGovBillUrl(bill);
}

/** @see providerUrlForBill. Falls back to the Congress.gov home page rather than fabricating a biography link. */
export function providerUrlForMember(member: MemberDirectoryEntry): string {
  return bioguideUrl(member.bioguideId) ?? CONGRESS_GOV_HOME;
}

/** @see providerUrlForBill. The committee index, deliberately — Congress.gov's per-committee URL embeds a name slug. */
export function providerUrlForCommittee(): string {
  return CONGRESS_GOV_COMMITTEES;
}

/**
 * The in-app path for a stored record.
 *
 * This is what makes the sitemap possible: a crawler needs the URL on *this* site, and a record already on hand locally
 * can produce one with no Congress.gov request at all. @see src/app/sitemap.ts, which is the only caller.
 *
 * @param record - A validated stored record.
 * @returns The route to that record's page, built through the same `*Href` helpers every link in the app uses, so a
 *   sitemap entry and a rendered link can never disagree about where a record lives.
 */
export function storedRecordPath(record: StoredRecord): string {
  if (record.recordType === "bill") return billHref(record.payload);
  if (record.recordType === "member") return memberHref(record.payload.bioguideId);

  return committeeHref(record.payload.chamber, record.payload.systemCode);
}
