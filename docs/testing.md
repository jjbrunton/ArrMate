# Testing

## Overview

Vitest with v8 coverage. Config at `vitest.config.ts`. Tests are mandatory — see AGENTS.md for enforcement rules.

## Commands

- `npm test` — Run all tests once
- `npm run test:watch` — Watch mode
- `npm run test:coverage` — With coverage thresholds (80% statements/functions/lines, 75% branches)

## Test Structure

```
src/lib/
├── auth/
│   ├── config.test.ts         # Auth environment validation for the session secret
│   ├── password.test.ts       # Scrypt hash/verify coverage
│   ├── request.test.ts        # Origin and client-IP helpers
│   └── session.test.ts        # Cookie helpers and token hashing
├── arr-client/
│   ├── client.test.ts          # ArrClient HTTP methods, pagination, error handling
│   └── errors.test.ts          # Error class properties
├── instances/
│   ├── connection.test.ts      # Type-aware connection verification routing
│   └── definitions.test.ts     # Instance capability registry coverage
├── overseerr-client/
│   ├── client.test.ts          # Overseerr health, request pagination, and media lookup calls
│   └── errors.test.ts          # Error class properties
├── crypto/
│   └── crypto.test.ts          # Encrypt/decrypt, persisted-key bootstrap, and env-to-file key migration
├── db/
│   └── index.test.ts           # Shared DB bootstrap applies migrations for fresh and legacy SQLite files
├── issues/
│   ├── detector.test.ts        # Priority ordering, gone filtering, multi-item
│   ├── enrichment.test.ts      # Grab history, movie disambiguation
│   ├── fix-executor.test.ts     # Shared fix selection and param building
│   ├── fixes.test.ts           # All fix actions, select_movie_import flow
│   └── rules/
│       ├── failed.test.ts
│       ├── stalled.test.ts
│       ├── duplicate.test.ts
│       ├── import-blocked.test.ts
│       ├── import-pending.test.ts
│       ├── missing-files.test.ts
│       └── slow-download.test.ts
├── services/
│   ├── auth-service.test.ts   # Onboarding, first-instance creation, persisted admin auth, login throttling, and session issue/revoke flows
│   ├── integration.test.ts     # Full service tests with in-memory SQLite
│   ├── media-cache-service.test.ts # Cache rebuilds preserve persisted quality snapshot fields
│   ├── quality-service.test.ts # Quality snapshot persistence, local pagination, summaries, and upgrade-search history
│   └── request-service.test.ts # Imported Overseerr request sync, stats, and stale-row cleanup
├── scheduler/
│   ├── index.test.ts          # Immediate priming for newly created instances vs steady-state startup scheduling
│   ├── job-tracker.test.ts    # Running-state and concurrency guards
│   └── jobs/
│       └── quality-check.test.ts # Upgrade-search cooldown and per-run quality batch behavior
├── test-utils/
│   ├── fixtures.ts             # makeQueueItem, makeContext, makeInstance, etc.
│   └── mock-arr-client.ts      # Mock ArrClient with vi.fn() stubs
└── utils/
    ├── api-response.test.ts    # Response helpers
    └── parse-status-messages.test.ts  # Shared status message parser
```

## Patterns

### Unit Tests
Co-located with source files. Import fixtures from `src/lib/test-utils/fixtures.ts`.

### Integration Tests
`integration.test.ts` uses an in-memory SQLite database. Mocks:
- `../db` — returns the test database
- `../crypto` — passthrough encrypt/decrypt
- `../arr-client/client` — mock class that resolves testConnection
- `../overseerr-client/client` — mock class that resolves testConnection

Keep the `CREATE_SQL` schema in this test synchronized with `src/lib/db/schema.ts`. If instance, request-import, media-cache, auth, or quality-history columns/tables change, update the in-memory definitions in the same change so integration tests continue to reflect production behavior.

### Fixtures
- `makeQueueItem(overrides)` — creates a QueueItem with sensible defaults
- `makeQueueRecord(overrides)` — creates an API QueueRecord
- `makeStatusMessages(messages)` — creates JSON status message string
- `makeContext(overrides)` — creates IssueContext
- `makeInstance(overrides)` — creates an Instance

### Mock ArrClient
`createMockArrClient()` returns an object with all ArrClient methods as `vi.fn()` stubs with default return values.
