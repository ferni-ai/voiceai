/**
 * Scheduled delivery jobs (Cloud Scheduler). They replace intervals that ran
 * inside every voice-call process and only saw that process's memory.
 *
 * POST /api/jobs/deliver-scheduled-actions   (every minute; ?dryRun=true)
 * POST /api/jobs/execute-scheduled-outreach  (every minute; ?dryRun=true)
 * POST /api/jobs/calendar-triggers           (every 5 minutes)
 * POST /api/jobs/calendar-briefing           (every 15 minutes; MORNING_BRIEF texts)
 * POST /api/jobs/follow-through              (every 5 minutes; ?dryRun=true; FOLLOW_THROUGH_JOB)
 * POST /api/jobs/retry-pending-revocations  (every 15 minutes; Google revokes and Twilio records erasure queued)
 *
 * @module api/scheduled-jobs/background-delivery-jobs
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';
import {
  flagForUser,
  usersWithFlag,
  type FlagLookupOptions,
} from '../../services/platform/cohort-flags.js';
import type { FollowUpTextDeps } from '../../services/outreach/follow-up-texts.js';

const log = createLogger({ module: 'BackgroundDeliveryJobs' });

const isDryRun = (req: IncomingMessage): boolean => {
  const v = new URL(req.url ?? '/', 'http://localhost').searchParams.get('dryRun');
  return v === 'true' || v === '1';
};

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

interface WorldDue {
  factId: string;
  text: string;
}
type LoadTemporalWorld = (
  userId: string,
  opts: { timeZone?: string }
) => Promise<{ sinceLastCall: Array<WorldDue & { kind: string }> } | null>;

/**
 * What comes due today in the user's world (the temporal world model's
 * loadTemporalWorld, WORLD_MODEL_TEMPORAL). The module isn't on every
 * branch yet, so it is looked up at run time: without it, no world items.
 */
export async function worldDue(userId: string, timeZone?: string): Promise<WorldDue[]> {
  const spec = '../../intelligence/world-model/temporal/load.js';
  const mod = (await import(spec).catch((error: unknown) => {
    log.debug({ error: String(error) }, 'No temporal world model on this server');
    return null;
  })) as { loadTemporalWorld?: LoadTemporalWorld } | null;
  const world = await mod?.loadTemporalWorld?.(userId, { timeZone });
  return (world?.sinceLastCall ?? [])
    .filter((i) => i.kind === 'due')
    .map(({ factId, text }) => ({ factId, text }));
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
    const deps = { ...defaultProactiveDeps(), worldDue };
    const proactive = await runProactiveChannelsTick(deps, {
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
    if (isDryRun(req)) return { ...outreach };
    // Calls the call-hours guard deferred ride the same per-minute job; their
    // failure must not hide the outreach result. Not gated on this server's
    // CALL_HOURS_GUARD: the agent defers, this server places, and a held call
    // whose flag lived only on the agent was never placed (2026-10-17).
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

/**
 * Alex's 8am text brief first (MORNING_BRIEF, outreach/morning-brief), then
 * the 7am calendar push for everyone else with a calendar: whoever gets the
 * text brief is skipped there, so nobody gets two. A failed text run leaves
 * the push brief as it was.
 */
export async function handleCalendarBriefing(res: ServerResponse): Promise<void> {
  await run(res, 'calendar-briefing', async () => {
    const [{ runMorningBriefs }, { defaultMorningBriefDeps }, { checkAndSendMorningBriefings }] =
      await Promise.all([
        import('../../services/outreach/morning-brief/brief-job.js'),
        import('../../services/outreach/morning-brief/default-deps.js'),
        import('../../tasks/scheduled/calendar-briefing-job.js'),
      ]);
    const brief = await runMorningBriefs(await defaultMorningBriefDeps(), new Date()).catch(
      (error: unknown) => {
        log.error({ error: String(error) }, 'Morning brief run failed');
        return { recipients: [], report: { error: String(error) } };
      }
    );
    const push = await checkAndSendMorningBriefings({ skipUsers: brief.recipients });
    return { ...push, morningBrief: brief.report };
  });
}

/**
 * Who gets follow-up texts and whether this person does, from the shared
 * cohort lookups. Both come back empty unless COHORT_FLAGS=on, so turning
 * cohort flags off stops follow-up texts too.
 */
export function followThroughFlags(
  opts: FlagLookupOptions = {}
): Pick<FollowUpTextDeps, 'optedIn' | 'resolveFlags'> {
  return {
    optedIn: async () => usersWithFlag('FOLLOW_THROUGH_TEXTS', opts),
    resolveFlags: async (userId) => ({
      FOLLOW_THROUGH_TEXTS: (await flagForUser(userId, 'FOLLOW_THROUGH_TEXTS', opts)) ?? '',
    }),
  };
}

/**
 * The real follow-through deps: the Firestore store, cohort flags, the guarded
 * sender and the person's forgotten topics. Null without Firestore.
 */
async function defaultFollowThroughDeps(): Promise<FollowUpTextDeps | null> {
  const [{ firestoreFollowUpStore }, { sendGuardedText }, { forgottenTopicsOrNull }] =
    await Promise.all([
      import('../../services/stores/follow-through-store.js'),
      import('../../services/outreach/guarded-text.js'),
      import('../../memory/recall/forget.js'),
    ]);
  const store = firestoreFollowUpStore();
  if (!store) return null;
  return {
    store,
    ...followThroughFlags(),
    sendText: async (t) => sendGuardedText(t),
    forgotten: async (userId) => forgottenTopicsOrNull(userId),
  };
}

/**
 * One run of the follow-up delivery job (follow-up-texts.ts). Off unless the
 * UI server has FOLLOW_THROUGH_JOB=on; each person also needs their own
 * FOLLOW_THROUGH_TEXTS cohort flag, which sendDueFollowUpTexts checks.
 */
export async function runFollowThroughJob(opts: {
  dryRun: boolean;
  env?: Record<string, string | undefined>;
  deps?: () => Promise<FollowUpTextDeps | null>;
  now?: Date;
}): Promise<Record<string, unknown>> {
  const { followUpJobOn, sendDueFollowUpTexts } =
    await import('../../services/outreach/follow-up-texts.js');
  if (!followUpJobOn(opts.env)) return { skipped: 'flag-off' };
  const deps = await (opts.deps ?? defaultFollowThroughDeps)();
  if (!deps) return { skipped: 'no-firestore' };
  const report = await sendDueFollowUpTexts(deps, { dryRun: opts.dryRun, now: opts.now });
  return { dryRun: opts.dryRun, ...report };
}

export async function handleFollowThrough(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await run(res, 'follow-through', async () => runFollowThroughJob({ dryRun: isDryRun(req) }));
}

/** Twilio records an account erasure left (platform/twilio-erasure); skipped with the flag off. */
async function retryTwilioErasures(): Promise<Record<string, unknown>> {
  const { flagOn } = await import('../../config/env-flag.js');
  if (!flagOn('TWILIO_ERASE_ON_DELETE')) return { skipped: 'flag-off' };
  const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) return { skipped: 'no-firestore' };
  const { retryPendingTwilioErasures } = await import('../../services/platform/twilio-erasure.js');
  return { ...(await retryPendingTwilioErasures(db)) };
}

/** Revokes Google couldn't take during an account erasure (identity/google-revocations), and Twilio records. */
export async function handleRetryPendingRevocations(res: ServerResponse): Promise<void> {
  await run(res, 'retry-pending-revocations', async () => {
    const { retryPendingRevocations } =
      await import('../../services/identity/google-revocations.js');
    return { ...(await retryPendingRevocations()), twilio: await retryTwilioErasures() };
  });
}
