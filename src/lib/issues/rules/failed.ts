import type { IssueRule } from "../types";

export const failedRule: IssueRule = {
  name: "failed",
  priority: 100,

  analyze(item) {
    const state = item.trackedDownloadState?.toLowerCase();
    if (state !== "failed" && state !== "failedpending") return null;

    return {
      type: "failed",
      severity: "critical",
      title: `Download failed: ${item.title}`,
      description: `The download has entered a failed state (${item.trackedDownloadState}).`,
      suggestedFixes: [
        {
          action: "retry_download",
          label: "Retry download",
          description: "Remove and search for a new release",
          priority: 1,
          automatable: true,
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
  },
};
