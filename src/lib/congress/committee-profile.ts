import {
  type CongressApiCommitteeDetailResponse,
  congressApiCommitteeDetailResponseSchema,
} from "@/lib/congress/api-schema";
import type { CommitteeChamber, CommitteeProfile } from "@/lib/congress/committees";
import { findPreviewCommitteeProfile } from "@/lib/congress/fixtures";
import {
  buildCongressUrl,
  type CongressRequestResult,
  committeeCacheTags,
  getCongressApiKey,
  normalizeCommitteeChamberSegment,
  normalizeSystemCode,
  requestCongressJson,
} from "@/lib/congress/http";
import { mapCommitteeProfile } from "@/lib/congress/mappers";
import type { CongressSnapshot } from "@/lib/congress/types";

/**
 * One committee's own record — what the individual committee page reads.
 *
 * The committee counterpart to `member-profile.ts`, and it holds the same invariants: nothing throws, provenance
 * travels with the data, and a page degrades to a clearly labeled preview rather than to an error boundary.
 *
 * What this deliberately does *not* fetch is a membership roster, because Congress.gov's committee endpoints do not
 * publish one. @see CommitteeProfile.
 */

/** What {@link getCommitteeProfile} resolved: the committee (if any), and where it came from. */
export type CommitteeProfileResult = {
  /** `undefined` means "no such committee" and should render as a 404 — never "something went wrong". */
  profile: CommitteeProfile | undefined;
  source: CongressSnapshot["source"];
  /** User-facing explanation shown when `source` is "preview". */
  notice?: string;
  retrievedAt: string;
};

/**
 * Fetches one committee's record.
 *
 * Both route params are untrusted — they arrive from the URL bar — so both are narrowed to a known shape before either
 * reaches an outbound path. @see normalizeCommitteeChamberSegment and normalizeSystemCode.
 *
 * @param rawChamber - The raw `chamber` route param.
 * @param rawSystemCode - The raw `systemCode` route param.
 * @returns The committee, always labeled live or preview. A missing key, a malformed param, or a failed request
 *   resolves against the preview fixtures rather than throwing.
 */
export async function getCommitteeProfile(rawChamber: string, rawSystemCode: string): Promise<CommitteeProfileResult> {
  const retrievedAt: string = new Date().toISOString();
  const apiKey: string | undefined = getCongressApiKey();
  const chamber: CommitteeChamber | null = normalizeCommitteeChamberSegment(rawChamber);
  const systemCode: string | null = normalizeSystemCode(rawSystemCode);

  if (!apiKey || chamber === null || systemCode === null) {
    const profile: CommitteeProfile | undefined = findPreviewCommitteeProfile(rawChamber, rawSystemCode);

    return {
      profile,
      source: "preview",
      retrievedAt,
      // Three genuinely different situations land here and only one of them is "no key" — the same three
      // `getMemberProfile` distinguishes, and worded apart for the same reason.
      notice: profile
        ? "This is an illustrative placeholder committee, not a committee of any real Congress."
        : apiKey
          ? "That is not a valid committee identifier, so no committee could be looked up."
          : "Placeholder records are shown until a server-only Congress.gov API key is configured.",
    };
  }

  const detail: CongressRequestResult<CongressApiCommitteeDetailResponse> = await requestCongressJson(
    buildCongressUrl(`/committee/${chamber}/${systemCode}`, apiKey),
    committeeCacheTags(systemCode),
    congressApiCommitteeDetailResponseSchema,
    `committee lookup for ${systemCode}`,
  );

  if (detail.outcome === "not-found") return { profile: undefined, source: "live", retrievedAt };

  if (detail.outcome === "ok") {
    const profile: CommitteeProfile | null = detail.data.committee
      ? mapCommitteeProfile(detail.data.committee, systemCode, chamber)
      : null;

    return { profile: profile ?? undefined, source: "live", retrievedAt };
  }

  // A transient failure shouldn't be indistinguishable from "no such committee", which would render as a 404 and tell
  // a reader something false about the record. Fall back to the labeled preview path instead, exactly as the member
  // route does.
  return {
    profile: findPreviewCommitteeProfile(rawChamber, rawSystemCode),
    source: "preview",
    retrievedAt,
    notice: "Live committee records are temporarily unavailable, so a placeholder record is shown.",
  };
}
