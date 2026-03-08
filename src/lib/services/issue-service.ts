import { eq, and, gt, inArray, desc, count, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  detectedIssues,
  suggestedFixes,
  auditLog,
  instances,
  queueItems,
  type DetectedIssue,
  type SuggestedFix,
  type QueueItem,
} from "../db/schema";
import type { DetectedIssueInput } from "../issues/types";

export interface IssueWithFixes extends DetectedIssue {
  fixes: SuggestedFix[];
}

/**
 * Batch-attach fixes to a list of issues in a single query (avoids N+1).
 */
function attachFixes(db: ReturnType<typeof getDb>, issues: DetectedIssue[]): IssueWithFixes[] {
  if (issues.length === 0) return [];

  const issueIds = issues.map((i) => i.id);
  const allFixes = db
    .select()
    .from(suggestedFixes)
    .where(inArray(suggestedFixes.issueId, issueIds))
    .all();

  const fixesByIssue = new Map<number, SuggestedFix[]>();
  for (const fix of allFixes) {
    const list = fixesByIssue.get(fix.issueId) ?? [];
    list.push(fix);
    fixesByIssue.set(fix.issueId, list);
  }

  return issues.map((issue) => ({
    ...issue,
    fixes: fixesByIssue.get(issue.id) ?? [],
  }));
}

export function getActiveIssueCounts(): { instanceId: number; count: number }[] {
  const db = getDb();
  return db
    .select({
      instanceId: detectedIssues.instanceId,
      count: count(),
    })
    .from(detectedIssues)
    .where(eq(detectedIssues.status, "active"))
    .groupBy(detectedIssues.instanceId)
    .all();
}

export function getActiveIssues(instanceId?: number): IssueWithFixes[] {
  const db = getDb();
  const conditions = instanceId
    ? and(eq(detectedIssues.instanceId, instanceId), eq(detectedIssues.status, "active"))
    : eq(detectedIssues.status, "active");

  const issues = db.select().from(detectedIssues).where(conditions).all();
  return attachFixes(db, issues);
}

export function getAllIssues(instanceId?: number): IssueWithFixes[] {
  const db = getDb();
  const issues = instanceId
    ? db.select().from(detectedIssues).where(eq(detectedIssues.instanceId, instanceId)).all()
    : db.select().from(detectedIssues).all();

  return attachFixes(db, issues);
}

export function getIssue(id: number): IssueWithFixes | undefined {
  const db = getDb();
  const issue = db.select().from(detectedIssues).where(eq(detectedIssues.id, id)).get();
  if (!issue) return undefined;

  return attachFixes(db, [issue])[0];
}

export function getFix(id: number): SuggestedFix | undefined {
  const db = getDb();
  return db.select().from(suggestedFixes).where(eq(suggestedFixes.id, id)).get();
}

export function persistDetectedIssues(
  instanceId: number,
  results: { queueItem: QueueItem; issue: DetectedIssueInput }[],
) {
  const db = getDb();

  for (const { queueItem, issue } of results) {
    // Check for existing active issue of same type for same queue item
    const existing = db
      .select()
      .from(detectedIssues)
      .where(
        and(
          eq(detectedIssues.instanceId, instanceId),
          eq(detectedIssues.externalQueueId, queueItem.externalId),
          eq(detectedIssues.type, issue.type),
          eq(detectedIssues.status, "active"),
        ),
      )
      .get();

    const fixValues = (issueId: number) =>
      issue.suggestedFixes.map((fix) => ({
        issueId,
        action: fix.action,
        label: fix.label,
        description: fix.description,
        priority: fix.priority,
        automatable: fix.automatable,
        params: fix.params ? JSON.stringify(fix.params) : null,
      }));

    if (existing) {
      // Update existing issue with potentially improved enrichment data
      db.update(detectedIssues)
        .set({
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
        })
        .where(eq(detectedIssues.id, existing.id))
        .run();

      // Replace fixes with enriched versions
      db.delete(suggestedFixes)
        .where(eq(suggestedFixes.issueId, existing.id))
        .run();

      const values = fixValues(existing.id);
      if (values.length > 0) {
        db.insert(suggestedFixes).values(values).run();
      }

      continue;
    }

    const newIssue = db
      .insert(detectedIssues)
      .values({
        instanceId,
        queueItemId: queueItem.id,
        externalQueueId: queueItem.externalId,
        type: issue.type,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
      })
      .returning()
      .get();

    const values = fixValues(newIssue.id);
    if (values.length > 0) {
      db.insert(suggestedFixes).values(values).run();
    }
  }
}

export function resolveIssuesForGoneItems(instanceId: number) {
  const db = getDb();
  const now = new Date().toISOString();

  // Join issues with queue items to find gone items in a single query,
  // instead of N+1 lookups per issue
  const issuesToResolve = db
    .select({ issueId: detectedIssues.id })
    .from(detectedIssues)
    .innerJoin(queueItems, eq(detectedIssues.queueItemId, queueItems.id))
    .where(
      and(
        eq(detectedIssues.instanceId, instanceId),
        eq(detectedIssues.status, "active"),
        eq(queueItems.isGone, true),
      ),
    )
    .all();

  if (issuesToResolve.length === 0) return;

  const ids = issuesToResolve.map((r) => r.issueId);
  db.update(detectedIssues)
    .set({ status: "resolved", resolvedAt: now })
    .where(inArray(detectedIssues.id, ids))
    .run();
}

export function dismissIssue(id: number): boolean {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db
    .update(detectedIssues)
    .set({ status: "dismissed", resolvedAt: now })
    .where(eq(detectedIssues.id, id))
    .returning()
    .get();

  if (result) {
    db.insert(auditLog)
      .values({
        instanceId: result.instanceId,
        issueId: id,
        action: "dismiss_issue",
        source: "user",
        details: JSON.stringify({ issueType: result.type, title: result.title }),
      })
      .run();
  }

  return !!result;
}

export function dismissAllIssues(instanceId: number): number {
  const db = getDb();
  const now = new Date().toISOString();

  const activeIssues = db
    .select({ id: detectedIssues.id })
    .from(detectedIssues)
    .where(and(eq(detectedIssues.instanceId, instanceId), eq(detectedIssues.status, "active")))
    .all();

  if (activeIssues.length === 0) return 0;

  const ids = activeIssues.map((i) => i.id);
  db.update(detectedIssues)
    .set({ status: "dismissed", resolvedAt: now })
    .where(inArray(detectedIssues.id, ids))
    .run();

  db.insert(auditLog)
    .values({
      instanceId,
      action: "dismiss_all_issues",
      source: "user",
      details: JSON.stringify({ count: activeIssues.length }),
    })
    .run();

  return activeIssues.length;
}

export function markFixExecuted(fixId: number, result: string) {
  const db = getDb();
  db.update(suggestedFixes)
    .set({ executedAt: new Date().toISOString(), executionResult: result })
    .where(eq(suggestedFixes.id, fixId))
    .run();
}

export function resolveIssue(id: number) {
  const db = getDb();
  db.update(detectedIssues)
    .set({ status: "resolved", resolvedAt: new Date().toISOString() })
    .where(eq(detectedIssues.id, id))
    .run();
}

export function writeAuditLog(entry: {
  instanceId?: number | null;
  issueId?: number | null;
  action: string;
  source: "user" | "system" | "automation";
  details?: Record<string, unknown>;
}) {
  const db = getDb();
  db.insert(auditLog)
    .values({
      instanceId: entry.instanceId ?? null,
      issueId: entry.issueId ?? null,
      action: entry.action,
      source: entry.source,
      details: entry.details ? JSON.stringify(entry.details) : null,
    })
    .run();
}

export function getRecentAuditLog(limit = 100, afterId?: number) {
  const db = getDb();

  const conditions = afterId
    ? gt(auditLog.id, afterId)
    : undefined;

  return db
    .select({
      id: auditLog.id,
      instanceId: auditLog.instanceId,
      instanceName: instances.name,
      instanceType: instances.type,
      issueId: auditLog.issueId,
      action: auditLog.action,
      source: auditLog.source,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(instances, eq(auditLog.instanceId, instances.id))
    .where(conditions)
    .orderBy(desc(auditLog.id))
    .limit(limit)
    .all();
}

export function getDashboardStats() {
  const db = getDb();

  const instanceStats = db
    .select({
      total: count(),
      healthy: count(
        sql`CASE WHEN ${instances.lastHealthStatus} = 'healthy' THEN 1 END`,
      ),
    })
    .from(instances)
    .get()!;

  const issueStats = db
    .select({
      total: count(),
      critical: count(
        sql`CASE WHEN ${detectedIssues.severity} = 'critical' THEN 1 END`,
      ),
      warning: count(
        sql`CASE WHEN ${detectedIssues.severity} = 'warning' THEN 1 END`,
      ),
    })
    .from(detectedIssues)
    .where(eq(detectedIssues.status, "active"))
    .get()!;

  return {
    totalInstances: instanceStats.total,
    healthyInstances: instanceStats.healthy,
    activeIssues: issueStats.total,
    criticalIssues: issueStats.critical,
    warningIssues: issueStats.warning,
  };
}
