import { ArrowUpRight, ChevronLeft, Landmark } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { CalloutCard } from "@/components/callout-card";
import { CommitteeRecordsSection } from "@/components/committee-records";
import { DataSourceNotice } from "@/components/data-source-notice";
import { OutboundLink } from "@/components/outbound-link";
import { SiteShell } from "@/components/site-shell";
import { committeeHref } from "@/lib/committee-route";
import type { CommitteeRecordsResult } from "@/lib/congress/committee-records";
import {
  CONGRESS_GOV_COMMITTEES,
  type CommitteeHistoryEntry,
  type CommitteeProfile,
  committeeChamberLabels,
  committeeTypeDescriptions,
  committeeTypeLabels,
  formatCommitteeHistoryYears,
  isCommitteeSystemCode,
  type Subcommittee,
} from "@/lib/congress/committees";
import type { CongressSnapshot } from "@/lib/congress/types";
import { lessonHref } from "@/lib/lesson-route";

/** Props for {@link CommitteeDetail} — everything the committee route resolves server-side. */
type CommitteeDetailProps = {
  profile: CommitteeProfile;
  /** Whether this record is live Congress.gov data or a labeled placeholder. Changes wording throughout. */
  source: CongressSnapshot["source"];
  /** User-facing explanation of *why* placeholder data is being shown, when it is. */
  notice?: string;
  /** When this committee's record was actually fetched — passed straight through to `DataSourceNotice`. */
  retrievedAt?: string;
  /**
   * One page of one of the committee's record collections, already selected and fetched by the route.
   *
   * Resolved server-side rather than in the section that renders it, on the same rule every other detail component in
   * this app follows: a component that fetches is a component that can't be rendered in a test, in a different context,
   * or against a different source.
   * @see CommitteeRecordsSection.
   */
  records: CommitteeRecordsResult;
};

/**
 * One row of the committee's recorded history.
 *
 * @param entry - The history entry to describe.
 * @returns The name it went by, the span it went by it, and what established it when the record says.
 */
function HistoryRow({ entry }: { entry: CommitteeHistoryEntry }): JSX.Element {
  const years: string = formatCommitteeHistoryYears(entry);

  return (
    <li className="member-terms__item">
      <span className="member-terms__chamber">{entry.name}</span>
      <span className="member-terms__detail">
        {years.length > 0 ? years : "Dates not recorded"}
        {entry.establishingAuthority ? ` · ${entry.establishingAuthority}` : ""}
      </span>
    </li>
  );
}

/**
 * Individual committee page.
 *
 * Purely presentational, exactly as `MemberDetail` and `BillDetail` are: every value is resolved by the route and
 * passed in, so this component has no fetching, no environment access, and nothing that behaves differently between a
 * live and a placeholder render except the wording it chooses.
 *
 * The page reports only what Congress.gov publishes about a committee — what kind of body it is, what it has been
 * called, what sits under it, and how much has been referred to it. It carries **no membership roster**, because the
 * committee endpoints publish none; assembling one by inference would be the single most plausible-looking fabrication
 * this app could ship, since a list of names under a committee heading reads as a fact whatever caveat sits beside it.
 *
 * @param props - @see CommitteeDetailProps
 * @returns The hero, the type explainer and history panels, the subcommittee list, the record counts, and the closing
 *   context card.
 */
export function CommitteeDetail({ profile, source, notice, retrievedAt, records }: CommitteeDetailProps): JSX.Element {
  const chamberLabel: string = committeeChamberLabels[profile.chamber];
  const isRealCommittee: boolean = isCommitteeSystemCode(profile.systemCode);

  return (
    <SiteShell>
      {/* Points at the directory rather than the home page, on the same reasoning as the member page's backlink: from
          one committee, "back" is far more usefully the list of all of them than the front door. */}
      <div className="bill-backlink">
        <Link href="/committees">
          <ChevronLeft aria-hidden="true" size={16} /> All Committees
        </Link>
      </div>

      <section className="committee-hero" aria-labelledby="committee-name">
        {/* No trailing "Committee": the type label already carries it where it belongs, and appending it produced
            "Commission or Caucus Committee" for one of the five types. The heading directly below names the body. */}
        <p className="eyebrow">
          {committeeTypeLabels[profile.type]} · {chamberLabel}
        </p>
        <h1 id="committee-name">{profile.name}</h1>

        <div className="committee-hero__meta">
          <span className={`committee-hero__type committee-type--${profile.type}`}>
            {committeeTypeLabels[profile.type]}
          </span>
          {profile.parent ? (
            <span>
              Subcommittee of{" "}
              <Link className="text-link" href={committeeHref(profile.chamber, profile.parent.systemCode)}>
                {profile.parent.name}
              </Link>
            </span>
          ) : null}
          {!profile.isCurrent ? <span className="member-former">No longer active</span> : null}
        </div>

        <p className="committee-hero__lead">{committeeTypeDescriptions[profile.type]}</p>
      </section>

      <DataSourceNotice source={source} notice={notice} retrievedAt={retrievedAt} />

      <div className="detail-grid">
        <section className="detail-panel" aria-labelledby="committee-history-heading">
          <p className="section-kicker">What It Has Been Called</p>
          <h2 id="committee-history-heading">Recorded History</h2>
          {profile.history.length > 0 ? (
            <>
              <p className="muted-copy">
                A committee's jurisdiction is usually rewritten by renaming it, so the list below is a record of what
                this body has been responsible for — not a list of clerical corrections.
              </p>
              <ol className="member-terms">
                {profile.history.map(
                  (entry: CommitteeHistoryEntry): JSX.Element => (
                    <HistoryRow entry={entry} key={`${entry.name}-${entry.startDate ?? "undated"}`} />
                  ),
                )}
              </ol>
            </>
          ) : (
            <p className="muted-copy">Congress.gov publishes no name history for this committee.</p>
          )}
        </section>

        <aside className="detail-panel detail-panel--accent" aria-labelledby="committee-sources-heading">
          <p className="section-kicker">Primary Source</p>
          <h2 id="committee-sources-heading">Verify This Yourself</h2>
          {isRealCommittee ? (
            <>
              <p className="muted-copy">
                Congress.gov identifies this committee by the system code{" "}
                <code className="committee-code">{profile.systemCode}</code>, which appears in the address of its page
                on the official site.
              </p>
              <OutboundLink href={CONGRESS_GOV_COMMITTEES}>Committees on Congress.gov</OutboundLink>
              {/* Published by Congress.gov rather than derived from the committee's name, which is the only reason this
                  link can exist at all — the congress.gov link above stays an index for exactly that reason. */}
              {profile.websiteUrl ? (
                <>
                  <p className="muted-copy">
                    Congress.gov also publishes the committee’s own site, which is where its schedule, hearings, and
                    membership are kept. That roster is not in the API, so it is not on this page.
                  </p>
                  <OutboundLink href={profile.websiteUrl}>The Committee’s Own Site</OutboundLink>
                </>
              ) : null}
            </>
          ) : (
            <p className="muted-copy">
              This is a placeholder committee, so there is no official record to link to. Configure a Congress.gov API
              key to browse the real ones.
            </p>
          )}
        </aside>
      </div>

      <CommitteeRecordsSection profile={profile} result={records} />

      <section className="committee-subcommittees" aria-labelledby="committee-subcommittees-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">One Level Down</p>
            <h2 id="committee-subcommittees-heading">Subcommittees</h2>
          </div>
        </div>

        {profile.subcommittees.length > 0 ? (
          <ul className="committee-subcommittee-list">
            {profile.subcommittees.map(
              (subcommittee: Subcommittee): JSX.Element => (
                <li key={subcommittee.systemCode}>
                  <Link href={committeeHref(profile.chamber, subcommittee.systemCode)}>{subcommittee.name}</Link>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="muted-copy">
            {profile.parent
              ? "This is itself a subcommittee, so nothing sits below it."
              : "Congress.gov records no subcommittees for this committee."}
          </p>
        )}
      </section>

      {/* Points at the committee module rather than the lifecycle one it used to: referral, markup, and the silence
          that ends most bills are what this page's reader is holding a half-answer to, and the lifecycle lesson covers
          all three in a single sentence. Built through `lessonHref` because the lesson routes are now one dynamic
          segment, so a literal here is both untyped and a slug typed in a second place. */}
      <CalloutCard
        body="Most bills are referred to a committee and never leave it. That is the ordinary outcome rather than a failure of one — a committee's job includes deciding what not to take up, and a referral is the beginning of that process, not a verdict on it."
        heading="A Referral Is Not a Vote."
        headingId="committee-reading-heading"
        href={lessonHref("what-committees-do")}
        icon={Landmark}
        kicker="Read It With Context"
        linkIcon={ArrowUpRight}
        linkLabel="See What a Committee Does"
      />
    </SiteShell>
  );
}
