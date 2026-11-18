import { Fragment, type JSX } from "react";

import type { BillSubResource, CongressSnapshot } from "@/lib/congress/bills/model";

/**
 * What every record section on the bill page needs to word itself, including its empty state: what arrived, whether the
 * request was answered, and whether the record is live or preview.
 *
 * @typeParam Item - The record type the section lists.
 */
export type BillSectionProps<Item> = {
  /**
   * The collection, carrying whether its own request was answered.
   *
   * @see BillSubResource
   */
  resource: BillSubResource<Item>;
  /**
   * Congress.gov's own count for the whole collection, when it published one.
   *
   * @see describeBillCollection
   */
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
 * A long list capped at a preview length, the remainder behind a `<details>` whose label says how many are hidden — a
 * list that silently stopped would read as complete.
 *
 * @typeParam Item - The record type being listed.
 * @param props - {@link DisclosedListProps}.
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
