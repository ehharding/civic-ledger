/**
 * Covers what an ingested record *is*: how it is identified, what a stored payload has to look like to still be usable,
 * and when two observations of an action are the same observation.
 *
 * The payload validation is the load-bearing part. A stored row is written by this app against a model this app owns,
 * so — unlike an upstream payload, which degrades field by field — a row that no longer matches is dropped whole. These
 * tests pin that asymmetry, because the tempting "fix" for a schema change is to loosen it, and loosening it is how a
 * copy quietly stops being a copy of anything.
 */
import { describe, expect, it } from "vitest";

import type { CommitteeSummary } from "@/lib/congress/committees";
import type { MemberDirectoryEntry } from "@/lib/congress/members";
import type { LegislativeBill } from "@/lib/congress/types";
import {
  billRecordKey,
  committeeRecordKey,
  eventHashFor,
  isRecordType,
  memberRecordKey,
  parseStoredRecord,
  providerUrlForBill,
  providerUrlForCommittee,
  providerUrlForMember,
  recordPayloadHash,
  type StoredRecord,
  type StoredRecordRow,
  storedRecordPath,
} from "@/lib/ingest/records";

const FETCHED_AT: Date = new Date("2026-07-31T09:00:00.000Z");

function bill(overrides: Partial<LegislativeBill> = {}): LegislativeBill {
  return {
    congress: 119,
    type: "HR",
    number: "284",
    title: "A bill to widen rural broadband access",
    originChamber: "House",
    introducedDate: "2026-01-14",
    latestAction: { date: "2026-03-02", text: "Referred to the Committee on Energy and Commerce." },
    policyArea: "Science, Technology, Communications",
    stage: "committee",
    officialUrl: "https://www.congress.gov/bill/119th-congress/house-bill/284",
    ...overrides,
  };
}

function member(overrides: Partial<MemberDirectoryEntry> = {}): MemberDirectoryEntry {
  return {
    bioguideId: "L000174",
    name: "Leahy, Patrick J.",
    party: "democratic",
    partyName: "Democratic",
    state: "Vermont",
    chamber: "senate",
    ...overrides,
  };
}

function committee(overrides: Partial<CommitteeSummary> = {}): CommitteeSummary {
  return {
    systemCode: "hsag00",
    name: "Agriculture Committee",
    chamber: "house",
    type: "standing",
    subcommitteeCount: 6,
    ...overrides,
  };
}

function row(recordType: string, payload: unknown): StoredRecordRow {
  return {
    recordType,
    recordKey: "key",
    congress: 119,
    title: "title",
    payload,
    sourceUpdatedAt: null,
    fetchedAt: FETCHED_AT,
    payloadHash: "hash",
    providerUrl: "https://www.congress.gov/",
  };
}

describe("isRecordType", (): void => {
  it("recognizes the three ingested types and nothing else", (): void => {
    expect(isRecordType("bill")).toBe(true);
    expect(isRecordType("member")).toBe(true);
    expect(isRecordType("committee")).toBe(true);
    expect(isRecordType("nomination")).toBe(false);
    expect(isRecordType("")).toBe(false);
  });
});

describe("parseStoredRecord", (): void => {
  it("validates a stored bill back into the app's model", (): void => {
    const record: StoredRecord | null = parseStoredRecord(row("bill", bill()));

    expect(record).toEqual({
      recordType: "bill",
      recordKey: "key",
      congress: 119,
      fetchedAt: FETCHED_AT,
      payload: bill(),
    });
  });

  it("validates a stored member and a stored committee", (): void => {
    expect(parseStoredRecord(row("member", member()))?.payload).toEqual(member());
    expect(parseStoredRecord(row("committee", committee()))?.payload).toEqual(committee());
  });

  it("keeps a bill's optional sponsor and cosponsor count", (): void => {
    const withSponsor: LegislativeBill = bill({
      sponsor: { fullName: "Rep. Example", party: "D", state: "OH", bioguideId: "E000001" },
      cosponsorCount: 12,
    });

    expect(parseStoredRecord(row("bill", withSponsor))?.payload).toEqual(withSponsor);
  });

  /* Dropped whole rather than field by field. A row that no longer matches was written by a different model, and
     guessing which of its fields still mean what they did is exactly the divergence this rule exists to prevent. */
  it("drops a payload that no longer matches the model", (): void => {
    expect(parseStoredRecord(row("bill", { ...bill(), title: 42 }))).toBeNull();
    expect(parseStoredRecord(row("bill", { ...bill(), latestAction: undefined }))).toBeNull();
    expect(parseStoredRecord(row("member", { ...member(), chamber: "assembly" }))).toBeNull();
    expect(parseStoredRecord(row("committee", { ...committee(), subcommitteeCount: "six" }))).toBeNull();
    expect(parseStoredRecord(row("bill", null))).toBeNull();
  });

  it("drops a row whose type this app does not ingest", (): void => {
    expect(parseStoredRecord(row("nomination", { anything: true }))).toBeNull();
  });

  /* A stage or party the model has since stopped recognizing is a genuine mismatch, not a value to pass through. */
  it("drops a payload carrying a value outside a closed union", (): void => {
    expect(parseStoredRecord(row("bill", { ...bill(), stage: "conference" }))).toBeNull();
    expect(parseStoredRecord(row("member", { ...member(), party: "whig" }))).toBeNull();
  });
});

describe("recordPayloadHash", (): void => {
  it("is stable across runs for the same payload", (): void => {
    expect(recordPayloadHash(bill())).toBe(recordPayloadHash(bill()));
  });

  /* The reason the hash canonicalizes key order: two payloads carrying identical facts must not look like a change,
     because a false "changed" writes a row and moves the freshness timestamp the copy reports. */
  it("ignores the order fields were assembled in, at every depth", (): void => {
    const one = { congress: 119, latestAction: { date: "2026-03-02", text: "Referred." } };
    const other = { latestAction: { text: "Referred.", date: "2026-03-02" }, congress: 119 };

    expect(recordPayloadHash(one)).toBe(recordPayloadHash(other));
  });

  it("does not ignore the order of an array, which is part of the value", (): void => {
    expect(recordPayloadHash({ formats: ["pdf", "xml"] })).not.toBe(recordPayloadHash({ formats: ["xml", "pdf"] }));
  });

  it("changes when any field changes", (): void => {
    expect(recordPayloadHash(bill())).not.toBe(recordPayloadHash(bill({ stage: "chamber" })));
  });

  it("hashes primitives and nulls without special-casing at the call site", (): void => {
    expect(recordPayloadHash(null)).toBe(recordPayloadHash(null));
    expect(recordPayloadHash(null)).not.toBe(recordPayloadHash(0));
    expect(recordPayloadHash("text")).not.toBe(recordPayloadHash(["text"]));
    // `undefined` has no JSON form at all; it must still hash rather than throw.
    expect(recordPayloadHash(undefined)).toBe(recordPayloadHash(undefined));
  });
});

describe("eventHashFor", (): void => {
  const action = {
    recordType: "bill",
    recordKey: "119-HR-284",
    occurredOn: "2026-03-02",
    summary: "Referred.",
  } as const;

  it("is stable, so re-observing the same action appends nothing", (): void => {
    expect(eventHashFor(action)).toBe(eventHashFor({ ...action }));
  });

  /* Boilerplate action text is genuinely common across bills, so the record has to be part of the identity. */
  it("distinguishes the same action text on two different records", (): void => {
    expect(eventHashFor(action)).not.toBe(eventHashFor({ ...action, recordKey: "119-S-917" }));
  });

  it("distinguishes the same text on two different dates", (): void => {
    expect(eventHashFor(action)).not.toBe(eventHashFor({ ...action, occurredOn: "2026-03-03" }));
  });

  it("handles an action carrying no date", (): void => {
    const undated = { recordType: "bill", recordKey: "119-HR-284", summary: "Referred." } as const;

    expect(eventHashFor(undated)).toBe(eventHashFor(undated));
    expect(eventHashFor(undated)).not.toBe(eventHashFor(action));
  });
});

describe("record keys", (): void => {
  it("keys a bill on its natural identifier, however the congress and type were spelled", (): void => {
    expect(billRecordKey(bill())).toBe("119-HR-284");
    expect(billRecordKey({ congress: "119", type: "hr", number: "284" })).toBe("119-HR-284");
  });

  it("keys a member on their Bioguide ID, upper-cased", (): void => {
    expect(memberRecordKey(" l000174 ")).toBe("L000174");
  });

  it("keys a committee on chamber and code, so the key can be opened without guessing a chamber", (): void => {
    expect(committeeRecordKey("House", "HSAG00")).toBe("house-hsag00");
  });
});

describe("provider URLs", (): void => {
  it("deep-links a bill to its public record", (): void => {
    expect(providerUrlForBill(bill())).toBe("https://www.congress.gov/bill/119th-congress/house-bill/284");
  });

  it("links a member to the Biographical Directory", (): void => {
    expect(providerUrlForMember(member())).toBe("https://bioguide.congress.gov/search/bio/L000174");
  });

  /* A placeholder's ID deliberately fails `isBioguideId`, so it can never produce a link to a real person. */
  it("falls back to the Congress.gov home page rather than fabricating a biography link", (): void => {
    expect(providerUrlForMember(member({ bioguideId: "PREVIEW-1" }))).toBe("https://www.congress.gov/");
  });

  /* Congress.gov's per-committee URL embeds a name slug the API does not publish, and a guessed slug that happens to
     be wrong is an authoritative-looking link to a 404. */
  it("links a committee to the index rather than to a guessed slug", (): void => {
    expect(providerUrlForCommittee()).toBe("https://www.congress.gov/committees");
  });
});

describe("storedRecordPath", (): void => {
  it("builds each record's in-app route through the app's own href helpers", (): void => {
    const stored = (recordType: string, payload: unknown): string => {
      const record: StoredRecord | null = parseStoredRecord(row(recordType, payload));
      if (!record) throw new Error(`fixture did not validate: ${recordType}`);
      return storedRecordPath(record);
    };

    expect(stored("bill", bill())).toBe("/bills/119/hr/284");
    expect(stored("member", member())).toBe("/members/L000174");
    expect(stored("committee", committee())).toBe("/committees/house/hsag00");
  });
});
