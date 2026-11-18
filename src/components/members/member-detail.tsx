import { ArrowUpRight, Landmark } from "lucide-react";
import type { JSX } from "react";

import { BillCard } from "@/components/bills/bill-card";
import { SiteShell } from "@/components/layout/site-shell";
import { MemberPortrait } from "@/components/members/member-portrait";
import { CalloutCard } from "@/components/ui/callout-card";
import { DataSourceNotice } from "@/components/ui/data-source-notice";
import { DetailBackLink } from "@/components/ui/detail-back-link";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import { OutboundLink } from "@/components/ui/outbound-link";
import { billIdentityKey, type CongressSnapshot, type LegislativeBill } from "@/lib/congress/bills/model";
import {
  bioguideUrl,
  chamberLabels,
  describeMemberLegislation,
  describeMemberService,
  formatMemberName,
  formatMemberParty,
  formatMemberSeat,
  formatMemberTitle,
  formatTermYears,
  type MemberLeadershipRole,
  type MemberProfile,
  type MemberTerm,
  partyTintClass,
} from "@/lib/congress/members/model";
import { formatOrdinal } from "@/lib/format";

/** Props for {@link ServiceTerm}. */
type ServiceTermProps = {
  /** The term to describe. */
  term: MemberTerm;
  /** The chamber's full name, for a term whose record names no member type. */
  chamberLabel: string;
};

/**
 * One row of the service history.
 *
 * @param props - {@link ServiceTermProps}.
 * @returns The term's chamber, congress, and calendar span.
 */
function ServiceTerm({ term, chamberLabel }: ServiceTermProps): JSX.Element {
  const years: string = formatTermYears(term);

  return (
    <li className="member-terms__item">
      <span className="member-terms__chamber">{term.memberType ?? chamberLabel}</span>
      <span className="member-terms__detail">
        {term.congress !== undefined ? `${formatOrdinal(term.congress)} Congress` : chamberLabel}
        {years.length > 0 ? ` · ${years}` : ""}
      </span>
    </li>
  );
}

/** Props for {@link LegislationSection}. */
type LegislationSectionProps = {
  /** The bills to show — already a capped slice, not the full history. */
  bills: LegislativeBill[];
  /** The id this section's `aria-labelledby` points at, so each list is its own labeled region. */
  headingId: string;
  /** The small label above the heading. */
  kicker: string;
  /** The section heading. */
  heading: string;
  /** What to say when the list is empty (ordinary for a newly seated member). */
  emptyNote: JSX.Element;
  /** The member's complete count for this list, when Congress.gov reports one. */
  total?: number;
  /** The cap the list was sliced to, so the copy can distinguish "all of them" from "the most recent few". */
  limit: number;
};

/**
 * One of the member's legislation lists, rendered as the same `BillCard` grid used everywhere else bills appear.
 *
 * @param props - {@link LegislationSectionProps}.
 * @returns The labeled section.
 * @see EmptySectionNote
 */
function LegislationSection({
  bills,
  headingId,
  kicker,
  heading,
  emptyNote,
  total,
  limit,
}: LegislationSectionProps): JSX.Element {
  return (
    <section className="member-legislation" aria-labelledby={headingId}>
      <div className="section-heading">
        <div>
          <p className="section-kicker">{kicker}</p>
          <h2 id={headingId}>{heading}</h2>
        </div>
      </div>

      {bills.length > 0 ? (
        <>
          <p className="muted-copy">{describeMemberLegislation({ shown: bills.length, total, limit })}</p>
          <div className="activity-grid">
            {bills.map(
              (bill: LegislativeBill): JSX.Element => (
                <BillCard bill={bill} key={billIdentityKey(bill)} />
              ),
            )}
          </div>
        </>
      ) : (
        emptyNote
      )}
    </section>
  );
}

/** Props for {@link MemberDetail} — everything the member route resolves server-side. */
type MemberDetailProps = {
  /** The member being shown. */
  profile: MemberProfile;
  /** Whether this record is live Congress.gov data or a labeled placeholder. Changes wording throughout. */
  source: CongressSnapshot["source"];
  /** User-facing explanation of *why* placeholder data is being shown, when it is. */
  notice?: string;
  /** When this member's data was actually fetched — passed straight through to `DataSourceNotice`. */
  retrievedAt?: string;
  /** Bills this member sponsored, most recent first. A slice, not the complete history. */
  sponsored: LegislativeBill[];
  /** Bills this member cosponsored, most recent first. A slice, not the complete history. */
  cosponsored: LegislativeBill[];
  /** How many bills each list was capped at, so the page can say what it's showing a slice *of*. */
  legislationLimit: number;
};

/**
 * Individual member page. Purely presentational: the route resolves every value. Reports only what Congress.gov
 * publishes — no voting scores, ratings, or ideological placement, which are editorial judgments.
 *
 * @param props - {@link MemberDetailProps}.
 * @returns The member page.
 */
export function MemberDetail({
  profile,
  source,
  notice,
  retrievedAt,
  sponsored,
  cosponsored,
  legislationLimit,
}: MemberDetailProps): JSX.Element {
  const displayName: string = formatMemberName(profile);
  const chamberLabel: string = chamberLabels[profile.chamber];
  const seat: string = formatMemberSeat(profile, profile.chamber);
  const service: string = describeMemberService(profile);
  const biographyUrl: string | undefined = bioguideUrl(profile.bioguideId);

  return (
    <SiteShell>
      {/* Points at the directory rather than the home page: a person who reached a member from a bill's sponsor line or
          a seat in the chamber diagram has nowhere sideways to go otherwise, and "back" from one person is far more
          usefully the list of everyone than the front door. */}
      <DetailBackLink href="/members" label="All Members" />

      <section className="member-hero" aria-labelledby="member-name">
        <MemberPortrait
          alt={`Official portrait of ${formatMemberName(profile)}`}
          depiction={profile.depiction}
          variant="profile"
        />

        <div className="member-hero__copy">
          <p className="eyebrow">
            {formatMemberTitle(profile)} · {chamberLabel}
          </p>
          <h1 id="member-name">{displayName}</h1>

          <div className="member-hero__meta">
            <span className={`member-party ${partyTintClass(profile.party)}`}>{formatMemberParty(profile)}</span>
            {seat.length > 0 ? <span>{seat}</span> : null}
            {service.length > 0 ? <span>{service}</span> : null}
            {!profile.currentMember ? <span className="member-former">No longer serving</span> : null}
          </div>

          {profile.leadership.length > 0 ? (
            <ul className="member-leadership" aria-label="Leadership roles">
              {profile.leadership.map(
                (role: MemberLeadershipRole): JSX.Element => (
                  <li key={`${role.type}-${role.congress ?? "unknown"}`}>
                    {role.type}
                    {role.congress !== undefined ? ` · ${formatOrdinal(role.congress)} Congress` : ""}
                  </li>
                ),
              )}
            </ul>
          ) : null}
        </div>
      </section>

      <DataSourceNotice source={source} notice={notice} retrievedAt={retrievedAt} />

      <div className="detail-grid">
        <DetailPanel headingId="service-heading" kicker="Time in Office" heading="Service Record">
          {profile.terms.length > 0 ? (
            <ol className="member-terms">
              {profile.terms.map(
                (term: MemberTerm): JSX.Element => (
                  <ServiceTerm
                    chamberLabel={chamberLabels[term.chamber]}
                    key={`${term.chamber}-${term.congress ?? term.startYear ?? "unknown"}`}
                    term={term}
                  />
                ),
              )}
            </ol>
          ) : (
            <p className="muted-copy">Congress.gov publishes no term history for this member.</p>
          )}
        </DetailPanel>

        <DetailPanel
          accent
          as="aside"
          heading="Verify This Yourself"
          headingId="member-sources-heading"
          kicker="Primary Source"
        >
          {biographyUrl ? (
            <>
              <p className="muted-copy">
                The Biographical Directory of the United States Congress is the authoritative record of who has served,
                and is what Congress.gov's own member pages cite.
              </p>
              <OutboundLink href={biographyUrl}>Official Biography</OutboundLink>
            </>
          ) : (
            <p className="muted-copy">
              This is a placeholder member, so there is no official biography to link to. Configure a Congress.gov API
              key to browse real members.
            </p>
          )}
          {profile.officialWebsiteUrl ? (
            <OutboundLink href={profile.officialWebsiteUrl}>Official Website</OutboundLink>
          ) : null}
        </DetailPanel>
      </div>

      <LegislationSection
        bills={sponsored}
        emptyNote={
          <EmptySectionNote
            absence="Congress.gov records no sponsored legislation for this member."
            previewLead="Sponsored bills appear"
            source={source}
          />
        }
        heading="Bills They Introduced"
        headingId="sponsored-heading"
        kicker="Sponsored"
        limit={legislationLimit}
        total={profile.sponsoredCount}
      />

      <LegislationSection
        bills={cosponsored}
        emptyNote={
          <EmptySectionNote
            absence="Congress.gov records no cosponsored legislation for this member."
            previewLead="Cosponsored bills appear"
            source={source}
          />
        }
        heading="Bills They Signed On To"
        headingId="cosponsored-heading"
        kicker="Cosponsored"
        limit={legislationLimit}
        total={profile.cosponsoredCount}
      />

      <CalloutCard
        body="Introducing or cosponsoring a bill records that a member put their name to it — not that it passed, not how they voted, and not how effective they were. Civic Ledger reports what Congress.gov publishes and leaves the judgment to you."
        heading="Sponsorship Is Not a Scorecard."
        headingId="member-reading-heading"
        href="/learn"
        icon={Landmark}
        kicker="Read It With Context"
        linkIcon={ArrowUpRight}
        linkLabel="Learn the Terms"
      />
    </SiteShell>
  );
}
