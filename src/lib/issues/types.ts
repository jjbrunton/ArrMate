import type { QueueItem } from "../db/schema";

export type IssueType = "stalled" | "failed" | "duplicate" | "missing_files" | "import_blocked" | "import_pending" | "slow_download";

export type IssueSeverity = "critical" | "warning" | "info";

export type FixAction =
  | "remove_and_blocklist"
  | "remove_keep_files"
  | "retry_download"
  | "grab_release"
  | "force_import"
  | "select_movie_import";

export interface SuggestedFixInput {
  action: FixAction;
  label: string;
  description: string;
  priority: number;
  automatable: boolean;
  params?: Record<string, unknown>;
}

export interface DetectedIssueInput {
  type: IssueType;
  severity: IssueSeverity;
  title: string;
  description: string;
  suggestedFixes: SuggestedFixInput[];
}

export interface IssueContext {
  instanceId: number;
  instanceType: "sonarr" | "radarr";
}

export interface IssueRule {
  name: string;
  priority: number; // higher = checked first
  analyze(item: QueueItem, context: IssueContext): DetectedIssueInput | null;
}
