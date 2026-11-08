/**
 * Outreach scheduler runs: who may start one, and the socket time it gets.
 *
 * The runs (/daily-job, /scheduler/daily) are allowed for Cloud Scheduler's
 * signed OIDC token or an admin. The token isn't a user login, so it is
 * checked before requireAuth. These routes used to trust headers any
 * logged-in user could set (X-CloudScheduler, or anything containing
 * "Cloud-Scheduler") and would run a real send for everyone.
 *
 * Once authorized, a run gets the scheduled-job socket timeout
 * (job-run-guard.ts) instead of the server's 30 s. The daily run writes
 * nothing until it is done, so on 2026-10-25, -26, -27 and -30 it was cut off
 * at 30.0 s, Cloud Run answered 503 and the run never finished. /api/jobs/*
 * already had this lift; these routes didn't. Any other caller keeps the 30 s.
 *
 * @module api/outreach-scheduler-runs
 */

import type { IncomingMessage } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { liftJobSocketTimeout } from './scheduled-jobs/job-run-guard.js';
import { verifySchedulerRequest } from './scheduled-jobs/scheduler-auth.js';

const log = createLogger({ module: 'OutreachSchedulerRuns' });

/** Routes under /api/outreach that Cloud Scheduler calls; its token counts only here. */
const SCHEDULER_TOKEN_ROUTES: ReadonlySet<string> = new Set(['/daily-job', '/scheduler/daily']);

/** Routes under /api/outreach that run over every user, for the scheduler or an admin. */
const SCHEDULER_RUN_ROUTE = /^\/(daily-job|scheduler\/.+)$/;

/** True when this request carries Cloud Scheduler's verified token for a route it calls. */
export async function isSchedulerCall(
  req: IncomingMessage,
  method: string,
  route: string,
  pathname: string
): Promise<boolean> {
  if (method !== 'POST' || !SCHEDULER_TOKEN_ROUTES.has(route)) return false;
  const caller = await verifySchedulerRequest(req, pathname);
  if (!caller.ok) log.info({ route, reason: caller.reason }, 'not a scheduler token');
  return caller.ok;
}

/**
 * Gives an authorized scheduler run the job socket timeout. `authorized` must
 * mean the scheduler's verified token or an admin login, never just a login.
 */
export function liftSocketTimeoutForSchedulerRun(
  req: IncomingMessage,
  route: string,
  authorized: boolean
): void {
  if (authorized && SCHEDULER_RUN_ROUTE.test(route)) liftJobSocketTimeout(req);
}
