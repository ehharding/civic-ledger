/**
 * Covers that each analytics collector is handed `redactUrl`, so a recorded URL names a page and never a query like
 * `?party=republican`. The redaction itself is tested in `src/lib/observability/redact.test.ts`.
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Both collectors are replaced with recorders. They render nothing and work entirely through injected scripts, so there
 * is no DOM to assert against — the only observable thing this component does is hand each collector a `beforeSend`,
 * and that callback is the whole point of the file.
 */
const analyticsProps: { beforeSend?: (event: { url: string }) => { url: string } }[] = [];
const speedProps: { beforeSend?: (event: { url: string }) => { url: string } }[] = [];

vi.mock("@vercel/analytics/next", () => ({
  Analytics: (props: { beforeSend?: (event: { url: string }) => { url: string } }): null => {
    analyticsProps.push(props);
    return null;
  },
}));

vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: (props: { beforeSend?: (event: { url: string }) => { url: string } }): null => {
    speedProps.push(props);
    return null;
  },
}));

import { SiteAnalytics } from "@/components/layout/site-analytics";

describe("SiteAnalytics", (): void => {
  it("mounts both collectors and renders no markup of its own", (): void => {
    const { container } = render(<SiteAnalytics />);

    expect(container).toBeEmptyDOMElement();
    expect(analyticsProps.length).toBeGreaterThan(0);
    expect(speedProps.length).toBeGreaterThan(0);
  });

  it("strips the query string from what each collector would report", (): void => {
    render(<SiteAnalytics />);

    const url: string = "https://civic-ledger.example/members?party=republican&state=Ohio#main-content";
    const analytics = analyticsProps.at(-1)?.beforeSend;
    const speed = speedProps.at(-1)?.beforeSend;

    // Both, not one: an unfiltered feed from *either* collector would be the log of who-searched-for-what that
    // `docs/data-policy.md` says this product will not build.
    expect(analytics?.({ url })).toEqual({ url: "https://civic-ledger.example/members" });
    expect(speed?.({ url })).toEqual({ url: "https://civic-ledger.example/members" });
  });

  it("passes the rest of the event through untouched, changing only the URL", (): void => {
    render(<SiteAnalytics />);

    const event = { url: "https://civic-ledger.example/bills?q=water", route: "/bills" };
    const sent: { url: string } | undefined = analyticsProps.at(-1)?.beforeSend?.(event as { url: string });

    expect(sent).toEqual({ url: "https://civic-ledger.example/bills", route: "/bills" });
  });
});
