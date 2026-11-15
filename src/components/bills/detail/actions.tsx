import type { JSX } from "react";

import type { BillSectionProps } from "@/components/bills/detail/section";
import { GlossaryProse } from "@/components/learn/glossary-prose";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import { type BillAction, describeBillCollection } from "@/lib/congress/bills/model";
import { formatDate, pluralize } from "@/lib/format";

/**
 * The bill's full action history, collapsed. Not deduplicated: Congress.gov logs one moment from several source
 * systems, and merging them would mean choosing which official log to believe.
 *
 * @param actions - Every action on file, most recent first.
 * @returns The collapsible history, or nothing at all when there is none to show.
 */
function ActionHistory({ actions }: { actions: BillAction[] }): JSX.Element | null {
  if (actions.length === 0) return null;

  return (
    <details className="summary-history">
      <summary className="summary-history__toggle">
        Read All {actions.length} {pluralize(actions.length, "Action")}
      </summary>
      {/* Keyed partly by position, which is the correct key here rather than a lazy one: an action carries no
          identifier of its own, and the endpoint deliberately returns near-duplicate rows — the same moment logged by
          two source systems — so date, code, and text together still don't separate every pair. The list is
          server-rendered from a fixed array and is never reordered or filtered. */}
      <ol className="action-history__list">
        {actions.map(
          (action: BillAction, index: number): JSX.Element => (
            // biome-ignore lint/suspicious/noArrayIndexKey: no per-action identifier exists; see the note above.
            <li key={`${action.date ?? ""}-${action.actionCode ?? ""}-${index}`}>
              {action.date ? <p className="date-label">{formatDate(action.date)}</p> : null}
              {/* Congress's own words, like the latest-action line above — and the same reason for annotating them. */}
              <p className="action-history__text">
                <GlossaryProse text={action.text} />
              </p>
            </li>
          ),
        )}
      </ol>
    </details>
  );
}

/**
 * Every step logged on the bill, newest first.
 *
 * @param props - {@link BillSectionProps}.
 * @returns The action-history panel.
 */
export function ActionsPanel({ resource, published, source }: BillSectionProps<BillAction>): JSX.Element {
  const { entries: actions, unavailable } = resource;

  return (
    <DetailPanel headingId="actions-heading" kicker="Every Step on the Record" heading="What Congress Actually Did">
      {actions.length > 0 ? (
        <p className="muted-copy">
          {describeBillCollection({ shown: actions.length, published, noun: "action" })} The same moment is often logged
          twice, by the chamber’s floor record and by the Library of Congress — both are kept here rather than merged.
        </p>
      ) : (
        <EmptySectionNote
          absence="No action history could be read for this bill."
          previewLead="The action history appears"
          source={source}
          unavailable={unavailable}
          unavailableLead="The action history is"
          unavailableSubject="anything has happened to this bill"
        />
      )}
      <ActionHistory actions={actions} />
    </DetailPanel>
  );
}
