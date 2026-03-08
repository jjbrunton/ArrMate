export interface OverseerrSystemStatus {
  version: string;
}

export interface OverseerrPageInfo {
  pages: number;
  pageSize: number;
  results: number;
  page: number;
}

export interface OverseerrUser {
  id: number;
  email?: string;
  username?: string;
  displayName?: string;
}

export interface OverseerrMediaInfo {
  id: number;
  mediaType?: "movie" | "tv";
  tmdbId?: number;
  status?: number;
}

export interface OverseerrRequestRecord {
  id: number;
  type?: "movie" | "tv";
  status?: number;
  createdAt?: string;
  updatedAt?: string;
  requestedBy?: OverseerrUser;
  media?: OverseerrMediaInfo;
}

export interface OverseerrRequestPage {
  pageInfo: OverseerrPageInfo;
  results: OverseerrRequestRecord[];
}

export interface OverseerrMovieDetails {
  id: number;
  title: string;
}

export interface OverseerrTvDetails {
  id: number;
  name: string;
}

