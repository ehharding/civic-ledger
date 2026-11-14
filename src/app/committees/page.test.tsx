/**
 * Covers the committee directory route.
 *
 * Same shape as `/members`, with one difference the route's comment calls out: neither of this directory's facets is
 * derived from the data, so a stale `?type=` can be validated against the app's own closed union rather than against
 * the list in hand. That's why this route resolves its query without passing anything alongside it — and why the
 * unknown-facet case still has to land on the unfiltered view rather than an empty grid.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import CommitteesPage, { metadata } from "@/app/committees/page";
import { renderCommitteesRoute } from "@/app/committees/render";
import type { CommitteeSummary } from "@/lib/congress/committees/model";
import { previewCommitteeDirectory } from "@/lib/congress/upstream/fixtures";
import type { RouteSearchParams } from "@/lib/search-params";

beforeEach((): void => {
  window.history.replaceState(null, "", "/committees");
});

/** Renders the route in its default view — the static half, which never reads a query. */
async function renderPage(): Promise<void> {
  render(await CommitteesPage());
}

/** Renders the route with the given deep link, as its `/query` twin does for a URL a rewrite sends there. */
async function renderQueryPage(searchParams: RouteSearchParams): Promise<void> {
  render(await renderCommitteesRoute(Promise.resolve(searchParams)));
}

describe("CommitteesPage", (): void => {
  it("renders the directory under the route's own header copy", async (): Promise<void> => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Where Bills Actually Go.");
  });

  it("lists every committee the directory contains", async (): Promise<void> => {
    await renderPage();

    const committees: CommitteeSummary[] = previewCommitteeDirectory();
    expect(committees.length).toBeGreaterThan(0);
    for (const committee of committees) {
      expect(screen.getByText(committee.name), committee.systemCode).toBeInTheDocument();
    }
  });

  it("labels a preview list rather than presenting fixtures as the record", async (): Promise<void> => {
    await renderPage();

    expect(screen.getByText("Preview Data")).toBeInTheDocument();
  });

  it("arrives already narrowed to the view a shared ?q= link asked for", async (): Promise<void> => {
    await renderQueryPage({ q: "archives" });

    expect(screen.getByRole("searchbox", { name: /Search committees/ })).toHaveValue("archives");
  });

  it("falls back to the unfiltered view for facet params naming nothing", async (): Promise<void> => {
    await renderQueryPage({ chamber: "starfleet", type: "imaginary", sort: "sideways" });

    for (const committee of previewCommitteeDirectory()) {
      expect(screen.getByText(committee.name), committee.systemCode).toBeInTheDocument();
    }
  });

  it("names itself and its canonical path", (): void => {
    expect(metadata.title).toBe("Committees");
    expect(metadata.alternates?.canonical).toBe("/committees");
  });
});
