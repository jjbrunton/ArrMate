import { ArrApiError, ArrConnectionError } from "./errors";
import type { QueuePageResponse, QueueRecord, SystemStatus, HealthCheck, Movie, ManualImportItem, ManualImportCommand, CutoffUnmetResponse, CommandResponse, HistoryRecord, HistoryResponse, Series, Episode, CutoffUnmetRecord, QualityProfile } from "./types";

const TIMEOUT_MS = 30_000;
const LONG_TIMEOUT_MS = 120_000;

export class ArrClient {
  private baseUrl: string;
  private apiKey: string;
  private type: "sonarr" | "radarr";

  constructor(baseUrl: string, apiKey: string, type: "sonarr" | "radarr" = "sonarr") {
    // Normalize: remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.type = type;
  }

  private async request<T>(method: string, path: string, body?: unknown, timeoutMs = TIMEOUT_MS): Promise<T> {
    const url = `${this.baseUrl}/api/v3${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "X-Api-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new ArrApiError(res.status, text, url);
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ArrApiError) throw err;
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new ArrConnectionError(message, url, err instanceof Error ? err : undefined);
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection(): Promise<SystemStatus> {
    return this.request<SystemStatus>("GET", "/system/status");
  }

  async getHealth(): Promise<HealthCheck[]> {
    return this.request<HealthCheck[]>("GET", "/health");
  }

  async getQueue(page = 1, pageSize = 50): Promise<QueuePageResponse> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    if (this.type === "sonarr") {
      params.set("includeUnknownSeriesItems", "true");
      params.set("includeSeries", "true");
      params.set("includeEpisode", "true");
    } else {
      params.set("includeUnknownMovieItems", "true");
      params.set("includeMovie", "true");
    }

    return this.request<QueuePageResponse>("GET", `/queue?${params}`);
  }

  async getAllQueueItems(): Promise<QueueRecord[]> {
    const items: QueueRecord[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
      const response = await this.getQueue(page, pageSize);
      items.push(...response.records);
      if (items.length >= response.totalRecords) break;
      page++;
    }

    return items;
  }

  async removeQueueItem(
    id: number,
    opts: { removeFromClient?: boolean; blocklist?: boolean } = {},
  ): Promise<void> {
    const params = new URLSearchParams();
    if (opts.removeFromClient !== undefined) params.set("removeFromClient", String(opts.removeFromClient));
    if (opts.blocklist !== undefined) params.set("blocklist", String(opts.blocklist));
    await this.request<void>("DELETE", `/queue/${id}?${params}`);
  }

  async bulkRemoveQueueItems(
    ids: number[],
    opts: { removeFromClient?: boolean; blocklist?: boolean } = {},
  ): Promise<void> {
    const params = new URLSearchParams();
    if (opts.removeFromClient !== undefined) params.set("removeFromClient", String(opts.removeFromClient));
    if (opts.blocklist !== undefined) params.set("blocklist", String(opts.blocklist));
    await this.request<void>("DELETE", `/queue/bulk?${params}`, { ids });
  }

  async grabQueueItem(id: number): Promise<void> {
    await this.request<void>("POST", `/queue/grab/${id}`, {});
  }

  async getMovies(): Promise<Movie[]> {
    return this.request<Movie[]>("GET", "/movie", undefined, LONG_TIMEOUT_MS);
  }

  async getSeries(): Promise<Series[]> {
    return this.request<Series[]>("GET", "/series", undefined, LONG_TIMEOUT_MS);
  }

  async getEpisodes(seriesId: number): Promise<Episode[]> {
    const params = new URLSearchParams({
      seriesId: String(seriesId),
      includeEpisodeFile: "true",
    });
    return this.request<Episode[]>("GET", `/episode?${params}`, undefined, LONG_TIMEOUT_MS);
  }

  async getManualImport(folder: string): Promise<ManualImportItem[]> {
    const params = new URLSearchParams({
      folder,
      filterExistingFiles: "true",
    });
    return this.request<ManualImportItem[]>("GET", `/manualimport?${params}`);
  }

  async triggerManualImport(items: ManualImportCommand[]): Promise<void> {
    await this.request<void>("POST", "/command", {
      name: "ManualImport",
      files: items,
      importMode: "auto",
    });
  }

  async getMovieHistory(movieId: number): Promise<HistoryRecord[]> {
    const params = new URLSearchParams({
      movieId: String(movieId),
      includeMovie: "true",
    });
    return this.request<HistoryRecord[]>("GET", `/history/movie?${params}`);
  }

  async getHistoryByDownloadId(downloadId: string): Promise<HistoryResponse> {
    const params = new URLSearchParams({
      downloadId,
      pageSize: "10",
      sortKey: "date",
      sortDirection: "descending",
    });

    if (this.type === "radarr") {
      params.set("includeMovie", "true");
    } else {
      params.set("includeSeries", "true");
      params.set("includeEpisode", "true");
    }

    return this.request<HistoryResponse>("GET", `/history?${params}`);
  }

  async getCutoffUnmet(page = 1, pageSize = 20): Promise<CutoffUnmetResponse> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    if (this.type === "sonarr") {
      params.set("includeSeries", "true");
      params.set("includeEpisodeFile", "true");
    } else {
      params.set("includeMovie", "true");
    }

    return this.request<CutoffUnmetResponse>("GET", `/wanted/cutoff?${params}`);
  }

  async getAllCutoffUnmetItems(pageSize = 1000): Promise<CutoffUnmetRecord[]> {
    const records: CutoffUnmetRecord[] = [];
    let page = 1;

    while (true) {
      const response = await this.getCutoffUnmet(page, pageSize);
      records.push(...response.records);
      if (records.length >= response.totalRecords) break;
      page++;
    }

    return records;
  }

  async getQualityProfiles(): Promise<QualityProfile[]> {
    return this.request<QualityProfile[]>("GET", "/qualityprofile");
  }

  async searchForUpgrade(ids: number[]): Promise<CommandResponse> {
    if (this.type === "radarr") {
      return this.request<CommandResponse>("POST", "/command", {
        name: "MoviesSearch",
        movieIds: ids,
      });
    }
    return this.request<CommandResponse>("POST", "/command", {
      name: "EpisodeSearch",
      episodeIds: ids,
    });
  }
}
