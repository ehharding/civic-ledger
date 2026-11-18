import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import type { JSX } from "react";

import { previewPendingCopy, unavailableCopy } from "@/components/ui/empty-section-note";
import { RecordLink } from "@/components/ui/record-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { type CommitteeChamber, type CommitteeProfile, isCommitteeSystemCode } from "@/lib/congress/committees/model";
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
  committeeReportedCount,
  DEFAULT_COMMITTEE_RECORD_KIND,
  describeCommitteeRecordsPage,
} from "@/lib/congress/committees/records";
import { formatCount, formatDate, formatOrdinal } from "@/lib/format";
import { billHref, committeeHref, committeeRecordsHref } from "@/lib/routes";

/**
 * The records an individual committee has accumulated: the bills referred to it, the reports it published, and the
 * nominations sent to it, one collection at a time.
 *
 * Purely presentational, as every other detail component in this app is — the route resolves which collection and which
 * page, fetches it, and passes the result in.
 *
 * **Every control here navigates.** The collection tabs and the pager's four steps are `next/link`s to this same
 * committee carrying different query params, not buttons over local state, and the pager's page field is a plain GET
 * `<form>` to the same place. That makes each view shareable, openable in a new tab, followable by a crawler, and
 * reachable with JavaScript disabled, and it keeps this whole section a server component.
 *
 * @see congress/committees/records.ts for what these collections are, and what this page does *not* claim about the
 *   order Congress.gov publishes them in.
 */

/**
 * How many records each collection holds. Congress.gov can disagree with itself — House Agriculture's record says
 * 17,795 bills, its bills endpoint 10,205 — so the fetched collection's own count wins on screen (it's what the pager
 * ends at), and the committee's figure stands for unfetched tabs. A tab's number can therefore change as you switch.
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

  return committeeReportedCount(profile, kind);
}

/** Props for {@link RecordsTab}. */
type RecordsTabProps = {
  /** The committee's chamber; with `systemCode`, what identifies it. */
  chamber: CommitteeChamber;
  /** The committee's system code. */
  systemCode: string;
  /** Which collection this tab opens. */
  kind: CommitteeRecordKind;
  /** How many records the collection holds, or `undefined` when Congress.gov reported none. */
  count: number | undefined;
  /** Whether this tab's collection is the one showing. */
  isCurrent: boolean;
};

/**
 * One collection tab.
 *
 * The tabs are plain links in a list rather than an ARIA tablist, and that is deliberate. A tablist promises a widget
 * whose panels are all present and swapped without leaving the page; these navigate, because the records behind each
 * one live on a different Congress.gov endpoint and are fetched on the server. Announcing them as tabs would tell a
 * screen-reader user to expect arrow-key switching that does not happen. `aria-current="page"` states which view is
 * showing, which is the honest version of the same information.
 *
 * @param props - {@link RecordsTabProps}.
 * @returns The tab.
 */
function RecordsTab({ chamber, systemCode, kind, count, isCurrent }: RecordsTabProps): JSX.Element {
  // Always page 1: switching collections from deep inside one of them and landing on page 9 of the next would be a
  // pager position carried somewhere it means nothing.
  const href: Route = committeeRecordsHref(chamber, systemCode, { kind, page: 1 });

  return (
    <li>
      <RecordLink aria-current={isCurrent ? "page" : undefined} className="committee-records__tab" href={href}>
        <span className="committee-records__tab-label">{committeeRecordKindLabels[kind]}</span>
        <span className="committee-records__tab-count">
          {count === undefined ? "Not reported" : formatCount(count)}
        </span>
      </RecordLink>
    </li>
  );
}

/** Props for {@link ReferralRow}. */
type ReferralRowProps = {
  /** The referral to render. */
  referral: CommitteeBillReferral;
};

/**
 * One referred measure.
 *
 * The identifier and the relationship both come from the committee's own record; the title arrives only when the
 * measure's own record could be looked up. When it couldn't, the row still names the measure, says what the committee
 * did with it, and links to its page, because the link is built from the identifier rather than from the title.
 *
 * @param props - {@link ReferralRowProps}.
 * @returns The row.
 * @see withBillTitles
 */
function ReferralRow({ referral }: ReferralRowProps): JSX.Element {
  const href: Route = billHref(referral);
  const identifier: string = `${referral.type} ${referral.number}`;

  return (
    <li className="committee-record">
      <div className="committee-record__topline">
        <span className="committee-record__id">{identifier}</span>
        {referral.relationship ? <span className="committee-record__tag">{referral.relationship}</span> : null}
      </div>
      <h3 className="committee-record__title">
        <RecordLink href={href}>{referral.bill?.title ?? identifier}</RecordLink>
      </h3>
      <p className="committee-record__meta">
        {referral.actionDate ? formatDate(referral.actionDate) : "Date not recorded"}
        {referral.bill?.policyArea ? ` · ${referral.bill.policyArea}` : ""}
      </p>
    </li>
  );
}

/** Props for {@link ReportRow}. */
type ReportRowProps = {
  /** The report to render. */
  report: CommitteeReport;
};

/**
 * One published report.
 *
 * Deliberately not a link, and this is the same decision the panel above it already makes about the committee itself.
 * Congress.gov's public report URLs take the form `/congressional-report/{ordinal}-congress/{chamber}-report/{number}`,
 * which *looks* derivable from what this record carries — and this project cannot verify that it is, because
 * congress.gov sits behind bot protection that answers every automated check with a challenge page. A deep link that
 * looks authoritative and lands on a 404 is a worse outcome for a product whose whole claim is that you can check it
 * than printing the citation and letting a reader search the identifier they were given.
 *
 * @param props - {@link ReportRowProps}.
 * @returns The row.
 * @see CONGRESS_GOV_COMMITTEES, where the same reasoning is applied to committee pages for a slightly different cause.
 */
function ReportRow({ report }: ReportRowProps): JSX.Element {
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

/** Props for {@link NominationRow}. */
type NominationRowProps = {
  /** The nomination to render. */
  nomination: CommitteeNomination;
};

/**
 * One referred nomination.
 *
 * The only one of the three collections whose list endpoint publishes a description, so this row says who was nominated
 * to what without the second request a referral needs for its title.
 *
 * @param props - {@link NominationRowProps}.
 * @returns The row.
 */
function NominationRow({ nomination }: NominationRowProps): JSX.Element {
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

/** Props for {@link RecordList}. */
type RecordListProps = {
  /** The page's records. */
  records: CommitteeRecords;
};

/**
 * The page's records, whichever collection they are.
 *
 * The one place the {@link CommitteeRecords} union is switched on, so each row component receives the record type it
 * was written for and nothing else.
 *
 * @param props - {@link RecordListProps}.
 * @returns The list.
 * @see CommitteeRecords for why the union exists rather than three parallel arrays.
 */
function RecordList({ records }: RecordListProps): JSX.Element {
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

// The `id`s the page field and the total beside it are wired together with. Module constants rather than generated,
// because `useId` is a hook and this whole section is a server component — and because a committee page renders exactly
// one pager, so there is nothing for a generated id to disambiguate.

/** The page-number field's `id`, which its label points at. */
const PAGE_INPUT_ID: string = "committee-records-page";

/** The "of N" total's `id`, which describes the page-number field. */
const PAGE_TOTAL_ID: string = "committee-records-page-total";

/** Props for {@link PagerStep}. */
type PagerStepProps = {
  /** Where the step lands, or `undefined` at the end of the range, which renders it as text. */
  href: Route | undefined;
  /** What the step says. */
  label: string;
  /** The step's glyph. */
  icon: LucideIcon;
  /** Leading for the two backward steps, trailing for the two forward ones — the glyph points the way it travels. */
  side: "leading" | "trailing";
  /** The link's `rel`, on the previous and next steps. */
  rel?: "prev" | "next";
};

/**
 * One of the pager's four steps: first, previous, next, last.
 *
 * A link when there is somewhere to go and plain text when there isn't: an end of the range is rendered as text rather
 * than as a disabled link, so there is no focusable control that does nothing.
 *
 * @param props - {@link PagerStepProps}.
 * @returns The step.
 */
function PagerStep({ href, label, icon: Icon, side, rel }: PagerStepProps): JSX.Element {
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
    <RecordLink className="committee-records__pager-step" href={href} rel={rel}>
      {content}
    </RecordLink>
  );
}

/** Props for {@link RecordsPager}. */
type RecordsPagerProps = {
  /** The committee's chamber; with `systemCode`, what identifies it. */
  chamber: CommitteeChamber;
  /** The committee's system code. */
  systemCode: string;
  /** The collection being paged. */
  kind: CommitteeRecordKind;
  /** The current page, 1-based. */
  page: number;
  /** How many pages the collection fills. */
  pageCount: number;
};

/**
 * The pager: two steps back, a page-number field, two steps forward. No numbered run, since collections reach hundreds
 * of pages; the field jumps anywhere.
 *
 * The field is a native GET `<form>`, so it works without JavaScript and yields a shareable URL. The costs: a full
 * document navigation, and `?page=1` where the link builders would write a bare URL.
 *
 * @param props - {@link RecordsPagerProps}.
 * @returns The pager, or `null` when the collection fits on one page and there is nowhere to go.
 */
function RecordsPager({ chamber, systemCode, kind, page, pageCount }: RecordsPagerProps): JSX.Element | null {
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

/** What {@link emptyCopy} needs to know about an empty collection. */
type EmptyCollection = {
  /** Which collection is empty. */
  kind: CommitteeRecordKind;
  /** Whether its request failed. */
  unavailable: boolean;
  /** Whether the page is showing placeholder records. */
  isPreview: boolean;
};

/**
 * What to say when a collection has no rows on screen.
 *
 * Three genuinely different situations produce an empty list and they are worded apart, on the same rule
 * `getCommitteeProfile` words its three preview notices apart: a reader who is told "this committee has published no
 * reports" when the truth is "the request failed" has been told something false about the congressional record.
 *
 * @param options - {@link EmptyCollection}.
 * @returns The sentence to print in place of the list.
 */
function emptyCopy(options: EmptyCollection): string {
  if (options.unavailable) {
    return unavailableCopy("These records are", "the committee has any");
  }

  if (options.isPreview) {
    return previewPendingCopy("Records appear");
  }

  const clause: string = `Congress.gov records ${committeeRecordKindClauses[options.kind]}.`;

  // The one collection whose emptiness is usually structural rather than incidental: a House or joint committee cannot
  // receive a nomination, so leaving that unsaid would make a permanent fact read as missing data.
  return options.kind === "nominations" ? `${clause} Only Senate committees receive them.` : clause;
}

/** Props for {@link CommitteeRecordsSection} — everything the committee route resolves server-side. */
type CommitteeRecordsSectionProps = {
  /** The committee whose records these are. Supplies the chamber and code every link here is built from. */
  profile: CommitteeProfile;
  /** The resolved page: its records, where it sits in the collection, and whether the request succeeded. */
  result: CommitteeRecordsResult;
};

/**
 * The committee page's records section.
 *
 * @param props - {@link CommitteeRecordsSectionProps}.
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
      <SectionHeading
        heading="What Has Come Through Here"
        headingId="committee-records-heading"
        kicker="In the Record"
      />

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
