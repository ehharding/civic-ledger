# Civic Ledger Architecture

## Goal

Give people a fast, plain-English path into congressional records while preserving primary-source provenance and leaving
room for editorial learning content.

```mermaid
flowchart LR
    V[Visitor] --> N[Next.js App Router]
    N --> P[Server-Rendered Routes]
    N --> R[Route Handlers]
    P --> C[Congress Client Adapter]
    C --> A[Congress.gov API v3]
    C --> F[Clearly Marked Preview Fixtures]
    P --> U[UI Components]
    U --> O[Official Congress.gov Links]
    N --> D[(PostgreSQL/Drizzle)]
    J[Scheduled Refresh Job] --> A
    J --> D
    D --> N
```

## Boundaries

| Layer                         | Responsibility                                  | Rule                                                              |
|-------------------------------|-------------------------------------------------|-------------------------------------------------------------------|
| `src/app`                     | Routes, metadata, route handlers                | Never expose the government API key.                              |
| `src/components`              | Presentation and small user interactions        | Preserve visible preview/live provenance.                         |
| `src/hooks`                   | Client-side async behavior extracted from views | Depend only on isomorphic modules, never on the server adapter.   |
| `src/db`                      | User-owned data and future normalized snapshots | Do not claim it is the source of truth for congressional records. |
| `src/lib/api-query.ts`        | Validation of this app's own query params       | Parse, don't trust; every input resolves to a usable value.       |
| `src/lib/congress`            | Fetch, normalize, cache, and classify API data  | Treat upstream fields as untrusted and maintain one stable model. |
| `src/lib/congress/seating.ts` | Chart geometry only                             | Stay free of React and of any Congress.gov concern.               |
| `src/lib/glossary.ts`         | Curated editorial learning content              | Cite sources once lessons become long-form.                       |

### Inside the Congress Adapter

`src/lib/congress/client.ts` is a barrel, not an implementation: it re-exports the adapter's public surface so routes,
components, and tests import one stable path while the internals stay free to move.

| Module           | Responsibility                                                              |
|------------------|-----------------------------------------------------------------------------|
| `api-schema.ts`  | Zod shapes for Congress.gov v3 payloads — the untrusted-input boundary.     |
| `http.ts`        | Key access, URL building, caching policy, one request helper, route guards. |
| `mappers.ts`     | Upstream shapes into this app's stable model. Pure; performs no I/O.        |
| `bills.ts`       | Bill snapshots, pagination, lookup, summaries, text versions, search.       |
| `composition.ts` | Chamber membership, including the member list's pagination.                 |
| `client.ts`      | Public surface. Re-exports only.                                            |

Two invariants hold across every exported read:

1. **Nothing throws.** Upstream failure is an expected condition, not an exception — a page degrades to clearly labeled
   preview data, never to an error boundary.
2. **Provenance travels with the data.** Anything that can come from either live or preview data reports which it was,
   on the same returned value, so no caller can render one while claiming the other.

Payloads are validated at runtime rather than cast. Schemas are loose objects whose fields each `.catch(undefined)`, so
an unexpected field type degrades that one field — which the mappers already handle — instead of discarding a whole
page. Only a payload that isn't an object at all is rejected outright.

## Runtime Data Flow

1. A Next.js server route calls `getCongressSnapshot` (current Congress) or `getCongressSnapshotForCongress` (any other
   Congress `/bills/[congress]` supports — see `src/lib/congress/congress-history.ts` for the supported range). The
   former is a thin wrapper around the latter, so both share one fetch and one fallback policy. The home route
   additionally calls `getCongressComposition` for the chamber diagram, concurrently rather than in sequence; the two
   datasets carry independent provenance and fall back independently.
2. If a server-only key exists, the adapter requests `https://api.congress.gov/v3/bill/{congress}?format=json` and lets
   Next cache the result for five minutes.
3. The adapter maps only known fields into `LegislativeBill`, which keeps the rest of the app insulated from upstream
   changes.
4. If no key exists or the request fails, the app renders transparent preview data instead of a broken dashboard.
5. A user can always leave for the official record from a bill page, and from any seat in the chamber diagram to that
   member's entry in the Biographical Directory.

Membership follows the same path with one wrinkle: `/v3/member/congress/{congress}` is paginated at the API's 250-record
ceiling, so `getCongressComposition` (in `composition.ts`) reads `pagination.count` from the first page and then
requests the remainder in parallel. Chart geometry is computed separately, in a pure module
(`src/lib/congress/seating.ts`) that knows nothing about Congress.gov — see "The Chamber Diagram Is a Schematic" in
`docs/decisions.md`.

## Persistence Plan

The draft includes only the tables needed for a future "saved bill" experience. When a database is provisioned, add:

- `congressional_records`: normalized upstream records with `source_updated_at`, `fetched_at`, raw-response hash, and
  provider URL.
- `record_events`: append-only action/timeline data.
- `sync_runs`: data freshness, error, and quota observability.
- `saved_bills`: already sketched for authenticated user collections.

Start with on-demand reads plus cache. Move to scheduled, incremental synchronization after usage requires reliable
history, notification delivery, or more than a few API-facing features.

## Deployment

- **App:** Vercel or any Node-capable platform running Next.js 16.
- **Database:** managed PostgreSQL (Neon is a natural fit) when user-owned persistence begins.
- **Jobs:** Vercel Cron plus a durable queue/workflow provider only when syncs or notifications become multistep.
- **Observability:** add structured logs, Sentry, and OpenTelemetry before public launch.
- **Secrets:** deployment environment variables only; never commit `.env.local`.

## Security and Accessibility Baseline

- API key stays server-side and is excluded from Git. It is read only through `getCongressApiKey()`, which treats an
  empty or whitespace-only value as absent rather than sending a blank key upstream.
- Every dynamic path segment is validated against a closed format before it reaches an outbound Congress.gov URL
  (`normalizeBillRouteParams`), and this app's own query params are parsed rather than coerced (`src/lib/api-query.ts`).
- Upstream payloads are validated at runtime, not cast.
- No political-affiliation targeting or persuasion logic belongs in the product.
- Components retain keyboard focus styles, semantic landmarks, accessible form labels, contrast-conscious colors, and
  real links.
- Nothing is reachable by pointer alone. The chamber diagram in particular is fully keyboard-operable (one tab stop plus
  a roving tabindex across seats) and names every seat for assistive technology, so it reads as a list of members rather
  than an unlabeled picture. Party color is never the only carrier of meaning — each seat states its party in its
  accessible name and the legend spells out every party and count in text.
- Preview/fallback content is visibly labeled to avoid accidental misinformation.
