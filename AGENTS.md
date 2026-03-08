# ArrMate - AI Agent Instructions

## What is ArrMate?

ArrMate is a self-hosted monitoring dashboard for [Sonarr](https://sonarr.tv) and [Radarr](https://radarr.video) instances. It polls their APIs on a schedule, detects download issues (stalled, failed, duplicate, import blocked, missing files, slow downloads), suggests fixes, and can auto-resolve them. Built with Next.js 16, TypeScript, SQLite, and designed to run as a single Docker container.

---

## Mandatory: Read Documentation First

**Before implementing ANY changes, you MUST read the relevant documentation in `docs/`.**

1. Read `docs/README.md` to understand what documentation exists
2. Read the specific docs relevant to your task:
   - Changing architecture or adding services? Read `docs/architecture.md`
   - Working on issue detection or rules? Read `docs/issue-detection.md`
   - Modifying the database? Read `docs/database-schema.md`
   - Adding or changing API endpoints? Read `docs/api-routes.md`
   - Writing or modifying tests? Read `docs/testing.md`
3. If you are unsure which docs are relevant, read `docs/architecture.md` as a baseline

**Do not skip this step.** The documentation contains design decisions and conventions that you must follow.

---

## Mandatory: Update Documentation

**After making changes, you MUST update the relevant documentation in `docs/`.**

- **New feature or module** → Add a section to the appropriate doc, or create a new doc and link it from `docs/README.md`
- **New API route** → Add it to `docs/api-routes.md`
- **New issue detection rule** → Add it to the rules table in `docs/issue-detection.md`
- **Schema change** → Update `docs/database-schema.md`
- **Architecture change** → Update `docs/architecture.md` (especially the design decisions table if you're making a non-obvious choice)
- **New test patterns or utilities** → Update `docs/testing.md`
- **Doesn't fit existing docs cleanly** → Create a new focused doc in `docs/`, add it to `docs/README.md`, and document the change there instead of forcing it into an unrelated file

If documentation contradicts the code, **fix the documentation** — the code is the source of truth, but the docs must stay accurate.

---

## Mandatory: Testing Requirements

**All AI agents MUST follow these testing rules:**

### Before Making Changes
1. Run `npm test` to confirm all existing tests pass
2. If tests fail before your changes, stop and investigate — do not proceed with broken tests

### After Making Changes
1. Run `npm test` to confirm no regressions
2. **Add or update tests** for any code you modify or create in `src/lib/`
3. New module in `src/lib/` → create a corresponding `.test.ts` file
4. Modified logic → update the relevant tests to cover your changes
5. New issue detection rule → add a corresponding test file

### Test Commands
- `npm test` — Run all tests (must pass before any PR)
- `npm run test:watch` — Watch mode for development
- `npm run test:coverage` — Run with coverage report

### Writing Tests
- Use factories from `src/lib/test-utils/fixtures.ts` (`makeQueueItem`, `makeContext`, etc.)
- Use `src/lib/test-utils/mock-arr-client.ts` for mocking the ArrClient
- Integration tests mock `../db`, `../crypto`, and `../arr-client/client` modules
- Test both happy paths and edge cases (null inputs, error conditions, boundary values)
- See `docs/testing.md` for full patterns and file structure

---

## Build & Dev

- **Node.js v25**: Use `node node_modules/next/dist/bin/next build` (not `npx next build`)
- **Dev**: `npm run dev`
- **Lint**: `npm run lint`
- **DB migrations**: `npm run db:generate` then `npm run db:migrate`

## Tech Stack
- Next.js 16 (App Router), TypeScript, React 19, Tailwind CSS 4
- SQLite via Drizzle ORM + better-sqlite3 (WAL mode)
- Zod v4 (import from `zod/v4`)
- node-cron v4 (`import * as cron from "node-cron"`)

## Architecture Summary
- Services layer in `src/lib/services/` — all DB access goes through here
- Issue detection rules in `src/lib/issues/rules/` — each rule is a separate file
- ArrClient in `src/lib/arr-client/` — Sonarr/Radarr API wrapper
- Encryption in `src/lib/crypto/` — AES-256-GCM for API keys at rest
- Scheduler in `src/lib/scheduler/` — node-cron based polling jobs
- Full details in `docs/architecture.md`
