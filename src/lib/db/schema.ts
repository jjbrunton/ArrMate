import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { INSTANCE_TYPE_VALUES } from "../instances/definitions";

export const instances = sqliteTable("instances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: INSTANCE_TYPE_VALUES }).notNull(),
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key").notNull(), // encrypted
  pollIntervalSeconds: integer("poll_interval_seconds").notNull().default(300),
  qualityCheckMaxItems: integer("quality_check_max_items").notNull().default(50),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  autoFix: integer("auto_fix", { mode: "boolean" }).notNull().default(false),
  lastHealthCheck: text("last_health_check"),
  lastHealthStatus: text("last_health_status", { enum: ["healthy", "unhealthy", "unknown"] }).default("unknown"),
  lastPolledAt: text("last_polled_at"),
  lastQualityCheckAt: text("last_quality_check_at"),
  mediaSyncIntervalSeconds: integer("media_sync_interval_seconds").notNull().default(3600),
  lastMediaSyncAt: text("last_media_sync_at"),
  requestSyncIntervalSeconds: integer("request_sync_interval_seconds"),
  lastRequestSyncAt: text("last_request_sync_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const queueItems = sqliteTable("queue_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id").notNull().references(() => instances.id, { onDelete: "cascade" }),
  externalId: integer("external_id").notNull(),
  title: text("title").notNull(),
  status: text("status"), // e.g., "downloading", "completed", "failed"
  trackedDownloadState: text("tracked_download_state"),
  trackedDownloadStatus: text("tracked_download_status"),
  statusMessages: text("status_messages"), // JSON array
  protocol: text("protocol"),
  downloadClient: text("download_client"),
  sizeBytes: integer("size_bytes"),
  sizeLeftBytes: integer("size_left_bytes"),
  timeleft: text("timeleft"),
  estimatedCompletionTime: text("estimated_completion_time"),
  downloadId: text("download_id"),
  outputPath: text("output_path"),
  firstSeenAt: text("first_seen_at").notNull().default(sql`(datetime('now'))`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`(datetime('now'))`),
  isGone: integer("is_gone", { mode: "boolean" }).notNull().default(false),
});

export const detectedIssues = sqliteTable("detected_issues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id").notNull().references(() => instances.id, { onDelete: "cascade" }),
  queueItemId: integer("queue_item_id").references(() => queueItems.id, { onDelete: "set null" }),
  externalQueueId: integer("external_queue_id"),
  type: text("type").notNull(), // stalled, failed, duplicate, missing_files, import_pending, slow_download
  severity: text("severity", { enum: ["critical", "warning", "info"] }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: ["active", "dismissed", "resolved"] }).notNull().default("active"),
  detectedAt: text("detected_at").notNull().default(sql`(datetime('now'))`),
  resolvedAt: text("resolved_at"),
});

export const suggestedFixes = sqliteTable("suggested_fixes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  issueId: integer("issue_id").notNull().references(() => detectedIssues.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // remove_and_blocklist, remove_keep_files, retry_download, grab_release, force_import
  label: text("label").notNull(),
  description: text("description"),
  priority: integer("priority").notNull().default(0),
  automatable: integer("automatable", { mode: "boolean" }).notNull().default(false),
  params: text("params"), // JSON
  executedAt: text("executed_at"),
  executionResult: text("execution_result"),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id").references(() => instances.id, { onDelete: "set null" }),
  issueId: integer("issue_id").references(() => detectedIssues.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  source: text("source", { enum: ["user", "system", "automation"] }).notNull(),
  details: text("details"), // JSON
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  instanceActionCreatedAtIdx: index("audit_log_instance_action_created_at_idx").on(
    table.instanceId,
    table.action,
    table.createdAt,
  ),
}));

export const qualitySearchItems = sqliteTable("quality_search_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id").notNull().references(() => instances.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull(),
  source: text("source", { enum: ["user", "automation"] }).notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  instanceItemCreatedAtIdx: index("quality_search_items_instance_item_created_at_idx").on(
    table.instanceId,
    table.itemId,
    table.createdAt,
  ),
}));

export const importedRequests = sqliteTable("imported_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id").notNull().references(() => instances.id, { onDelete: "cascade" }),
  externalId: integer("external_id").notNull(),
  mediaType: text("media_type", { enum: ["movie", "tv"] }).notNull(),
  title: text("title").notNull(),
  tmdbId: integer("tmdb_id"),
  requestStatus: integer("request_status"),
  mediaStatus: integer("media_status"),
  status: text("status").notNull(),
  requestedByDisplayName: text("requested_by_display_name").notNull(),
  requestedByEmail: text("requested_by_email"),
  requestedAt: text("requested_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  instanceExternalIdIdx: uniqueIndex("imported_requests_instance_external_id_idx").on(
    table.instanceId,
    table.externalId,
  ),
  instanceStatusRequestedAtIdx: index("imported_requests_instance_status_requested_at_idx").on(
    table.instanceId,
    table.status,
    table.requestedAt,
  ),
}));

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => ({
  expiresAtIdx: index("auth_sessions_expires_at_idx").on(table.expiresAt),
}));

export const authAdmin = sqliteTable("auth_admin", {
  id: integer("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const authLoginAttempts = sqliteTable("auth_login_attempts", {
  ipAddress: text("ip_address").primaryKey(),
  failureCount: integer("failure_count").notNull().default(0),
  firstFailedAt: text("first_failed_at").notNull(),
  lastFailedAt: text("last_failed_at").notNull(),
  blockedUntil: text("blocked_until"),
}, (table) => ({
  blockedUntilIdx: index("auth_login_attempts_blocked_until_idx").on(table.blockedUntil),
}));

export const cachedMovies = sqliteTable("cached_movies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id").notNull().references(() => instances.id, { onDelete: "cascade" }),
  externalId: integer("external_id").notNull(),
  title: text("title").notNull(),
  year: integer("year"),
  tmdbId: integer("tmdb_id"),
  imdbId: text("imdb_id"),
  status: text("status"),
  monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
  hasFile: integer("has_file", { mode: "boolean" }).notNull().default(false),
  qualityProfileId: integer("quality_profile_id"),
  sizeOnDisk: integer("size_on_disk"),
  rootFolderPath: text("root_folder_path"),
  path: text("path"),
  movieFileQuality: text("movie_file_quality"), // JSON
  belowCutoff: integer("below_cutoff", { mode: "boolean" }).notNull().default(false),
  wantedQualityName: text("wanted_quality_name"),
  qualityLastSearchAt: text("quality_last_search_at"),
  syncedAt: text("synced_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  instanceBelowCutoffIdx: index("cached_movies_instance_below_cutoff_idx").on(table.instanceId, table.belowCutoff),
  instanceMonitoredHasFileIdx: index("cached_movies_instance_monitored_has_file_idx").on(
    table.instanceId,
    table.monitored,
    table.hasFile,
  ),
  instanceExternalIdIdx: index("cached_movies_instance_external_id_idx").on(table.instanceId, table.externalId),
}));

export const cachedSeries = sqliteTable("cached_series", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id").notNull().references(() => instances.id, { onDelete: "cascade" }),
  externalId: integer("external_id").notNull(),
  title: text("title").notNull(),
  year: integer("year"),
  tvdbId: integer("tvdb_id"),
  imdbId: text("imdb_id"),
  status: text("status"),
  seriesType: text("series_type"),
  monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
  qualityProfileId: integer("quality_profile_id"),
  seasonCount: integer("season_count"),
  path: text("path"),
  rootFolderPath: text("root_folder_path"),
  totalEpisodeCount: integer("total_episode_count"),
  episodeFileCount: integer("episode_file_count"),
  episodeCount: integer("episode_count"),
  sizeOnDisk: integer("size_on_disk"),
  percentOfEpisodes: integer("percent_of_episodes"),
  syncedAt: text("synced_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  instanceExternalIdIdx: index("cached_series_instance_external_id_idx").on(table.instanceId, table.externalId),
  instanceMonitoredIdx: index("cached_series_instance_monitored_idx").on(table.instanceId, table.monitored),
}));

export const cachedEpisodes = sqliteTable("cached_episodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id").notNull().references(() => instances.id, { onDelete: "cascade" }),
  seriesCacheId: integer("series_cache_id").notNull().references(() => cachedSeries.id, { onDelete: "cascade" }),
  externalId: integer("external_id").notNull(),
  seriesExternalId: integer("series_external_id").notNull(),
  seasonNumber: integer("season_number").notNull(),
  episodeNumber: integer("episode_number").notNull(),
  title: text("title"),
  airDateUtc: text("air_date_utc"),
  monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
  hasFile: integer("has_file", { mode: "boolean" }).notNull().default(false),
  episodeFileQuality: text("episode_file_quality"), // JSON
  episodeFileSize: integer("episode_file_size"),
  belowCutoff: integer("below_cutoff", { mode: "boolean" }).notNull().default(false),
  wantedQualityName: text("wanted_quality_name"),
  qualityLastSearchAt: text("quality_last_search_at"),
  syncedAt: text("synced_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  instanceBelowCutoffIdx: index("cached_episodes_instance_below_cutoff_idx").on(table.instanceId, table.belowCutoff),
  instanceSeriesExternalIdIdx: index("cached_episodes_instance_series_external_id_idx").on(
    table.instanceId,
    table.seriesExternalId,
  ),
  instanceMonitoredHasFileAirDateIdx: index("cached_episodes_instance_monitored_has_file_air_date_idx").on(
    table.instanceId,
    table.monitored,
    table.hasFile,
    table.airDateUtc,
  ),
  instanceExternalIdIdx: index("cached_episodes_instance_external_id_idx").on(table.instanceId, table.externalId),
}));

// Type exports
export type Instance = typeof instances.$inferSelect;
export type NewInstance = typeof instances.$inferInsert;
export type QueueItem = typeof queueItems.$inferSelect;
export type NewQueueItem = typeof queueItems.$inferInsert;
export type DetectedIssue = typeof detectedIssues.$inferSelect;
export type NewDetectedIssue = typeof detectedIssues.$inferInsert;
export type SuggestedFix = typeof suggestedFixes.$inferSelect;
export type NewSuggestedFix = typeof suggestedFixes.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type QualitySearchItem = typeof qualitySearchItems.$inferSelect;
export type NewQualitySearchItem = typeof qualitySearchItems.$inferInsert;
export type ImportedRequest = typeof importedRequests.$inferSelect;
export type NewImportedRequest = typeof importedRequests.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
export type AuthAdmin = typeof authAdmin.$inferSelect;
export type NewAuthAdmin = typeof authAdmin.$inferInsert;
export type AuthLoginAttempt = typeof authLoginAttempts.$inferSelect;
export type NewAuthLoginAttempt = typeof authLoginAttempts.$inferInsert;
export type CachedMovie = typeof cachedMovies.$inferSelect;
export type NewCachedMovie = typeof cachedMovies.$inferInsert;
export type CachedSeries = typeof cachedSeries.$inferSelect;
export type NewCachedSeries = typeof cachedSeries.$inferInsert;
export type CachedEpisode = typeof cachedEpisodes.$inferSelect;
export type NewCachedEpisode = typeof cachedEpisodes.$inferInsert;
