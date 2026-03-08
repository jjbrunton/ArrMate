import type { IssueRule } from "../types";
import { parseStatusMessages } from "../../utils/parse-status-messages";

const DUPLICATE_KEYWORDS = ["duplicate", "already exists", "already been imported", "has a duplicate"];

export const duplicateRule: IssueRule = {
  name: "duplicate",
  priority: 80,

  analyze(item) {
    const messages = parseStatusMessages(item.statusMessages);
    const hasDuplicate = messages.some((msg) =>
      DUPLICATE_KEYWORDS.some((kw) => msg.toLowerCase().includes(kw)),
    );

    if (!hasDuplicate) return null;

    return {
      type: "duplicate",
      severity: "warning",
      title: `Duplicate detected: ${item.title}`,
      description: `This download appears to be a duplicate. Status: ${messages.join("; ")}`,
      suggestedFixes: [
        {
          action: "remove_and_blocklist",
          label: "Remove & blocklist",
          description: "Remove the duplicate and blocklist the release",
          priority: 1,
          automatable: true,
        },
        {
          action: "remove_keep_files",
          label: "Remove from queue",
          description: "Remove from queue but keep files",
          priority: 2,
          automatable: false,
        },
      ],
    };
  },
};

