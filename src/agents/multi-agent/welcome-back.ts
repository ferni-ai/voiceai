/**
 * Welcome back, life on both sides (WELCOME_BACK_BOTH_SIDES, off by default).
 *
 * When a caller comes back after a gap, a friend doesn't say "it's been twelve
 * days" or "I missed you": that makes the gap something the caller did to
 * him. A friend picks up one thing of theirs from before and mentions one
 * small thing from their own week, so the gap reads as life going on for both.
 *
 * So after WELCOME_BACK_MIN_DAYS the greeting gets:
 * - no gap: the "last time you talked" fact is dropped and counting the gap,
 *   "missed you" and "where have you been" are ruled out;
 * - one thread of theirs, from their call summaries' follow-ups, never a
 *   sensitive one (health, grief, money, relationships stay theirs to raise);
 * - one small update from his own life, only one already written from what he
 *   told them (life-updates.ts, LIFE_MOVES_ON) and not yet said. With none,
 *   he shares nothing: nothing new is made up about him here.
 *
 * One opening thread per call. What they said they'd do (COACH_FOLLOW_THROUGH)
 * is that thread when there is one. A pondered follow-up (PONDERING, the
 * pondering opener) also wins: welcome-back then adds only the no-gap rule,
 * not its own thread or update. Precedence: check-in, then pondered, then
 * welcome-back's own thread.
 *
 * @module agents/multi-agent/welcome-back
 */

import { isSensitiveThread } from '../../memory/recall/sensitive.js';
import { loadRecallSnapshot } from '../../memory/recall/session-recall.js';
import { createLogger } from '../../utils/safe-logger.js';
import { loadLedger } from '../personas/life-ledger.js';
import { pendingLifeUpdates } from '../personas/life-updates.js';
import { firestoreRecallStore } from './memory-recall-hook.js';

const log = createLogger({ module: 'welcome-back' });

export function welcomeBackEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.WELCOME_BACK_BOTH_SIDES === 'on';
}

/** Days since their last call from which a call counts as coming back. */
export const WELCOME_BACK_MIN_DAYS = 5;

/** How long the greeting waits for the thread and the update before going without. */
const WAIT_MS = 400;

export function isWelcomeBack(history: { daysSince?: number } | undefined): boolean {
  return history?.daysSince !== undefined && history.daysSince >= WELCOME_BACK_MIN_DAYS;
}

export { isSensitiveThread };

/** The lines the system prompt gets for when they last talked (agent-setup.ts). */
export function lastTalkedAwareness(
  daysSince: number,
  env: Record<string, string | undefined> = process.env
): string[] {
  const line =
    daysSince === 0
      ? 'You talked earlier today.'
      : daysSince === 1
        ? 'You talked yesterday.'
        : daysSince < 7
          ? `Last talked ${daysSince} days ago.`
          : daysSince < 30
            ? `It's been about ${Math.round(daysSince / 7)} weeks since you last talked.`
            : `It's been a while - about ${Math.round(daysSince / 30)} month${daysSince > 45 ? 's' : ''} since you last talked.`;
  if (welcomeBackEnabled(env) && daysSince >= WELCOME_BACK_MIN_DAYS) {
    return [line, NO_GAP_AWARENESS]; // the welcome back picks its one thread itself
  }
  if (!recentCallRestraintEnabled(env)) return [line];
  return [line, daysSince === 0 ? `${SAME_DAY_AWARENESS} ${LET_THEM_LEAD}` : LET_THEM_LEAD];
}

/**
 * RECENT_CALL_RESTRAINT (on unless "off"). Live call 10-17, second call that day: given
 * "You talked earlier today." and the last call's summary, the first reply was "I was
 * actually just thinking about how things went with Clayton and Brent after you talked
 * with Jordan earlier." Seth: "You did jump the gun." The summary stays; it just doesn't
 * get to open the call, and at most one light thing is asked about, never a presumed outcome.
 */
export function recentCallRestraintEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.RECENT_CALL_RESTRAINT !== 'off';
}

const SAME_DAY_AWARENESS =
  'You already talked today, so start like friends picking back up: a plain hello and how they are doing.';

const LET_THEM_LEAD =
  'Let them lead the start of the call; do not open with what you talked about last time. If you bring it up, ask about one light thing as a short open question ("How did that go?"). Never guess how something went, and never string several people\'s names together.';

const NO_GAP_AWARENESS =
  'Never bring up how long it has been, that you missed them, or where they have been. Their life went on, and so did yours.';

/** Rules out the gap itself: added whenever a returning call is a welcome back. */
export const NO_GAP_DIRECTION =
  ' It has been a while since they called. Do not mention it at all: no counting days or weeks, no "it\'s been a while", no "missed you", no "where have you been", no "since last week" or "since we last talked", never ask why they were away or say you noticed they were quiet.';

const SHARE_AND_ASK_DIRECTION =
  ' Say hello, then the one small thing from your own life you are given, in a few plain words, then ask about the one thing of theirs you are given as an open question in their words ("How did the move go?"). Nothing else from before, and nothing about your life beyond that one thing.';

const SHARE_DIRECTION =
  ' After your hello you may share the one small thing from your own life you are given, in a few plain words. Nothing about your life beyond that one thing.';

const ASK_DIRECTION =
  ' Say hello, then ask about the one thing of theirs you are given as an open question in their words ("How did the move go?"). Nothing else from before.';

/** Every thread was sensitive: none is named, and it stays theirs to raise. */
export const GENTLE_DIRECTION =
  ' Something hard may have been going on for them. Do not name it; leave it for them to bring up. A plain "how are you doing?" is enough.';

export const THREAD_FACT = 'something of theirs to ask about';
export const UPDATE_FACT = 'a small thing from your own life lately';

/** What a welcome back can open on, read at call start. */
export interface WelcomeBackMaterial {
  followUps: string[];
  lifeUpdate?: string;
}

export interface WelcomeBackSources {
  followUps: (userId: string) => Promise<string[]>;
  lifeUpdate: (userId: string, personaId: string) => Promise<string | undefined>;
}

/** Firestore by default; a property of an object so tests can stub one source. */
export const welcomeBackSources: WelcomeBackSources = {
  async followUps(userId) {
    const store = { ...firestoreRecallStore, facts: () => Promise.resolve([]) };
    return (await loadRecallSnapshot(store, userId)).followUps;
  },
  async lifeUpdate(userId, personaId) {
    const told = await loadLedger(userId, personaId);
    return (await pendingLifeUpdates(userId, told, personaId))[0]?.update;
  },
};

async function within<T>(work: Promise<T>, empty: T, what: string, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      log.info({ what, ms }, 'Welcome back: too slow, going without');
      resolve(empty);
    }, ms);
  });
  const read = work.catch((error: unknown) => {
    log.warn({ what, error: String(error) }, 'Welcome back: not loaded');
    return empty;
  });
  return Promise.race([read, late]).finally(() => clearTimeout(timer));
}

/**
 * The material for a welcome back, or undefined when this call isn't one (flag
 * off, no caller, or under WELCOME_BACK_MIN_DAYS). Never throws; a slow or
 * failed source leaves that part out, and the no-gap rule still applies.
 */
export async function loadWelcomeBack(
  userId: string | undefined,
  personaId: string,
  history: { daysSince?: number } | undefined,
  opts: {
    env?: Record<string, string | undefined>;
    sources?: WelcomeBackSources;
    waitMs?: number;
  } = {}
): Promise<WelcomeBackMaterial | undefined> {
  if (!welcomeBackEnabled(opts.env) || !isWelcomeBack(history)) return undefined;
  if (!userId || userId === 'anonymous') return undefined;
  const sources = opts.sources ?? welcomeBackSources;
  const ms = opts.waitMs ?? WAIT_MS;
  const [followUps, lifeUpdate] = await Promise.all([
    within(sources.followUps(userId), [] as string[], 'follow-ups', ms),
    within(sources.lifeUpdate(userId, personaId), undefined, 'life update', ms),
  ]);
  return { followUps, ...(lifeUpdate?.trim() ? { lifeUpdate: lifeUpdate.trim() } : {}) };
}

export interface WelcomeBackPlan {
  /** Appended to the greeting direction. */
  direction: string;
  thread?: string;
  lifeUpdate?: string;
  /** Every thread was sensitive: last time's topic stays out too. */
  heldBack?: true;
}

/**
 * What the greeting adds for a welcome back, given what else it opens on. The
 * caller's check-in is the one thread when there is one; a pondered follow-up
 * takes the opening entirely, and welcome-back keeps only the no-gap rule.
 */
export function planWelcomeBack(
  material: WelcomeBackMaterial,
  opening: { checkIn?: string; pondered?: string } = {}
): WelcomeBackPlan {
  if (opening.pondered) {
    log.info({ deferred: 'pondered' }, 'WELCOME_BACK');
    return { direction: NO_GAP_DIRECTION };
  }
  const thread = opening.checkIn
    ? undefined
    : material.followUps.find((t) => !isSensitiveThread(t));
  const heldBack = !opening.checkIn && !thread && material.followUps.length > 0;
  const { lifeUpdate } = material;
  const how =
    lifeUpdate && thread
      ? SHARE_AND_ASK_DIRECTION
      : lifeUpdate
        ? SHARE_DIRECTION
        : thread
          ? ASK_DIRECTION
          : '';
  log.info(
    {
      thread: Boolean(thread),
      checkIn: Boolean(opening.checkIn),
      lifeUpdate: Boolean(lifeUpdate),
      heldBack,
    },
    'WELCOME_BACK'
  );
  return {
    direction: NO_GAP_DIRECTION + how + (heldBack ? GENTLE_DIRECTION : ''),
    ...(thread ? { thread } : {}),
    ...(lifeUpdate ? { lifeUpdate } : {}),
    ...(heldBack ? { heldBack: true as const } : {}),
  };
}

/**
 * The greeting's facts for a welcome back: no "last time you talked", the one
 * thread in place of last time's topic, and no topic at all when every thread
 * was sensitive. Unchanged without a plan.
 */
export function welcomeBackFacts(
  facts: Record<string, string>,
  plan: WelcomeBackPlan | undefined
): Record<string, string> {
  if (!plan) return facts;
  const out = { ...facts };
  delete out['last time you talked'];
  if (plan.thread || plan.heldBack) delete out['what you talked about last time'];
  if (plan.thread) out[THREAD_FACT] = plan.thread.slice(0, 160);
  if (plan.lifeUpdate) out[UPDATE_FACT] = plan.lifeUpdate.slice(0, 160);
  return out;
}
