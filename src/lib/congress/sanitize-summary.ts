/**
 * Tags CRS bill summaries actually use: paragraphs, emphasis, lists, line breaks, and the occasional cross-reference
 * link. Anything else is stripped. @see sanitizeSummaryHtml
 */
const ALLOWED_TAGS: Set<string> = new Set(["p", "strong", "b", "em", "i", "ul", "ol", "li", "br", "a", "span"]);

/**
 * Matches one HTML tag (opening, closing, or self-closing) so it can be inspected and rewritten in isolation.
 *
 * The separator before the attribute list is `[\s/]`, not `\s+`, because a tag can separate its name from its
 * attributes with a slash: `<svg/onload=alert(1)>` is a real element with a real event handler, and a pattern that
 * only recognized whitespace would not match it *at all* — which used to mean it bypassed the allow-list entirely and
 * was emitted verbatim.
 */
const TAG_PATTERN: RegExp = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[\s/][^<>]*)?)>/g;

/**
 * Matches an HTML comment, including an unterminated one at the end of the input.
 *
 * Comments are stripped before tags are inspected: `TAG_PATTERN` starts at a letter, so `<!-- … -->` would otherwise
 * pass through untouched and carry whatever it contains — including markup that only looks inert because it's
 * commented out — straight into the rendered fragment.
 */
const COMMENT_PATTERN: RegExp = /<!--[\s\S]*?(?:-->|$)/g;

/** Matches a double- or single-quoted `href` value inside a tag's attribute string. */
const HREF_PATTERN: RegExp = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Escapes the two characters that can begin markup, for text sitting between recognized tags.
 *
 * `&` is deliberately *not* escaped. CRS summaries genuinely contain entities (`&amp;` in "AT&T", `&nbsp;`, `&lt;`),
 * and escaping the ampersand would turn every one of them into visible literal text. An unescaped `&` cannot begin an
 * element on its own, so leaving it alone costs nothing in safety.
 *
 * @param text - A run of text that sat outside any recognized tag.
 * @returns The same text with `<` and `>` rendered inert.
 */
function escapeText(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Decides what one recognized tag becomes.
 *
 * @param closingSlash - `"/"` when this was a closing tag.
 * @param rawTag - The tag name as it was written.
 * @param attrs - The raw attribute text, which is inspected only for `<a href>`.
 * @returns The replacement markup, or an empty string for a tag that isn't allow-listed.
 */
function renderTag(closingSlash: string, rawTag: string, attrs: string): string {
  const tag: string = rawTag.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) return "";

  if (closingSlash) return `</${tag}>`;

  if (tag === "a") {
    const hrefMatch: RegExpExecArray | null = HREF_PATTERN.exec(attrs);
    const href: string | undefined = hrefMatch?.[1] ?? hrefMatch?.[2];
    if (!href || !/^https?:\/\//i.test(href)) return "<a>";

    // `&` first, so the `&quot;` produced next isn't itself re-escaped into a visible "&amp;quot;".
    const safeHref: string = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return `<a href="${safeHref}" target="_blank" rel="noreferrer">`;
  }

  // Self-closing form (e.g., "<br/>") collapses to the same bare opening tag; void elements like <br> don't need a
  // closing tag in HTML.
  return `<${tag}>`;
}

/**
 * A minimal allow-list sanitizer for the small, consistent HTML that CRS bill summaries use — not a general-purpose
 * sanitizer. The Congress.gov API itself notes this markup isn't always well-formed (see the "HTML codes may not be
 * valid" caveat in BillEndpoint.md), so this works tag-by-tag with a regex rather than assuming a parseable DOM tree;
 * malformed nesting just renders a little oddly rather than breaking anything.
 *
 * The output is assembled rather than patched, and that distinction is the whole security property. An earlier version
 * ran a single `.replace()` over the input, which meant any text the tag pattern *didn't* match — notably a `<` that
 * began no valid tag — survived into the output untouched. Overlapping tags exploited exactly that gap: the input
 * `<i<img src=x onerror=alert(1)>mg src=x onerror=alert(1)>` had its inner `<img …>` matched and stripped, and the
 * leftover `<i` and `mg src=x onerror=alert(1)>` fragments then closed up around each other into a live, executing
 * `<img onerror>`. Stripping a dangerous tag made a dangerous tag.
 *
 * So nothing passes through by default now. The input is walked once; text between recognized tags is escaped, and
 * only a recognized, allow-listed tag is re-emitted as markup. A `<` that begins no valid tag becomes `&lt;` and
 * renders as the visible character it is. There is no longer any path by which unmatched input reaches the browser as
 * markup, which is what closes the whole overlapping-tag class rather than the particular payloads that found it.
 *
 * Every tag not on `ALLOWED_TAGS` is dropped (its own markup is removed, but any text between an opening and closing
 * pair is kept as plain text). Every attribute is dropped except `href` on `<a>`, which is kept only if it's an
 * absolute `http(s)` link (so `javascript:` and other unsafe schemes never survive) and always gets
 * `target="_blank" rel="noreferrer"` added, matching how every other outbound link in this app behaves.
 *
 * This deliberately keeps the project dependency-free (see `docs/decisions.md`'s "Tooling Intentionally Stays Small")
 * rather than pulling in a full DOM-based sanitizer for a narrow, well-understood input shape. That tradeoff is worth
 * revisiting if this is ever pointed at markup from a less predictable source than Congress.gov — a hand-written
 * sanitizer is only as good as the bypasses someone has thought to test, and the tests beside this file are the
 * record of which ones have been.
 *
 * @param html - The raw summary fragment as Congress.gov returned it.
 * @returns A fragment safe to render with `dangerouslySetInnerHTML`: allow-listed tags only, no attributes except a
 *   validated `href` on `<a>`, no comments, and every other `<` escaped rather than forwarded.
 */
export function sanitizeSummaryHtml(html: string): string {
  const source: string = html.replace(COMMENT_PATTERN, "");

  let out: string = "";
  let cursor: number = 0;

  for (const match of source.matchAll(TAG_PATTERN)) {
    const at: number = match.index ?? 0;
    out += escapeText(source.slice(cursor, at));
    out += renderTag(match[1] ?? "", match[2] ?? "", match[3] ?? "");
    cursor = at + match[0].length;
  }

  return out + escapeText(source.slice(cursor));
}
