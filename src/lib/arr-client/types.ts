export interface StatusMessage {
  title: string;
  messages: string[];
}

export interface QueueRecord {
  id: number;
  title: string;
  status: string;
  trackedDownloadState: string;
  trackedDownloadStatus: string;
  statusMessages: StatusMessage[];
  protocol: string;
  downloadClient: string;
  size: number;
  sizeleft: number;
  timeleft: string | null;
  estimatedCompletionTime: string | null;
  errorMessage?: string;
  downloadId?: string;
  outputPath?: string;
  series?: { title: string; id: number };
  movie?: { title: string; id: number };
  episode?: { title: string; seasonNumber: number; episodeNumber: number };
  quality?: Record<string, unknown>;
  languages?: Record<string, unknown>[];
}

export interface QueuePageResponse {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: QueueRecord[];
}

export interface SystemStatus {
  appName: string;
  version: string;
  urlBase: string;
}

export interface HealthCheck {
  source: string;
  type: string;
  message: string;
  wikiUrl?: string;
}

export interface Movie {
  id: number;
  title: string;
  year: number;
  tmdbId: number;
  imdbId?: string;
  hasFile: boolean;
  monitored: boolean;
  status?: string;
  qualityProfileId?: number;
  sizeOnDisk?: number;
  rootFolderPath?: string;
  path?: string;
  movieFile?: { quality?: QualityInfo; size?: number };
}

export interface QualityDefinition {
  id: number;
  name: string;
  source: string;
  resolution: number;
}

export interface QualityProfileItem {
  quality?: QualityDefinition;
  items: QualityProfileItem[];
  allowed: boolean;
  name?: string;
  id?: number;
}

export interface QualityProfile {
  id: number;
  name: string;
  cutoff: number;
  upgradeAllowed: boolean;
  items: QualityProfileItem[];
}

export interface SeriesStatistics {
  seasonCount: number;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
  percentOfEpisodes: number;
}

export interface Series {
  id: number;
  title: string;
  year: number;
  tvdbId: number;
  imdbId?: string;
  status: string;
  seriesType: string;
  monitored: boolean;
  qualityProfileId: number;
  seasonCount: number;
  path: string;
  rootFolderPath: string;
  statistics?: SeriesStatistics;
}

export interface EpisodeFile {
  quality?: QualityInfo;
  size?: number;
}

export interface Episode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDateUtc?: string;
  monitored: boolean;
  hasFile: boolean;
  episodeFile?: EpisodeFile;
  episodeFileId?: number;
}

export interface ManualImportItem {
  id: number;
  path: string;
  name: string;
  size: number;
  movie?: { id: number; title: string; year: number; tmdbId: number };
  quality: Record<string, unknown>;
  languages: Record<string, unknown>[];
  releaseGroup?: string;
  rejections: { type: string; reason: string }[];
}

export interface ManualImportCommand {
  path: string;
  movieId: number;
  quality: Record<string, unknown>;
  languages: Record<string, unknown>[];
  downloadId?: string;
}

export interface QualityInfo {
  quality: { id: number; name: string; source: string; resolution: number };
  revision: { version: number; real: number; isRepack: boolean };
}

export interface CutoffUnmetRecord {
  id: number;
  title?: string;
  year?: number;
  qualityProfileId?: number;
  lastSearchTime?: string | null;
  movieFile?: { quality: QualityInfo };
  movie?: {
    id: number;
    title: string;
    year?: number;
    qualityProfileId?: number;
  };
  series?: { title: string; id: number; qualityProfileId?: number };
  episode?: { title: string; seasonNumber: number; episodeNumber: number };
  seriesId?: number;
  episodeFile?: { quality: QualityInfo };
  episodeFileId?: number;
}

export interface CutoffUnmetResponse {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: CutoffUnmetRecord[];
}

export interface HistoryRecord {
  id: number;
  movieId?: number;
  seriesId?: number;
  episodeId?: number;
  sourceTitle: string;
  eventType: string; // "grabbed" | "downloadFolderImported" | "downloadFailed" | etc.
  date: string;
  downloadId?: string;
  data: Record<string, string>;
  movie?: { id: number; title: string; year: number; tmdbId: number };
  series?: { id: number; title: string };
  episode?: { id: number; title: string; seasonNumber: number; episodeNumber: number };
}

export interface HistoryResponse {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: HistoryRecord[];
}

export interface CommandResponse {
  id: number;
  name: string;
  commandName: string;
  status: string;
  started?: string;
}
