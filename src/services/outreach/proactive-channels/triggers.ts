/**
 * What Ferni has a reason to reach out about right now, from what she already
 * tracks. Nothing here invents a reason: every trigger is something Ferni
 * said she'd do, or something the user said was coming up.
 *
 * - "I'll check in about the move" (a check_in promise): the next day, if
 *   they haven't talked since. Ferni otherwise keeps it only by asking in a
 *   conversation, so a user who doesn't call back gets a broken promise.
 *   With OPEN_PROMISE_TRIGGERS on it keys on the promise still being open
 *   instead: asking about it in a call settles it as kept (follow-through.ts),
 *   so one still open after a call is one Ferni didn't keep there. An active
 *   user has always talked since, so the old rule stood almost every promise
 *   down (specialist-beats plan, S12). It still waits JUST_TALKED_HOURS after a call.
 * - "Let me know how the interview goes" (a follow_up invitation): the
 *   evening after, "how did the interview go?".
 * - Either one that says she'd call ("I'll call you tomorrow") is a promised call.
 *
 * Read from bogle_users/{uid}/ferni_commitments (promise-keeper.ts). Missed
 * reminders, the user's own commitments and their world come from
 * more-triggers.ts.
 *
 * @module services/outreach/proactive-channels/triggers
 */

import { flagOn } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import {
  commitmentTriggers,
  reminderTriggers,
  worldTriggers,
  type WorldDueItem,
} from './more-triggers.js';
import { justTalked } from '../outreach-cadence.js';
import type { ProactiveTrigger } from './types.js';

const log = createLogger({ module: 'ProactiveTriggers' });

const HOUR_MS = 60 * 60 * 1000;
/** Reach out the next day, not the same evening Ferni said it. */
const NEXT_DAY_MS = 18 * HOUR_MS;
/** A follow-up waits for the evening, user's time. */
const EVENING_HOUR = 17;
/** "How did it go?" stops making sense after a few days. */
const FOLLOW_UP_TTL_MS = 3 * 24 * HOUR_MS;
/** Older promises were made before this pipeline existed; leave them to the sweep. */
const MAX_AGE_MS = 14 * 24 * HOUR_MS;

const PROMISED_CALL = /\b(call|ring|phone) you\b/i;

interface StoredPromise {
  id: string;
  type?: string;
  commitment?: string;
  relatedTopic?: string;
  madeAt?: unknown;
  dueBy?: unknown;
  outcome?: string;
}

function toMs(value: unknown): number | undefined {
  const raw = (value as { toDate?: () => Date })?.toDate?.() ?? value;
  if (raw === undefined || raw === null) return undefined;
  const t = new Date(raw as string | number | Date).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/** A short topic fit for a text, or undefined when there isn't one. */
function topicOf(p: StoredPromise): string | undefined {
  const t = p.relatedTopic?.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 80) return undefined;
  return t.replace(/[.!?]+$/, '');
}

export interface TriggerContext {
  now: Date;
  /** User's local hour (0-23). */
  localHour: number;
  /** When they last talked with Ferni (ms), if ever. */
  lastTalkedAt?: number;
  /** What comes due today in their world (temporal world model), if loaded. */
  worldDue?: WorldDueItem[];
}

/**
 * Why a promise's check-in waits for now. Off: they've talked since it was made. On
 * (OPEN_PROMISE_TRIGGERS): only that they just talked, since an open promise is unkept.
 */
function waitsOnTalk(madeAt: number, ctx: TriggerContext): boolean {
  if (flagOn('OPEN_PROMISE_TRIGGERS')) return justTalked(ctx.lastTalkedAt, ctx.now.getTime());
  // They've talked since: Ferni can ask in person (follow-through.ts).
  return ctx.lastTalkedAt !== undefined && ctx.lastTalkedAt > madeAt + HOUR_MS;
}

function checkInTrigger(
  p: StoredPromise,
  now: number,
  topic: string | undefined,
  promisedCall: boolean
): ProactiveTrigger | null {
  const dueBy = toMs(p.dueBy);
  if (dueBy !== undefined && now > dueBy) return null;
  return {
    sourceId: `promise:${p.id}`,
    promisedCall,
    kind: 'promise',
    weight: promisedCall ? 'meaningful' : 'light',
    timely: true,
    text: topic
      ? `Hey, it's Ferni. I said I'd check in about ${topic}. How's it going?`
      : `Hey, it's Ferni. I said I'd check in, so here I am. How are you doing?`,
    reason: topic ? `I said I'd check in about ${topic}` : `I said I'd check in`,
    expiresAt: dueBy === undefined ? undefined : new Date(dueBy),
  };
}

function followUpTrigger(
  p: StoredPromise,
  madeAt: number,
  ctx: TriggerContext,
  topic: string,
  promisedCall: boolean
): ProactiveTrigger | null {
  if (ctx.now.getTime() - madeAt > FOLLOW_UP_TTL_MS || ctx.localHour < EVENING_HOUR) return null;
  return {
    sourceId: `promise:${p.id}`,
    promisedCall,
    kind: 'follow_up',
    weight: promisedCall ? 'meaningful' : 'light',
    timely: true,
    text: `Hey, it's Ferni. How did ${topic} go?`,
    reason: `wanted to hear how ${topic} went`,
    expiresAt: new Date(madeAt + FOLLOW_UP_TTL_MS),
  };
}

/** One promise → a trigger, or null if it isn't time (or no longer time). */
export function triggerFromPromise(p: StoredPromise, ctx: TriggerContext): ProactiveTrigger | null {
  const now = ctx.now.getTime();
  const madeAt = toMs(p.madeAt);
  if (p.outcome !== 'open' || madeAt === undefined) return null;
  if (now - madeAt < NEXT_DAY_MS || now - madeAt > MAX_AGE_MS) return null;
  if (waitsOnTalk(madeAt, ctx)) return null;

  const topic = topicOf(p);
  const promisedCall = PROMISED_CALL.test(p.commitment ?? '');
  if (p.type === 'check_in') return checkInTrigger(p, now, topic, promisedCall);
  if (p.type === 'follow_up' && topic) return followUpTrigger(p, madeAt, ctx, topic, promisedCall);
  return null;
}

const KIND_ORDER: Array<ProactiveTrigger['kind']> = [
  'promise',
  'follow_up',
  'reminder',
  'world_due',
];
const rank = (t: ProactiveTrigger): number =>
  (t.weight === 'meaningful' ? 0 : 10) + KIND_ORDER.indexOf(t.kind);

async function promiseTriggers(userId: string, ctx: TriggerContext): Promise<ProactiveTrigger[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('ferni_commitments')
    .where('outcome', '==', 'open')
    .get();
  return snap.docs
    .map((d) => triggerFromPromise({ ...(d.data() as StoredPromise), id: d.id }, ctx))
    .filter((t): t is ProactiveTrigger => t !== null);
}

/** Everything Ferni has a reason to reach out about now, most pressing first. */
export async function collectTriggers(
  userId: string,
  ctx: TriggerContext
): Promise<ProactiveTrigger[]> {
  // One source failing (a missing index, a bad document) mustn't silence the rest.
  const safe = async (
    p: Promise<ProactiveTrigger[]>,
    source: string
  ): Promise<ProactiveTrigger[]> =>
    p.catch((error: unknown) => {
      log.warn({ error: String(error), userId, source }, 'Proactive trigger source failed');
      return [] as ProactiveTrigger[];
    });
  const sources = await Promise.all([
    safe(promiseTriggers(userId, ctx), 'promises'),
    safe(commitmentTriggers(userId, ctx.now), 'commitments'),
    safe(reminderTriggers(userId, ctx.now), 'reminders'),
  ]);
  return [...sources.flat(), ...worldTriggers(ctx.worldDue ?? [], ctx.now)].sort(
    (a, b) => rank(a) - rank(b)
  );
}
