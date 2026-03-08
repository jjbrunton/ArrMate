import { withApiAuth } from "@/lib/auth/request";
import { getActiveIssues, writeAuditLog } from "@/lib/services/issue-service";
import { getInstanceWithKey } from "@/lib/services/instance-service";
import { ArrClient } from "@/lib/arr-client/client";
import { decrypt } from "@/lib/crypto";
import { success, error } from "@/lib/utils/api-response";
import { selectBestFixes, executeAndRecordFix, type FixExecutionResult } from "@/lib/issues/fix-executor";

export const POST = withApiAuth(async () => {
  try {
    const issues = getActiveIssues();
    const toExecute = selectBestFixes(issues);

    if (toExecute.length === 0) {
      return success({ executed: 0, results: [] });
    }

    const byInstance = new Map<number, typeof toExecute>();
    for (const item of toExecute) {
      const list = byInstance.get(item.issue.instanceId) || [];
      list.push(item);
      byInstance.set(item.issue.instanceId, list);
    }

    const results: FixExecutionResult[] = [];

    for (const [instanceId, items] of byInstance) {
      const instance = getInstanceWithKey(instanceId);
      if (!instance) continue;

      const apiKey = decrypt(instance.apiKey);
      const client = new ArrClient(instance.baseUrl, apiKey, instance.type as "sonarr" | "radarr");

      for (const { issue, fix } of items) {
        try {
          const result = await executeAndRecordFix(client, instance, issue, fix, "automation", { trigger: "accept_all" });
          results.push(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Fix execution failed";
          results.push({ issueId: issue.id, fixId: fix.id, success: false, message });
        }
      }
    }

    const succeeded = results.filter((r) => r.success).length;

    writeAuditLog({
      action: "accept_all_fixes",
      source: "user",
      details: { total: results.length, succeeded, failed: results.length - succeeded },
    });

    return success({ executed: results.length, succeeded, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to execute fixes";
    return error(message, 500);
  }
});
