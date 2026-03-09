# API Routes

All routes are under `/api/`. Responses use `{ data: T }` for success and `{ error: string }` for errors.
All routes except `POST /api/auth/setup`, `POST /api/auth/login`, and `POST /api/auth/logout` require an authenticated session cookie. State-changing routes also require a same-origin `Origin` header.

## Authentication

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/account` | Return the configured administrator username for authenticated UI chrome and account settings |
| POST | `/api/auth/account` | Change the administrator password after verifying the current password; keeps the current session and revokes other sessions |
| POST | `/api/auth/setup` | Complete first-run onboarding: create the single admin account, optionally add the first instance, kick that instance's supported jobs once immediately, and set the HTTP-only session cookie |
| POST | `/api/auth/login` | Authenticate the configured admin user, apply per-IP throttling, and set the HTTP-only session cookie |
| POST | `/api/auth/logout` | Revoke the current session and clear the cookie |

## Instances

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/instances` | List all instances with type-aware queue/request/media counts and in-memory job status metadata for dashboard cards |
| POST | `/api/instances` | Create instance (verifies Sonarr/Radarr/Overseerr connections; accepts `qualityCheckMaxItems` for Arr and `requestSyncIntervalSeconds` for Overseerr), register its scheduler tasks immediately, and kick each supported job once right away |
| POST | `/api/instances/verify` | Test a Sonarr/Radarr/Overseerr connection without saving |
| GET | `/api/instances/[id]` | Get single instance with local type-aware summary stats |
| PUT | `/api/instances/[id]` | Update instance settings including Arr scheduler fields or Overseerr request-sync interval |
| DELETE | `/api/instances/[id]` | Delete instance |
| POST | `/api/instances/[id]/poll` | Trigger manual Arr queue poll (409 if a job is already running) |
| POST | `/api/instances/[id]/quality-check` | Trigger manual Arr quality checks and update the instance quality timestamp (409 if another quality check is already running) |
| POST | `/api/instances/[id]/sync-media` | Trigger manual Arr media sync (409 if a job is already running) |
| GET | `/api/instances/[id]/requests` | List locally imported Overseerr requests for the instance |
| POST | `/api/instances/[id]/sync-requests` | Trigger a manual Overseerr request import (409 if another request sync is already running) |
| GET | `/api/instances/[id]/job-status` | Get running job status `{ running: string[], busy: boolean }` |
| GET | `/api/instances/[id]/cutoff` | Get the Media Management tab data from local cache only: paged below-cutoff rows, cached wanted/current quality, per-item upgrade-search history, recent upgrade-search batches with resolved item labels, and a local summary split of `healthy`, `wrongQuality`, and `missing` |
| POST | `/api/instances/[id]/cutoff/search` | Trigger an upgrade search for selected cutoff-unmet items that have not been searched in the last 24 hours; skipped item IDs are returned so the UI can explain local cooldown no-ops |

## Issues

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/issues` | List issues (?instanceId, ?all=true) |
| POST | `/api/issues/[id]/dismiss` | Dismiss issue |
| POST | `/api/issues/[id]/fix` | Execute a fix |
| POST | `/api/issues/accept-all` | Resolve all active issues |
| POST | `/api/issues/dismiss-all` | Dismiss all for instance |

## Queue

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/queue` | List queue items (?instanceId, ?includeGone) |

## Other

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/logs` | Recent audit log (`?limit`, `?afterId`, repeated `?action=` filters supported so dashboards can request slices such as only `quality_search_sent` events) |
| GET | `/api/health` | Health check + dashboard stats for authenticated dashboards |
