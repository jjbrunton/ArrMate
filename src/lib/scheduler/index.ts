import * as cron from "node-cron";
import { getDb } from "../db";
import { instances, type Instance } from "../db/schema";
import { pollQueue } from "./jobs/poll-queue";
import { checkInstanceHealth } from "./jobs/health-check";
import { syncMediaCache } from "./jobs/sync-media-cache";
import { runQualityChecks } from "./jobs/quality-check";
import { runExclusive } from "./job-tracker";
import { createLogger } from "../utils/logger";
import { getInstanceDefinition } from "../instances/definitions";
import { syncOverseerrRequests } from "../services/request-service";

const log = createLogger("scheduler");

interface ScheduledInstanceTask {
  instanceId: number;
  healthTask: cron.ScheduledTask;
  pollTask?: cron.ScheduledTask;
  qualityTask?: cron.ScheduledTask;
  mediaSyncTask?: cron.ScheduledTask;
  requestSyncTask?: cron.ScheduledTask;
}

const activeTasks = new Map<number, ScheduledInstanceTask>();

function intervalToCron(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `*/${minutes} * * * *`;
}

async function runHealthTask(instanceId: number) {
  try {
    await runExclusive(instanceId, "health-check", () => checkInstanceHealth(instanceId));
  } catch (err) {
    log.error({ instanceId, err }, "Health check task failed");
  }
}

async function runPollTask(instance: Instance) {
  try {
    await runExclusive(instance.id, "poll", () => pollQueue(instance));
  } catch (err) {
    log.error({ instanceId: instance.id, err }, "Poll task failed");
  }
}

async function runQualityTask(instance: Instance) {
  try {
    await runExclusive(instance.id, "quality-check", () => runQualityChecks(instance));
  } catch (err) {
    log.error({ instanceId: instance.id, err }, "Quality check task failed");
  }
}

async function runMediaSyncTask(instance: Instance) {
  try {
    await runExclusive(instance.id, "sync-media", () => syncMediaCache(instance));
  } catch (err) {
    log.error({ instanceId: instance.id, err }, "Media sync task failed");
  }
}

async function runRequestSyncTask(instance: Instance) {
  try {
    await runExclusive(instance.id, "sync-requests", () =>
      syncOverseerrRequests(instance).then(() => undefined),
    );
  } catch (err) {
    log.error({ instanceId: instance.id, err }, "Request sync task failed");
  }
}

function stopInstanceTasks(task: ScheduledInstanceTask) {
  task.pollTask?.stop();
  task.qualityTask?.stop();
  task.healthTask.stop();
  task.mediaSyncTask?.stop();
  task.requestSyncTask?.stop();
}

function scheduleTasksForInstance(instance: Instance): ScheduledInstanceTask {
  const definition = getInstanceDefinition(instance.type);
  log.info(
    {
      instanceId: instance.id,
      name: instance.name,
      pollInterval: instance.pollIntervalSeconds,
      qualityCheckInterval: instance.qualityCheckIntervalSeconds,
    },
    "Scheduling tasks",
  );

  const healthTask = cron.schedule("*/5 * * * *", () => {
    void runHealthTask(instance.id);
  });

  let pollTask: cron.ScheduledTask | undefined;
  let qualityTask: cron.ScheduledTask | undefined;
  let mediaSyncTask: cron.ScheduledTask | undefined;
  let requestSyncTask: cron.ScheduledTask | undefined;

  if (definition.supportsQueue) {
    const pollCron = intervalToCron(instance.pollIntervalSeconds);
    pollTask = cron.schedule(pollCron, () => {
      void runPollTask(instance);
    });

    const qualityCron = intervalToCron(instance.qualityCheckIntervalSeconds);
    qualityTask = cron.schedule(qualityCron, () => {
      void runQualityTask(instance);
    });

    const mediaSyncCron = intervalToCron(instance.mediaSyncIntervalSeconds);
    mediaSyncTask = cron.schedule(mediaSyncCron, () => {
      void runMediaSyncTask(instance);
    });
  }

  if (definition.supportsRequestSync) {
    const requestSyncCron = intervalToCron(instance.requestSyncIntervalSeconds ?? 300);
    requestSyncTask = cron.schedule(requestSyncCron, () => {
      void runRequestSyncTask(instance);
    });
  }

  return {
    instanceId: instance.id,
    pollTask,
    qualityTask,
    healthTask,
    mediaSyncTask,
    requestSyncTask,
  };
}

function syncTasks() {
  const db = getDb();
  const allInstances = db.select().from(instances).all();

  const currentIds = new Set(allInstances.filter((i) => i.enabled).map((i) => i.id));

  // Remove tasks for deleted/disabled instances
  for (const [id, task] of activeTasks) {
    if (!currentIds.has(id)) {
      log.info({ instanceId: id }, "Removing scheduled tasks");
      stopInstanceTasks(task);
      activeTasks.delete(id);
    }
  }

  // Add/update tasks for enabled instances
  for (const instance of allInstances) {
    if (!instance.enabled) continue;

    if (!activeTasks.has(instance.id)) {
      activeTasks.set(instance.id, scheduleTasksForInstance(instance));
    }
  }
}

async function runInitialJobs(instance: Instance) {
  const jobs: Promise<void>[] = [runHealthTask(instance.id)];
  const definition = getInstanceDefinition(instance.type);

  if (definition.supportsQueue) {
    jobs.push(runPollTask(instance), runQualityTask(instance), runMediaSyncTask(instance));
  }

  if (definition.supportsRequestSync) {
    jobs.push(runRequestSyncTask(instance));
  }

  await Promise.allSettled(jobs);
}

export async function scheduleNewInstance(instanceId: number) {
  try {
    syncTasks();

    const instance = getDb()
      .select()
      .from(instances)
      .all()
      .find((row) => row.id === instanceId && row.enabled);

    if (!instance) {
      return;
    }

    await runInitialJobs(instance);
  } catch (err) {
    log.error({ instanceId, err }, "Failed to schedule new instance");
  }
}

let masterTask: cron.ScheduledTask | null = null;

export function startScheduler() {
  log.info("Starting scheduler");

  // Initial sync
  syncTasks();

  // Re-sync every 60 seconds to pick up changes
  masterTask = cron.schedule("* * * * *", () => {
    syncTasks();
  });

  log.info("Scheduler started");
}

export function stopScheduler() {
  log.info("Stopping scheduler");

  if (masterTask) {
    masterTask.stop();
    masterTask = null;
  }

  for (const [id, task] of activeTasks) {
    stopInstanceTasks(task);
    activeTasks.delete(id);
  }

  log.info("Scheduler stopped");
}
