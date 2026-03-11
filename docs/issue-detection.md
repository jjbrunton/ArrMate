# Issue Detection

## How It Works

The detector (`src/lib/issues/detector.ts`) runs all registered rules against each non-gone queue item. Rules are sorted by priority (highest first). The first rule that returns a match wins — only one issue per queue item.

## Rules

| Rule | Priority | Detects | Severity |
|------|----------|---------|----------|
| Failed | 100 | `trackedDownloadState` is "failed" or "failedpending" | critical |
| Stalled | 90 | Status message keywords (stalled, no connections, not seeded, unavailable) OR zero progress for 60+ min | warning |
| Duplicate | 80 | Status message keywords (duplicate, already exists, already been imported) | warning |
| Import Blocked | 75 | `trackedDownloadState` is "importblocked" OR warning status with import keywords. Special handling for "found multiple movies" with candidate parsing | critical/warning |
| Missing Files | 70 | Status message keywords (no files found, no eligible files, no video files, sample only) | critical |
| Import Pending | 60 | `trackedDownloadState/Status` is "importpending" for 30+ minutes | warning |
| Slow Download | 30 | Estimated remaining time >24 hours (calculated from progress over 30+ min history) | info |

## Adding a New Rule

1. Create `src/lib/issues/rules/<name>.ts` implementing `IssueRule` interface
2. Export the rule and add it to the `rules` array in `src/lib/issues/detector.ts`
3. Create `src/lib/issues/rules/<name>.test.ts` with test coverage
4. Update this document with the new rule

## Enrichment

After detection, `enrichDetectedIssues()` runs two passes:

1. **Grab History** — For duplicate/import_blocked/missing_files issues, looks up the download's grab history to add "Originally grabbed for: X" context
2. **Multiple Movie Disambiguation** — For import_blocked issues with multiple movie candidates, resolves TMDB IDs against the Radarr library and uses per-movie grab history to identify the correct match

## Fix Actions

| Action | What it does | Automatable |
|--------|-------------|-------------|
| `remove_and_blocklist` | DELETE queue item, blocklist release | Yes |
| `remove_keep_files` | DELETE queue item, keep files | No |
| `retry_download` | DELETE queue item (triggers re-search) | Yes |
| `grab_release` | POST grab to re-download | Yes |
| `force_import` | Fetches manual import files from output path, triggers import with the movie's ID | Yes (Radarr only) |
| `select_movie_import` | Fetches manual import files, triggers import for specific movie | Yes |
