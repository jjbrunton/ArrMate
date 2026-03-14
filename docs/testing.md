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
├── quality-check-strategy.test.ts # Media-management ordering strategies and deterministic randomization
├── auth/
│   ├── config.test.ts         # Auth environment validation for the session secret
│   ├── password.test.ts       # Scrypt hash/verify coverage
│   ├── request.test.ts        # Origin and client-IP helpers
│   └── session.test.ts        # Cookie helpers and token hashing
├── arr-client/
│   ├── client.test.ts          # ArrClient HTTP methods, pagination, active search-command filtering, error handling
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
│   ├── request-service.test.ts # Imported Overseerr request sync, stats, and stale-row cleanup
│   └── update-service.test.ts # GitHub release parsing, version comparison, and cache behavior for the update notifier
├── app/
│   └── version.test.ts         # Build metadata fallback to package version plus env override coverage
├── scheduler/
│   ├── index.test.ts          # Immediate priming for newly created instances vs steady-state startup scheduling
│   ├── job-tracker.test.ts    # Running-state and concurrency guards, including shared quality-search locks
│   └── jobs/
│       ├── quality-check.test.ts # Upgrade-search cooldown, shared search locking, active Arr command backoff, and per-run quality batch behavior
│       └── sync-media-cache.test.ts # Empty-response guards prevent cache wipes
├── security/
│   └── security.test.ts       # Security regression tests (encryption, auth bypass, key leakage, sessions, error messages)
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

### Security Tests
`security.test.ts` is a dedicated security regression test suite that guards against common security regressions. It uses in-memory SQLite with real crypto (not mocked) and covers:

- **Encryption integrity** — unique IVs, no plaintext leakage, GCM auth tag validation, DB storage verification
- **API key stripping** — `toPublic()` removes `apiKey` from all instance-service responses
- **Authentication bypass** — empty credentials, oversized inputs, wrong-user-right-password, per-IP rate limiting
- **Password hashing** — unique salts, correct format, edge cases (empty, unicode)
- **Session security** — token entropy, HMAC hashing, session expiry enforcement
- **Error message leakage** — generic auth failure messages, security headers on all responses

If a commit accidentally weakens input validation, encryption, auth, or information leakage defenses, these tests will fail.
