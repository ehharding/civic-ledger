/**
 * The Congress.gov adapter's public surface — a barrel, so callers import from one place however the modules are split.
 * Each module's role is tabulated in docs/architecture.md, "Inside the Congress Adapter".
 *
 * Everything here never throws and reports whether it's live or preview. The transport (`upstream/http.ts`,
 * `sub-resource.ts`) isn't re-exported, except the `BillSubResource` shape the reads return. `getSearchResults`'s shape
 * lives in `@/lib/api-contract` so the browser can import it.
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
