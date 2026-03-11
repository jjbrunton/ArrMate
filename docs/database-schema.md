# Database Schema

SQLite via Drizzle ORM. Schema source of truth: `src/lib/db/schema.ts`. Migrations in `/drizzle`.

## Tables

### instances
Shared instance connection records for Sonarr, Radarr, and Overseerr.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Display name |
| type | TEXT | "sonarr", "radarr", or "overseerr" |
| base_url | TEXT | Server URL |
| api_key | TEXT | Encrypted (AES-256-GCM) |
| poll_interval_seconds | INTEGER | Arr queue-poll interval, default 300 |
| quality_check_interval_seconds | INTEGER | Arr-only quality-check scheduler interval, default 1800 (30 minutes) |
| quality_check_max_items | INTEGER | Arr-only: max overdue cutoff items to search per quality-check run. Default 50 |
| quality_check_strategy | TEXT | Arr-only batch ordering for overdue media-management runs. Default `oldest_search` |
| enabled | BOOLEAN | Default true |
| auto_fix | BOOLEAN | Arr-only auto-fix toggle, default false |
| last_health_check | TEXT | ISO timestamp |
| last_health_status | TEXT | healthy/unhealthy/unknown |
| last_polled_at | TEXT | Arr-only queue poll timestamp |
| last_quality_check_at | TEXT | Arr-only ISO timestamp of the last successful quality-check batch |
| media_sync_interval_seconds | INTEGER | Arr-only media sync interval, default 3600 |
| last_media_sync_at | TEXT | Arr-only media sync timestamp |
| request_sync_interval_seconds | INTEGER | Overseerr request sync interval |
| last_request_sync_at | TEXT | Overseerr request sync timestamp |
| created_at, updated_at | TEXT | ISO timestamps |

### queue_items
Download items tracked from instance queues.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| instance_id | INTEGER FK | → instances.id (cascade delete) |
| external_id | INTEGER | ID from Sonarr/Radarr |
| title | TEXT | Download title |
| status, tracked_download_state, tracked_download_status | TEXT | State from API |
| status_messages | TEXT | JSON array of {title, messages[]} |
| size_bytes, size_left_bytes | INTEGER | Progress tracking |
| download_id | TEXT | For history lookups |
| output_path | TEXT | For manual import |
| first_seen_at, last_seen_at | TEXT | Tracking timestamps |
| is_gone | BOOLEAN | True when item leaves queue |

### detected_issues
Problems detected with queue items.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| instance_id | INTEGER FK | → instances.id |
| queue_item_id | INTEGER FK | → queue_items.id (set null on delete) |
| external_queue_id | INTEGER | For matching across syncs |
| type | TEXT | Issue type (see issue-detection.md) |
| severity | TEXT | critical/warning/info |
| status | TEXT | active/dismissed/resolved |
| detected_at, resolved_at | TEXT | Lifecycle timestamps |

### suggested_fixes
Possible actions for each issue.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| issue_id | INTEGER FK | → detected_issues.id (cascade delete) |
| action | TEXT | Fix action type |
| priority | INTEGER | Lower = preferred |
| automatable | BOOLEAN | Can auto-fix execute this |
| params | TEXT | JSON parameters |
| executed_at | TEXT | When fix was run |
| execution_result | TEXT | Outcome message |

### audit_log
Activity tracking for all actions.

- Quality searches use action `quality_search_sent` with `details.itemIds` containing the Sonarr/Radarr item IDs that were queued for upgrade. The Media Management tab aggregates these rows to show `upgrades sent` history.
- Instance deletion removes the deleted instance's audit rows so local activity history does not retain orphaned records for instances that no longer exist.

### quality_search_items
Normalized per-item history for quality upgrade searches.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| instance_id | INTEGER FK | → instances.id (cascade delete) |
| item_id | INTEGER | Sonarr/Radarr movie or episode ID |
| source | TEXT | user/automation |
| created_at | TEXT | Batch timestamp copied from the originating search request |

### imported_requests
Locally cached Overseerr requests used by the dashboard.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| instance_id | INTEGER FK | → instances.id (cascade delete) |
| external_id | INTEGER | Request ID from Overseerr |
| media_type | TEXT | "movie" or "tv" |
| title | TEXT | Resolved via Overseerr movie/tv detail endpoints |
| tmdb_id | INTEGER | TMDB identifier for the request target |
| request_status | INTEGER | Raw Overseerr request status code |
| media_status | INTEGER | Raw Overseerr media availability code |
| status | TEXT | Normalized display status such as `pending approval`, `processing`, or `available` |
| requested_by_display_name | TEXT | Display name / username / email fallback |
| requested_by_email | TEXT | Requesting user's email when available |
| requested_at | TEXT | Request creation timestamp from Overseerr |
| updated_at | TEXT | Latest request update timestamp from Overseerr |

### auth_sessions
Authenticated ArrMate admin sessions.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Random UUID for the session row |
| token_hash | TEXT UNIQUE | HMAC-SHA256 of the opaque cookie token |
| ip_address | TEXT | Source IP recorded at login time |
| user_agent | TEXT | Browser user agent recorded at login time |
| created_at | TEXT | ISO timestamp |
| expires_at | TEXT | ISO timestamp, fixed 24-hour expiry |

### auth_admin
Single persisted ArrMate administrator account created during onboarding.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Fixed value `1` so only one admin row can exist |
| username | TEXT | Login username |
| password_hash | TEXT | Scrypt hash of the administrator password |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### auth_login_attempts
Per-IP failed-login tracking for brute-force throttling.

| Column | Type | Notes |
|--------|------|-------|
| ip_address | TEXT PK | Client IP address |
| failure_count | INTEGER | Consecutive failures inside the current window |
| first_failed_at | TEXT | ISO timestamp of the first failure in the active window |
| last_failed_at | TEXT | ISO timestamp of the most recent failure |
| blocked_until | TEXT | ISO timestamp until login is blocked; null when not blocked |

### cached_movies, cached_series, cached_episodes
Local cache of Radarr/Sonarr media libraries, synced periodically via `media_sync_interval_seconds`.

- `cached_movies` and `cached_episodes` also persist the latest quality snapshot fields used by the Media Management tab and the 24-hour upgrade-search cooldown:
  - `below_cutoff` — whether the item was in the most recent cutoff-unmet snapshot
  - `wanted_quality_name` — resolved cutoff label from the item's quality profile at snapshot time
  - `quality_last_search_at` — the latest known search timestamp, preserving the newer value from Arr snapshots and local upgrade-search actions

## Notes

- Pending Drizzle migrations are applied on first database access, so a newly created or older SQLite file is upgraded before services query tables such as `auth_admin`.
- ArrMate administrator credentials are stored in SQLite in `auth_admin` after first-run onboarding.
- Session signing uses `AUTH_SESSION_SECRET` when provided. If it is missing, ArrMate generates a random 32-byte secret and stores it beside the SQLite database so sessions remain valid across restarts.
- Instance `api_key` values remain encrypted at rest. `ENCRYPTION_KEY` can still be supplied, but if it is missing ArrMate generates and persists a random 32-byte key beside the SQLite database. When upgrading from an env-managed key, startup re-encrypts stored instance API keys onto the persisted key before continuing.
- The `instances` table is shared across all instance families; capability-specific columns are only meaningful for instance types that support those jobs.
- Session rows store only a hashed session token so a database leak does not expose active bearer tokens directly.
- Login throttling is keyed by IP address and persists across process restarts because `auth_login_attempts` lives in SQLite.
- The Media Management tab reads local DB state only. Scheduler/manual quality checks refresh the cached snapshot; the page itself does not call Arr.
- The Media Management tab per-item `last check` and `next check` values come from persisted `quality_last_search_at`.
- Manual and scheduled upgrade searches both consult persisted `quality_last_search_at`, so locally recorded searches still enforce the 24-hour cooldown even before Arr updates `lastSearchTime`.
- Scheduled quality checks also consult the per-instance `quality_check_strategy` when choosing which overdue records to search first.
- The Media Management tab per-item `upgrades sent` values come from `quality_search_items`; batch totals still come from `audit_log` `quality_search_sent` rows.
- `last_quality_check_at` is instance-level scheduler metadata for the configurable quality-check cron, not a per-item timestamp.
- Overseerr request pages read local DB state only. Scheduler/manual request sync refreshes `imported_requests`; the dashboard does not call Overseerr directly.
