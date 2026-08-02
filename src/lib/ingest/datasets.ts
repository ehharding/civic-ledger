import { fetchLiveCommittees } from "@/lib/congress/committee-directory";
import type { CommitteeSummary } from "@/lib/congress/committees";
import { fetchLiveComposition } from "@/lib/congress/composition";
import { fetchBillsUpdatedSince, type UpdatedBill, type UpdatedBillSweep } from "@/lib/congress/ingest-source";
import { buildMemberDirectory } from "@/lib/congress/member-directory";
import type { ChamberComposition, CongressComposition, MemberDirectoryEntry } from "@/lib/congress/members";
import type { LegislativeBill } from "@/lib/congress/types";
import {
  billRecordKey,
  committeeRecordKey,
  eventHashFor,
  memberRecordKey,
  providerUrlForBill,
  providerUrlForCommittee,
  providerUrlForMember,
  type RecordType,
  recordPayloadHash,
} from "@/lib/ingest/records";
import type { EventWrite, RecordWrite } from "@/lib/ingest/store";

/**
 * What each dataset is, and how one run of it reads.
 *
 * The three descriptors below are the whole of "what gets ingested". A fourth subject would be a fourth entry rather
 * than a fourth code path — which is the point of the shape, and also the reason not to add one speculatively: a stored
 * record earns its place by being one a page in this app renders, and `docs/roadmap.md` is explicit that the goal is
 * freshness for what this app shows rather than a second copy of the register.
 */

/** Hard ceiling on records one bill run will take, so a distant cursor can't turn a sync into a full mirror. */
export const MAX_RECORDS_PER_RUN: number = 1_000;

/** What one dataset's read produced. */
export type DatasetHarvest = {
  records: RecordWrite[];
  /**
   * Actions observed on those records. Only bills produce these. @see recordEvents for what the log does and doesn't
   * claim.
   */
  events: EventWrite[];
  /** Upstream requests spent, for the run's quota accounting. */
  requests: number;
  /**
   * Whether the dataset was read completely. `false` records the run as `"partial"`: what was read is real and is
   * written, but the run made no claim to have seen everything it was asked for.
   */
  complete: boolean;
};

/** One ingestible dataset. @see ingestDatasets for the three. */
export type IngestDataset = {
  /** The name written to `sync_runs.dataset`, and the key `/api/health` reports freshness under. */
  name: string;
  recordType: RecordType;
  /**
   * Whether this dataset reads incrementally from a stored watermark.
   *
   * Only bills do. Members and committees are bounded lists — a little over 540 people, on the order of 250 committee
   * records — whose endpoints publish no per-record update timestamp to window on, so each run simply re-reads them.
   * That is two requests apiece and costs less than the machinery to avoid it would.
   */
  windowed: boolean;
  collect(input: { apiKey: string; congress: number; since: Date | null; now: Date }): Promise<DatasetHarvest>;
};

/**
 * Builds the write for one bill, plus the action observed on it.
 *
 * An event is emitted only when the record carries action text at all. A bill with an empty latest action has nothing
 * to observe, and inventing an event for it would put a row in an append-only log that says something happened.
 */
function billWrites(
  entry: UpdatedBill,
  congress: number,
  now: Date,
): { record: RecordWrite; event: EventWrite | undefined } {
  const bill: LegislativeBill = entry.bill;
  const recordKey: string = billRecordKey(bill);
  const actionText: string = bill.latestAction.text.trim();

  return {
    record: {
      recordType: "bill",
      recordKey,
      congress,
      title: bill.title,
      payload: bill,
      sourceUpdatedAt: entry.sourceUpdatedAt,
      fetchedAt: now,
      payloadHash: recordPayloadHash(bill),
      providerUrl: providerUrlForBill(bill),
    },
    event:
      actionText.length > 0
        ? {
            recordType: "bill",
            recordKey,
            occurredOn: bill.latestAction.date,
            summary: actionText,
            eventHash: eventHashFor({
              recordType: "bill",
              recordKey,
              occurredOn: bill.latestAction.date,
              summary: actionText,
            }),
          }
        : undefined,
  };
}

/**
 * Bills — the one incremental dataset.
 *
 * Windowed on Congress.gov's own `updateDate`, which is what keeps a frequent sync cheap: after the first run, a sweep
 * reads only what actually moved. It is also the only dataset that produces events, because it is the only one whose
 * list record carries an action.
 */
const billDataset: IngestDataset = {
  name: "bills",
  recordType: "bill",
  windowed: true,
  async collect({ apiKey, congress, since, now }): Promise<DatasetHarvest> {
    const sweep: UpdatedBillSweep = await fetchBillsUpdatedSince({
      apiKey,
      congress,
      since,
      maxRecords: MAX_RECORDS_PER_RUN,
    });

    const records: RecordWrite[] = [];
    const events: EventWrite[] = [];

    for (const entry of sweep.bills) {
      const { record, event } = billWrites(entry, congress, now);
      records.push(record);
      if (event) events.push(event);
    }

    return { records, events, requests: sweep.requests, complete: sweep.complete };
  },
};

/**
 * Members — the bounded roster, re-read whole each run.
 *
 * Reads through {@link fetchLiveComposition} and {@link buildMemberDirectory}, the same two steps `/members` takes, so
 * a stored row and a rendered row are the same value rather than two normalizations of one upstream record. Members
 * whose record carries no Bioguide ID are already dropped by that path, which is the correct rule here too: a stored
 * record that cannot be opened is a sitemap entry pointing at nothing.
 */
const memberDataset: IngestDataset = {
  name: "members",
  recordType: "member",
  windowed: false,
  async collect({ apiKey, congress, now }): Promise<DatasetHarvest> {
    const chambers: ChamberComposition[] | null = await fetchLiveComposition(apiKey, congress);
    if (!chambers) return { records: [], events: [], requests: 1, complete: false };

    const composition: CongressComposition = {
      congress,
      chambers,
      source: "live",
      retrievedAt: now.toISOString(),
    };

    const records: RecordWrite[] = buildMemberDirectory(composition).map(
      (member: MemberDirectoryEntry): RecordWrite => ({
        recordType: "member",
        recordKey: memberRecordKey(member.bioguideId),
        congress,
        title: member.name,
        payload: member,
        // The member list endpoint publishes no per-record update timestamp, so there is genuinely none to record.
        // Stamping `fetched_at`'s value here instead would be this app's own fact wearing Congress.gov's name.
        sourceUpdatedAt: null,
        fetchedAt: now,
        payloadHash: recordPayloadHash(member),
        providerUrl: providerUrlForMember(member),
      }),
    );

    // Two requests is the roster's normal cost: one to read `pagination.count`, then the remainder together.
    return { records, events: [], requests: 2, complete: true };
  },
};

/** Committees — the other bounded list, on exactly the same terms as members. @see memberDataset. */
const committeeDataset: IngestDataset = {
  name: "committees",
  recordType: "committee",
  windowed: false,
  async collect({ apiKey, congress, now }): Promise<DatasetHarvest> {
    const committees: CommitteeSummary[] | null = await fetchLiveCommittees(apiKey, congress);
    if (!committees) return { records: [], events: [], requests: 1, complete: false };

    const records: RecordWrite[] = committees.map(
      (committee: CommitteeSummary): RecordWrite => ({
        recordType: "committee",
        recordKey: committeeRecordKey(committee.chamber, committee.systemCode),
        congress,
        title: committee.name,
        payload: committee,
        sourceUpdatedAt: null,
        fetchedAt: now,
        payloadHash: recordPayloadHash(committee),
        providerUrl: providerUrlForCommittee(),
      }),
    );

    return { records, events: [], requests: 2, complete: true };
  },
};

/** Every dataset one sync run covers, in the order it runs them. */
export const ingestDatasets: readonly IngestDataset[] = [billDataset, memberDataset, committeeDataset];
