/**
 * The Congress.gov adapter's public surface — a barrel, not an implementation.
 *
 * The adapter is split by responsibility across the rest of this directory, and the split is deliberately invisible to
 * callers: every route, component, and test imports from `@/lib/congress/client`, so the internal layout can keep
 * moving without a churn of import rewrites across the app. What each module is responsible for is tabulated once, in
 * [docs/architecture.md](../../../docs/architecture.md) under "Inside the Congress Adapter", rather than restated here
 * where a second copy would be free to fall out of step with the first.
 *
 * Everything re-exported here shares two guarantees: it never throws (upstream failure is an expected condition, not an
 * exception), and anything that can come from either live or preview data reports which it was, on the returned value
 * itself. That is what keeps `upstream/http.ts` and `bills/sub-resource.ts` off this surface — the key reader, the
 * cache window, and the request helpers are the transport those guarantees are built out of rather than reads that hold
 * them, so the modules that need them import them directly.
 */
export { getBillCommittees } from "@/lib/congress/bills/committees";
export { getBillCosponsors } from "@/lib/congress/bills/cosponsors";
export {
  type BillLookupResult,
  type BillSearchResult,
  getBillActions,
  getBillById,
  getBillSummaries,
  getBillTextVersions,
  getCongressSnapshot,
  getCongressSnapshotForCongress,
  getMoreBills,
  getSearchResults,
} from "@/lib/congress/bills/reads";
export { getRelatedBills } from "@/lib/congress/bills/related";
export { getCommitteeRecords } from "@/lib/congress/committees/activity";
export {
  buildCommitteeDirectory,
  type CommitteeDirectoryResult,
  getCommitteeDirectory,
} from "@/lib/congress/committees/directory";
export { type CommitteeProfileResult, getCommitteeProfile } from "@/lib/congress/committees/profile";
export { getCongressComposition } from "@/lib/congress/members/composition";
export {
  buildMemberDirectory,
  getMemberDirectory,
  type MemberDirectoryResult,
} from "@/lib/congress/members/directory";
export {
  getMemberProfile,
  MEMBER_LEGISLATION_LIMIT,
  type MemberProfileResult,
} from "@/lib/congress/members/profile";
