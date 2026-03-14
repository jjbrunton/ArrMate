# Architecture

## Overview

ArrMate is a Next.js 16 application (App Router) that monitors Sonarr, Radarr, and Overseerr instances. It runs as a single Docker container with an embedded SQLite database.

## High-Level Data Flow

```
Scheduler (node-cron)
├── Poll Job (Arr instances, every N minutes)
│   ├── Fetch queue from Sonarr/Radarr API
│   ├── Sync queue items to local DB
│   ├── Auto-resolve issues for items that left the queue
│   ├── Run issue detection (rule engine)
│   ├── Enrich detected issues (grab history, library lookup)
│   ├── Persist issues + suggested fixes
│   └── Auto-fix (if enabled): execute highest-priority automatable fix
├── Quality Check Job (Arr instances, every N minutes; default 30 min)
│   ├── Fetch cutoff-unmet items from Sonarr/Radarr
│   ├── Select items whose latest known search time is older than 24 hours
│   └── Order and queue upgrade searches using the instance-configured strategy and batch size
├── Request Sync Job (Overseerr instances, every N minutes)
│   ├── Fetch requests from Overseerr
│   ├── Resolve movie/series titles from the Overseerr media endpoints
│   └── Persist request status + requester metadata locally
└── Health Check Job (per instance, every 5 min)
    └── Test API connection for the current instance type, update health status
```

## Key Layers

### API Layer (`src/app/api/`)
Next.js route handlers. Thin — validates input, calls services, returns responses. Uses Zod v4 for request validation.
All API routes except `POST /api/auth/setup`, `POST /api/auth/login`, and `POST /api/auth/logout` are wrapped with `withApiAuth(...)`, which enforces a valid authenticated session and same-origin checks on mutating requests. Protected API routes return onboarding-required errors until the first administrator account exists.

### App Shell (`src/app/layout.tsx`, `src/components/layout/`)
Persistent sidebar navigation with page-owned headers. The shared layout provides chrome and spacing, while each route renders its own single compact header row so page context, counts, and actions are presented once instead of being duplicated by the shell.
The `/login` and `/onboarding` routes are public and render without the application sidebar. First launch redirects unauthenticated traffic to `/onboarding` until the administrator account is created. All dashboard pages perform a server-side session check before rendering their client-side content.

### Services Layer (`src/lib/services/`)
All database access goes through services. Main services:
- **instance-service** — CRUD for all instance types, connection verification
- **queue-service** — Sync and query queue items
- **issue-service** — Issue lifecycle (persist, dismiss, resolve), audit log, dashboard stats
- **media-cache-service** — Cache and query library data (movies, series, episodes). Media sync preserves persisted quality snapshot fields so rebuilding the cache does not temporarily reset the quality page.
- **request-service** — Sync and query imported Overseerr requests plus local request summary stats
- **update-service** — Reads the running app build metadata, checks the configured GitHub repository's latest release, caches release-note lookups in-memory, and exposes update/changelog status to the authenticated UI
- **auth-service** — First-run onboarding state, persisted admin credential verification, account profile lookup, password rotation, brute-force throttling, and server-side session issue/revoke flows

### Instance Type Registry (`src/lib/instances/`)
Instance metadata lives in a small registry that defines which capabilities each type supports (queue polling, quality checks, media sync, request sync, auto-fix). API routes, forms, dashboard cards, and instance detail pages consult this registry so adding a new type does not require scattering fresh type checks across the codebase.

### Shared Utilities (`src/lib/utils/`)
- **parse-status-messages** — Parses the JSON status messages from Sonarr/Radarr queue items. Used by all issue detection rules and the queue table component.
- **api-response** — Standardized JSON response helpers for API routes.
- **logger** — Structured logging via pino.
- **cn** — Tailwind CSS class merging utility.

### App Metadata (`src/lib/app/`)
Small server-side helpers that expose build metadata such as the running ArrMate version, commit SHA, and the GitHub repository used for release-note lookups. Docker builds inject these values when available, while local development falls back to `package.json`.

### Fix Execution (`src/lib/issues/fix-executor.ts`)
Centralizes the logic for executing fixes against the Arr API, recording results, and writing audit logs. Used by:
- `POST /api/issues/[id]/fix` (single fix, user-triggered)
- `POST /api/issues/accept-all` (batch fix, user-triggered)
- `poll-queue.ts` auto-fix (automation-triggered)

Successful import-targeting fixes (`force_import`, `select_movie_import`) no longer invalidate the full cached media library snapshot. ArrMate keeps the last successful media-sync totals visible and lets the next scheduled media sync reconcile any individual title changes.

### Issue Detection (`src/lib/issues/`)
Rule-based engine. Each rule analyzes a queue item and returns a detected issue or null. Rules are prioritized — highest priority match wins (one issue per item). See [Issue Detection](./issue-detection.md).

### ArrClient (`src/lib/arr-client/`)
HTTP client wrapping Sonarr/Radarr v3 API. Handles pagination, timeouts, and error classification (ArrApiError vs ArrConnectionError).

### OverseerrClient (`src/lib/overseerr-client/`)
HTTP client wrapping the Overseerr v1 API for health checks, request pagination, and media-title lookups used during local request imports.

### Scheduler (`src/lib/scheduler/`)
Initialized via Next.js `instrumentation.ts` on server startup. Uses node-cron v4 to schedule capability-specific jobs per enabled instance. Arr instances get poll, quality-check, health-check, and media-sync jobs. Overseerr instances get request-sync and health-check jobs. When a brand-new instance is created through onboarding or `POST /api/instances`, the scheduler registers its cron tasks immediately and also primes each supported job once right away so dashboards populate without waiting for the first cron boundary; process startup still only registers steady-state schedules and does not re-prime every existing instance after a restart. The quality check job runs on an Arr instance-specific cadence (`quality_check_interval_seconds`, default `1800`), fetches the full cutoff-unmet list plus quality profiles once, persists that snapshot onto the local media cache, and only queues overdue upgrade searches for items whose latest known search time is older than 24 hours. That cooldown uses the newer of Arr's `lastSearchTime` and ArrMate's locally recorded search timestamp so manual/scheduled searches are not re-sent before Arr refreshes its own metadata. Once the overdue set is known, ArrMate orders it with the per-instance `quality_check_strategy` (`oldest_search`, `random`, `year_asc`, `year_desc`, or `lowest_quality`) before trimming to the configured batch size. Manual `POST /api/instances/[id]/cutoff/search` requests and scheduled quality-check batches also share a dedicated in-memory `quality-search` lock per instance, so overlapping requests cannot both submit the same Radarr/Sonarr upgrade search before the local timestamp is recorded. Before either path submits a new upgrade search, ArrMate also checks the Arr `/command` queue and backs off when Sonarr/Radarr already has an active search command in `queued`/`started` state, including searches launched manually outside ArrMate. When ArrMate sends one of those manual or scheduled upgrade-search batches, the structured logs include the resolved movie or episode labels for each requested item so operators can see exactly what Sonarr/Radarr was asked to search for. Overseerr request sync pulls the full request list, resolves titles, and stores request status/requester metadata in local tables for dashboards. Successful manual and scheduled upgrade-search batches are also written to `audit_log` and normalized into `quality_search_items` so the quality page can show per-item `upgrades sent` counts and the latest sent timestamp without reparsing historical JSON on every request. The quality-check cadence, per-run batch size, and ordering strategy are configured on Arr instances (`quality_check_interval_seconds`, default `1800`; `quality_check_max_items`, default `50`; `quality_check_strategy`, default `oldest_search`). An in-memory job tracker (`job-tracker.ts`) prevents concurrent execution of the same job type for the same instance — duplicate polls, media syncs, health checks, quality checks, quality searches, or request syncs are skipped (scheduler) or rejected with 409 (API), while different job types may run at the same time.

### Quality Tracking (`src/lib/services/quality-service.ts`)
The quality page combines:
- Persisted cutoff snapshot fields on `cached_movies` and `cached_episodes`
- Cached library rows from `cached_movies`, `cached_series`, and `cached_episodes`
- `quality_search_items` for per-row search history and `audit_log` aggregates for batch totals plus recent batch activity with resolved item labels

The page itself does not call Arr. It reads paged local rows only, calculates summary metrics with SQL aggregates over the local cache, and joins per-row upgrade history from normalized local tables. That keeps the Media Management tab load bounded by page size instead of total library size.

### Database (`src/lib/db/`)
SQLite via Drizzle ORM + better-sqlite3. WAL mode, foreign keys enabled. Schema defined in `schema.ts`, migrations in `/drizzle`. `getDb()` applies pending Drizzle migrations before returning the shared connection, so fresh installs and upgraded databases do not depend solely on `instrumentation.ts` ordering to create new tables. See [Database Schema](./database-schema.md).
Authentication persistence uses three tables: `auth_admin` for the single persisted administrator account, `auth_sessions` for opaque session records keyed by hashed tokens, and `auth_login_attempts` for per-IP failed-login throttling.
The username and password hash are created during first-run onboarding and stored in SQLite. The session-signing secret is loaded from `AUTH_SESSION_SECRET` when provided, otherwise ArrMate generates and persists one alongside the SQLite database on first launch. The API-key encryption key follows the same persisted-secret pattern: `ENCRYPTION_KEY` is still accepted for compatibility, but if no persisted key file exists ArrMate generates one beside the SQLite database and, when an older env-provided key is available, re-encrypts stored instance API keys onto the new persisted key during startup.

### Delivery Pipeline
GitHub Actions can build and publish the production Docker image to GitHub Container Registry (GHCR). The workflow runs the full Vitest suite before publishing, emits multi-architecture (`linux/amd64`, `linux/arm64`) images so the same tags can be pulled directly onto typical x86_64 or ARM Docker hosts, injects build metadata (`APP_VERSION`, `APP_COMMIT_SHA`, `APP_RELEASE_REPOSITORY`) so the authenticated UI can compare the running build against the latest GitHub release, and creates GitHub Releases for commits that land on `main`. See [Deployment](./deployment.md).

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| SQLite over Postgres | Single-container deployment, no external dependencies. WAL mode provides good concurrent read performance. |
| Rule-based detection over ML | Deterministic, debuggable, easy to extend. Each rule is a single file with clear logic. |
| Capability-driven instance registry | Keeps type-specific behavior centralized so new instance families can be added without scattering ad-hoc conditionals across routes, forms, scheduler code, and dashboards. |
| Encryption at rest for API keys | API keys are sensitive. AES-256-GCM with per-value random IVs. |
| One issue per queue item | Avoids alert fatigue. Highest-priority rule wins. |
| Enrichment as separate pass | Keeps detection rules simple and fast. Enrichment does API calls (history, library) and runs after detection. |
| Auto-fix opt-in per instance | Users control risk. Auto-fix only executes the highest-priority automatable fix. |
| In-memory job tracking | Prevents duplicate runs of the same job type per instance without blocking unrelated work. Simpler than DB-based locking for single-container deployment. State resets on restart which is acceptable. |
| First-run onboarding with persisted admin credentials | Keeps setup inside the product while still limiting ArrMate to a single administrator account for the self-hosted deployment model. |
| Server-side opaque sessions | Allows logout revocation and avoids persisting bearer tokens in plaintext; only HMAC-hashed session tokens are stored. |
| Same-origin checks on mutations | Protects cookie-authenticated API endpoints from browser CSRF without per-form token plumbing across the existing UI. |
| Persistent login throttling | Failed-login counters live in SQLite so lockouts survive process restarts in the single-container deployment model. |
| Persisted app-managed secrets | Avoids mandatory env setup for self-hosted installs while keeping session signing and API-key encryption stable across restarts. |
| GHCR-backed container publishing | Produces pullable multi-architecture images for self-hosted Docker deployments without requiring each host to build from source. |
