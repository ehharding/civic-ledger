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
    copy: "Every Data-Backed Surface Links People to the Corresponding Official Record Instead of Replacing It.",
  },
  {
    icon: ShieldCheck,
    title: "Useful Without Persuasion",
    copy: "The Product Explains Process and Provenance; It Does Not Tell People What Position To Hold.",
  },
  {
    icon: CheckCircle2,
    title: "Clear About Uncertainty",
    copy: "Status Cues Are Educational Summaries. Source Freshness and Preview States Stay Visible in the Interface.",
  },
];

/** Static "Methodology" route explaining the product's editorial principles. */
export default function AboutPage(): JSX.Element {
  return (
    <SiteShell>
      <PageHeader
        eyebrow="Methodology"
        title="Civic Information Deserves Good Product Thinking."
        description="Civic Ledger Is a Source-Conscious Public-Interest Interface for Understanding the Federal Legislative Process."
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
