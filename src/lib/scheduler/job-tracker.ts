import { createLogger } from "../utils/logger";

const log = createLogger("job-tracker");

export type JobType = "poll" | "sync-media" | "health-check" | "quality-check" | "sync-requests";

/** In-memory set of currently running jobs, keyed by "instanceId:jobType" */
const runningJobs = new Set<string>();

function key(instanceId: number, jobType: JobType): string {
  return `${instanceId}:${jobType}`;
}

export function isJobRunning(instanceId: number, jobType: JobType): boolean {
  return runningJobs.has(key(instanceId, jobType));
}

export function isAnyJobRunning(instanceId: number): boolean {
  for (const k of runningJobs) {
    if (k.startsWith(`${instanceId}:`)) return true;
  }
  return false;
}

export function getRunningJobs(instanceId: number): JobType[] {
  const running: JobType[] = [];
  for (const k of runningJobs) {
    if (k.startsWith(`${instanceId}:`)) {
      running.push(k.split(":")[1] as JobType);
    }
  }
  return running;
}

export function markJobRunning(instanceId: number, jobType: JobType): void {
  runningJobs.add(key(instanceId, jobType));
  log.info({ instanceId, jobType }, "Job started");
}

export function markJobDone(instanceId: number, jobType: JobType): void {
  runningJobs.delete(key(instanceId, jobType));
  log.info({ instanceId, jobType }, "Job finished");
}

/**
 * Wraps a job function to track its running state and prevent concurrent execution
 * for the same job type on the same instance.
 */
export async function runExclusive(
  instanceId: number,
  jobType: JobType,
  fn: () => Promise<void>,
): Promise<boolean> {
  if (isJobRunning(instanceId, jobType)) {
    log.info({ instanceId, jobType }, "Skipping — same job already running");
    return false;
  }

  markJobRunning(instanceId, jobType);
  try {
    await fn();
    return true;
  } finally {
    markJobDone(instanceId, jobType);
  }
}
