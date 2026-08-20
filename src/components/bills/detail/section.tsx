import { Fragment, type JSX } from "react";

import type { CongressSnapshot } from "@/lib/congress/bills/model";
import type { BillSubResource } from "@/lib/congress/bills/sub-resource";

/**
 * The two things every record section of the bill page is built from: the props all of them take, and the capped list
 * three of them render.
 *
 * The page is nine sections in nine files beside this one, and what they share is small and worth holding in one place
 * anyway — the emptiness contract in {@link BillSectionProps}, which is a rule about what this app may claim rather
 * than a convenience, and the disclosure rule in {@link DisclosedList}, which is a rule about not silently truncating
 * the record.
 */

/**
 * What every record section on this page needs to word itself.
 *
 * The three fields travel together because the sections' emptiness copy depends on all three at once: what arrived,
 * whether the request that would have carried more was answered, and whether this record is live or preview. Stated
 * once here rather than restated in eight prop types, so a section cannot accidentally be given two of the three.
 *
 * @typeParam Item - The record type the section lists.
 */
export type BillSectionProps<Item> = {
  /** The collection, carrying whether its own request was answered. @see BillSubResource */
  resource: BillSubResource<Item>;
  /** Congress.gov's own count for the whole collection, when it published one. @see describeBillCollection */
  published?: number;
  /** Whether this record is live Congress.gov data or a labeled preview fixture. */
  source: CongressSnapshot["source"];
};

/** Props for {@link DisclosedList}. */
type DisclosedListProps<Item> = {
  /** Everything to show, in the order it should read. */
  items: Item[];
  /** How many appear before the disclosure. */
  limit: number;
  /** The `<ul>`'s class, applied to both the visible list and the disclosed one so they lay out identically. */
  listClassName: string;
  /** Renders one item. */
  renderItem: (item: Item) => JSX.Element;
  /** A stable key for one item. */
  keyFor: (item: Item) => string;
  /** The disclosure's label, given how many are behind it — e.g., `` (n) => `Show the Remaining ${n} Cosponsors` ``. */
  moreLabel: (remaining: number) => string;
};

/**
 * A long list, capped at a preview length with the remainder behind a `<details>`.
 *
 * Three of this page's collections need the same treatment for the same reason — a bill can have four hundred
 * cosponsors, three dozen related measures, or five hundred amendments, and any of them would bury every section
 * beneath it — so the rule is stated once here rather than implemented three times with three chances to disagree
 * about it.
 *
 * **Nothing is dropped and the label says how much is behind it.** That is the point of the disclosure rather than a
 * detail of it: this app's standing rule is that a bounded view names what it bounded (@see describeBillCollection),
 * and a list that silently stopped at twelve would read as a complete list of twelve. The count in the summary text is
 * what keeps the cap honest, and it is why `moreLabel` receives the number rather than being a fixed string.
 *
 * @typeParam Item - The record type being listed.
 * @param props - @see DisclosedListProps
 * @returns The visible list, followed by the disclosure when anything is behind it.
 */
export function DisclosedList<Item>({
  items,
  limit,
  listClassName,
  renderItem,
  keyFor,
  moreLabel,
}: DisclosedListProps<Item>): JSX.Element {
  const shown: Item[] = items.slice(0, limit);
  const remaining: Item[] = items.slice(limit);

  return (
    <>
      <ul className={listClassName}>
        {shown.map(
          (item: Item): JSX.Element => (
            <Fragment key={keyFor(item)}>{renderItem(item)}</Fragment>
          ),
        )}
      </ul>

      {remaining.length > 0 ? (
        <details className="summary-history">
          <summary className="summary-history__toggle">{moreLabel(remaining.length)}</summary>
          <ul className={listClassName}>
            {remaining.map(
              (item: Item): JSX.Element => (
                <Fragment key={keyFor(item)}>{renderItem(item)}</Fragment>
              ),
            )}
          </ul>
        </details>
      ) : null}
    </>
  );
}
