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

`pnpm dev` is the loop you work in. `pnpm preview` builds and serves the _production_ output on port 3001 — a different
port on purpose, so it can run beside a dev server rather than fighting it for 3000. Reach for it when the thing you
changed behaves differently once built: ISR and `revalidate`, the analytics gate, route segment caching, bundle size,
or anything the dev overlay sits on top of. It is also what `pnpm build` succeeding does _not_ tell you, which is
whether the built app is any good to look at.

Both are declared in `.claude/launch.json`, which is checked in for the same reason `.nvmrc` is: how to run this app is
a fact about the project, not about one person's machine. An agent or editor that reads that file starts the right
server on the right port instead of guessing. Its neighbor `.claude/settings.local.json` is machine-local and
gitignored. Add a configuration there whenever a new way to run the app becomes worth naming; leave personal settings
out of it.

`pnpm test:coverage` shows what the suite actually reaches, and `pnpm check` above runs it — the thresholds exist only
inside the coverage pass, so a `check` running the bare suite would leave them stated and unenforced. Statements,
branches, functions, and lines are all at 100%, and `vitest.config.mts` sets all four thresholds there, so dropping
below it fails the build. Only test data, test infrastructure, and declarative files are excluded outright — the preview
fixtures, the shared helpers in `src/test/`, and the Drizzle schema.

Treat the report as a way to find untested code rather than a number to defend. Coverage says a line ran, not that it
was checked: a `0%` row on a module with real branches is the useful signal, and a green 100 says nothing about whether
the assertions beneath it are worth anything.

The one case for reaching past a test is a guard no input can reach — an `arr[i] ?? fallback` over an index a loop bound
has already proven valid, or a handler guarding against state its own render condition excludes. Testing those means
fabricating a value the app cannot produce, which pins the guard rather than the behavior. Mark them at the line with a
`/* v8 ignore start */` … `/* v8 ignore stop */` pair and a stated reason, so the exclusion is visible in the diff that
adds it. If a branch is reachable at all, write the test instead — and note that `v8 ignore next` is the wrong tool
here: this project's coverage provider only honors the hint when the comment _begins_ with it, and it ignores the count
in `next 2`.

Two kinds of code are worth testing directly even when a component test already drags them over the line:

- **Anything that races.** Debouncing, aborting, out-of-order responses, and reconciling state against the address bar
  all keep working by accident until they don't, and statement coverage through a component says nothing about whether
  the guard still holds. See `use-bill-search.test.ts` and `use-directory-url-sync.test.ts`.
- **Wording a reader is shown.** Display helpers live in the model (`congress/members/model.ts`,
  `congress/committees/model.ts`) specifically so the sentence a page prints can be asserted here rather than only
  reached by rendering a route.

**An unexpected `console.error` or `console.warn` fails the test that provoked it.** The guard is in `vitest.setup.ts`.
Warnings such as a React duplicate-key collision don't throw, and Vitest only prints a passing test's output to a TTY,
so without the guard they'd pass silently in CI. The app's own `[civic-ledger] …` lines pass through, since the
"degrades rather than crashes" suites write them on purpose. A test that _means_ to provoke a log line spies on the
method — `vi.spyOn(console, "warn").mockImplementation(() => {})` — which replaces the guard for that test. If a test
trips the guard, ask whether the warning is real, not how to silence it.

**Every test runs at the same instant.** `vitest.setup.ts` freezes `Date` at a moment inside the 119th Congress — the
one the preview fixtures model — so `getCurrentCongress()` and every default derived from it give the same answer on any
day the suite runs, including after a new Congress convenes. Timers stay real. A test that needs a different "now" calls
`vi.setSystemTime` itself; one that needs a specific Congress passes it explicitly rather than doing arithmetic on the
clock. E2E specs run against the dev server's real clock, so they reach fixture bills through `FIXTURE_CONGRESS_BILLS`
in `tests/e2e/routes.ts` rather than through `/bills`.

**Every test starts with no Congress.gov key and cleans up after itself.** `vitest.setup.ts` unsets `CONGRESS_API_KEY`
before each test, whatever your shell exports, and undoes every `vi.stubEnv`, `vi.stubGlobal`, and `vi.spyOn` after it.
So a suite that wants the live path stubs a key with `vi.stubEnv` and moves on. It doesn't assign to `process.env`, save
an original, or restore anything by hand. A suite that drives the adapter through a fake `fetch` takes `jsonResponse`
and `requestedUrl` from `src/test/congress-api.ts` instead of declaring its own.

## Where Documentation Goes

Documentation has **one home per fact**, chosen by audience rather than topic. The routing table and the style rules
live in [docs/README.md](docs/README.md); anything a contributor does or must not do belongs in this file. The default
home is a code comment beside the code it explains, saying why that code is the way it is now, as briefly as the reason
allows.

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
- **No DOM-based HTML sanitizer.** `src/lib/congress/bills/sanitize-summary.ts` is hand-written because the input
  shape is narrow and well understood. This is a bounded position, not a permanent one: it expires the moment this app
  renders markup from a less predictable source than Congress.gov.
- **`date-fns` earns its place on one job.** `DataSourceNotice`'s "Updated 5 minutes ago" line, via
  `formatDistanceToNow`. Bill and member dates stay on native `Intl.DateTimeFormat` in `src/lib/format.ts`, which
  already handles a subtle UTC rollback bug in Congress.gov's date-only strings correctly.
- **`@axe-core/playwright` is the accessibility baseline's enforcement point.** It overlaps nothing else here: Biome
  lints source text, Vitest renders into jsdom — which has no layout and no computed colors, so it cannot see a
  contrast failure at all — and Playwright on its own drives behavior without judging markup. This is the only check
  that reads a rendered page, which is what makes it the only one that can catch a token that fails contrast, a control
  inheriting user-agent chrome, or an `aria-labelledby` pointing at nothing. It adds one dependency and no build step,
  and runs inside the Playwright job that already exists. It covers only the machine-checkable half of WCAG — see the
  header of `tests/e2e/accessibility.spec.ts` for what stays with review.
- **No Storybook yet.** Add it when the component inventory justifies it.
- **`@types/node` is held at the Node major this project runs.** Its major version _is_ a Node version — 24.x describes
  Node 24, 26.x describes Node 26 — so it is the one dependency here where "update to latest" is the wrong instinct.
  `.nvmrc` and `engines` name Node 26, CI runs Node 26, and typings from a later major would declare APIs that runtime
  does not have: the code compiles, `pnpm check` passes, and the call is simply missing when it runs. The caret range in
  `package.json` and an `ignore` entry in `.github/dependabot.yml` both hold that ceiling, and `pnpm outdated` will keep
  reporting a newer "Latest" because of it. Move it when `.nvmrc` and `engines` move, in the same change.

## Code Conventions

- Biome is the formatter and linter; `lineWidth` is 120 and applies to prose in Markdown too. `pnpm lint` is the check
  and `pnpm format` is its fix — the latter runs `biome check --write`, not `biome format --write`, so it applies
  everything `pnpm lint` can fail on rather than only the whitespace half of it.
- Prefer a doc comment that explains _why_ over one that restates the signature. The comment density in
  `src/lib/congress/` is the house style.
- Each comment takes the form its context calls for. JSDoc (`/** */`) documents one declaration; a note covering a group
  of declarations is a `//` line above them, and test blocks, hooks, and `useEffect` calls take `/* */`. `@see` is a
  block tag on its own line after every other tag. Mid-sentence, write `(see {@link X})`, and outside JSDoc write plain
  "see".
- Outside tests, name an object shape that's used more than once or has more than one field. Every component's props get
  a `type XProps` directly above it, with a doc comment on each field, and its JSDoc says
  `@param props - {@link XProps}.` rather than documenting the destructured fields, which TypeScript hovers don't show.
  The same goes for a function taking one options object: link its named type rather than listing its fields.
- A module that grows past a few concerns groups its declarations by subject under one-line `//` headings
  (`bills/model.ts`, `upstream/http.ts`, the `filter.ts` pair), with each section's main type or entry point first and
  its helpers after it. Parallel modules use parallel headings, so the member and committee filters read the same way.
- Name the enforcement point when you state a rule — the constant, the guard, the test. A rule with no named enforcement
  point is a wish.
- Pure, isomorphic modules (`*/filter.ts`, `bills/search.ts`, `members/seating.ts`, `format.ts`) must not import
  anything server-side. A client component has to be able to import them without dragging the adapter, and the API key
  it reads, into the browser bundle.
- Import with the `@/` alias, never a relative path. It is what let the adapter and the component tree be regrouped
  into folders without touching a single import statement, and it keeps a module's imports readable in a diff that
  doesn't say which directory the file is in. The grouping — Node builtins, then packages, a blank line, then this
  app's own modules — is enforced by `biome.jsonc`'s `organizeImports` assist, so `pnpm lint` reports a run-together
  block and `pnpm format` fixes it.
- A new file goes in the folder named for its _subject_, not for whoever calls it — `src/components/bills/` for
  anything that draws a bill, `src/lib/congress/members/` for anything that knows what a member is. Two exceptions,
  both stated in [Architecture](docs/architecture.md): `src/components/ui/` is for pieces that could render a record
  type they have never heard of, and `src/lib/congress/upstream/` is for the modules that talk to Congress.gov itself.
- Inside `src/lib/congress/<record type>/`, `model.ts` is the pure one — shapes, vocabulary, and display helpers, with
  no I/O. Anything that fetches belongs beside it under its own name, not inside it.
- A component file is named for the single component it exports, so `BillCard` is findable at `bills/bill-card.tsx`
  from the name alone. The adapter's modules export many things and are named for their responsibility instead.
- **A new environment variable is declared in `env.d.ts` before it can be read.** `noPropertyAccessFromIndexSignature`
  in `tsconfig.json` is the enforcement point: without a declaration, `process.env.WHATEVER` no longer compiles, so a
  misspelled name fails `pnpm typecheck` instead of evaluating to `undefined` — which every read in this app has a
  graceful, silent answer for. Document the variable in `.env.example` too if a contributor is ever expected to set it,
  and in [Deployment](docs/deployment.md) if a deployment is.
