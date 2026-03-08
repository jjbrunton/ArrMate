import { beforeEach, describe, expect, it, vi } from "vitest";
import { enrichCutoffUnmetResponse, formatQualitySearchRecordLabel } from "./cutoff-service";
import { getCachedEpisodes, getCachedMovies, getCachedSeries } from "./media-cache-service";
import type { CutoffUnmetResponse, QualityInfo, QualityProfile } from "../arr-client/types";

vi.mock("./media-cache-service", () => ({
  getCachedMovies: vi.fn(),
  getCachedEpisodes: vi.fn(),
  getCachedSeries: vi.fn(),
}));

const webdl1080p: QualityInfo = {
  quality: { id: 3, name: "WEBDL-1080p", source: "webdl", resolution: 1080 },
  revision: { version: 1, real: 0, isRepack: false },
};

const bluray2160p: QualityInfo = {
  quality: { id: 19, name: "Bluray-2160p", source: "bluray", resolution: 2160 },
  revision: { version: 1, real: 0, isRepack: false },
};

const qualityProfiles: QualityProfile[] = [
  {
    id: 1,
    name: "HD-1080p",
    cutoff: 19,
    upgradeAllowed: true,
    items: [
      {
        name: "Bluray 2160p",
        allowed: true,
        items: [
          {
            quality: bluray2160p.quality,
            allowed: true,
            items: [],
          },
        ],
      },
    ],
  },
];

describe("enrichCutoffUnmetResponse", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCachedMovies).mockReturnValue([]);
    vi.mocked(getCachedEpisodes).mockReturnValue([]);
    vi.mocked(getCachedSeries).mockReturnValue([]);
  });

  it("normalizes top-level Radarr quality into movieFile quality and check timestamps", () => {
    const data: CutoffUnmetResponse = {
      page: 1,
      pageSize: 20,
      totalRecords: 1,
      records: [
        {
          id: 42,
          title: "Movie A",
          quality: webdl1080p,
          qualityProfileId: 1,
          lastSearchTime: "2026-03-07T12:00:00.000Z",
        } as unknown as CutoffUnmetResponse["records"][number],
      ],
    };

    const result = enrichCutoffUnmetResponse(1, "radarr", data, qualityProfiles);

    expect(result.records[0].movieFile?.quality).toEqual(webdl1080p);
    expect(result.records[0].wantedQualityName).toBe("Bluray 2160p");
    expect(result.records[0].lastCheckAt).toBe("2026-03-07T12:00:00.000Z");
    expect(result.records[0].nextCheckAt).toBe("2026-03-08T12:00:00.000Z");
  });

  it("backfills missing Radarr quality and quality profile from cached movie data", () => {
    vi.mocked(getCachedMovies).mockReturnValue([
      {
        id: 1,
        instanceId: 1,
        externalId: 42,
        title: "Movie A",
        year: 2024,
        tmdbId: 123,
        imdbId: null,
        status: "released",
        monitored: true,
        hasFile: true,
        qualityProfileId: 1,
        sizeOnDisk: null,
        rootFolderPath: null,
        path: null,
        movieFileQuality: JSON.stringify(bluray2160p),
        syncedAt: new Date().toISOString(),
      },
    ]);

    const data: CutoffUnmetResponse = {
      page: 1,
      pageSize: 20,
      totalRecords: 1,
      records: [{ id: 42 }],
    };

    const result = enrichCutoffUnmetResponse(1, "radarr", data, qualityProfiles);

    expect(result.records[0]).toMatchObject({
      id: 42,
      title: "Movie A",
      year: 2024,
      movieFile: { quality: bluray2160p },
      wantedQualityName: "Bluray 2160p",
      lastCheckAt: null,
      nextCheckAt: null,
    });
  });

  it("backfills missing Sonarr series, episode, and quality from cache", () => {
    vi.mocked(getCachedSeries).mockReturnValue([
      {
        id: 11,
        instanceId: 2,
        externalId: 7,
        title: "Series A",
        year: 2024,
        tvdbId: 123,
        imdbId: null,
        status: "continuing",
        seriesType: "standard",
        monitored: true,
        qualityProfileId: 1,
        seasonCount: 1,
        path: "/tv/series-a",
        rootFolderPath: "/tv",
        totalEpisodeCount: 8,
        episodeFileCount: 7,
        episodeCount: 8,
        sizeOnDisk: null,
        percentOfEpisodes: 87,
        syncedAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(getCachedEpisodes).mockReturnValue([
      {
        id: 21,
        instanceId: 2,
        seriesCacheId: 11,
        externalId: 101,
        seriesExternalId: 7,
        seasonNumber: 1,
        episodeNumber: 4,
        title: "Episode 4",
        airDateUtc: null,
        monitored: true,
        hasFile: true,
        episodeFileQuality: JSON.stringify(webdl1080p),
        episodeFileSize: null,
        syncedAt: new Date().toISOString(),
      },
    ]);

    const data: CutoffUnmetResponse = {
      page: 1,
      pageSize: 20,
      totalRecords: 1,
      records: [{ id: 101 }],
    };

    const result = enrichCutoffUnmetResponse(2, "sonarr", data, qualityProfiles);

    expect(result.records[0]).toMatchObject({
      id: 101,
      series: { id: 7, title: "Series A", qualityProfileId: 1 },
      episode: { seasonNumber: 1, episodeNumber: 4, title: "Episode 4" },
      episodeFile: { quality: webdl1080p },
      wantedQualityName: "Bluray 2160p",
    });
  });

  it("ignores invalid cached quality JSON", () => {
    vi.mocked(getCachedMovies).mockReturnValue([
      {
        id: 1,
        instanceId: 1,
        externalId: 42,
        title: "Movie A",
        year: 2024,
        tmdbId: 123,
        imdbId: null,
        status: "released",
        monitored: true,
        hasFile: true,
        qualityProfileId: 1,
        sizeOnDisk: null,
        rootFolderPath: null,
        path: null,
        movieFileQuality: "{not-json",
        syncedAt: new Date().toISOString(),
      },
    ]);

    const data: CutoffUnmetResponse = {
      page: 1,
      pageSize: 20,
      totalRecords: 1,
      records: [{ id: 42 }],
    };

    const result = enrichCutoffUnmetResponse(1, "radarr", data, qualityProfiles);

    expect(result.records[0].movieFile).toBeUndefined();
  });

  it("formats Radarr quality search labels with title and year", () => {
    expect(formatQualitySearchRecordLabel("radarr", {
      id: 42,
      title: "Movie A",
      year: 2024,
    })).toBe("Movie A (2024)");
  });

  it("formats Sonarr quality search labels with series and episode details", () => {
    expect(formatQualitySearchRecordLabel("sonarr", {
      id: 101,
      series: { id: 7, title: "Series A" },
      episode: {
        title: "Episode 4",
        seasonNumber: 1,
        episodeNumber: 4,
      },
    })).toBe("Series A S01E04 - Episode 4");
  });
});
