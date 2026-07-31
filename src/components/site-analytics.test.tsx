/**
 * Covers the one rule the analytics layer has to keep: a recorded URL names a page and nothing else.
 *
 * The cases below are not hypothetical URLs — each one is a view this app itself produces and writes into the address
 * bar, which is precisely why the stripping matters. `docs/data-policy.md` says this product carries no
 * political-affiliation targeting; an analytics feed carrying `?party=republican&state=Ohio` would be the raw material
 * for exactly that, arrived at by accident rather than by anyone's decision.
 */
import { describe, expect, it } from "vitest";

import { stripQuery } from "@/components/site-analytics";

describe("stripQuery", (): void => {
  it("leaves a plain page URL alone", (): void => {
    expect(stripQuery("https://civic-ledger.example/committees")).toBe("https://civic-ledger.example/committees");
  });

  it("drops what a reader searched for", (): void => {
    expect(stripQuery("https://civic-ledger.example/bills?q=broadband")).toBe("https://civic-ledger.example/bills");
  });

  it("drops which party and state a reader narrowed the roster to", (): void => {
    expect(stripQuery("https://civic-ledger.example/members?party=republican&state=Ohio&sort=state")).toBe(
      "https://civic-ledger.example/members",
    );
  });

  it("drops the skip link's fragment, with or without a query string beside it", (): void => {
    expect(stripQuery("https://civic-ledger.example/members#main-content")).toBe(
      "https://civic-ledger.example/members",
    );
    expect(stripQuery("https://civic-ledger.example/members?q=ohio#main-content")).toBe(
      "https://civic-ledger.example/members",
    );
  });

  it("keeps the path segments that identify a record, since those are the page", (): void => {
    expect(stripQuery("https://civic-ledger.example/bills/119/hr/284")).toBe(
      "https://civic-ledger.example/bills/119/hr/284",
    );
  });

  it("returns something usable for input that is not a URL at all, rather than throwing inside the collector", (): void => {
    expect(stripQuery("")).toBe("");
    expect(stripQuery("not a url?q=secret")).toBe("not a url");
  });
});
