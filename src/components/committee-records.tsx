import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { JSX } from "react";

import { billHref } from "@/lib/bill-route";
import { committeeHref, committeeRecordsHref } from "@/lib/committee-route";
import {
  COMMITTEE_RECORDS_PARAMS,
  type CommitteeBillReferral,
  type CommitteeNomination,
  type CommitteeRecordKind,
  type CommitteeRecords,
  type CommitteeRecordsResult,
  type CommitteeReport,
  committeeRecordKindClauses,
  committeeRecordKindDescriptions,
  committeeRecordKindLabels,
  committeeRecordKinds,
  DEFAULT_COMMITTEE_RECORD_KIND,
  describeCommitteeRecordsPage,
} from "@/lib/congress/committee-records";
import { type CommitteeChamber, type CommitteeProfile, isCommitteeSystemCode } from "@/lib/congress/committees";
import { formatCount, formatDate, formatOrdinal } from "@/lib/format";

/**
 * The records an individual committee has accumulated: the bills referred to it, the reports it published, and the
 * nominations sent to it, one collection at a time.
 *
 * Purely presentational, as every other detail component in this app is — the route resolves which collection and which
 * page, fetches it, and passes the result in.
 *
 * **Every control here navigates.** The collection tabs and the pager's four steps are `next/link`s to this same
 * committee carrying different query params, not buttons over local state, and the pager's page field is a plain GET
 * `<form>` to the same place. That is what makes each view shareable, openable in a new tab, followable by a crawler,
 * and reachable with JavaScript disabled — and it is what lets this whole section stay a server component, which
 * matters because the alternative would have meant shipping a page's worth of records to the browser to filter records
 * the browser already can't fetch more of.
 *
 * @see committee-records.ts for what these collections are and, more importantly, what this page does *not* claim about
 *   the order Congress.gov publishes them in.
 */

/** Props for {@link CommitteeRecordsSection} — everything the committee route resolves server-side. */
type CommitteeRecordsSectionProps = {
  /** The committee whose records these are. Supplies the chamber and code every link here is built from. */
  profile: CommitteeProfile;
  /** The resolved page: its records, where it sits in the collection, and whether the request succeeded. */
  result: CommitteeRecordsResult;
};

/**
 * How many records each collection holds.
 *
 * **Congress.gov publishes two different answers to this for the same collection, and this is where that is resolved.**
 * The House Agriculture Committee's own record reports `bills.count: 17795`, while its bills endpoint reports
 * `pagination.count: 10205` for the very same collection. Reports agree between the two; bills do not.
 *
 * The collection endpoint's count wins for whichever collection is on screen, because it is the one a reader can check:
 * it is what the pager is built from and what the last page actually ends at, and printing 17,795 above a list that
 * runs out after 10,205 would be this page contradicting itself in a way anyone paging to the end could catch. The
 * committee's own figure stands for the two collections that have not been fetched, since it is the only figure in hand
 * for them.
 *
 * The visible consequence, stated rather than hidden: the bills tab reads 10,205 while bills are showing and 17,795
 * while reports are. Preferring the committee's figure everywhere would trade that for a contradiction visible on a
 * single screen, which is the worse of the two.
 *
 * @param profile - The committee whose counts to read.
 * @param kind - Which collection this tab opens.
 * @param result - The collection actually fetched, whose own count is authoritative for it.
 * @returns The count, or `undefined` when Congress.gov reported none — which is a different claim from "none", and is
 *   why the tab says so in words rather than printing a zero.
 */
function countFor(
  profile: CommitteeProfile,
  kind: CommitteeRecordKind,
  result: CommitteeRecordsResult,
): number | undefined {
  if (kind === result.records.kind && result.total !== undefined) return result.total;

  if (kind === "bills") return profile.billCount;
  if (kind === "reports") return profile.reportCount;

  return profile.nominationCount;
}

/**
 * One collection tab.
 *
 * The tabs are plain links in a list rather than an ARIA tablist, and that is deliberate. A tablist promises a widget
 * whose panels are all present and swapped without leaving the page; these navigate, because the records behind each
 * one live on a different Congress.gov endpoint and are fetched on the server. Announcing them as tabs would tell a
 * screen-reader user to expect arrow-key switching that does not happen. `aria-current="page"` states which view is
 * showing, which is the honest version of the same information.
 *
 * @param props - The committee, which collection this tab opens, its count, and whether it is the current view.
 * @returns The tab.
 */
function RecordsTab({
  chamber,
  systemCode,
  kind,
  count,
  isCurrent,
}: {
  chamber: CommitteeChamber;
  systemCode: string;
  kind: CommitteeRecordKind;
  count: number | undefined;
  isCurrent: boolean;
}): JSX.Element {
  // Always page 1: switching collections from deep inside one of them and landing on page 9 of the next would be a
  // pager position carried somewhere it means nothing.
  const href: Route = committeeRecordsHref(chamber, systemCode, { kind, page: 1 });

  return (
    <li>
      <Link aria-current={isCurrent ? "page" : undefined} className="committee-records__tab" href={href}>
        <span className="committee-records__tab-label">{committeeRecordKindLabels[kind]}</span>
        <span className="committee-records__tab-count">
          {count === undefined ? "Not reported" : formatCount(count)}
        </span>
      </Link>
    </li>
  );
}

/**
 * One referred measure.
 *
 * The identifier and the relationship both come from the committee's own record; the title arrives only when the
 * measure's own record could be looked up. @see withBillTitles, and note what this row does when it couldn't: it still
 * names the measure, still says what the committee did with it, and still links to its page, because the link is built
 * from the identifier rather than from the title.
 *
 * @param referral - The referral to render.
 * @returns The row.
 */
function ReferralRow({ referral }: { referral: CommitteeBillReferral }): JSX.Element {
  const href: Route = billHref(referral);
  const identifier: string = `${referral.type} ${referral.number}`;

  return (
    <li className="committee-record">
      <div className="committee-record__topline">
        <span className="committee-record__id">{identifier}</span>
        {referral.relationship ? <span className="committee-record__tag">{referral.relationship}</span> : null}
      </div>
      <h3 className="committee-record__title">
        <Link href={href}>{referral.bill?.title ?? identifier}</Link>
      </h3>
      <p className="committee-record__meta">
        {referral.actionDate ? formatDate(referral.actionDate) : "Date not recorded"}
        {referral.bill?.policyArea ? ` · ${referral.bill.policyArea}` : ""}
      </p>
    </li>
  );
}

/**
 * One published report.
 *
 * Deliberately not a link, and this is the same decision the panel above it already makes about the committee itself.
 * Congress.gov's public report URLs take the form `/congressional-report/{ordinal}-congress/{chamber}-report/{number}`,
 * which *looks* derivable from what this record carries — and this project cannot verify that it is, because
 * congress.gov sits behind bot protection that answers every automated check with a challenge page. A deep link that
 * looks authoritative and lands on a 404 is a worse outcome for a product whose whole claim is that you can check it
 * than printing the citation and letting a reader search the identifier they were given. @see CONGRESS_GOV_COMMITTEES,
 * where the same reasoning is applied to committee pages for a slightly different cause.
 *
 * @param report - The report to render.
 * @returns The row.
 */
function ReportRow({ report }: { report: CommitteeReport }): JSX.Element {
  const parts: string[] = [];
  if (report.congress !== undefined) parts.push(`${formatOrdinal(report.congress)} Congress`);
  // Congress.gov spells the part into some citations and not others — `"H. Rept. 117-357,Part 1"` beside a bare
  // `"H. Rept. 117-221"` that also carries `part: 1`. Restating it would print "Part 1" twice on the first and once on
  // the second, so it is added only where the citation hasn't already said it.
  if (report.part !== undefined && !/part/i.test(report.citation)) parts.push(`Part ${report.part}`);
  if (report.updateDate) parts.push(`Record updated ${formatDate(report.updateDate)}`);

  return (
    <li className="committee-record">
      <div className="committee-record__topline">
        <span className="committee-record__id">{report.citation}</span>
      </div>
      <p className="committee-record__meta">
        {parts.length > 0 ? parts.join(" · ") : "Congress.gov publishes no further detail for this report."}
      </p>
    </li>
  );
}

/**
 * One referred nomination.
 *
 * The only one of the three collections whose list endpoint publishes a description, so this row says who was nominated
 * to what without the second request a referral needs for its title.
 *
 * @param nomination - The nomination to render.
 * @returns The row.
 */
function NominationRow({ nomination }: { nomination: CommitteeNomination }): JSX.Element {
  return (
    <li className="committee-record">
      <div className="committee-record__topline">
        <span className="committee-record__id">{nomination.citation}</span>
        {nomination.receivedDate ? (
          <span className="committee-record__tag">Received {formatDate(nomination.receivedDate)}</span>
        ) : null}
      </div>
      {nomination.description ? <p className="committee-record__title">{nomination.description}</p> : null}
      <p className="committee-record__meta">
        {nomination.latestAction?.text ?? "Congress.gov records no action on this nomination."}
      </p>
    </li>
  );
}

/**
 * The page's records, whichever collection they are.
 *
 * The one place the {@link CommitteeRecords} union is switched on, so each row component receives the record type it
 * was written for and nothing else. @see CommitteeRecords for why the union exists rather than three parallel arrays.
 *
 * @param records - The page's records.
 * @returns The list.
 */
function RecordList({ records }: { records: CommitteeRecords }): JSX.Element {
  if (records.kind === "reports") {
    return (
      <ul className="committee-records__list">
        {records.items.map(
          (report: CommitteeReport): JSX.Element => (
            <ReportRow key={report.citation} report={report} />
          ),
        )}
      </ul>
    );
  }

  if (records.kind === "nominations") {
    return (
      <ul className="committee-records__list">
        {records.items.map(
          (nomination: CommitteeNomination): JSX.Element => (
            <NominationRow key={nomination.citation} nomination={nomination} />
          ),
        )}
      </ul>
    );
  }

  return (
    <ul className="committee-records__list">
      {records.items.map(
        (referral: CommitteeBillReferral): JSX.Element => (
          <ReferralRow key={`${referral.congress}-${referral.type}-${referral.number}`} referral={referral} />
        ),
      )}
    </ul>
  );
}

/**
 * The `id`s the page field and the total beside it are wired together with.
 *
 * Module constants rather than generated, because `useId` is a hook and this whole section is a server component — and
 * because a committee page renders exactly one pager, so there is nothing for a generated id to disambiguate.
 */
const PAGE_INPUT_ID = "committee-records-page";
const PAGE_TOTAL_ID = "committee-records-page-total";

/**
 * One of the pager's four steps: first, previous, next, last.
 *
 * A link when there is somewhere to go and plain text when there isn't, which is the same rule the section held when
 * there were only two of them — an end of the range is rendered as text rather than as a disabled link, so there is no
 * focusable control that does nothing.
 *
 * @param props - Where the step lands (or `undefined` at the end of the range), what it says, its glyph, and which side
 *   that glyph sits on.
 * @returns The step.
 */
function PagerStep({
  href,
  label,
  icon: Icon,
  side,
  rel,
}: {
  href: Route | undefined;
  label: string;
  icon: LucideIcon;
  /** Leading for the two backward steps, trailing for the two forward ones — the glyph points the way it travels. */
  side: "leading" | "trailing";
  rel?: "prev" | "next";
}): JSX.Element {
  const glyph: JSX.Element = <Icon aria-hidden="true" size={16} />;
  const content: JSX.Element =
    side === "leading" ? (
      <>
        {glyph}
        {label}
      </>
    ) : (
      <>
        {label}
        {glyph}
      </>
    );

  if (href === undefined) {
    return <span className="committee-records__pager-step committee-records__pager-step--edge">{content}</span>;
  }

  return (
    <Link className="committee-records__pager-step" href={href} rel={rel}>
      {content}
    </Link>
  );
}

/**
 * The pager: two steps back, the page field, two steps forward.
 *
 * Still not a numbered run, and for the reason it never was — these collections reach five figures, so a full
 * pagination control would either be truncated with ellipses nobody can aim at or be a thousand links in the page
 * source. What a numbered run is actually *for*, though, is getting somewhere that isn't adjacent, and stepping one
 * page at a time is a poor answer to that when there are 851 of them. The field is the direct answer: type a number,
 * land on it, from either end of the collection in one move.
 *
 * **It is a real `<form>` with `method="get"`, not a scripted jump.** That is the same commitment every other control
 * in this section makes — the tabs and the four steps are all `next/link`s rather than click handlers — carried to the
 * one control a link can't express, because its destination isn't known until the reader types it. A GET form submits
 * natively, so this works with JavaScript disabled, and what it produces is an ordinary shareable committee URL rather
 * than a state only this page can restore.
 *
 * Two consequences of that choice, stated rather than hidden. Submitting navigates the document instead of routing on
 * the client, which costs a moment the four steps beside it don't. And a reader who types `1` lands on `?page=1` — a
 * URL the route reads correctly but that the link builders would have written bare. A form can only submit the field
 * it has, and neither is worth trading native submission for.
 *
 * @param props - The committee, the current view, and how many pages the collection fills.
 * @returns The pager, or `null` when the collection fits on one page and there is nowhere to go.
 */
function RecordsPager({
  chamber,
  systemCode,
  kind,
  page,
  pageCount,
}: {
  chamber: CommitteeChamber;
  systemCode: string;
  kind: CommitteeRecordKind;
  page: number;
  pageCount: number;
}): JSX.Element | null {
  if (pageCount <= 1) return null;

  const label: string = committeeRecordKindLabels[kind].toLowerCase();
  const pageHref = (target: number): Route => committeeRecordsHref(chamber, systemCode, { kind, page: target });
  // Across two pages, "First" points exactly where "Previous" does and "Last" where "Next" does. Two controls that can
  // only ever agree are one control and some furniture, so the ends appear once there is a middle to skip over.
  const hasEnds: boolean = pageCount > 2;

  return (
    <nav aria-label={`Pages of ${label}`} className="committee-records__pager">
      <div className="committee-records__pager-steps">
        {hasEnds ? (
          <PagerStep href={page > 1 ? pageHref(1) : undefined} icon={ChevronFirst} label="First" side="leading" />
        ) : null}
        <PagerStep
          href={page > 1 ? pageHref(page - 1) : undefined}
          icon={ChevronLeft}
          label="Previous"
          rel="prev"
          side="leading"
        />
      </div>

      {/* Points at the committee's bare URL and lets the fields supply the query, so a GET submission rewrites the
          whole query string rather than appending to one. The collection is carried as a hidden field for the same
          reason the step links carry it — jumping to page 40 of the reports must not silently land on the bills — and
          is omitted at its default, so the URL this produces matches the one every link on the page would have built
          for the same view. */}
      <form action={committeeHref(chamber, systemCode)} className="committee-records__pager-jump" method="get">
        {kind === DEFAULT_COMMITTEE_RECORD_KIND ? null : (
          <input name={COMMITTEE_RECORDS_PARAMS.kind} type="hidden" value={kind} />
        )}
        <label className="committee-records__pager-jump-label" htmlFor={PAGE_INPUT_ID}>
          Page
        </label>
        {/* `min`/`max` let the browser reject an out-of-range page before a request goes anywhere, and are an honest
            statement of the range besides. They are a convenience rather than the guard: the route parses and clamps
            this param regardless, because a hand-edited URL never passes through this field at all. */}
        <input
          aria-describedby={PAGE_TOTAL_ID}
          className="committee-records__pager-input"
          defaultValue={page}
          id={PAGE_INPUT_ID}
          inputMode="numeric"
          max={pageCount}
          min={1}
          name={COMMITTEE_RECORDS_PARAMS.page}
          type="number"
        />
        <span className="committee-records__pager-total" id={PAGE_TOTAL_ID}>
          of {formatCount(pageCount)}
        </span>
        <button className="committee-records__pager-go" type="submit">
          Go
        </button>
      </form>

      <div className="committee-records__pager-steps">
        <PagerStep
          href={page < pageCount ? pageHref(page + 1) : undefined}
          icon={ChevronRight}
          label="Next"
          rel="next"
          side="trailing"
        />
        {hasEnds ? (
          <PagerStep
            href={page < pageCount ? pageHref(pageCount) : undefined}
            icon={ChevronLast}
            label="Last"
            side="trailing"
          />
        ) : null}
      </div>
    </nav>
  );
}

/**
 * What to say when a collection has no rows on screen.
 *
 * Three genuinely different situations produce an empty list and they are worded apart, on the same rule
 * `getCommitteeProfile` words its three preview notices apart: a reader who is told "this committee has published no
 * reports" when the truth is "the request failed" has been told something false about the congressional record.
 *
 * @param options - Which collection, whether the request failed, and whether these are placeholder records.
 * @returns The sentence to print in place of the list.
 */
function emptyCopy(options: { kind: CommitteeRecordKind; unavailable: boolean; isPreview: boolean }): string {
  if (options.unavailable) {
    return "These records are temporarily unavailable. Congress.gov did not answer this request, so this page cannot say whether the committee has any.";
  }

  if (options.isPreview) {
    return "Records appear here once live Congress.gov data is connected.";
  }

  const clause: string = `Congress.gov records ${committeeRecordKindClauses[options.kind]}.`;

  // The one collection whose emptiness is usually structural rather than incidental: a House or joint committee cannot
  // receive a nomination, so leaving that unsaid would make a permanent fact read as missing data.
  return options.kind === "nominations" ? `${clause} Only Senate committees receive them.` : clause;
}

/**
 * The committee page's records section.
 *
 * @param props - @see CommitteeRecordsSectionProps
 * @returns The heading, the three collection tabs, the current collection's rows, and the pager.
 */
export function CommitteeRecordsSection({ profile, result }: CommitteeRecordsSectionProps): JSX.Element {
  const { records, page, pageCount, total, unavailable } = result;
  const kind: CommitteeRecordKind = records.kind;
  // The same test the panel above uses to decide whether an official-record reference can honestly be offered: a code
  // that cannot be a real one belongs to a placeholder committee, whose empty collections say nothing about Congress.
  const isPreview: boolean = !isCommitteeSystemCode(profile.systemCode);
  const range: string = describeCommitteeRecordsPage({ shown: records.items.length, page, total });

  return (
    <section className="committee-records" aria-labelledby="committee-records-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">In the Record</p>
          <h2 id="committee-records-heading">What Has Come Through Here</h2>
        </div>
      </div>

      <p className="muted-copy">
        Counted across this committee's whole existence, not the current Congress alone. Choose a collection to read the
        records themselves.
      </p>

      <ul aria-label="Record collections" className="committee-records__tabs">
        {committeeRecordKinds.map(
          (candidate: CommitteeRecordKind): JSX.Element => (
            <RecordsTab
              chamber={profile.chamber}
              count={countFor(profile, candidate, result)}
              isCurrent={candidate === kind}
              key={candidate}
              kind={candidate}
              systemCode={profile.systemCode}
            />
          ),
        )}
      </ul>

      <p className="muted-copy committee-records__about">{committeeRecordKindDescriptions[kind]}</p>

      {records.items.length > 0 ? (
        <>
          {/* Unconditional, because `describeCommitteeRecordsPage` returns an empty string only for a page with no rows
              on it — which this branch has already excluded. A guard here would be one no input could reach. */}
          <p className="committee-records__range" role="status">
            {range}
          </p>
          <RecordList records={records} />
          <RecordsPager
            chamber={profile.chamber}
            kind={kind}
            page={page}
            pageCount={pageCount}
            systemCode={profile.systemCode}
          />
        </>
      ) : (
        <p className="muted-copy">{emptyCopy({ kind, unavailable, isPreview })}</p>
      )}
    </section>
  );
}
