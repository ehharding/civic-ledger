/**
 * Covers sanitizeSummaryHtml's security-relevant behavior: allowed structural tags pass through untouched, everything
 * else is stripped (including any wrapping needed to neutralize script content), all attributes except a validated
 * `href` on `<a>` are dropped, and unsafe link schemes never survive.
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
    // See BillEndpoint.md: "The HTML codes may not be valid" — e.g., an empty <ul><ul></ul></ul>.
    expect(sanitizeSummaryHtml("<ul><ul> </ul></ul>")).toBe("<ul><ul> </ul></ul>");
  });

  it("leaves plain text with no markup untouched", (): void => {
    expect(sanitizeSummaryHtml("No markup here.")).toBe("No markup here.");
  });
});

describe("HTML comments", (): void => {
  it("strips comments entirely, including whatever they wrap", (): void => {
    expect(sanitizeSummaryHtml("<p>Before</p><!-- <script>alert(1)</script> --><p>After</p>")).toBe(
      "<p>Before</p><p>After</p>",
    );
  });

  it("strips an unterminated comment rather than leaving it in the output", (): void => {
    expect(sanitizeSummaryHtml("<p>Kept</p><!-- never closed")).toBe("<p>Kept</p>");
  });
});

/**
 * Regression tests for the overlapping-tag bypass class.
 *
 * These are the payloads that defeat a sanitizer which *patches* its input with a single `.replace()`, letting any text
 * the tag pattern doesn't match through untouched: stripping an inner tag splices the leftover fragments on either side
 * of it into a *new*, live tag, so sanitizing the input is what creates the payload. @see sanitizeSummaryHtml, which
 * builds its output instead.
 *
 * The property each of these asserts is the same one, and it is deliberately stated as "no raw `<` followed by a
 * letter" rather than as an exact output string: what matters is that nothing reaches the browser as markup, not the
 * particular escaping used to achieve that.
 */
describe("overlapping and malformed tags", (): void => {
  /** Whether a fragment contains anything a browser would parse as an element. */
  function containsLiveTag(fragment: string): boolean {
    return /<\s*\/?\s*[a-zA-Z]/.test(fragment);
  }

  it.each([
    [
      "an <img> spliced together from the fragments around a stripped one",
      "<i<img src=x onerror=alert(1)>mg src=x onerror=alert(1)>",
    ],
    ["a script tag wrapped around another script tag", "<<script>script>alert(1)<</script>/script>"],
    ["a script tag split across another one", "<scr<script>ipt>alert(1)</scr</script>ipt>"],
    ["an iframe whose attribute value contains a tag", '<iframe srcdoc="<script>alert(1)</script>">'],
    ["a stray opening bracket before a disallowed tag", "<<img src=x onerror=alert(1)>"],
  ])("emits no live element for %s", (_name: string, payload: string): void => {
    expect(containsLiveTag(sanitizeSummaryHtml(payload))).toBe(false);
  });

  /*
   * `<svg/onload=…>` separates its name from its attributes with a slash rather than whitespace. The tag pattern used
   * to require whitespace, so this matched nothing at all and was forwarded verbatim — an event handler that never met
   * the allow-list on its way to the page.
   */
  it("strips a tag that separates its attributes with a slash instead of whitespace", (): void => {
    expect(sanitizeSummaryHtml("<svg/onload=alert(1)>")).toBe("");
    expect(sanitizeSummaryHtml("<p>Kept</p><svg/onload=alert(1)>")).toBe("<p>Kept</p>");
  });

  it("renders an unmatched angle bracket as visible text rather than forwarding it", (): void => {
    expect(sanitizeSummaryHtml("5 < 6 and 7 > 6")).toBe("5 &lt; 6 and 7 &gt; 6");
  });

  /*
   * The ampersand is left alone on purpose: CRS summaries carry real entities, and escaping it would turn every
   * "AT&amp;T" into a visible "AT&amp;amp;T".
   */
  it("leaves existing entities intact rather than double-escaping them", (): void => {
    expect(sanitizeSummaryHtml("<p>AT&amp;T and R&amp;D</p>")).toBe("<p>AT&amp;T and R&amp;D</p>");
  });

  /*
   * A single-quoted href can carry a double quote, which would otherwise close the double-quoted attribute this
   * re-emits and let everything after it become new attributes.
   */
  it("contains a double quote smuggled through a single-quoted href", (): void => {
    const out: string = sanitizeSummaryHtml(`<a href='https://evil.test" onmouseover=alert(1)'>x</a>`);

    expect(out).toContain("&quot;");
    expect(out).not.toMatch(/"\s+onmouseover/);
  });
});
