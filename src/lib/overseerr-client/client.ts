import { OverseerrApiError, OverseerrConnectionError } from "./errors";
import type {
  OverseerrMovieDetails,
  OverseerrRequestPage,
  OverseerrRequestRecord,
  OverseerrSystemStatus,
  OverseerrTvDetails,
} from "./types";

const TIMEOUT_MS = 30_000;

export class OverseerrClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, timeoutMs = TIMEOUT_MS): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "X-Api-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new OverseerrApiError(res.status, text, url);
      }

      if (res.status === 204) {
        return undefined as T;
      }

      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof OverseerrApiError) {
        throw err;
      }

      const message = err instanceof Error ? err.message : "Unknown error";
      throw new OverseerrConnectionError(message, url, err instanceof Error ? err : undefined);
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection(): Promise<{ appName: string; version: string }> {
    const status = await this.request<OverseerrSystemStatus>("/status");
    return {
      appName: "Overseerr",
      version: status.version,
    };
  }

  async getRequests(page = 1, take = 100): Promise<OverseerrRequestPage> {
    const params = new URLSearchParams({
      take: String(take),
      skip: String((page - 1) * take),
      sort: "added",
    });

    return this.request<OverseerrRequestPage>(`/request?${params.toString()}`);
  }

  async getAllRequests(take = 100): Promise<OverseerrRequestRecord[]> {
    const results: OverseerrRequestRecord[] = [];
    let page = 1;

    while (true) {
      const response = await this.getRequests(page, take);
      results.push(...response.results);

      if (page >= response.pageInfo.pages) {
        break;
      }

      page++;
    }

    return results;
  }

  async getMovieDetails(tmdbId: number): Promise<OverseerrMovieDetails> {
    return this.request<OverseerrMovieDetails>(`/movie/${tmdbId}`);
  }

  async getTvDetails(tmdbId: number): Promise<OverseerrTvDetails> {
    return this.request<OverseerrTvDetails>(`/tv/${tmdbId}`);
  }
}

