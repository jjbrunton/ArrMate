import type { ArrClient } from "../arr-client/client";
import type { Movie, HistoryRecord } from "../arr-client/types";
import type { DetectionResult } from "./detector";
import type { SuggestedFixInput } from "./types";
import { createLogger } from "../utils/logger";

const log = createLogger("issue-enrichment");

/**
 * Runs all enrichment passes on detected issues.
 * Called after detection but before persistence.
 *
 * Enrichments run sequentially so that grab-history context
 * (which movie a download was originally grabbed for) is
 * available to the multiple-movie disambiguator.
 */
export async function enrichDetectedIssues(
  client: ArrClient,
  instanceType: "sonarr" | "radarr",
  results: DetectionResult[],
): Promise<void> {
  // Run grab-history enrichment first — it attaches "Originally grabbed for"
  // context that enrichMultipleMovieIssues can use as a fallback.
  await enrichWithGrabHistory(client, instanceType, results);
  await enrichMultipleMovieIssues(client, results);
}

/**
 * Enriches "found multiple movies" issues by:
 * 1. Resolving each candidate's TMDB ID to a Radarr movie ID via the library
 * 2. Calling /history/movie?movieId={id} for each candidate to find which one
 *    has a recent grab — that's the movie the user was searching for
 * 3. Falls back to single-library-match if history doesn't disambiguate
 */
async function enrichMultipleMovieIssues(
  client: ArrClient,
  results: DetectionResult[],
): Promise<void> {
  const multipleMovieIssues = results.filter(
    (r) =>
      r.issue.type === "import_blocked" &&
      r.issue.suggestedFixes.some((f) => f.action === "select_movie_import"),
  );

  if (multipleMovieIssues.length === 0) return;

  // Fetch the full library to map TMDB IDs → Radarr movie IDs
  let movies: Movie[] | null = null;
  try {
    movies = await client.getMovies();
  } catch (err) {
    log.warn({ err }, "Failed to fetch movie library for enrichment — will use downloadId fallback");
  }

  const tmdbIndex = movies ? new Map(movies.map((m) => [m.tmdbId, m])) : new Map<number, Movie>();

  for (const result of multipleMovieIssues) {
    const selectFixes = result.issue.suggestedFixes.filter(
      (f) => f.action === "select_movie_import" && f.params,
    );

    // Step 1: Attach Radarr movieId to each candidate that's in the library
    const libraryFixes: { fix: SuggestedFixInput; movie: Movie }[] = [];
    for (const fix of selectFixes) {
      const movie = tmdbIndex.get(fix.params?.tmdbId as number);
      if (movie) {
        fix.params = { ...fix.params, movieId: movie.id };
        libraryFixes.push({ fix, movie });
      }
    }

    // Step 2: If multiple candidates are in library, use per-movie history to disambiguate
    let resolved = false;
    if (libraryFixes.length > 1) {
      const winner = await findRecentlyGrabbedCandidate(client, libraryFixes);

      if (winner) {
        promoteWinner(winner.fix, winner.movie, result, "grabbed");

        // Demote all other candidates
        for (const { fix, movie } of libraryFixes) {
          if (fix !== winner.fix) {
            fix.label = `Import as "${movie.title} (${movie.year})"`;
            fix.priority = 10;
          }
        }

        log.info(
          { queueItem: result.queueItem.title, matchedMovie: winner.movie.title, movieId: winner.movie.id },
          "Identified correct movie via grab history",
        );
        resolved = true;
      }
    } else if (libraryFixes.length === 1) {
      // Only one candidate in library — that's the answer
      const { fix, movie } = libraryFixes[0];
      promoteWinner(fix, movie, result, "in library");

      log.info(
        { queueItem: result.queueItem.title, matchedMovie: movie.title },
        "Identified single library match for ambiguous import",
      );
      resolved = true;
    }

    // Step 3: Fallback — use the download's own grab history to match a candidate.
    // This works even if getMovies() failed, and catches cases where per-movie
    // history didn't disambiguate (e.g. both candidates had old grabs).
    if (!resolved && result.queueItem.downloadId) {
      const winner = await findCandidateViaDownloadHistory(client, selectFixes, result.queueItem.downloadId);
      if (winner) {
        promoteWinner(winner.fix, winner.movie, result, "grabbed");

        for (const fix of selectFixes) {
          if (fix !== winner.fix) {
            fix.priority = 10;
          }
        }

        log.info(
          { queueItem: result.queueItem.title, matchedMovie: winner.movie.title },
          "Identified correct movie via download grab history (fallback)",
        );
        resolved = true;
      }
    }

    if (!resolved && libraryFixes.length > 1) {
      // History didn't help — label all library matches but can't auto-pick
      for (const { fix, movie } of libraryFixes) {
        fix.label = `Import as "${movie.title} (${movie.year})" (in library)`;
      }
    }

    // Demote non-library candidates
    for (const fix of selectFixes) {
      if (!fix.params?.movieId) {
        fix.description += " (not in library)";
        fix.priority = 50;
        fix.automatable = false;
      }
    }
  }
}

/**
 * Checks each candidate's movie history to find which one has a recent grab.
 * Calls GET /history/movie?movieId={id} for each candidate in parallel.
 * Returns the candidate with the most recent grab, or null if none found.
 */
async function findRecentlyGrabbedCandidate(
  client: ArrClient,
  candidates: { fix: SuggestedFixInput; movie: Movie }[],
): Promise<{ fix: SuggestedFixInput; movie: Movie } | null> {
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        // /history/movie returns a plain array of HistoryRecord, not a paginated response
        const records = await client.getMovieHistory(candidate.movie.id);
        const recentGrab = records.find((r) => r.eventType === "grabbed");
        return { candidate, grabDate: recentGrab?.date ?? null };
      } catch (err) {
        log.debug({ movieId: candidate.movie.id, err }, "Failed to fetch movie history");
        return { candidate, grabDate: null };
      }
    }),
  );

  // Find candidates that have grabs
  const withGrabs = results.filter((r) => r.grabDate !== null);

  if (withGrabs.length === 1) {
    // Only one candidate was recently grabbed — definitive match
    return withGrabs[0].candidate;
  }

  if (withGrabs.length > 1) {
    // Multiple have grabs — pick the most recent one
    withGrabs.sort((a, b) => new Date(b.grabDate!).getTime() - new Date(a.grabDate!).getTime());
    return withGrabs[0].candidate;
  }

  return null;
}

/**
 * Fallback disambiguator: looks up the download's own grab history to find
 * which movie this specific download was grabbed for, then matches it
 * against the candidate fixes by TMDB ID or title+year.
 */
async function findCandidateViaDownloadHistory(
  client: ArrClient,
  selectFixes: SuggestedFixInput[],
  downloadId: string,
): Promise<{ fix: SuggestedFixInput; movie: { title: string; year: number; id?: number; tmdbId?: number } } | null> {
  try {
    const history = await client.getHistoryByDownloadId(downloadId);
    const grabEvent = history.records.find((r) => r.eventType === "grabbed");
    if (!grabEvent?.movie) return null;

    const grabbed = grabEvent.movie;

    // Match by TMDB ID first, then by title+year
    const match = selectFixes.find(
      (f) =>
        (f.params?.tmdbId != null && f.params.tmdbId === grabbed.tmdbId) ||
        (f.params?.title === grabbed.title && f.params?.year === grabbed.year),
    );

    if (match) {
      // Ensure movieId is set on the fix params
      if (!match.params?.movieId && grabbed.id) {
        match.params = { ...match.params, movieId: grabbed.id };
      }
      return { fix: match, movie: grabbed };
    }

    return null;
  } catch (err) {
    log.debug({ downloadId, err }, "Failed to fetch download history for disambiguation");
    return null;
  }
}

function promoteWinner(
  fix: SuggestedFixInput,
  movie: Pick<Movie, "title" | "year"> & Partial<Pick<Movie, "tmdbId">>,
  result: DetectionResult,
  reason: string,
): void {
  fix.label = `Import as "${movie.title} (${movie.year})" (${reason})`;
  const tmdbSuffix = movie.tmdbId != null ? ` [TMDB: ${movie.tmdbId}]` : "";
  fix.description = `This download was grabbed for ${movie.title} (${movie.year})${tmdbSuffix}`;
  fix.priority = 0;

  result.issue.title = `Auto-resolvable: ${result.queueItem.title}`;
  result.issue.description = `Matched to "${movie.title} (${movie.year})" via ${reason === "grabbed" ? "download history" : "library lookup"}`;
}

/**
 * Enriches issues (especially duplicates and import_blocked) with grab history.
 * Looks up the downloadId in history to find which movie/episode the download
 * was originally grabbed for, and adds that context to the issue description.
 */
async function enrichWithGrabHistory(
  client: ArrClient,
  instanceType: "sonarr" | "radarr",
  results: DetectionResult[],
): Promise<void> {
  const enrichableTypes = new Set(["duplicate", "import_blocked", "missing_files"]);
  const toEnrich = results.filter(
    (r) => enrichableTypes.has(r.issue.type) && r.queueItem.downloadId,
  );

  if (toEnrich.length === 0) return;

  const downloadIds = [...new Set(toEnrich.map((r) => r.queueItem.downloadId!))];
  const grabTargets = new Map<string, string>();

  await Promise.all(
    downloadIds.map(async (downloadId) => {
      try {
        const history = await client.getHistoryByDownloadId(downloadId);
        const grabEvent = history.records.find((r) => r.eventType === "grabbed");
        if (!grabEvent) return;

        const target = formatGrabTarget(grabEvent, instanceType);
        if (target) grabTargets.set(downloadId, target);
      } catch (err) {
        log.debug({ downloadId, err }, "Failed to fetch grab history");
      }
    }),
  );

  if (grabTargets.size === 0) return;

  for (const result of toEnrich) {
    const target = grabTargets.get(result.queueItem.downloadId!);
    if (!target) continue;

    result.issue.description = `Originally grabbed for: ${target}. ${result.issue.description}`;
  }
}

function formatGrabTarget(
  grabEvent: HistoryRecord,
  instanceType: "sonarr" | "radarr",
): string | null {
  if (instanceType === "radarr" && grabEvent.movie) {
    return `${grabEvent.movie.title} (${grabEvent.movie.year})`;
  }
  if (instanceType === "sonarr" && grabEvent.series && grabEvent.episode) {
    return `${grabEvent.series.title} S${String(grabEvent.episode.seasonNumber).padStart(2, "0")}E${String(grabEvent.episode.episodeNumber).padStart(2, "0")}`;
  }
  return null;
}
