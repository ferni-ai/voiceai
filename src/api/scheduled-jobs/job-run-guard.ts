/**
 * Runs one authorized scheduled job: lifts the socket idle timeout for it,
 * holds a lock so a Scheduler retry can't run it twice, and logs the outcome.
 *
 * Why: `hardenServer` destroys any socket idle for 30 s. A job handler writes
 * nothing until it is done, so every job past 30 s was cut off and Cloud Run
 * answered 503 (memory-consolidation 3 of 3 attempts on 2026-10-11,
 * knowledge-graph-consolidation on 10-12, knowledge-graph-entity-decay on
 * 10-08). The job stays synchronous, not "202 then run in the background":
 * john-bogle-ui has no `run.googleapis.com/cpu-throttling: false`, so Cloud
 * Run gives an instance CPU only while a request is open, and work left
 * running after the response would freeze. Cloud Run's own request timeout
 * (300 s) remains the ceiling.
 *
 * SCHEDULED_JOB_LOCK=off skips the lock (the timeout lift always applies).
 *
 * @module api/scheduled-jobs/job-run-guard
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';
import { firestoreJobLockStore, type JobLockStore } from './job-lock-store.js';

const log = createLogger({ module: 'ScheduledJobRun' });

/** Cloud Run request timeout for john-bogle-ui (`timeoutSeconds: 300`). */
export const CLOUD_RUN_REQUEST_TIMEOUT_MS = 300_000;

/** Socket idle timeout for an authorized job: just under Cloud Run's ceiling. */
export const JOB_SOCKET_TIMEOUT_MS = 290_000;

/** A lock older than this belongs to a run Cloud Run has already cut off. */
export const JOB_LOCK_LEASE_MS = CLOUD_RUN_REQUEST_TIMEOUT_MS + 30_000;

/** A lock store that hangs is treated like one that threw: the job runs without it. */
export const JOB_LOCK_ACQUIRE_TIMEOUT_MS = 5_000;

export interface JobRunDeps {
  store?: JobLockStore;
  now?: () => number;
  env?: Record<string, string | undefined>;
  lockAcquireTimeoutMs?: number;
}

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lets an authorized scheduled run outlive the server-wide 30 s socket idle
 * timeout, for this socket only; Node puts the server timeout back when the
 * connection carries its next request. Call it only once the caller has
 * passed the scheduler (OIDC) or admin check, so no unauthenticated request
 * ever holds a socket longer than before.
 */
export function liftJobSocketTimeout(req: IncomingMessage): void {
  req.socket.setTimeout(JOB_SOCKET_TIMEOUT_MS);
}

let defaultStore: JobLockStore | null = null;

export async function runScheduledJob(
  req: IncomingMessage,
  res: ServerResponse,
  job: string,
  run: () => Promise<unknown>,
  deps: JobRunDeps = {}
): Promise<void> {
  liftJobSocketTimeout(req);

  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const runId = randomUUID();
  const startedAt = now();
  const store =
    env.SCHEDULED_JOB_LOCK === 'off'
      ? null
      : (deps.store ?? (defaultStore ??= firestoreJobLockStore()));

  let locked = false;
  if (store) {
    try {
      const lock = await withDeadline(
        store.acquire(job, runId, startedAt, JOB_LOCK_LEASE_MS),
        deps.lockAcquireTimeoutMs ?? JOB_LOCK_ACQUIRE_TIMEOUT_MS
      );
      if (!lock.acquired) {
        log.info(
          { job, holder: lock.holder, expiresAt: lock.expiresAt },
          'Scheduled job already running, skipped'
        );
        sendJson(res, 200, { success: true, job, skipped: true, reason: 'already_running' });
        return;
      }
      locked = true;
    } catch (error) {
      // Better a rare double run than a job that never runs because the lock store is down or hung.
      log.warn({ job, error: String(error) }, 'Scheduled job lock unavailable, running without it');
    }
  }

  try {
    await run();
    if (!res.writableEnded) {
      // A handler that returns without answering would leave Scheduler waiting
      // for the socket timeout and the log reporting Node's default 200.
      log.error({ job, headersSent: res.headersSent }, 'Scheduled job returned without answering');
      if (res.headersSent) res.end();
      else sendJson(res, 500, { success: false, job, error: 'job did not answer' });
    }
  } catch (error) {
    log.error({ job, error: String(error), headersSent: res.headersSent }, 'Scheduled job threw');
    if (!res.headersSent) sendJson(res, 500, { success: false, job, error: 'job failed' });
    else if (!res.writableEnded) res.end();
  } finally {
    const outcome = { status: res.statusCode, durationMs: now() - startedAt, finishedAt: now() };
    log.info({ job, runId, ...outcome }, 'Scheduled job finished');
    if (store && locked) {
      await store.release(job, runId, outcome).catch((error: unknown) => {
        log.warn(
          { job, runId, error: String(error) },
          'Scheduled job lock release failed; lease will expire'
        );
      });
    }
  }
}
