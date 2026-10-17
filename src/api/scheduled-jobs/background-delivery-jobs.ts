/**
 * Scheduled delivery jobs (Cloud Scheduler). They replace intervals that ran
 * inside every voice-call process and only saw that process's memory.
 *
 * POST /api/jobs/deliver-scheduled-actions   (every minute; ?dryRun=true)
 * POST /api/jobs/execute-scheduled-outreach  (every minute; ?dryRun=true)
 * POST /api/jobs/calendar-triggers           (every 5 minutes)
 * POST /api/jobs/calendar-briefing           (every 15 minutes, morning window)
 * POST /api/jobs/follow-through              (every 5 minutes; ?dryRun=true; FOLLOW_THROUGH_JOB)
 *
 * @module api/scheduled-jobs/background-delivery-jobs
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';
import type { Firestore } from '@google-cloud/firestore';
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

type FlagDb = Pick<Firestore, 'collection'>;

/**
 * Who may have FOLLOW_THROUGH_TEXTS on: members of enabled cohorts that set
 * it, plus anyone whose own override sets it. resolveCallerFlags still decides
 * for each (an override can turn it off). To be replaced by cohort-flags'
 * usersWithFlag once #1669 lands.
 */
export async function optedInToFollowUpTexts(db: FlagDb): Promise<string[]> {
  const withFlag = async (name: string) =>
    (await db.collection(name).where('flags.FOLLOW_THROUGH_TEXTS', '==', 'on').get()).docs;
  const [cohorts, overrides] = await Promise.all([
    withFlag('feature_cohorts'),
    withFlag('feature_flag_overrides'),
  ]);
  const members = cohorts
    .filter((d) => d.data().enabled !== false)
    .flatMap((d) => {
      const m: unknown = d.data().members;
      return Array.isArray(m) ? m.filter((x): x is string => typeof x === 'string') : [];
    });
  return [...new Set([...members, ...overrides.map((d) => d.id)])];
}

/** The real follow-through deps: the Firestore store, cohort flags, the guarded sender. Null without Firestore. */
async function defaultFollowThroughDeps(): Promise<FollowUpTextDeps | null> {
  const [{ getFirestoreDb }, { createFollowUpStore }, { resolveCallerFlags }, { sendGuardedText }] =
    await Promise.all([
      import('../../utils/firestore-utils.js'),
      import('../../services/stores/follow-through-store.js'),
      import('../../services/platform/cohort-flags.js'),
      import('../../services/outreach/guarded-text.js'),
    ]);
  const db = getFirestoreDb();
  if (!db) return null;
  return {
    store: createFollowUpStore(db),
    optedIn: async () => optedInToFollowUpTexts(db),
    resolveFlags: async (userId) => resolveCallerFlags(userId),
    sendText: async (t) => sendGuardedText(t),
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
