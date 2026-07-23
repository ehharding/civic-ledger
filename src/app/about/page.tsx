import { CheckCircle2, Database, type LucideProps, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import type { ForwardRefExoticComponent, JSX, RefAttributes } from "react";

import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = { title: "About" };

/** The three product principles shown on the /about (Methodology) page. Purely presentational — no data fetching. */
const principles: {
  icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
  title: string;
  copy: string;
}[] = [
  {
    icon: Database,
    title: "Primary Sources First",
    copy: "Every data-backed surface links people to the corresponding official record instead of replacing it.",
  },
  {
    icon: ShieldCheck,
    title: "Useful Without Persuasion",
    copy: "The product explains process and provenance; it does not tell people what position to hold.",
  },
  {
    icon: CheckCircle2,
    title: "Clear About Uncertainty",
    copy: "Status cues are educational summaries. Source freshness and preview states stay visible in the interface.",
  },
];

/** Static "Methodology" route explaining the product's editorial principles. */
export default function AboutPage(): JSX.Element {
  return (
    <SiteShell>
      <PageHeader
        eyebrow="Methodology"
        title="Civic Information Deserves Good Product Thinking."
        description="Civic Ledger is a source-conscious public-interest interface for understanding the federal legislative process."
      />
      <div className="principle-list">
        {principles.map(
          ({
            icon: Icon,
            title,
            copy,
          }: {
            icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
            title: string;
            copy: string;
          }) => (
            <article className="principle" key={title}>
              <Icon aria-hidden="true" size={22} />
              <div>
                <h2>{title}</h2>
                <p>{copy}</p>
              </div>
            </article>
          ),
        )}
      </div>
    </SiteShell>
  );
}
