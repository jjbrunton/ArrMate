import type { IssueRule } from "../types";

const SLOW_THRESHOLD_HOURS = 24;

export const slowDownloadRule: IssueRule = {
  name: "slow_download",
  priority: 30,

  analyze(item) {
    if (!item.sizeBytes || !item.sizeLeftBytes) return null;
    if (item.sizeLeftBytes <= 0) return null;

    const downloaded = item.sizeBytes - item.sizeLeftBytes;
    if (downloaded <= 0) return null;

    const firstSeen = new Date(item.firstSeenAt);
    const elapsedMs = Date.now() - firstSeen.getTime();
    if (elapsedMs < 30 * 60_000) return null; // need at least 30 min of data

    const bytesPerMs = downloaded / elapsedMs;
    const estimatedRemainingMs = item.sizeLeftBytes / bytesPerMs;
    const estimatedRemainingHours = estimatedRemainingMs / (1000 * 60 * 60);

    if (estimatedRemainingHours < SLOW_THRESHOLD_HOURS) return null;

    return {
      type: "slow_download",
      severity: "info",
      title: `Slow download: ${item.title}`,
      description: `At current speed, download will take approximately ${Math.round(estimatedRemainingHours)} more hours.`,
      suggestedFixes: [
        {
          action: "remove_and_blocklist",
          label: "Blocklist & search",
          description: "Blocklist and search for a faster release",
          priority: 1,
          automatable: true,
        },
        {
          action: "retry_download",
          label: "Retry download",
          description: "Remove and try another release",
          priority: 2,
          automatable: true,
        },
      ],
    };
  },
};
