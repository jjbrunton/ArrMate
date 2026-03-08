import type { IssueRule } from "../types";
import { parseStatusMessages } from "../../utils/parse-status-messages";

const STALLED_KEYWORDS = ["stalled", "no connections", "not seeded", "unavailable"];
const STALLED_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

export const stalledRule: IssueRule = {
  name: "stalled",
  priority: 90,

  analyze(item) {
    const messages = parseStatusMessages(item.statusMessages);
    const hasKeyword = messages.some((msg) =>
      STALLED_KEYWORDS.some((kw) => msg.toLowerCase().includes(kw)),
    );

    const noProgress =
      item.sizeBytes &&
      item.sizeLeftBytes &&
      item.sizeBytes === item.sizeLeftBytes &&
      isOlderThan(item.firstSeenAt, STALLED_TIMEOUT_MS);

    if (!hasKeyword && !noProgress) return null;

    return {
      type: "stalled",
      severity: "warning",
      title: `Download stalled: ${item.title}`,
      description: hasKeyword
        ? `Download is stalled. Status: ${messages.join("; ")}`
        : "Download has made no progress for over 60 minutes.",
      suggestedFixes: [
        {
          action: "remove_and_blocklist",
          label: "Blocklist & search",
          description: "Blocklist this release and search for another",
          priority: 1,
          automatable: true,
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

function isOlderThan(dateStr: string, ms: number): boolean {
  const date = new Date(dateStr);
  return Date.now() - date.getTime() > ms;
}
