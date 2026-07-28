import { getCongressComposition } from "@/lib/congress/composition";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { previewMemberDirectory } from "@/lib/congress/fixtures";
import {
  type ChamberComposition,
  type CongressComposition,
  type CongressMember,
  compareMembersByName,
  type MemberDirectoryEntry,
} from "@/lib/congress/members";
import type { CongressSnapshot } from "@/lib/congress/types";

/**
 * The roster behind the browsable member directory (`/members`).
 *
 * Deliberately not a fourth endpoint: this reads the same `/v3/member/congress/{congress}` list the chamber diagram
 * already reads, through the same {@link getCongressComposition} call, so the two views of "who is serving" cannot
 * disagree and the directory costs nothing extra upstream inside the shared five-minute cache window. What this module
 * adds is the reshaping — flattening two chambers into one alphabetical list, dropping what can't be linked, and
 * carrying the chamber down onto each row, since a flat list no longer has a grouping to imply it.
 *
 * Follows the adapter's two standing invariants: nothing throws, and provenance travels with the data.
 *
 * @see member-profile.ts for the individual member page's separate, item-level read.
 */

/** What {@link getMemberDirectory} resolved: the roster, the Congress it describes, and where it came from. */
export type MemberDirectoryResult = {
  /** The Congress this roster describes, echoed back so the page can name it without recomputing it. */
  congress: number;
  /** Every listable member, alphabetically by last-name-first name. */
  members: MemberDirectoryEntry[];
  source: CongressSnapshot["source"];
  retrievedAt: string;
  /** User-facing explanation shown when `source` is "preview". */
  notice?: string;
};

/**
 * Flattens a fetched composition into directory rows.
 *
 * Exported for its own tests: this is where the "a row must be openable" rule actually lives, and it's worth being able
 * to assert on directly rather than only through a stubbed fetch.
 *
 * @param composition - Both chambers' membership, as `getCongressComposition` returns it.
 * @returns One row per member carrying a Bioguide ID, alphabetically across both chambers. A member without one is
 *   dropped rather than rendered as an unopenable card — that is every seat in preview mode, where the roster is
 *   deliberately unattributed, and it is also the honest handling of a live record too incomplete to link.
 */
export function buildMemberDirectory(composition: CongressComposition): MemberDirectoryEntry[] {
  return composition.chambers
    .flatMap((chamber: ChamberComposition): MemberDirectoryEntry[] =>
      chamber.members.flatMap((member: CongressMember): MemberDirectoryEntry[] =>
        member.bioguideId
          ? [
              {
                bioguideId: member.bioguideId,
                name: member.name,
                party: member.party,
                partyName: member.partyName,
                state: member.state,
                district: member.district,
                chamber: chamber.chamber,
              },
            ]
          : [],
      ),
    )
    .sort(compareMembersByName);
}

/**
 * Fetches every member currently holding a seat, as a single alphabetical directory.
 *
 * A live roster is bounded — a little over 540 people — and it is already in memory once the composition resolves, so
 * the whole list is handed to the browser at once and every subsequent search or filter runs there instantly. That is
 * the opposite of the bill directory's approach, and deliberately so: bills number in the hundreds of thousands and
 * have no upstream search endpoint, while members fit comfortably in one payload.
 *
 * @param congress - The Congress whose roster to read. Defaults to the one currently seated.
 * @returns The directory, always labeled live or preview. A missing key or a failed request yields the labeled
 *   placeholder members rather than an empty page; this never throws.
 */
export async function getMemberDirectory(congress: number = getCurrentCongress()): Promise<MemberDirectoryResult> {
  const composition: CongressComposition = await getCongressComposition(congress);

  if (composition.source === "preview") {
    return {
      congress: composition.congress,
      members: previewMemberDirectory(),
      source: "preview",
      retrievedAt: composition.retrievedAt,
      notice:
        "These are the placeholder people named on the preview bills, not a roster of Congress. Configure a " +
        "server-only Congress.gov API key to browse the members actually serving.",
    };
  }

  return {
    congress: composition.congress,
    members: buildMemberDirectory(composition),
    source: "live",
    retrievedAt: composition.retrievedAt,
  };
}
