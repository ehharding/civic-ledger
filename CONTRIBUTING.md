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

Run `pnpm test:e2e` when changing navigation, forms, or layout behavior. Every data adapter change should include a
fixture or unit test for the upstream shape it supports.

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

Documentation scales here by having **one home per fact**, chosen by audience rather than topic:

| If it is…                                               | It belongs in…                               |
|---------------------------------------------------------|----------------------------------------------|
| Why *this line of code* is the way it is                | A doc comment on that code                   |
| A rule spanning modules, or a boundary between them     | [docs/architecture.md](docs/architecture.md) |
| A claim or refusal about the data a reader sees         | [docs/data-policy.md](docs/data-policy.md)   |
| Something an operator does to ship or configure the app | [docs/deployment.md](docs/deployment.md)     |
| Something a contributor does or must not do             | This file                                    |
| Not built yet, and gated on something                   | [docs/roadmap.md](docs/roadmap.md)           |
| How to run this thing at all                            | [README.md](README.md)                       |

**The default is the code comment.** The documents above exist for reasoning that spans files, constrains the product,
or has to be found by someone who is not already reading the relevant module. Reasoning about one function, one
component, or one CSS rule belongs beside it — read at the moment it is needed, and going stale visibly rather than
quietly.

This project deliberately has no running decision log. One existed, reached 36 entries, and most of them turned out to
be either already stated (better) in the code they described, or genuinely cross-cutting rules nobody would find in a
file ordered by when things were decided. If a decision is worth recording and fits none of the rows above, that is a
strong signal it is a code comment. See [docs/README.md](docs/README.md) for the documentation style rules.

## Tooling Stays Small

TypeScript, Biome, Vitest, Playwright, Drizzle, and GitHub Actions cover correctness, browser behavior, database
evolution, and CI without a pile of overlapping abstractions. Adding a dependency is a real decision here, not a
default — a few current positions, so they don't have to be relitigated per pull request:

- **No Tailwind.** There is no Tailwind installation at all: no config, no PostCSS setup, just handwritten CSS split
  across `src/styles/` and imported from `globals.css`, built on custom-property design tokens throughout. Adding it now
  would mean rewriting every component's `className` from scratch. When `@tailwindcss/typography`'s job was genuinely
  needed — `.summary-body` (injected CRS summary HTML) and `.text-version-list` had no rules, so the sitewide reset made
  paragraphs run together and links invisible — it was done by hand on the same tokens as everything else.
- **No DOM-based HTML sanitizer.** `src/lib/congress/sanitize-summary.ts` is hand-written because the input shape is
  narrow and well understood. This is a bounded position, not a permanent one: it expires the moment this app renders
  markup from a less predictable source than Congress.gov.
- **`date-fns` earns its place on one job.** `DataSourceNotice`'s "Updated 5 minutes ago" line, via
  `formatDistanceToNow`. Bill and member dates stay on native `Intl.DateTimeFormat` in `src/lib/format.ts`, which
  already handles a subtle UTC rollback bug in Congress.gov's date-only strings correctly.
- **No Storybook yet.** Add it when the component inventory justifies it.

### TypeScript Stays on the 6.x (Classic) Line

TypeScript 7 ships a native, Go-based compiler under the standard `typescript` package name, but it does not yet expose
the JS compiler API that Next.js's build-time type-check calls into. Installing it as `typescript` currently makes
`next build` misreport TypeScript as missing and crash.

`typescript` is pinned to `^6.0.3` — the last classic release — and `.github/dependabot.yml` is configured to ignore
`>=7.0.0` bumps for the same reason. Revisit both together.

**The gate is a file, not a bug report.** Next's `verify-typescript-setup` resolves `typescript/lib/typescript.js` to
decide whether TypeScript is installed at all. The 6.x tarball ships that entry point and the 7.x tarball does not,
which is the whole failure — so the check that actually settles this takes one command, and does not depend on anyone
triaging an issue:

```bash
npm pack typescript@latest --dry-run --json | grep 'lib/typescript.js'
```

Empty output means the pin still stands. The pin lifts when that prints a path, or when Next.js stops resolving it —
whichever happens first.

[next.js#95400](https://github.com/vercel/next.js/issues/95400) is the upstream report and is worth reading for the
detail, but note that it was **auto-closed for a missing reproduction link, not fixed**. Its closed state is not
evidence the incompatibility is resolved; the command above is.

## Code Conventions

- Biome is the formatter and linter; `lineWidth` is 120 and applies to prose in Markdown too.
- Prefer a doc comment that explains *why* over one that restates the signature. The comment density in
  `src/lib/congress/` is the house style.
- Name the enforcement point when you state a rule — the constant, the guard, the test. A rule with no named enforcement
  point is a wish.
- Pure, isomorphic modules (`*-filter.ts`, `search.ts`, `seating.ts`, `format.ts`) must not import anything server-side.
  A client component has to be able to import them without dragging the adapter, and the API key it reads, into the
  browser bundle.
