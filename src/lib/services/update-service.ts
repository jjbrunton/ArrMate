import { z } from "zod/v4";
import { getAppVersionInfo } from "@/lib/app/version";

const GITHUB_RELEASE_RESPONSE_SCHEMA = z.object({
  tag_name: z.string().min(1),
  html_url: z.url(),
  body: z.string().nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
});

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedUpdateStatus {
  expiresAt: number;
  value: AppUpdateStatus;
}

interface ParsedVersion {
  core: [number, number, number];
  preRelease: string | null;
}

export interface AppUpdateStatus {
  currentVersion: string;
  currentCommitSha: string | null;
  releaseRepository: string;
  latestVersion: string | null;
  latestReleaseTag: string | null;
  updateAvailable: boolean;
  publishedAt: string | null;
  releaseUrl: string | null;
  changelog: string | null;
  checkedAt: string;
  error: string | null;
}

let cachedStatus: CachedUpdateStatus | null = null;

function cleanVersion(value: string) {
  return value.trim().replace(/^v/i, "");
}

function parseVersion(value: string): ParsedVersion | null {
  const match = cleanVersion(value).match(
    /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );

  if (!match) {
    return null;
  }

  return {
    core: [
      Number(match[1] ?? "0"),
      Number(match[2] ?? "0"),
      Number(match[3] ?? "0"),
    ],
    preRelease: match[4] ?? null,
  };
}

function compareVersions(left: string, right: string) {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);

  if (!parsedLeft || !parsedRight) {
    return cleanVersion(left).localeCompare(cleanVersion(right), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  for (let index = 0; index < parsedLeft.core.length; index += 1) {
    const difference = parsedLeft.core[index] - parsedRight.core[index];

    if (difference !== 0) {
      return difference;
    }
  }

  if (parsedLeft.preRelease === parsedRight.preRelease) {
    return 0;
  }

  if (parsedLeft.preRelease === null) {
    return 1;
  }

  if (parsedRight.preRelease === null) {
    return -1;
  }

  return parsedLeft.preRelease.localeCompare(parsedRight.preRelease, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function buildBaseStatus(now: Date): AppUpdateStatus {
  const versionInfo = getAppVersionInfo();

  return {
    currentVersion: versionInfo.currentVersion,
    currentCommitSha: versionInfo.currentCommitSha,
    releaseRepository: versionInfo.releaseRepository,
    latestVersion: null,
    latestReleaseTag: null,
    updateAvailable: false,
    publishedAt: null,
    releaseUrl: null,
    changelog: null,
    checkedAt: now.toISOString(),
    error: null,
  };
}

export async function getAppUpdateStatus(now = new Date()) {
  if (cachedStatus && cachedStatus.expiresAt > now.getTime()) {
    return cachedStatus.value;
  }

  const baseStatus = buildBaseStatus(now);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${baseStatus.releaseRepository}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `ArrMate/${baseStatus.currentVersion}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub release lookup failed with status ${response.status}`);
    }

    const payload = GITHUB_RELEASE_RESPONSE_SCHEMA.parse(await response.json());
    const latestVersion = cleanVersion(payload.tag_name);
    const updateAvailable = compareVersions(latestVersion, baseStatus.currentVersion) > 0;

    const value: AppUpdateStatus = {
      ...baseStatus,
      latestVersion,
      latestReleaseTag: payload.tag_name,
      updateAvailable,
      publishedAt: payload.published_at ?? null,
      releaseUrl: payload.html_url,
      changelog: payload.body?.trim() || null,
    };

    cachedStatus = {
      value,
      expiresAt: now.getTime() + CACHE_TTL_MS,
    };

    return value;
  } catch {
    const value: AppUpdateStatus = {
      ...baseStatus,
      error: "Unable to check GitHub releases right now.",
    };

    cachedStatus = {
      value,
      expiresAt: now.getTime() + CACHE_TTL_MS,
    };

    return value;
  }
}

export function resetAppUpdateStatusCacheForTests() {
  cachedStatus = null;
}
