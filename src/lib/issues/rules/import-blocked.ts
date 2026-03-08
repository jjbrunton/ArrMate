import type { IssueRule, SuggestedFixInput } from "../types";
import { parseStatusMessages } from "../../utils/parse-status-messages";

const IMPORT_BLOCKED_KEYWORDS = [
  "unable to import",
  "found multiple",
  "not available",
  "import failed",
  "manual import required",
  "path does not exist",
  "not a valid",
];

export interface MovieCandidate {
  title: string;
  year: number;
  imdbId: string;
  tmdbId: number;
}

/** Parses Radarr's "found multiple movies" candidate format:
 *  [Title (Year)][imdbId, tmdbId]
 */
export function parseMultipleMovieCandidates(messages: string[]): MovieCandidate[] {
  const text = messages.join(" ");
  // Create regex inside function to avoid stale lastIndex from the g flag
  const regex = /\[([^\]]+?)\s*\((\d{4})\)\]\[([^,\]]+),\s*(\d+)\]/g;

  const candidates: MovieCandidate[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    candidates.push({
      title: match[1].trim(),
      year: parseInt(match[2], 10),
      imdbId: match[3].trim(),
      tmdbId: parseInt(match[4], 10),
    });
  }

  return candidates;
}

function hasFoundMultiple(messages: string[]): boolean {
  return messages.some((msg) => msg.toLowerCase().includes("found multiple"));
}

function buildFoundMultipleFixes(candidates: MovieCandidate[]): SuggestedFixInput[] {
  const fixes: SuggestedFixInput[] = [];

  // Create a fix for each candidate movie
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    fixes.push({
      action: "select_movie_import",
      label: `Import as "${c.title} (${c.year})"`,
      description: `Import this release as ${c.title} (${c.year}) [TMDB: ${c.tmdbId}]`,
      priority: i + 1,
      automatable: true,
      params: { tmdbId: c.tmdbId, imdbId: c.imdbId, title: c.title, year: c.year },
    });
  }

  // Always include fallback options
  fixes.push(
    {
      action: "remove_and_blocklist",
      label: "Blocklist & search",
      description: "Blocklist this release and search for another",
      priority: candidates.length + 1,
      automatable: true,
    },
    {
      action: "remove_keep_files",
      label: "Remove from queue",
      description: "Remove from queue but keep downloaded files",
      priority: candidates.length + 2,
      automatable: false,
    },
  );

  return fixes;
}

export const importBlockedRule: IssueRule = {
  name: "import_blocked",
  priority: 75,

  analyze(item) {
    const state = item.trackedDownloadState?.toLowerCase();
    const status = item.trackedDownloadStatus?.toLowerCase();

    // Direct match on importBlocked state
    if (state === "importblocked") {
      const messages = parseStatusMessages(item.statusMessages);
      const candidates = parseMultipleMovieCandidates(messages);

      // If we found multiple movie candidates, create specific fixes
      if (hasFoundMultiple(messages) && candidates.length > 0) {
        return {
          type: "import_blocked",
          severity: "critical",
          title: `Multiple matches: ${item.title}`,
          description: `Found ${candidates.length} possible movies: ${candidates.map((c) => `${c.title} (${c.year})`).join(", ")}`,
          suggestedFixes: buildFoundMultipleFixes(candidates),
        };
      }

      return {
        type: "import_blocked",
        severity: "critical",
        title: `Import blocked: ${item.title}`,
        description: messages.length
          ? messages.join("; ")
          : "Download completed but cannot be imported automatically.",
        suggestedFixes: [
          {
            action: "force_import",
            label: "Manual import",
            description: "Open the *arr UI to resolve the import manually",
            priority: 1,
            automatable: false,
          },
          {
            action: "remove_and_blocklist",
            label: "Blocklist & search",
            description: "Blocklist this release and search for another",
            priority: 2,
            automatable: true,
          },
          {
            action: "remove_keep_files",
            label: "Remove from queue",
            description: "Remove from queue but keep downloaded files",
            priority: 3,
            automatable: false,
          },
        ],
      };
    }

    // Catch items with warning status that have import-related messages
    if (status === "warning") {
      const messages = parseStatusMessages(item.statusMessages);
      const hasImportIssue = messages.some((msg) =>
        IMPORT_BLOCKED_KEYWORDS.some((kw) => msg.toLowerCase().includes(kw)),
      );

      if (hasImportIssue) {
        const candidates = parseMultipleMovieCandidates(messages);

        if (hasFoundMultiple(messages) && candidates.length > 0) {
          return {
            type: "import_blocked",
            severity: "warning",
            title: `Multiple matches: ${item.title}`,
            description: `Found ${candidates.length} possible movies: ${candidates.map((c) => `${c.title} (${c.year})`).join(", ")}`,
            suggestedFixes: buildFoundMultipleFixes(candidates),
          };
        }

        return {
          type: "import_blocked",
          severity: "warning",
          title: `Import warning: ${item.title}`,
          description: messages.join("; "),
          suggestedFixes: [
            {
              action: "force_import",
              label: "Manual import",
              description: "Open the *arr UI to resolve the import manually",
              priority: 1,
              automatable: false,
            },
            {
              action: "remove_and_blocklist",
              label: "Blocklist & search",
              description: "Blocklist this release and search for another",
              priority: 2,
              automatable: true,
            },
          ],
        };
      }
    }

    return null;
  },
};

