/**
 * Image Job Lifecycle Cleanup Service
 *
 * Periodically cleans up stale image jobs to prevent unbounded memory growth:
 * - Successful jobs older than 24h are removed
 * - Failed jobs are capped at 50 most recent
 * - Stuck "running"/"queued" jobs older than 30min are marked as failed
 */
import { updateStore } from "../store/index.mjs";
import { timestamp } from "../utils/helpers.mjs";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const SUCCESS_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const STUCK_JOB_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_JOBS = 50;
const MAX_LOG_ENTRIES = 300;

let cleanupTimer = null;

/**
 * Run a single cleanup pass on image jobs.
 * Returns stats about what was cleaned.
 */
export async function cleanupImageJobs() {
  const stats = { removed: 0, markedFailed: 0, logsTrimmed: 0 };

  await updateStore((data) => {
    if (!Array.isArray(data.imageJobs)) return;
    const now = Date.now();

    // 1. Mark stuck jobs as failed
    for (const job of data.imageJobs) {
      if ((job.status === "queued" || job.status === "running") && job.updatedAt) {
        const age = now - Date.parse(job.updatedAt);
        if (age > STUCK_JOB_MAX_AGE_MS) {
          job.status = "failed";
          job.progress = 100;
          job.errorText = "任务超时，已被自动清理标记为失败。";
          job.updatedAt = timestamp();
          stats.markedFailed++;
        }
      }
    }

    // 2. Remove successful jobs older than 24h
    const beforeCount = data.imageJobs.length;
    data.imageJobs = data.imageJobs.filter((job) => {
      if (job.status === "success" && job.updatedAt) {
        return (now - Date.parse(job.updatedAt)) < SUCCESS_MAX_AGE_MS;
      }
      return true;
    });
    stats.removed += beforeCount - data.imageJobs.length;

    // 3. Cap failed jobs at MAX_FAILED_JOBS (keep most recent)
    const failedJobs = data.imageJobs.filter((j) => j.status === "failed");
    if (failedJobs.length > MAX_FAILED_JOBS) {
      // Sort by updatedAt desc, keep most recent
      const sortedFailed = failedJobs.sort((a, b) => Date.parse(b.updatedAt ?? 0) - Date.parse(a.updatedAt ?? 0));
      const toRemoveIds = new Set(sortedFailed.slice(MAX_FAILED_JOBS).map((j) => j.id));
      const beforeRemoval = data.imageJobs.length;
      data.imageJobs = data.imageJobs.filter((j) => !toRemoveIds.has(j.id));
      stats.removed += beforeRemoval - data.imageJobs.length;
    }

    // 4. Trim image generation logs
    if (Array.isArray(data.imageGenerationLogs) && data.imageGenerationLogs.length > MAX_LOG_ENTRIES) {
      const trimmed = data.imageGenerationLogs.length - MAX_LOG_ENTRIES;
      data.imageGenerationLogs = data.imageGenerationLogs.slice(0, MAX_LOG_ENTRIES);
      stats.logsTrimmed = trimmed;
    }

    // 5. Trim per-job logs to last 30 entries
    for (const job of data.imageJobs) {
      if (Array.isArray(job.logs) && job.logs.length > 30) {
        job.logs = job.logs.slice(-30);
      }
    }
  });

  if (stats.removed > 0 || stats.markedFailed > 0) {
    console.log(`[ImageJobCleaner] Cleaned: ${stats.removed} removed, ${stats.markedFailed} marked failed, ${stats.logsTrimmed} logs trimmed`);
  }

  return stats;
}

/**
 * Start periodic image job cleanup.
 * Call once at server startup.
 */
export function startImageJobCleanup(intervalMs = DEFAULT_INTERVAL_MS) {
  if (cleanupTimer) return; // Already running

  // Run first cleanup after a short delay (don't block startup)
  setTimeout(() => cleanupImageJobs().catch(console.error), 10_000);

  // Then run periodically
  cleanupTimer = setInterval(() => {
    cleanupImageJobs().catch(console.error);
  }, intervalMs);

  // Don't keep process alive just for cleanup
  cleanupTimer.unref();

  console.log(`[ImageJobCleaner] Started (interval: ${Math.round(intervalMs / 60_000)}min)`);
}

/**
 * Stop the periodic cleanup (for graceful shutdown).
 */
export function stopImageJobCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
