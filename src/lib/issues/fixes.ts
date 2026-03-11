import { ArrClient } from "../arr-client/client";
import type { FixAction } from "./types";

export interface FixResult {
  success: boolean;
  message: string;
}

export async function executeFix(
  client: ArrClient,
  externalQueueId: number,
  action: FixAction,
  params?: Record<string, unknown>,
): Promise<FixResult> {
  switch (action) {
    case "remove_and_blocklist":
      await client.removeQueueItem(externalQueueId, { removeFromClient: true, blocklist: true });
      return { success: true, message: "Removed from queue and blocklisted" };

    case "remove_keep_files":
      await client.removeQueueItem(externalQueueId, { removeFromClient: false, blocklist: false });
      return { success: true, message: "Removed from queue, files kept" };

    case "retry_download":
      await client.removeQueueItem(externalQueueId, { removeFromClient: true, blocklist: false });
      return { success: true, message: "Removed from queue, will re-search automatically" };

    case "grab_release":
      await client.grabQueueItem(externalQueueId);
      return { success: true, message: "Release grabbed" };

    case "force_import":
      return executeForceImport(client, externalQueueId, params);

    case "select_movie_import":
      return executeSelectMovieImport(client, externalQueueId, params);

    default:
      return { success: false, message: `Unknown fix action: ${action}` };
  }
}

async function executeForceImport(
  client: ArrClient,
  externalQueueId: number,
  params?: Record<string, unknown>,
): Promise<FixResult> {
  const allQueueItems = await client.getAllQueueItems();
  const queueItem = allQueueItems.find((q) => q.id === externalQueueId);

  if (!queueItem) {
    return { success: false, message: "Queue item no longer exists." };
  }

  const movieId = queueItem.movie?.id;
  if (!movieId) {
    return {
      success: false,
      message: "Force import is currently only supported for Radarr movies. Use the Sonarr/Radarr UI for manual import.",
    };
  }

  const outputPath = (params?.outputPath as string | undefined) || queueItem.outputPath;
  if (!outputPath) {
    return { success: false, message: "Cannot force import: no output path available." };
  }

  const importItems = await client.getManualImport(outputPath);
  if (importItems.length === 0) {
    return { success: false, message: "No importable files found. The files may have been moved or deleted." };
  }

  const fallbackQuality = queueItem.quality ?? { quality: { id: 0 }, revision: { version: 1, real: 0, isRepack: false } };
  const fallbackLanguages = queueItem.languages ?? [{ id: 1, name: "English" }];

  await client.triggerManualImport(
    importItems.map((item) => ({
      path: item.path,
      movieId,
      quality: item.quality ?? fallbackQuality,
      languages: item.languages?.length ? item.languages : fallbackLanguages,
      downloadId: queueItem.downloadId,
    })),
  );

  return {
    success: true,
    message: `Force import triggered for "${queueItem.movie?.title || queueItem.title}" with ${importItems.length} file(s)`,
  };
}

async function executeSelectMovieImport(
  client: ArrClient,
  externalQueueId: number,
  params?: Record<string, unknown>,
): Promise<FixResult> {
  const movieId = params?.movieId as number | undefined;
  const downloadId = params?.downloadId as string | undefined;
  const title = params?.title as string | undefined;

  if (!movieId) {
    return {
      success: false,
      message: `Cannot auto-import: movie "${title || "unknown"}" is not in your library. Add it to Radarr first, then retry.`,
    };
  }

  // Fetch the live queue item from Radarr to get outputPath, quality, and languages
  const allQueueItems = await client.getAllQueueItems();
  const queueItem = allQueueItems.find((q) => q.id === externalQueueId);

  if (!queueItem) {
    return {
      success: false,
      message: "Queue item no longer exists in Radarr.",
    };
  }

  const outputPath = (params?.outputPath as string | undefined) || queueItem.outputPath;

  if (!outputPath) {
    return {
      success: false,
      message: "Cannot auto-import: no output path available. Use the Radarr UI to manually import.",
    };
  }

  // Get the files from the download folder
  const importItems = await client.getManualImport(outputPath);

  if (importItems.length === 0) {
    return {
      success: false,
      message: "No importable files found. The files may have been moved or deleted.",
    };
  }

  const fallbackQuality = queueItem.quality ?? { quality: { id: 0 }, revision: { version: 1, real: 0, isRepack: false } };
  const fallbackLanguages = queueItem.languages ?? [{ id: 1, name: "English" }];

  // Trigger manual import with the correct movie assignment.
  // Use each file's own quality/languages (derived from its filename by Radarr)
  // rather than the queue-level values, which may not match the actual file.
  await client.triggerManualImport(
    importItems.map((item) => ({
      path: item.path,
      movieId,
      quality: item.quality ?? fallbackQuality,
      languages: item.languages?.length ? item.languages : fallbackLanguages,
      downloadId,
    })),
  );

  return {
    success: true,
    message: `Import triggered for "${title || "movie"}" with ${importItems.length} file(s)`,
  };
}
