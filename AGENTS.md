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

## Mandatory: Software Engineering Best Practices

**All code changes MUST adhere to these principles:**

### SOLID Principles
- **Single Responsibility**: Each module, class, and function should have one reason to change. Don't add unrelated logic to existing files — create a new module instead.
- **Open/Closed**: Extend behaviour through new rules, handlers, or strategies rather than modifying existing ones. The issue detection rule system is a good example — add new rule files, don't bloat existing ones.
- **Liskov Substitution**: Subtypes and interface implementations must be interchangeable without breaking callers.
- **Interface Segregation**: Keep interfaces focused. Don't force consumers to depend on methods they don't use.
- **Dependency Inversion**: Depend on abstractions, not concretions. Services should accept dependencies (DB, clients) via injection rather than importing singletons directly in non-entry-point code.

### KISS & Pragmatism
- Prefer the simplest solution that meets the requirement. Don't over-abstract.
- Three similar lines of code is better than a premature abstraction.
- Avoid unnecessary layers of indirection — if a function just forwards to another function, consider removing the wrapper.
- Don't add configurability, feature flags, or extension points unless they're needed now.

### Inversion of Control
- Business logic should not directly instantiate its own dependencies. Pass dependencies in (constructor injection, function parameters) so code is testable and decoupled.
- Entry points (API routes, scheduler jobs) are responsible for wiring up dependencies — deeper layers should receive them.

### General
- Follow existing patterns in the codebase. Consistency trumps personal preference.
- Name things clearly — a good name removes the need for a comment.
- Keep functions short and focused. If a function needs a comment explaining a section, that section should probably be its own function.
- Avoid premature optimisation. Write clear code first, optimise only when measured.

---

## Mandatory: Security

**All code MUST be reviewed for security issues before committing. Follow OWASP guidelines.**

### Input Validation & Injection Prevention
- **SQL Injection**: Always use Drizzle ORM's parameterised queries. Never concatenate user input into raw SQL strings. If raw SQL is absolutely required, use parameterised placeholders.
- **Command Injection**: Never pass user input to `child_process.exec()` or shell commands. Use `execFile()` with explicit argument arrays if shell interaction is needed.
- **XSS (Cross-Site Scripting)**: Never use `dangerouslySetInnerHTML` with user-supplied content. React escapes by default — don't bypass it. Sanitise any content rendered from external APIs (Sonarr/Radarr responses).
- **Path Traversal**: Validate and sanitise any user-supplied file paths. Never use user input directly in `fs` operations.

### Authentication & Secrets
- API keys are encrypted at rest with AES-256-GCM — maintain this pattern for any new secrets.
- Never log secrets, API keys, or tokens. Mask them in error messages.
- Never commit `.env` files, credentials, or secrets to the repository.
- Validate the `ENCRYPTION_KEY` environment variable is present at startup.

### API Security
- Validate all request bodies with Zod schemas at API route boundaries. Reject invalid input early.
- Return appropriate HTTP status codes — don't leak internal error details in responses (use generic messages for 500s).
- Apply rate limiting or request size limits where appropriate for public-facing endpoints.

### Dependency & Supply Chain
- Don't add new dependencies without justification. Prefer built-in Node.js APIs or existing dependencies.
- Review changelogs/security advisories before upgrading dependencies.
- Keep `package-lock.json` committed and up to date.

### Data Handling
- Use the principle of least privilege — only request the data and permissions you need.
- Sanitise and validate data at system boundaries (user input, external API responses).
- Don't trust data from Sonarr/Radarr APIs blindly — validate structure before using it.

### Before Committing
- Review your diff for hardcoded secrets, exposed credentials, or debug code.
- Verify no new `eval()`, `Function()`, or dynamic code execution has been introduced.
- Confirm all user inputs flow through validation before reaching business logic or the database.

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
