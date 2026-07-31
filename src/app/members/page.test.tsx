/**
 * Covers the member directory route.
 *
 * The one thing this route does that the other two directories don't is validate `?state=` against the jurisdictions
 * the roster actually contains — which is why it reads the filters *after* the roster rather than alongside it. That
 * sequential read is a deliberate cost, and the behavior it buys is the case worth pinning: a link to a state nobody
 * currently represents opens the full directory rather than an empty grid claiming to be filtered.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import MembersPage, { metadata } from "@/app/members/page";
import { previewMemberDirectory } from "@/lib/congress/fixtures";
import type { MemberDirectoryEntry } from "@/lib/congress/members";
import type { RouteSearchParams } from "@/lib/search-params";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

beforeEach((): void => {
  delete process.env.CONGRESS_API_KEY;
  window.history.replaceState(null, "", "/members");
});

afterEach((): void => {
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

/** Renders the route with the given deep link. */
async function renderPage(searchParams: RouteSearchParams = {}): Promise<void> {
  render(await MembersPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("MembersPage", (): void => {
  it("renders the directory under the route's own header copy", async (): Promise<void> => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The People Who Write It.");
  });

  it("lists every member the roster contains", async (): Promise<void> => {
    await renderPage();

    const roster: MemberDirectoryEntry[] = previewMemberDirectory();
    expect(roster.length).toBeGreaterThan(0);
    for (const member of roster) {
      expect(screen.getByText(member.name), member.bioguideId).toBeInTheDocument();
    }
  });

  it("labels a preview roster rather than presenting fixtures as currently-seated members", async (): Promise<void> => {
    await renderPage();

    expect(screen.getByText("Preview Data")).toBeInTheDocument();
  });

  it("arrives already narrowed to the view a shared ?q= link asked for", async (): Promise<void> => {
    await renderPage({ q: "alvarez" });

    expect(screen.getByRole("searchbox", { name: /Search members/ })).toHaveValue("alvarez");
  });

  it("honors a ?state= link naming a jurisdiction the roster actually contains", async (): Promise<void> => {
    const roster: MemberDirectoryEntry[] = previewMemberDirectory();
    const state: string | undefined = roster[0]?.state;
    expect(state).toBeDefined();

    await renderPage({ state });

    expect(screen.getByRole("combobox", { name: /place|state|jurisdiction/i })).toHaveValue(state);
  });

  it("opens the full directory for a ?state= naming a place nobody in the roster represents", async (): Promise<void> => {
    await renderPage({ state: "Atlantis" });

    // Not an empty grid claiming to be filtered: a shared link is exactly the kind of URL that gets opened a year
    // later against a roster that has since changed.
    for (const member of previewMemberDirectory()) {
      expect(screen.getByText(member.name), member.bioguideId).toBeInTheDocument();
    }
  });

  it("falls back to the default view for a chamber, party, or sort param naming nothing", async (): Promise<void> => {
    await renderPage({ chamber: "starfleet", party: "whig", sort: "sideways" });

    for (const member of previewMemberDirectory()) {
      expect(screen.getByText(member.name), member.bioguideId).toBeInTheDocument();
    }
  });

  it("names itself and its canonical path", (): void => {
    expect(metadata.title).toBe("Members");
    expect(metadata.alternates?.canonical).toBe("/members");
  });
});
