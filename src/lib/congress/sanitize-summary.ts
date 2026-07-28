/**
 * Tags CRS bill summaries actually use: paragraphs, emphasis, lists, line breaks, and the occasional cross-reference
 * link. Anything else is stripped. @see sanitizeSummaryHtml
 */
const ALLOWED_TAGS: Set<string> = new Set(["p", "strong", "b", "em", "i", "ul", "ol", "li", "br", "a", "span"]);

/** Matches one HTML tag (opening, closing, or self-closing) so it can be inspected and rewritten in isolation. */
const TAG_PATTERN: RegExp = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*)?)\/?>/g;

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
 * A minimal allow-list sanitizer for the small, consistent HTML that CRS bill summaries use — not a general-purpose
 * sanitizer. The Congress.gov API itself notes this markup isn't always well-formed (see the "HTML codes may not be
 * valid" caveat in BillEndpoint.md), so this works tag-by-tag with a regex rather than assuming a parseable DOM tree;
 * malformed nesting just renders a little oddly rather than breaking anything.
 *
 * Every tag not on `ALLOWED_TAGS` is dropped (its own markup is removed, but any text between an opening and closing
 * pair is kept as plain text) — this also neutralizes anything like a stray `<script>`, since without its wrapping
 * tags the browser has nothing to execute. Every attribute is dropped except `href` on `<a>`, which is kept only if
 * it's an absolute `http(s)` link (so `javascript:` and other unsafe schemes never survive) and always gets
 * `target="_blank" rel="noreferrer"` added, matching how every other outbound link in this app behaves.
 *
 * This deliberately keeps the project dependency-free (see `docs/decisions.md`'s "Tooling Intentionally Stays Small")
 * rather than pulling in a full DOM-based sanitizer for a narrow, well-understood input shape.
 *
 * @param html - The raw summary fragment as Congress.gov returned it.
 * @returns A fragment safe to render with `dangerouslySetInnerHTML`: allow-listed tags only, no attributes except a
 *   validated `href` on `<a>`, and no comments.
 */
export function sanitizeSummaryHtml(html: string): string {
  return html
    .replace(COMMENT_PATTERN, "")
    .replace(TAG_PATTERN, (_match: string, closingSlash: string, rawTag: string, attrs: string): string => {
      const tag: string = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";

      if (closingSlash) return `</${tag}>`;

      if (tag === "a") {
        const hrefMatch: RegExpExecArray | null = HREF_PATTERN.exec(attrs);
        const href: string | undefined = hrefMatch?.[1] ?? hrefMatch?.[2];
        if (!href || !/^https?:\/\//i.test(href)) return "<a>";

        const safeHref: string = href.replace(/"/g, "&quot;");
        return `<a href="${safeHref}" target="_blank" rel="noreferrer">`;
      }

      // Self-closing form (e.g., "<br/>") collapses to the same bare opening tag; void elements like <br> don't need a
      // closing tag in HTML.
      return `<${tag}>`;
    });
}
