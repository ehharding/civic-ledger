import { ArrowUpRight, ChevronLeft, Landmark } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { BillCard } from "@/components/bill-card";
import { CalloutCard } from "@/components/callout-card";
import { DataSourceNotice } from "@/components/data-source-notice";
import { OutboundLink } from "@/components/outbound-link";
import { SiteShell } from "@/components/site-shell";
import {
  bioguideUrl,
  chamberLabels,
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
} from "@/lib/congress/members";
import { billIdentityKey, type CongressSnapshot, type LegislativeBill } from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";

/** Props for {@link MemberDetail} — everything the member route resolves server-side. */
type MemberDetailProps = {
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
 * The member's official portrait and its credit line.
 *
 * A plain `<img>` rather than `next/image`, deliberately: this is one small portrait per page, served from
 * congress.gov, and it has to render identically in the static export — which turns off image optimization anyway.
 * Routing it through the optimizer would buy nothing and would add a remote-host allow-list to `next.config.ts` that
 * every future deploy target would have to keep correct.
 *
 * @param profile - The member whose portrait to render.
 * @returns The portrait and its attribution, or `null` when Congress.gov publishes no image for this member — which is
 *   common for members who left before the photo collection was digitized.
 */
function MemberPortrait({ profile }: { profile: MemberProfile }): JSX.Element | null {
  if (!profile.depiction) return null;

  return (
    <figure className="member-portrait">
      {/* biome-ignore lint/performance/noImgElement: next/image would need every congress.gov portrait host
          allow-listed in next.config.ts, and an un-listed host is a hard runtime error rather than a missing picture —
          the opposite of how the rest of this app degrades. The static export disables optimization anyway. */}
      <img
        alt={`Official portrait of ${formatMemberName(profile)}`}
        className="member-portrait__image"
        height={275}
        loading="lazy"
        src={profile.depiction.imageUrl}
        width={220}
      />
      {profile.depiction.attribution ? (
        <figcaption className="member-portrait__credit">
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by sanitizeSummaryHtml in the adapter. */}
          <span dangerouslySetInnerHTML={{ __html: profile.depiction.attribution }} />
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * One row of the service history.
 *
 * @param term - The term to describe.
 * @param chamberLabel - The chamber's full name, resolved by the caller so the label table is consulted once per list
 *   rather than once per row.
 * @returns The term's chamber, congress, and calendar span.
 */
function ServiceTerm({ term, chamberLabel }: { term: MemberTerm; chamberLabel: string }): JSX.Element {
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

/**
 * One of the member's legislation lists, rendered as the same `BillCard` grid used everywhere else bills appear.
 *
 * @param bills - The bills to show — already a capped slice, not the full history.
 * @param headingId - The id this section's `aria-labelledby` points at, so each list is its own labeled region.
 * @param kicker - The small label above the heading.
 * @param heading - The section heading.
 * @param emptyCopy - What to say when the list is empty, which for a newly seated member is an ordinary state.
 * @param total - The member's complete count for this list, when Congress.gov reports one.
 * @param limit - The cap the list was sliced to, so the copy can distinguish "all of them" from "the most recent few".
 * @returns The labeled section.
 */
function LegislationSection({
  bills,
  headingId,
  kicker,
  heading,
  emptyCopy,
  total,
  limit,
}: {
  bills: LegislativeBill[];
  headingId: string;
  kicker: string;
  heading: string;
  emptyCopy: string;
  total?: number;
  limit: number;
}): JSX.Element {
  const isTruncated: boolean = total !== undefined && total > limit;

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
          <p className="muted-copy">
            {isTruncated
              ? `Showing the ${bills.length} most recent of ${total} on file. The complete list lives on the official record.`
              : `${bills.length} on file.`}
          </p>
          <div className="activity-grid">
            {bills.map(
              (bill: LegislativeBill): JSX.Element => (
                <BillCard bill={bill} key={billIdentityKey(bill)} />
              ),
            )}
          </div>
        </>
      ) : (
        <p className="muted-copy">{emptyCopy}</p>
      )}
    </section>
  );
}

/**
 * Individual member page.
 *
 * Purely presentational, exactly as `BillDetail` is: every value is resolved by the route and passed in, so this
 * component has no fetching, no environment access, and nothing that behaves differently between a live and a
 * placeholder render except the wording it chooses.
 *
 * The page deliberately reports only what Congress.gov publishes — service record, party, jurisdiction, and the
 * legislation they put their name to. It carries no voting scores, ratings, or ideological placement: those are
 * editorial judgments, and this project's stated stance is that clarity and provenance, not persuasion, are the
 * product.
 *
 * @param props - @see MemberDetailProps
 * @returns The hero (portrait, name, title, seat, service span), the service record and official-source panels, the
 *   sponsored and cosponsored legislation grids, and the closing context card.
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
      <div className="bill-backlink">
        <Link href="/members">
          <ChevronLeft aria-hidden="true" size={16} /> All Members
        </Link>
      </div>

      <section className="member-hero" aria-labelledby="member-name">
        <MemberPortrait profile={profile} />

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
        <section className="detail-panel" aria-labelledby="service-heading">
          <p className="section-kicker">Time in Office</p>
          <h2 id="service-heading">Service Record</h2>
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
        </section>

        <aside className="detail-panel detail-panel--accent" aria-labelledby="member-sources-heading">
          <p className="section-kicker">Primary Source</p>
          <h2 id="member-sources-heading">Verify This Yourself</h2>
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
        </aside>
      </div>

      <LegislationSection
        bills={sponsored}
        emptyCopy={
          source === "preview"
            ? "Sponsored bills appear here once live Congress.gov data is connected."
            : "Congress.gov records no sponsored legislation for this member."
        }
        heading="Bills They Introduced"
        headingId="sponsored-heading"
        kicker="Sponsored"
        limit={legislationLimit}
        total={profile.sponsoredCount}
      />

      <LegislationSection
        bills={cosponsored}
        emptyCopy={
          source === "preview"
            ? "Cosponsored bills appear here once live Congress.gov data is connected."
            : "Congress.gov records no cosponsored legislation for this member."
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
