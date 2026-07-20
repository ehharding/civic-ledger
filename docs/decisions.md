# First-Draft Decisions

## A Focused Surface Before a Complete Data Warehouse

The initial product focuses on bills, their latest actions, and the legislative path. Congress.gov offers far more  
collections, but a broad clone would be difficult to understand and expensive to keep fresh. Members, committees,  
nominations, treaties, and roll-call views are future verticals.

## Server Proxy Instead of Client-Side API Calls

Congress.gov keys belong in the request URL, so exposing requests from the browser would expose the key. The server  
adapter also gives the UI one stable type and one caching policy.

## Preview Records Instead of Empty State

The visual foundation, responsive behavior, and filtering work without an API key. The UI labels this content as  
preview data, and fixture records deliberately link only to the Congress.gov home page so they cannot be confused  
with official bill pages.

## Educational Status Cues Are Not Legal Status

The API provides human-written action text. The stage classifier can orient a person, but it cannot safely replace a  
legal-status reading. The interface therefore says so and provides the official link prominently.

## PostgreSQL Is Deferred, Not Omitted

There is no value in requiring a database merely to render a public feed. The Drizzle schema establishes the first  
user-owned persistence surface, while ingestion tables wait until history, notifications, or high traffic justify a  
sync pipeline.

## TypeScript Stays on the 6.x (Classic) Line for Now

TypeScript 7 ships a native, Go-based compiler under the standard `typescript` package name, but it doesn't yet expose  
the JS compiler API that Next.js's build-time type-check calls into. Installing it as `typescript` currently makes  
`next build` misreport TypeScript as missing and crash  
(see [next.js#95400](https://github.com/vercel/next.js/issues/95400)). `typescript` is pinned to `^6.0.3` — the last  
classic release — until Next.js adds native TS7 support. Dependabot is configured to ignore `>=7.0.0` bumps for the  
same reason.

## Only One Deploy Pipeline Builds on Each Push

Vercel auto-deploys on push by default the moment a repo is imported, independent of `deploy-vercel.yml`. Left as-is,  
every push would build twice — once via the Actions workflow (gated on `pnpm check`) and once via Vercel's own Git  
integration (not gated on anything). Vercel's automatic Git deployments should stay off; `deploy-vercel.yml` is the  
single source of truth for what ships.

## Tooling Intentionally Stays Small

TypeScript, Biome, Vitest, Playwright, Drizzle, and GitHub Actions cover correctness, browser behavior, database  
evolution, and CI without a pile of overlapping abstractions. Add Storybook when the component inventory starts to  
justify it.
