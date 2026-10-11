/**
 * Scheduled delivery jobs (Cloud Scheduler). They replace intervals that ran
 * inside every voice-call process and only saw that process's memory.
 *
 * POST /api/jobs/deliver-scheduled-actions   (every minute; ?dryRun=true)
 * POST /api/jobs/execute-scheduled-outreach  (every minute; ?dryRun=true)
 * POST /api/jobs/calendar-triggers           (every 5 minutes)
 * POST /api/jobs/calendar-briefing           (every 15 minutes, morning window)
 *
 * @module api/scheduled-jobs/background-delivery-jobs
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'BackgroundDeliveryJobs' });

const isDryRun = (req: IncomingMessage): boolean =>
  new URL(req.url ?? '/', 'http://localhost').searchParams.get('dryRun') === 'true';

async function run(
  res: ServerResponse,
  job: string,
  fn: () => Promise<Record<string, unknown>>
): Promise<void> {
  try {
    sendJson(res, 200, { success: true, job, ...(await fn()) });
  } catch (error) {
    log.error({ job, error: String(error) }, 'Scheduled job failed');
    sendJson(res, 500, { success: false, job, error: String(error) });
  }
}

export async function handleDeliverScheduledActions(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await run(res, 'deliver-scheduled-actions', async () => {
    const { deliverDueScheduledActions } =
      await import('../../services/workflows/scheduled-actions.js');
    const actions = await deliverDueScheduledActions({ dryRun: isDryRun(req) });
    // Proactive check-ins ride this per-minute job (PROACTIVE_CHANNELS=on,
    // allowlisted users only); a failure there must not hide the actions result.
    const { runProactiveChannelsTick } =
      await import('../../services/outreach/proactive-channels/proactive-tick.js');
    const { defaultProactiveDeps } =
      await import('../../services/outreach/proactive-channels/default-deps.js');
    const proactive = await runProactiveChannelsTick(defaultProactiveDeps(), {
      dryRun: isDryRun(req),
    }).catch((error: unknown) => ({ enabled: true, error: String(error) }));
    return { ...actions, ...(proactive.enabled ? { proactive } : {}) };
  });
}

export async function handleExecuteScheduledOutreach(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await run(res, 'execute-scheduled-outreach', async () => {
    const { executeDueScheduledOutreach } =
      await import('../../services/outreach/scheduled-outreach-executor.js');
    const outreach = await executeDueScheduledOutreach({ dryRun: isDryRun(req) });
    if (isDryRun(req) || process.env.CALL_HOURS_GUARD !== 'on') return { ...outreach };
    // Calls the call-hours guard deferred ride the same per-minute job; their
    // failure must not hide the outreach result.
    const { executeDueDeferredCalls } = await import('../../services/outreach/deferred-calls.js');
    const deferredCalls = await executeDueDeferredCalls().catch((error: unknown) => {
      log.error({ error: String(error) }, 'Deferred calls run failed');
      return { error: String(error) };
    });
    return { ...outreach, deferredCalls };
  });
}

export async function handleCalendarTriggers(res: ServerResponse): Promise<void> {
  await run(res, 'calendar-triggers', async () => {
    const { runCalendarTriggerCheck } =
      await import('../../services/workflows/calendar-trigger-worker.js');
    return { ...(await runCalendarTriggerCheck()) };
  });
}

export async function handleCalendarBriefing(res: ServerResponse): Promise<void> {
  await run(res, 'calendar-briefing', async () => {
    const { checkAndSendMorningBriefings } =
      await import('../../tasks/scheduled/calendar-briefing-job.js');
    return { ...(await checkAndSendMorningBriefings()) };
  });
}
