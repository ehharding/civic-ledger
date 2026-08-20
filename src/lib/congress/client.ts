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
 *
 * `BillSubResource` is the one name from `sub-resource.ts` that does belong here, and it is not an exception to that
 * rule but an instance of it: it is the *shape* six of the reads below return, so a caller typing what it received
 * cannot get at it any other way. The function that produces it stays unexported, like the rest of the transport.
 *
 * `getSearchResults` is the one read below whose shape is *not* re-exported here, on the same rule read the other
 * way: that shape is also the body `/api/bills/search` sends, so it is declared in `@/lib/api-contract`, where a
 * browser can import it without importing this surface and the API key behind it. A caller can get at it, just not from
 * here.
 */
export { getBillAmendments } from "@/lib/congress/bills/amendments";
export { getBillCommittees } from "@/lib/congress/bills/committees";
export { getBillCosponsors } from "@/lib/congress/bills/cosponsors";
export {
  type BillLookupResult,
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
export type { BillSubResource } from "@/lib/congress/bills/sub-resource";
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
