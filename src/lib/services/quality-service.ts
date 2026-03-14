import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { CommandResponse, CutoffUnmetRecord, QualityInfo, QualityProfile } from "../arr-client/types";
import { getDb } from "../db";
import {
  auditLog,
  cachedEpisodes,
  cachedMovies,
  cachedSeries,
  qualitySearchItems,
} from "../db/schema";
import {
  DEFAULT_QUALITY_CHECK_STRATEGY,
  orderQualityCheckRecords,
  type QualityCheckStrategy,
} from "../quality-check-strategy";
import { buildProfileCutoffMap, formatQualitySearchRecordLabel, getRecordQuality } from "./cutoff-service";

type InstanceType = "sonarr" | "radarr";
const QUALITY_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface QualityStatusSummary {
  trackedItems: number;
  healthy: number;
  wrongQuality: number;
  missing: number;
}

export interface QualityUpgradeHistoryEntry {
  searchesSent: number;
  lastSearchSentAt: string | null;
}

export interface QualityUpgradeHistorySummary {
  totalBatchesSent: number;
  totalItemsSent: number;
  lastSearchSentAt: string | null;
}

export interface QualitySearchBatchItem {
  id: number;
  label: string;
}

export interface QualitySearchBatch {
  source: "user" | "automation";
  requestedCount: number;
  createdAt: string;
  items: QualitySearchBatchItem[];
}

export interface QualityPageRecord {
  id: number;
  title?: string;
  year?: number;
  movieFile?: { quality: QualityInfo };
  series?: { id: number; title: string; qualityProfileId?: number };
  episode?: { title: string; seasonNumber: number; episodeNumber: number };
  episodeFile?: { quality: QualityInfo };
  wantedQualityName: string | null;
  lastCheckAt: string | null;
  nextCheckAt: string | null;
  upgradeSearchCount: number;
  lastUpgradeSearchAt: string | null;
}

export interface QualityPageResponse {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: QualityPageRecord[];
  statusSummary: QualityStatusSummary;
  upgradeHistory: QualityUpgradeHistorySummary;
  recentSearches: QualitySearchBatch[];
}

function parseQualityInfo(raw: string | null): QualityInfo | undefined {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Partial<QualityInfo>;
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.quality &&
      typeof parsed.quality === "object" &&
      typeof parsed.quality.name === "string"
    ) {
      return parsed as QualityInfo;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function getNextCheckAt(lastCheckAt: string | null): string | null {
  if (!lastCheckAt) return null;

  const timestamp = Date.parse(lastCheckAt);
  if (Number.isNaN(timestamp)) return null;

  return new Date(timestamp + QUALITY_CHECK_INTERVAL_MS).toISOString();
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function getTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function getLatestKnownQualitySearchAt(...values: Array<string | null | undefined>): string | null {
  let latestValue: string | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    const timestamp = getTimestamp(value);
    if (timestamp > latestTimestamp && value) {
      latestTimestamp = timestamp;
      latestValue = value;
    }
  }

  return latestValue;
}

export function isQualitySearchDue(lastSearchAt: string | null | undefined, now = new Date()): boolean {
  const lastSearchTimestamp = getTimestamp(lastSearchAt);
  return lastSearchTimestamp === Number.NEGATIVE_INFINITY
    || now.getTime() - lastSearchTimestamp >= QUALITY_CHECK_INTERVAL_MS;
}

interface StoredQualityInfo {
  lastSearchAt: string | null;
  belowCutoff: boolean;
  monitored: boolean;
}

function getStoredQualityInfoMap(
  instanceId: number,
  instanceType: InstanceType,
  itemIds: number[],
): Map<number, StoredQualityInfo> {
  if (itemIds.length === 0) return new Map();

  const db = getDb();

  if (instanceType === "radarr") {
    const rows = db
      .select({
        itemId: cachedMovies.externalId,
        lastSearchAt: cachedMovies.qualityLastSearchAt,
        belowCutoff: cachedMovies.belowCutoff,
        monitored: cachedMovies.monitored,
      })
      .from(cachedMovies)
      .where(and(
        eq(cachedMovies.instanceId, instanceId),
        inArray(cachedMovies.externalId, itemIds),
      ))
      .all();

    return new Map(rows.map((row) => [row.itemId, {
      lastSearchAt: row.lastSearchAt ?? null,
      belowCutoff: row.belowCutoff,
      monitored: row.monitored,
    }]));
  }

  const rows = db
    .select({
      itemId: cachedEpisodes.externalId,
      lastSearchAt: cachedEpisodes.qualityLastSearchAt,
      belowCutoff: cachedEpisodes.belowCutoff,
      monitored: cachedEpisodes.monitored,
    })
    .from(cachedEpisodes)
    .where(and(
      eq(cachedEpisodes.instanceId, instanceId),
      inArray(cachedEpisodes.externalId, itemIds),
    ))
    .all();

  return new Map(rows.map((row) => [row.itemId, {
    lastSearchAt: row.lastSearchAt ?? null,
    belowCutoff: row.belowCutoff,
    monitored: row.monitored,
  }]));
}

export function partitionQualitySearchableItemIds(
  instanceId: number,
  instanceType: InstanceType,
  itemIds: number[],
  now = new Date(),
): {
  searchableIds: number[];
  skippedIds: number[];
  cutoffMetIds: number[];
} {
  const storedInfoMap = getStoredQualityInfoMap(instanceId, instanceType, itemIds);

  return itemIds.reduce<{
    searchableIds: number[];
    skippedIds: number[];
    cutoffMetIds: number[];
  }>((result, itemId) => {
    const info = storedInfoMap.get(itemId);

    if (info && (!info.belowCutoff || !info.monitored)) {
      result.cutoffMetIds.push(itemId);
    } else if (isQualitySearchDue(info?.lastSearchAt ?? null, now)) {
      result.searchableIds.push(itemId);
    } else {
      result.skippedIds.push(itemId);
    }

    return result;
  }, { searchableIds: [], skippedIds: [], cutoffMetIds: [] });
}

export function getDueQualitySearchRecords(
  instanceId: number,
  instanceType: InstanceType,
  records: CutoffUnmetRecord[],
  maxItems: number,
  now = new Date(),
  strategy: QualityCheckStrategy = DEFAULT_QUALITY_CHECK_STRATEGY,
): CutoffUnmetRecord[] {
  const storedInfoMap = getStoredQualityInfoMap(
    instanceId,
    instanceType,
    records.map((record) => record.id),
  );

  const lastSearchAtById = new Map(
    Array.from(storedInfoMap.entries()).map(([id, info]) => [id, info.lastSearchAt]),
  );

  const dueRecords = records
    .filter((record) => {
      const info = storedInfoMap.get(record.id);
      if (info && (!info.belowCutoff || !info.monitored)) return false;

      return isQualitySearchDue(
        getLatestKnownQualitySearchAt(
          record.lastSearchTime ?? null,
          info?.lastSearchAt ?? null,
        ),
        now,
      );
    });

  return orderQualityCheckRecords(dueRecords, strategy, { lastSearchAtById }).slice(0, maxItems);
}

export interface QualitySearchLogItem {
  id: number;
  label: string;
}

interface QualitySearchAuditDetails {
  itemIds?: unknown;
  requestedCount?: unknown;
}

export function getQualitySearchLogItems(
  instanceId: number,
  instanceType: InstanceType,
  itemIds: number[],
): QualitySearchLogItem[] {
  if (itemIds.length === 0) return [];

  const db = getDb();

  if (instanceType === "radarr") {
    const rows = db
      .select({
        id: cachedMovies.externalId,
        title: cachedMovies.title,
        year: cachedMovies.year,
      })
      .from(cachedMovies)
      .where(and(
        eq(cachedMovies.instanceId, instanceId),
        inArray(cachedMovies.externalId, itemIds),
      ))
      .all();

    const labelMap = new Map(rows.map((row) => [
      row.id,
      formatQualitySearchRecordLabel(instanceType, { ...row, year: row.year ?? undefined }),
    ]));

    return itemIds.map((itemId) => ({
      id: itemId,
      label: labelMap.get(itemId) ?? `Unknown movie (${itemId})`,
    }));
  }

  const rows = db
    .select({
      id: cachedEpisodes.externalId,
      seriesTitle: cachedSeries.title,
      episodeTitle: cachedEpisodes.title,
      seasonNumber: cachedEpisodes.seasonNumber,
      episodeNumber: cachedEpisodes.episodeNumber,
    })
    .from(cachedEpisodes)
    .innerJoin(cachedSeries, eq(cachedEpisodes.seriesCacheId, cachedSeries.id))
    .where(and(
      eq(cachedEpisodes.instanceId, instanceId),
      inArray(cachedEpisodes.externalId, itemIds),
    ))
    .all();

  const labelMap = new Map(rows.map((row) => [
    row.id,
    formatQualitySearchRecordLabel(instanceType, {
      id: row.id,
      series: { id: 0, title: row.seriesTitle },
      episode: {
        title: row.episodeTitle ?? "Unknown",
        seasonNumber: row.seasonNumber,
        episodeNumber: row.episodeNumber,
      },
    }),
  ]));

  return itemIds.map((itemId) => ({
    id: itemId,
    label: labelMap.get(itemId) ?? `Unknown episode (${itemId})`,
  }));
}

function parseQualitySearchAuditDetails(details: string | null): { itemIds: number[]; requestedCount: number } {
  if (!details) return { itemIds: [], requestedCount: 0 };

  try {
    const parsed = JSON.parse(details) as QualitySearchAuditDetails;
    const itemIds = Array.isArray(parsed.itemIds)
      ? parsed.itemIds.filter((value): value is number => typeof value === "number")
      : [];
    const requestedCount = typeof parsed.requestedCount === "number" ? parsed.requestedCount : itemIds.length;

    return { itemIds, requestedCount };
  } catch {
    return { itemIds: [], requestedCount: 0 };
  }
}

export function getRecentQualitySearchBatches(
  instanceId: number,
  instanceType: InstanceType,
  limit = 5,
): QualitySearchBatch[] {
  const db = getDb();
  const rows = db
    .select({
      id: auditLog.id,
      source: auditLog.source,
      createdAt: auditLog.createdAt,
      details: auditLog.details,
    })
    .from(auditLog)
    .where(and(eq(auditLog.instanceId, instanceId), eq(auditLog.action, "quality_search_sent")))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit)
    .all();

  const uniqueItemIds = Array.from(new Set(rows.flatMap((row) => parseQualitySearchAuditDetails(row.details).itemIds)));
  const labelMap = new Map(
    getQualitySearchLogItems(instanceId, instanceType, uniqueItemIds).map((item) => [item.id, item]),
  );

  return rows.map((row) => {
    const { itemIds, requestedCount } = parseQualitySearchAuditDetails(row.details);

    return {
      source: row.source as "user" | "automation",
      requestedCount,
      createdAt: row.createdAt,
      items: itemIds.map((itemId) => labelMap.get(itemId) ?? {
        id: itemId,
        label: instanceType === "radarr" ? `Unknown movie (${itemId})` : `Unknown episode (${itemId})`,
      }),
    };
  });
}

function markQualitySearchSent(instanceId: number, itemIds: number[], createdAt: string) {
  if (itemIds.length === 0) return;

  const db = getDb();
  db.update(cachedMovies)
    .set({ qualityLastSearchAt: createdAt })
    .where(and(eq(cachedMovies.instanceId, instanceId), inArray(cachedMovies.externalId, itemIds)))
    .run();

  db.update(cachedEpisodes)
    .set({ qualityLastSearchAt: createdAt })
    .where(and(eq(cachedEpisodes.instanceId, instanceId), inArray(cachedEpisodes.externalId, itemIds)))
    .run();
}

export function recordQualitySearch(
  instanceId: number,
  itemIds: number[],
  source: "user" | "automation",
  command?: Pick<CommandResponse, "id" | "commandName" | "status">,
) {
  if (itemIds.length === 0) return;

  const db = getDb();
  const createdAt = new Date().toISOString();

  db.transaction((tx) => {
    tx.insert(auditLog)
      .values({
        instanceId,
        action: "quality_search_sent",
        source,
        details: JSON.stringify({
          itemIds,
          requestedCount: itemIds.length,
          commandId: command?.id ?? null,
          commandName: command?.commandName ?? null,
          commandStatus: command?.status ?? null,
        }),
        createdAt,
      })
      .run();

    tx.insert(qualitySearchItems)
      .values(itemIds.map((itemId) => ({
        instanceId,
        itemId,
        source,
        createdAt,
      })))
      .run();
  });

  markQualitySearchSent(instanceId, itemIds, createdAt);
}

export function syncQualitySnapshot(
  instanceId: number,
  instanceType: InstanceType,
  records: CutoffUnmetRecord[],
  qualityProfiles: QualityProfile[],
) {
  const db = getDb();
  const profileCutoffMap = buildProfileCutoffMap(qualityProfiles);

  db.transaction((tx) => {
    if (instanceType === "radarr") {
      const existingLastSearchMap = records.length === 0
        ? new Map<number, string | null>()
        : new Map(
            tx.select({
              itemId: cachedMovies.externalId,
              lastSearchAt: cachedMovies.qualityLastSearchAt,
            })
              .from(cachedMovies)
              .where(and(
                eq(cachedMovies.instanceId, instanceId),
                inArray(cachedMovies.externalId, records.map((record) => record.id)),
              ))
              .all()
              .map((row) => [row.itemId, row.lastSearchAt ?? null]),
          );

      tx.update(cachedMovies)
        .set({
          belowCutoff: false,
          wantedQualityName: null,
        })
        .where(and(eq(cachedMovies.instanceId, instanceId), eq(cachedMovies.belowCutoff, true)))
        .run();

      for (const record of records) {
        const qualityProfileId = record.qualityProfileId ?? record.movie?.qualityProfileId;
        const quality = getRecordQuality(record);
        tx.update(cachedMovies)
          .set({
            belowCutoff: true,
            wantedQualityName: qualityProfileId ? (profileCutoffMap.get(qualityProfileId) ?? null) : null,
            qualityLastSearchAt: getLatestKnownQualitySearchAt(
              existingLastSearchMap.get(record.id) ?? null,
              record.lastSearchTime ?? null,
            ),
            qualityProfileId: qualityProfileId ?? undefined,
            movieFileQuality: quality ? JSON.stringify(quality) : undefined,
          })
          .where(and(eq(cachedMovies.instanceId, instanceId), eq(cachedMovies.externalId, record.id)))
          .run();
      }

      return;
    }

    const existingLastSearchMap = records.length === 0
      ? new Map<number, string | null>()
      : new Map(
          tx.select({
            itemId: cachedEpisodes.externalId,
            lastSearchAt: cachedEpisodes.qualityLastSearchAt,
          })
            .from(cachedEpisodes)
            .where(and(
              eq(cachedEpisodes.instanceId, instanceId),
              inArray(cachedEpisodes.externalId, records.map((record) => record.id)),
            ))
            .all()
            .map((row) => [row.itemId, row.lastSearchAt ?? null]),
        );

    tx.update(cachedEpisodes)
      .set({
        belowCutoff: false,
        wantedQualityName: null,
      })
      .where(and(eq(cachedEpisodes.instanceId, instanceId), eq(cachedEpisodes.belowCutoff, true)))
      .run();

    for (const record of records) {
      const qualityProfileId = record.series?.qualityProfileId;
      const quality = getRecordQuality(record);
      tx.update(cachedEpisodes)
        .set({
          belowCutoff: true,
          wantedQualityName: qualityProfileId ? (profileCutoffMap.get(qualityProfileId) ?? null) : null,
          qualityLastSearchAt: getLatestKnownQualitySearchAt(
            existingLastSearchMap.get(record.id) ?? null,
            record.lastSearchTime ?? null,
          ),
          episodeFileQuality: quality ? JSON.stringify(quality) : undefined,
        })
        .where(and(eq(cachedEpisodes.instanceId, instanceId), eq(cachedEpisodes.externalId, record.id)))
        .run();
    }
  });
}

export function getQualitySearchHistory(
  instanceId: number,
  itemIds: number[] = [],
): {
  byItemId: Map<number, QualityUpgradeHistoryEntry>;
  summary: QualityUpgradeHistorySummary;
} {
  const db = getDb();
  const summaryRow = db
    .select({
      totalBatchesSent: sql<number>`cast(count(*) as integer)`,
      lastSearchSentAt: sql<string | null>`max(${auditLog.createdAt})`,
    })
    .from(auditLog)
    .where(and(eq(auditLog.instanceId, instanceId), eq(auditLog.action, "quality_search_sent")))
    .get();

  const totalItemsRow = db
    .select({
      totalItemsSent: sql<number>`cast(count(*) as integer)`,
    })
    .from(qualitySearchItems)
    .where(eq(qualitySearchItems.instanceId, instanceId))
    .get();

  const byItemId = new Map<number, QualityUpgradeHistoryEntry>();

  if (itemIds.length > 0) {
    const itemRows = db
      .select({
        itemId: qualitySearchItems.itemId,
        searchesSent: sql<number>`cast(count(*) as integer)`,
        lastSearchSentAt: sql<string | null>`max(${qualitySearchItems.createdAt})`,
      })
      .from(qualitySearchItems)
      .where(and(
        eq(qualitySearchItems.instanceId, instanceId),
        inArray(qualitySearchItems.itemId, itemIds),
      ))
      .groupBy(qualitySearchItems.itemId)
      .all();

    for (const row of itemRows) {
      byItemId.set(row.itemId, {
        searchesSent: toNumber(row.searchesSent),
        lastSearchSentAt: row.lastSearchSentAt ?? null,
      });
    }
  }

  return {
    byItemId,
    summary: {
      totalBatchesSent: toNumber(summaryRow?.totalBatchesSent),
      totalItemsSent: toNumber(totalItemsRow?.totalItemsSent),
      lastSearchSentAt: summaryRow?.lastSearchSentAt ?? null,
    },
  };
}

export function getQualityStatusSummary(
  instanceId: number,
  instanceType: InstanceType,
  now = new Date(),
): QualityStatusSummary {
  const db = getDb();

  if (instanceType === "radarr") {
    const row = db
      .select({
        trackedItems: sql<number>`cast(count(*) as integer)`,
        missing: sql<number>`cast(sum(case when ${cachedMovies.hasFile} = 0 then 1 else 0 end) as integer)`,
        wrongQuality: sql<number>`cast(sum(case when ${cachedMovies.hasFile} = 1 and ${cachedMovies.belowCutoff} = 1 then 1 else 0 end) as integer)`,
      })
      .from(cachedMovies)
      .where(and(eq(cachedMovies.instanceId, instanceId), eq(cachedMovies.monitored, true)))
      .get();

    const trackedItems = toNumber(row?.trackedItems);
    const missing = toNumber(row?.missing);
    const wrongQuality = toNumber(row?.wrongQuality);

    return {
      trackedItems,
      healthy: trackedItems - missing - wrongQuality,
      wrongQuality,
      missing,
    };
  }

  const nowIso = now.toISOString();
  const row = db
    .select({
      trackedItems: sql<number>`cast(count(*) as integer)`,
      missing: sql<number>`cast(sum(case when ${cachedEpisodes.hasFile} = 0 then 1 else 0 end) as integer)`,
      wrongQuality: sql<number>`cast(sum(case when ${cachedEpisodes.hasFile} = 1 and ${cachedEpisodes.belowCutoff} = 1 then 1 else 0 end) as integer)`,
    })
    .from(cachedEpisodes)
    .innerJoin(cachedSeries, eq(cachedEpisodes.seriesCacheId, cachedSeries.id))
    .where(and(
      eq(cachedEpisodes.instanceId, instanceId),
      eq(cachedEpisodes.monitored, true),
      eq(cachedSeries.monitored, true),
      sql`(${cachedEpisodes.airDateUtc} is null or ${cachedEpisodes.airDateUtc} <= ${nowIso})`,
    ))
    .get();

  const trackedItems = toNumber(row?.trackedItems);
  const missing = toNumber(row?.missing);
  const wrongQuality = toNumber(row?.wrongQuality);

  return {
    trackedItems,
    healthy: trackedItems - missing - wrongQuality,
    wrongQuality,
    missing,
  };
}

function getMovieQualityRows(instanceId: number, page: number, pageSize: number): {
  totalRecords: number;
  records: QualityPageRecord[];
} {
  const db = getDb();
  const offset = (page - 1) * pageSize;
  const totalRow = db
    .select({ total: sql<number>`cast(count(*) as integer)` })
    .from(cachedMovies)
    .where(and(
      eq(cachedMovies.instanceId, instanceId),
      eq(cachedMovies.monitored, true),
      eq(cachedMovies.belowCutoff, true),
    ))
    .get();

  const rows = db
    .select({
      id: cachedMovies.externalId,
      title: cachedMovies.title,
      year: cachedMovies.year,
      movieFileQuality: cachedMovies.movieFileQuality,
      wantedQualityName: cachedMovies.wantedQualityName,
      lastCheckAt: cachedMovies.qualityLastSearchAt,
    })
    .from(cachedMovies)
    .where(and(
      eq(cachedMovies.instanceId, instanceId),
      eq(cachedMovies.monitored, true),
      eq(cachedMovies.belowCutoff, true),
    ))
    .orderBy(asc(cachedMovies.title), asc(cachedMovies.externalId))
    .limit(pageSize)
    .offset(offset)
    .all();

  return {
    totalRecords: toNumber(totalRow?.total),
    records: rows.map((row) => {
      const quality = parseQualityInfo(row.movieFileQuality);
      const lastCheckAt = row.lastCheckAt ?? null;

      return {
        id: row.id,
        title: row.title,
        year: row.year ?? undefined,
        movieFile: quality ? { quality } : undefined,
        wantedQualityName: row.wantedQualityName ?? null,
        lastCheckAt,
        nextCheckAt: getNextCheckAt(lastCheckAt),
        upgradeSearchCount: 0,
        lastUpgradeSearchAt: null,
      };
    }),
  };
}

function getEpisodeQualityRows(
  instanceId: number,
  page: number,
  pageSize: number,
  now: Date,
): {
  totalRecords: number;
  records: QualityPageRecord[];
} {
  const db = getDb();
  const offset = (page - 1) * pageSize;
  const nowIso = now.toISOString();
  const where = and(
    eq(cachedEpisodes.instanceId, instanceId),
    eq(cachedEpisodes.monitored, true),
    eq(cachedSeries.monitored, true),
    eq(cachedEpisodes.belowCutoff, true),
    sql`(${cachedEpisodes.airDateUtc} is null or ${cachedEpisodes.airDateUtc} <= ${nowIso})`,
  );

  const totalRow = db
    .select({ total: sql<number>`cast(count(*) as integer)` })
    .from(cachedEpisodes)
    .innerJoin(cachedSeries, eq(cachedEpisodes.seriesCacheId, cachedSeries.id))
    .where(where)
    .get();

  const rows = db
    .select({
      id: cachedEpisodes.externalId,
      seriesId: cachedSeries.externalId,
      seriesTitle: cachedSeries.title,
      seriesQualityProfileId: cachedSeries.qualityProfileId,
      seasonNumber: cachedEpisodes.seasonNumber,
      episodeNumber: cachedEpisodes.episodeNumber,
      episodeTitle: cachedEpisodes.title,
      episodeFileQuality: cachedEpisodes.episodeFileQuality,
      wantedQualityName: cachedEpisodes.wantedQualityName,
      lastCheckAt: cachedEpisodes.qualityLastSearchAt,
    })
    .from(cachedEpisodes)
    .innerJoin(cachedSeries, eq(cachedEpisodes.seriesCacheId, cachedSeries.id))
    .where(where)
    .orderBy(
      asc(cachedSeries.title),
      asc(cachedEpisodes.seasonNumber),
      asc(cachedEpisodes.episodeNumber),
      asc(cachedEpisodes.externalId),
    )
    .limit(pageSize)
    .offset(offset)
    .all();

  return {
    totalRecords: toNumber(totalRow?.total),
    records: rows.map((row) => {
      const quality = parseQualityInfo(row.episodeFileQuality);
      const lastCheckAt = row.lastCheckAt ?? null;

      return {
        id: row.id,
        series: {
          id: row.seriesId,
          title: row.seriesTitle,
          qualityProfileId: row.seriesQualityProfileId ?? undefined,
        },
        episode: {
          title: row.episodeTitle ?? "Unknown",
          seasonNumber: row.seasonNumber,
          episodeNumber: row.episodeNumber,
        },
        episodeFile: quality ? { quality } : undefined,
        wantedQualityName: row.wantedQualityName ?? null,
        lastCheckAt,
        nextCheckAt: getNextCheckAt(lastCheckAt),
        upgradeSearchCount: 0,
        lastUpgradeSearchAt: null,
      };
    }),
  };
}

export function getQualityPage(
  instanceId: number,
  instanceType: InstanceType,
  page: number,
  pageSize: number,
  now = new Date(),
): QualityPageResponse {
  const pageData = instanceType === "radarr"
    ? getMovieQualityRows(instanceId, page, pageSize)
    : getEpisodeQualityRows(instanceId, page, pageSize, now);
  const history = getQualitySearchHistory(instanceId, pageData.records.map((record) => record.id));
  const recentSearches = getRecentQualitySearchBatches(instanceId, instanceType);

  return {
    page,
    pageSize,
    totalRecords: pageData.totalRecords,
    records: pageData.records.map((record) => {
      const itemHistory = history.byItemId.get(record.id);
      return {
        ...record,
        upgradeSearchCount: itemHistory?.searchesSent ?? 0,
        lastUpgradeSearchAt: itemHistory?.lastSearchSentAt ?? null,
      };
    }),
    statusSummary: getQualityStatusSummary(instanceId, instanceType, now),
    upgradeHistory: history.summary,
    recentSearches,
  };
}
