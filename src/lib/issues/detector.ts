import type { QueueItem } from "../db/schema";
import type { IssueContext, IssueRule, DetectedIssueInput } from "./types";
import { failedRule } from "./rules/failed";
import { stalledRule } from "./rules/stalled";
import { duplicateRule } from "./rules/duplicate";
import { missingFilesRule } from "./rules/missing-files";
import { importBlockedRule } from "./rules/import-blocked";
import { importPendingRule } from "./rules/import-pending";
import { slowDownloadRule } from "./rules/slow-download";

const rules: IssueRule[] = [
  failedRule,
  stalledRule,
  duplicateRule,
  missingFilesRule,
  importBlockedRule,
  importPendingRule,
  slowDownloadRule,
].sort((a, b) => b.priority - a.priority);

export interface DetectionResult {
  queueItem: QueueItem;
  issue: DetectedIssueInput;
}

export function detectIssues(items: QueueItem[], context: IssueContext): DetectionResult[] {
  const results: DetectionResult[] = [];

  for (const item of items) {
    if (item.isGone) continue;

    for (const rule of rules) {
      const issue = rule.analyze(item, context);
      if (issue) {
        results.push({ queueItem: item, issue });
        break; // one issue per item, highest priority wins
      }
    }
  }

  return results;
}
