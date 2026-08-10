# Contributing

## Working Agreement

These are the rules the codebase is written to keep. [docs/data-policy.md](docs/data-policy.md) is the long form; this
is the checklist.

- Treat Congress.gov as the primary source and preserve source links.
- Do not commit secrets, raw API-key URLs, or user data.
- Do not introduce a status label that can be mistaken for an official legal determination.
- Keep preview and demo data visibly marked and fictional.
- Do not add vote ratings, effectiveness scores, ideological placement, or any other editorial judgment about a member
  or a bill. Clarity and provenance are the product; persuasion is not.
- Do not infer data the API does not publish. A plausible-looking fabrication is worse here than an absence, because a
  reader cannot tell them apart.

## Before Opening a Pull Request

```bash
pnpm check
```

```bash
pnpm build
```

Run `pnpm test:e2e` when changing navigation, forms, or layout behavior — and when changing a color, a design token, or
anything a control inherits from the user agent, because `tests/e2e/accessibility.spec.ts` runs there and is the only
check that reads the page as a browser paints it. Every data adapter change should include a fixture or unit test for
the upstream shape it supports.

`pnpm dev` is the loop you work in. `pnpm preview` builds and serves the *production* output on port 3001 — a different
port on purpose, so it can run beside a dev server rather than fighting it for 3000. Reach for it when the thing you
changed behaves differently once built: ISR and `revalidate`, the analytics gate, route segment caching, bundle size,
or anything the dev overlay sits on top of. It is also what `pnpm build` succeeding does *not* tell you, which is
whether the built app is any good to look at.

Both are declared in `.claude/launch.json`, which is checked in for the same reason `.nvmrc` is: how to run this app is
a fact about the project, not about one person's machine. An agent or editor that reads that file starts the right
server on the right port instead of guessing. Its neighbor `.claude/settings.local.json` is machine-local and
gitignored. Add a configuration there whenever a new way to run the app becomes worth naming; leave personal settings
out of it.

`pnpm test:coverage` shows what the suite actually reaches. Statements, branches, functions, and lines are all at 100%,
and `vitest.config.mts` sets all four thresholds there, so dropping below it fails the build. Only test data, test
infrastructure, and declarative files are excluded outright — the preview fixtures, the shared helpers in `src/test/`,
and the Drizzle schema.

Treat the report as a way to find untested code rather than a number to defend. Coverage says a line ran, not that it
was checked: a `0%` row on a module with real branches is the useful signal, and a green 100 says nothing about whether
the assertions beneath it are worth anything.

The one case for reaching past a test is a guard no input can reach — an `arr[i] ?? fallback` over an index a loop bound
has already proven valid, or a handler guarding against state its own render condition excludes. Testing those means
fabricating a value the app cannot produce, which pins the guard rather than the behavior. Mark them at the line with a
`/* v8 ignore start */` … `/* v8 ignore stop */` pair and a stated reason, so the exclusion is visible in the diff that
adds it. If a branch is reachable at all, write the test instead — and note that `v8 ignore next` is the wrong tool
here: this project's coverage provider only honors the hint when the comment *begins* with it, and it ignores the count
in `next 2`.

Two kinds of code are worth testing directly even when a component test already drags them over the line:

- **Anything that races.** Debouncing, aborting, out-of-order responses, and reconciling state against the address bar
  all keep working by accident until they don't, and statement coverage through a component says nothing about whether
  the guard still holds. @see `use-bill-search.test.ts` and `use-directory-url-sync.test.ts`.
- **Wording a reader is shown.** Display helpers live in the model (`members.ts`, `committees.ts`) specifically so the
  sentence a page prints can be asserted here rather than only reached by rendering a route.

## Where Documentation Goes

Documentation scales here by having **one home per fact**, chosen by audience rather than topic. The routing table and
the style rules live in [docs/README.md](docs/README.md); anything a contributor does or must not do belongs in this
file.

**The default is the code comment.** The four documents under `docs/` exist for reasoning that spans files, constrains
the product, or has to be found by someone who is not already reading the relevant module. Reasoning about one function,
one component, or one CSS rule belongs beside it — read at the moment it is needed, and going stale visibly rather than
quietly.

Two rules follow, and both are about what a comment is *for*. A comment states why the code is the way it is, not what
it used to be: this project keeps no running decision log, and a note recording a previous shape is a note the next
reader has to check against the code before trusting it. If a decision is worth recording and fits none of the rows in
that table, that is a strong signal it is a code comment.

## Tooling Stays Small

TypeScript, Biome, Vitest, Playwright, Drizzle, and GitHub Actions cover correctness, browser behavior, database
evolution, and CI without a pile of overlapping abstractions. Adding a dependency is a real decision here, not a
default — a few current positions, so they don't have to be relitigated per pull request:

- **No Tailwind.** There is no Tailwind installation at all: no config, no PostCSS setup, just handwritten CSS split
  across `src/styles/` and imported from `globals.css`, built on custom-property design tokens throughout. Adding it
  would mean rewriting every component's `className` from scratch. Where `@tailwindcss/typography`'s job is genuinely
  needed — restoring paragraph and link styling inside `.summary-body` (injected CRS summary HTML) and
  `.text-version-list`, which the sitewide reset otherwise flattens — it is done by hand on the same tokens as
  everything else.
- **No DOM-based HTML sanitizer.** `src/lib/congress/sanitize-summary.ts` is hand-written because the input shape is
  narrow and well understood. This is a bounded position, not a permanent one: it expires the moment this app renders
  markup from a less predictable source than Congress.gov.
- **`date-fns` earns its place on one job.** `DataSourceNotice`'s "Updated 5 minutes ago" line, via
  `formatDistanceToNow`. Bill and member dates stay on native `Intl.DateTimeFormat` in `src/lib/format.ts`, which
  already handles a subtle UTC rollback bug in Congress.gov's date-only strings correctly.
- **`@axe-core/playwright` is the accessibility baseline's enforcement point.** It overlaps nothing else here: Biome
  lints source text, Vitest renders into jsdom — which has no layout and no computed colors, so it cannot see a
  contrast failure at all — and Playwright on its own drives behavior without judging markup. This is the only check
  that reads a rendered page, which is what makes it the only one that can catch a token that fails contrast, a control
  inheriting user-agent chrome, or an `aria-labelledby` pointing at nothing. It adds one dependency and no build step,
  and runs inside the Playwright job that already exists. It covers only the machine-checkable half of WCAG — @see the
  header of `tests/e2e/accessibility.spec.ts` for what stays with review.
- **No Storybook yet.** Add it when the component inventory justifies it.

## Code Conventions

- Biome is the formatter and linter; `lineWidth` is 120 and applies to prose in Markdown too.
- Prefer a doc comment that explains *why* over one that restates the signature. The comment density in
  `src/lib/congress/` is the house style.
- Name the enforcement point when you state a rule — the constant, the guard, the test. A rule with no named enforcement
  point is a wish.
- Pure, isomorphic modules (`*-filter.ts`, `search.ts`, `seating.ts`, `format.ts`) must not import anything server-side.
  A client component has to be able to import them without dragging the adapter, and the API key it reads, into the
  browser bundle.
