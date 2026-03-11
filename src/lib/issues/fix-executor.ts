import type { ArrClient } from "../arr-client/client";
import type { SuggestedFix, Instance } from "../db/schema";
import type { IssueWithFixes } from "../services/issue-service";
import { getQueueItemByExternalId } from "../services/queue-service";
import { markFixExecuted, resolveIssue, writeAuditLog } from "../services/issue-service";
import { executeFix } from "./fixes";
import type { FixAction } from "./types";

export interface FixExecutionResult {
  issueId: number;
  fixId: number;
  success: boolean;
  message: string;
}

/**
 * Build the params needed to execute a fix, merging stored params with
 * runtime data like downloadId and outputPath from the queue item.
 */
export function buildFixParams(
  fix: SuggestedFix,
  instanceId: number,
  externalQueueId: number,
): Record<string, unknown> {
  const fixParams: Record<string, unknown> = fix.params ? JSON.parse(fix.params) : {};
  if (fix.action === "select_movie_import" || fix.action === "force_import") {
    const queueItem = getQueueItemByExternalId(instanceId, externalQueueId);
    if (queueItem?.downloadId) fixParams.downloadId = queueItem.downloadId;
    if (queueItem?.outputPath) fixParams.outputPath = queueItem.outputPath;
  }
  return fixParams;
}

/**
 * Selects the highest-priority automatable, unexecuted fix for each issue.
 */
export function selectBestFixes(
  issues: IssueWithFixes[],
): { issue: IssueWithFixes; fix: SuggestedFix }[] {
  return issues
    .map((issue) => {
      const bestFix = issue.fixes
        .filter((f) => f.automatable && !f.executedAt)
        .sort((a, b) => a.priority - b.priority)[0];
      return bestFix ? { issue, fix: bestFix } : null;
    })
    .filter((item): item is { issue: IssueWithFixes; fix: SuggestedFix } => item !== null);
}

/**
 * Execute a single fix against the Arr API and record the result.
 * Returns null if the issue has no externalQueueId.
 */
export async function executeAndRecordFix(
  client: ArrClient,
  instance: Instance,
  issue: IssueWithFixes,
  fix: SuggestedFix,
  source: "user" | "automation",
  auditDetails?: Record<string, unknown>,
): Promise<FixExecutionResult> {
  if (!issue.externalQueueId) {
    return { issueId: issue.id, fixId: fix.id, success: false, message: "No external queue ID" };
  }

  const fixParams = buildFixParams(fix, issue.instanceId, issue.externalQueueId);
  const result = await executeFix(client, issue.externalQueueId, fix.action as FixAction, fixParams);

  markFixExecuted(fix.id, JSON.stringify(result));

  if (result.success) {
    resolveIssue(issue.id);
  }

  writeAuditLog({
    instanceId: instance.id,
    issueId: issue.id,
    action: `fix_${fix.action}`,
    source,
    details: { fixId: fix.id, result, ...auditDetails },
  });

  return { issueId: issue.id, fixId: fix.id, ...result };
}
