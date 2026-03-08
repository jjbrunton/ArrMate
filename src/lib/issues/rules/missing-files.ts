import type { IssueRule } from "../types";
import { parseStatusMessages } from "../../utils/parse-status-messages";

const MISSING_KEYWORDS = ["no files found", "no eligible files", "no video files", "sample only"];

export const missingFilesRule: IssueRule = {
  name: "missing_files",
  priority: 70,

  analyze(item) {
    const messages = parseStatusMessages(item.statusMessages);
    const hasMissing = messages.some((msg) =>
      MISSING_KEYWORDS.some((kw) => msg.toLowerCase().includes(kw)),
    );

    if (!hasMissing) return null;

    return {
      type: "missing_files",
      severity: "critical",
      title: `Missing files: ${item.title}`,
      description: `No eligible files found in download. Status: ${messages.join("; ")}`,
      suggestedFixes: [
        {
          action: "remove_and_blocklist",
          label: "Blocklist & search",
          description: "Blocklist this release and search for a proper one",
          priority: 1,
          automatable: true,
        },
        {
          action: "remove_keep_files",
          label: "Remove from queue",
          description: "Remove from queue and inspect files manually",
          priority: 2,
          automatable: false,
        },
      ],
    };
  },
};

