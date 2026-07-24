/**
 * Covers sanitizeSummaryHtml's security-relevant behavior: allowed structural tags pass through untouched,
 * everything else is stripped (including any wrapping needed to neutralize script content), all attributes except
 * a validated `href` on `<a>` are dropped, and unsafe link schemes never survive.
 */
import { describe, expect, it } from "vitest";

import { sanitizeSummaryHtml } from "@/lib/congress/sanitize-summary";

describe("sanitizeSummaryHtml", (): void => {
  it("keeps allowed structural tags as-is", (): void => {
    const html = "<p>This bill addresses <strong>postal reform</strong>.</p><ul><li>One provision.</li></ul>";

    expect(sanitizeSummaryHtml(html)).toBe(html);
  });

  it("strips a disallowed tag but keeps its inner text", (): void => {
    expect(sanitizeSummaryHtml("<p>See <h2>Section 2</h2> for details.</p>")).toBe("<p>See Section 2 for details.</p>");
  });

  it("neutralizes a script tag by stripping the tags and leaving inert text behind", (): void => {
    const result: string = sanitizeSummaryHtml('<p>Note.</p><script>alert("x")</script>');

    expect(result).not.toContain("<script");
    expect(result).not.toContain("</script>");
    expect(result).toBe('<p>Note.</p>alert("x")');
  });

  it("drops every attribute from a non-anchor tag, including event handlers", (): void => {
    expect(sanitizeSummaryHtml('<p onclick="evil()" style="color:red">Text</p>')).toBe("<p>Text</p>");
  });

  it("keeps a valid absolute http(s) href on an anchor and adds safe link attributes", (): void => {
    const result: string = sanitizeSummaryHtml('<a href="https://www.congress.gov/bill/119/hr/284">link</a>');

    expect(result).toBe('<a href="https://www.congress.gov/bill/119/hr/284" target="_blank" rel="noreferrer">link</a>');
  });

  it("drops the href (and any other attribute) for a javascript: link", (): void => {
    expect(sanitizeSummaryHtml('<a href="javascript:alert(1)">link</a>')).toBe("<a>link</a>");
  });

  it("drops the href for a relative or protocol-relative link", (): void => {
    expect(sanitizeSummaryHtml('<a href="/bill/119/hr/284">link</a>')).toBe("<a>link</a>");
    expect(sanitizeSummaryHtml('<a href="//evil.example/">link</a>')).toBe("<a>link</a>");
  });

  it("ignores an event handler attribute even when a valid href is also present", (): void => {
    const result: string = sanitizeSummaryHtml('<a href="https://example.com" onclick="evil()">link</a>');

    expect(result).toBe('<a href="https://example.com" target="_blank" rel="noreferrer">link</a>');
  });

  it("handles the self-closing <br/> form some feeds use", (): void => {
    expect(sanitizeSummaryHtml("Line one<br/>Line two<br />Line three")).toBe("Line one<br>Line two<br>Line three");
  });

  it("tolerates the malformed nested-list markup the upstream API is known to emit", (): void => {
    // See BillEndpoint.md: "The HTML codes may not be valid" — e.g. an empty <ul><ul></ul></ul>.
    expect(sanitizeSummaryHtml("<ul><ul> </ul></ul>")).toBe("<ul><ul> </ul></ul>");
  });

  it("leaves plain text with no markup untouched", (): void => {
    expect(sanitizeSummaryHtml("No markup here.")).toBe("No markup here.");
  });
});
