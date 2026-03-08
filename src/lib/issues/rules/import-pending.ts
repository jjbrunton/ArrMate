import type { IssueRule } from "../types";

const IMPORT_PENDING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const importPendingRule: IssueRule = {
  name: "import_pending",
  priority: 60,

  analyze(item) {
    const state = item.trackedDownloadState?.toLowerCase();
    const status = item.trackedDownloadStatus?.toLowerCase();

    if (state !== "importpending" && status !== "importpending") return null;

    const firstSeen = new Date(item.firstSeenAt);
    const elapsed = Date.now() - firstSeen.getTime();
    if (elapsed < IMPORT_PENDING_TIMEOUT_MS) return null;

    const minutes = Math.round(elapsed / 60_000);

    return {
      type: "import_pending",
      severity: "warning",
      title: `Import stuck: ${item.title}`,
      description: `Download has been pending import for ${minutes} minutes.`,
      suggestedFixes: [
        {
          action: "force_import",
          label: "Force import",
          description: "Attempt to force import (may require manual action in UI)",
          priority: 1,
          automatable: false,
        },
        {
          action: "retry_download",
          label: "Retry download",
          description: "Remove and search for a new release",
          priority: 2,
          automatable: true,
        },
      ],
    };
  },
};
