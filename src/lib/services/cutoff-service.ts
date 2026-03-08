import type {
  CutoffUnmetRecord,
  CutoffUnmetResponse,
  QualityInfo,
  QualityProfile,
  QualityProfileItem,
} from "../arr-client/types";
import { getCachedEpisodes, getCachedMovies, getCachedSeries } from "./media-cache-service";

type InstanceType = "sonarr" | "radarr";
const QUALITY_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface CutoffRecordWithTopLevelQuality extends CutoffUnmetRecord {
  quality?: QualityInfo;
}

export interface EnrichedCutoffRecord extends CutoffUnmetRecord {
  wantedQualityName: string | null;
  lastCheckAt: string | null;
  nextCheckAt: string | null;
}

export interface EnrichedCutoffResponse extends Omit<CutoffUnmetResponse, "records"> {
  records: EnrichedCutoffRecord[];
}

function formatEpisodeCode(seasonNumber: number, episodeNumber: number): string {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

export function formatQualitySearchRecordLabel(
  instanceType: InstanceType,
  record: Pick<CutoffUnmetRecord, "id" | "title" | "year" | "series" | "episode">,
): string {
  if (instanceType === "radarr") {
    const movieTitle = record.title ?? "Unknown movie";
    return record.year ? `${movieTitle} (${record.year})` : movieTitle;
  }

  const seriesTitle = record.series?.title ?? "Unknown series";
  const episode = record.episode;

  if (!episode) return seriesTitle;

  return `${seriesTitle} ${formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} - ${episode.title}`;
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

export function getRecordQuality(record: CutoffUnmetRecord): QualityInfo | undefined {
  return record.movieFile?.quality
    ?? record.episodeFile?.quality
    ?? (record as CutoffRecordWithTopLevelQuality).quality;
}

function flattenQualityProfileItems(items: QualityProfileItem[], groupName?: string): Array<{ id: number; label: string }> {
  return items.flatMap((item) => {
    if (item.quality) {
      return [{ id: item.quality.id, label: groupName ?? item.quality.name }];
    }

    return flattenQualityProfileItems(item.items, item.name);
  });
}

export function buildProfileCutoffMap(profiles: QualityProfile[]): Map<number, string> {
  return new Map(
    profiles.map((profile) => {
      const qualityItems = flattenQualityProfileItems(profile.items);
      const cutoff = qualityItems.find((item) => item.id === profile.cutoff);
      return [profile.id, cutoff?.label ?? profile.name];
    }),
  );
}

function getRecordQualityProfileId(
  instanceType: InstanceType,
  record: CutoffUnmetRecord,
): number | undefined {
  if (instanceType === "radarr") {
    return record.qualityProfileId ?? record.movie?.qualityProfileId;
  }

  return record.series?.qualityProfileId;
}

function getNextCheckAt(lastCheckAt: string | null): string | null {
  if (!lastCheckAt) return null;

  const timestamp = Date.parse(lastCheckAt);
  if (Number.isNaN(timestamp)) return null;

  return new Date(timestamp + QUALITY_CHECK_INTERVAL_MS).toISOString();
}

export function enrichCutoffUnmetResponse(
  instanceId: number,
  instanceType: InstanceType,
  data: CutoffUnmetResponse,
  qualityProfiles: QualityProfile[] = [],
): EnrichedCutoffResponse {
  const profileCutoffMap = buildProfileCutoffMap(qualityProfiles);

  if (instanceType === "radarr") {
    const cachedMovies = new Map(
      getCachedMovies(instanceId).map((movie) => [movie.externalId, movie]),
    );

    return {
      ...data,
      records: data.records.map((record) => {
        const cachedMovie = cachedMovies.get(record.id);
        const quality = getRecordQuality(record) ?? parseQualityInfo(cachedMovie?.movieFileQuality ?? null);
        const qualityProfileId = getRecordQualityProfileId(instanceType, record) ?? cachedMovie?.qualityProfileId ?? undefined;
        const lastCheckAt = record.lastSearchTime ?? null;

        return {
          ...record,
          title: record.title ?? cachedMovie?.title,
          year: record.year ?? cachedMovie?.year ?? undefined,
          qualityProfileId,
          movieFile: quality ? { ...(record.movieFile ?? {}), quality } : record.movieFile,
          wantedQualityName: qualityProfileId ? (profileCutoffMap.get(qualityProfileId) ?? null) : null,
          lastCheckAt,
          nextCheckAt: getNextCheckAt(lastCheckAt),
        };
      }),
    };
  }

  const cachedEpisodes = new Map(
    getCachedEpisodes(instanceId).map((episode) => [episode.externalId, episode]),
  );
  const cachedSeries = new Map(
    getCachedSeries(instanceId).map((series) => [series.externalId, series]),
  );

  return {
    ...data,
    records: data.records.map((record) => {
      const cachedEpisode = cachedEpisodes.get(record.id);
      const seriesId = record.series?.id ?? cachedEpisode?.seriesExternalId;
      const series = seriesId !== undefined ? cachedSeries.get(seriesId) : undefined;
      const quality = getRecordQuality(record) ?? parseQualityInfo(cachedEpisode?.episodeFileQuality ?? null);
      const qualityProfileId = getRecordQualityProfileId(instanceType, record) ?? series?.qualityProfileId ?? undefined;
      const lastCheckAt = record.lastSearchTime ?? null;

      return {
        ...record,
        series: record.series ?? (series ? { id: series.externalId, title: series.title, qualityProfileId: series.qualityProfileId ?? undefined } : undefined),
        episode: record.episode
          ?? (cachedEpisode
            ? {
                title: cachedEpisode.title ?? "Unknown",
                seasonNumber: cachedEpisode.seasonNumber,
                episodeNumber: cachedEpisode.episodeNumber,
              }
            : undefined),
        seriesId,
        episodeFile: quality ? { ...(record.episodeFile ?? {}), quality } : record.episodeFile,
        wantedQualityName: qualityProfileId ? (profileCutoffMap.get(qualityProfileId) ?? null) : null,
        lastCheckAt,
        nextCheckAt: getNextCheckAt(lastCheckAt),
      };
    }),
  };
}
