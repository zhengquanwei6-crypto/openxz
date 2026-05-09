/**
 * Image Job Lifecycle Cleanup Service
 *
 * Periodically cleans up stale image jobs to prevent unbounded growth:
 * - Successful jobs older than 24h are removed
 * - Failed jobs are capped at 50 most recent
 * - Stuck "running"/"queued" jobs older than 30min are marked as failed
 */
import { eq, and, lt, sql } from "drizzle-orm";
import { db, sqlite } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const SUCCESS_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const STUCK_JOB_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_JOBS = 50;

let cleanupTimer = null;

/**
 * Run a single cleanup pass on image jobs.
 */
export async function cleanupImageJobs() {
  const stats = { removed: 0, markedFailed: 0 };
  const now = Date.now();
  const stuckCutoff = new Date(now - STUCK_JOB_MAX_AGE_MS).toISOString();
  const successCutoff = new Date(now - SUCCESS_MAX_AGE_MS).toISOString();

  // 1. Mark stuck jobs as failed
  const stuckResult = sqlite.prepare(`
    UPDATE image_jobs SET status = 'failed', progress = 100,
      error_text = '任务超时，已被自动清理标记为失败。',
      updated_at = ?
    WHERE (status = 'queued' OR status = 'running') AND updated_at < ?
  `).run(new Date().toISOString(), stuckCutoff);
  stats.markedFailed = stuckResult.changes;

  // 2. Remove successful jobs older than 24h
  const removeSuccess = sqlite.prepare(`
    DELETE FROM image_jobs WHERE status = 'success' AND updated_at < ?
  `).run(successCutoff);
  stats.removed += removeSuccess.changes;

  // 3. Cap failed jobs at MAX_FAILED_JOBS (keep most recent)
  const failedCount = sqlite.prepare(`SELECT COUNT(*) as count FROM image_jobs WHERE status = 'failed'`).get();
  if (failedCount.count > MAX_FAILED_JOBS) {
    const excess = failedCount.count - MAX_FAILED_JOBS;
    sqlite.prepare(`
      DELETE FROM image_jobs WHERE id IN (
        SELECT id FROM image_jobs WHERE status = 'failed'
        ORDER BY updated_at ASC LIMIT ?
      )
    `).run(excess);
    stats.removed += excess;
  }

  if (stats.removed > 0 || stats.markedFailed > 0) {
    console.log(`[ImageJobCleaner] Cleaned: ${stats.removed} removed, ${stats.markedFailed} marked failed`);
  }
  return stats;
}

/**
 * Start periodic image job cleanup.
 */
export function startImageJobCleanup(intervalMs = DEFAULT_INTERVAL_MS) {
  if (cleanupTimer) return;
  setTimeout(() => cleanupImageJobs().catch(console.error), 10_000);
  cleanupTimer = setInterval(() => cleanupImageJobs().catch(console.error), intervalMs);
  cleanupTimer.unref();
  console.log(`[ImageJobCleaner] Started (interval: ${Math.round(intervalMs / 60_000)}min)`);
}

/**
 * Stop the periodic cleanup.
 */
export function stopImageJobCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
