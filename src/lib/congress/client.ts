/**
 * The Congress.gov adapter's public surface.
 *
 * This module used to hold the entire adapter — transport, schemas, mappers, bills, and members — in one ~840-line
 * file. That has since been split by responsibility, but the split is deliberately invisible to callers: every route,
 * component, and test still imports from `@/lib/congress/client`, so the internal layout can keep evolving without a
 * churn of import rewrites across the app.
 *
 * Where things now live:
 *
 * | Module                   | Responsibility                                                              |
 * |--------------------------|-----------------------------------------------------------------------------|
 * | `api-schema.ts`          | Runtime shapes for Congress.gov v3 payloads — the untrusted-input boundary. |
 * | `http.ts`                | Key access, URL building, caching policy, one request helper, route guards. |
 * | `mappers.ts`             | Upstream shapes to this app's stable model. Pure; no I/O.                   |
 * | `bills.ts`               | Bill snapshots, pagination, lookup, summaries, text versions, search.       |
 * | `composition.ts`         | Chamber membership, including the member list's pagination.                 |
 * | `committee-directory.ts` | Every committee of a Congress, reshaped into one browsable list.            |
 * | `committee-filter.ts`    | The committee directory's narrowing, ordering, and URL rules. Pure; no I/O. |
 * | `committee-profile.ts`   | One committee's record, its history, and its subcommittees.                 |
 * | `committee-records.ts`   | The bills/reports/nominations model, paging, and URL rules. Pure; no I/O.   |
 * | `committee-activity.ts`  | One page of one of those collections.                                       |
 * | `member-directory.ts`    | The same membership, reshaped into one browsable alphabetical roster.       |
 * | `member-filter.ts`       | The directory's narrowing, ordering, and URL rules. Pure; no I/O.           |
 * | `member-profile.ts`      | One member's record, plus the legislation they sponsored and cosponsored.   |
 *
 * Everything re-exported here shares two guarantees: it never throws (upstream failure is an expected condition, not an
 * exception), and anything that can come from either live or preview data reports which it was, on the returned value
 * itself. That is also what keeps `http.ts` off this list — the key reader, the cache window, and the request helper
 * are the transport those guarantees are built out of, not reads that hold them, and the modules above import them
 * directly.
 *
 * @see docs/architecture.md for how this layer fits into the app as a whole.
 */
export {
  type BillLookupResult,
  type BillSearchResult,
  getBillById,
  getBillSummaries,
  getBillTextVersions,
  getCongressSnapshot,
  getCongressSnapshotForCongress,
  getMoreBills,
  getSearchResults,
} from "@/lib/congress/bills";
export { getCommitteeRecords } from "@/lib/congress/committee-activity";
export {
  buildCommitteeDirectory,
  type CommitteeDirectoryResult,
  getCommitteeDirectory,
} from "@/lib/congress/committee-directory";
export { type CommitteeProfileResult, getCommitteeProfile } from "@/lib/congress/committee-profile";
export { getCongressComposition } from "@/lib/congress/composition";
export {
  buildMemberDirectory,
  getMemberDirectory,
  type MemberDirectoryResult,
} from "@/lib/congress/member-directory";
export {
  getMemberProfile,
  MEMBER_LEGISLATION_LIMIT,
  type MemberProfileResult,
} from "@/lib/congress/member-profile";
