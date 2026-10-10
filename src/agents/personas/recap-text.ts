/**
 * The recap text: after a call that settled something, one short SMS to the
 * user's own verified phone, in Ferni's voice. "From our call: You'll call the
 * landlord tomorrow (555-0134)." RECAP_TEXT=on (off by default), and only for
 * a user who opted in.
 *
 * What was settled comes from the call's own wrap-up reading (wrap-up.ts),
 * made during the call: no new model pass, and the wording is a template, so
 * nothing the caller quoted from someone else is sent. No text after a call
 * with hard news or a crisis turn, or where nothing was decided. The number is
 * the one on the user's Firebase account, which only phone verification sets
 * (#675), never a number heard on the call. Late at night in the user's
 * timezone the text waits for the morning.
 *
 * Runs after the call (an after-call task, after-call-register.ts), never on
 * the live path.
 *
 * @module agents/personas/recap-text
 */

import { createLogger } from '../../utils/safe-logger.js';
import { takeReading, type Decided } from './wrap-up.js';

const log = createLogger({ module: 'RecapText' });

type Env = Record<string, string | undefined>;

export function recapTextEnabled(env: Env = process.env): boolean {
  return env.RECAP_TEXT === 'on';
}

/** Quiet hours, local time: a text due from 9pm until 8am waits until 8am. */
export const QUIET_FROM_HOUR = 21;
export const QUIET_UNTIL_HOUR = 8;

const MAX_CHARS = 320;

/** Said on the call's day, past by the next morning. */
const SAME_DAY = /\b(?:today|tonight|this (?:morning|afternoon|evening))\b/i;

function phrase(i: Decided, nextDay: boolean): string {
  const when = i.when ? ` ${nextDay ? i.when.replace(/\btomorrow\b/gi, 'today') : i.when}` : '';
  const detail = i.detail ? ` (${i.detail})` : '';
  return `${i.what}${when}${detail}`;
}

/**
 * The text, or null when the call settled nothing for them to do. Two short
 * lines. `nextDay`: it goes out the morning after a late call, so "tomorrow" is
 * today and plans for that night are past.
 *
 * Ferni's own promises ("I'll check in Thursday") stay out until they are
 * recorded with the promise keeper (docs/plans/2026-10-10-call-commitments.md,
 * part 2): a written promise that nothing keeps is a false one.
 */
export function composeRecap(items: readonly Decided[], nextDay = false): string | null {
  const theirs = items
    .filter((i) => i.who === 'caller' && !(nextDay && SAME_DAY.test(i.when ?? '')))
    .map((i) => phrase(i, nextDay));
  if (!theirs.length) return null;
  const opener = nextDay ? 'From our call last night:' : 'From our call:';
  const text = `${opener}\nYou'll ${theirs.join(', and ')}.`;
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 3)}...` : text;
}

/** The day, hour and minute at `at` in `timezone` (UTC when unknown or invalid). */
function localTime(
  at: Date,
  timezone: string | undefined
): { day: string; hour: number; minute: number } {
  const read = (tz: string): { day: string; hour: number; minute: number } => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(at);
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0';
    return {
      day: `${get('year')}-${get('month')}-${get('day')}`,
      hour: Number(get('hour')),
      minute: Number(get('minute')),
    };
  };
  try {
    return read(timezone || 'UTC');
  } catch {
    return read('UTC');
  }
}

/** When to send: now, or 8am local when it's quiet hours where they are. */
export function sendTimeFor(now: Date, timezone: string | undefined): Date {
  const { hour, minute } = localTime(now, timezone);
  const quiet = hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
  if (!quiet) return now;
  const hoursToGo = (QUIET_UNTIL_HOUR - hour + 24) % 24;
  return new Date(now.getTime() + (hoursToGo * 60 - minute) * 60_000);
}

export interface RecapDeps {
  /** Whether the user turned the recap text on (default false). */
  optedIn: (userId: string) => Promise<boolean>;
  /** The verified phone on the user's account (E.164), or null. */
  verifiedPhone: (userId: string) => Promise<string | null>;
  /** Send now. */
  send: (userId: string, to: string, text: string) => Promise<void>;
  /** Send later, through a delivery that outlives this process. */
  queue: (userId: string, to: string, text: string, at: Date) => Promise<void>;
  now?: () => Date;
}

export type RecapOutcome =
  | 'off'
  | 'nothing_decided'
  | 'heavy_call'
  | 'not_opted_in'
  | 'no_verified_phone'
  | 'sent'
  | 'queued'
  | 'failed';

/** After a call: send (or queue) the recap text, or say why not. Never throws. */
export async function runRecapText(
  call: { userId: string; sessionId: string; timezone?: string },
  deps: RecapDeps,
  env: Env = process.env
): Promise<RecapOutcome> {
  const outcome = await decide(call, deps, env).catch((error: unknown) => {
    log.warn({ sessionId: call.sessionId, error: String(error) }, 'recap text failed');
    return 'failed' as const;
  });
  log.info({ sessionId: call.sessionId, outcome }, 'RECAP_TEXT');
  return outcome;
}

async function decide(
  call: { userId: string; sessionId: string; timezone?: string },
  deps: RecapDeps,
  env: Env
): Promise<RecapOutcome> {
  if (!recapTextEnabled(env)) return 'off';
  const reading = takeReading(call.sessionId);
  if (!reading) return 'nothing_decided';
  if (reading.heavy) return 'heavy_call';
  const text = composeRecap(reading.items);
  if (!text) return 'nothing_decided';
  if (!(await deps.optedIn(call.userId))) return 'not_opted_in';
  const phone = await deps.verifiedPhone(call.userId);
  if (!phone) return 'no_verified_phone';
  const now = deps.now?.() ?? new Date();
  const at = sendTimeFor(now, call.timezone);
  if (at.getTime() <= now.getTime()) {
    await deps.send(call.userId, phone, text);
    return 'sent';
  }
  const nextDay = localTime(at, call.timezone).day !== localTime(now, call.timezone).day;
  const morning = composeRecap(reading.items, nextDay);
  if (!morning) return 'nothing_decided';
  await deps.queue(call.userId, phone, morning, at);
  return 'queued';
}

/** The opt-in: bogle_users/{uid}/preferences/recap_text { optIn: true }. Absent means no. */
export const RECAP_OPT_IN_DOC = 'recap_text';

/**
 * The live dependencies. The opt-in is the user's preference doc; the phone is
 * the one on their Firebase account (set only by phone verification). Now:
 * Twilio through communication-service's sendSMS. Later: a pending reminder
 * doc, which the reminder delivery job (Cloud Scheduler, every minute) sends
 * through the same Twilio path, or to the app when it can't text.
 */
export function liveRecapDeps(): RecapDeps {
  type Db = ReturnType<
    (typeof import('../../services/superhuman/firestore-utils.js'))['getFirestoreDb']
  >;
  const db = async (): Promise<Db> =>
    (await import('../../services/superhuman/firestore-utils.js')).getFirestoreDb();
  return {
    optedIn: async (userId) => {
      const doc = await (
        await db()
      )
        ?.collection('bogle_users')
        .doc(userId)
        .collection('preferences')
        .doc(RECAP_OPT_IN_DOC)
        .get();
      return doc?.data()?.optIn === true;
    },
    verifiedPhone: async (userId) => {
      const { getFirebaseUser } = await import('../../services/identity/firebase-auth.js');
      return (await getFirebaseUser(userId))?.phoneNumber ?? null;
    },
    send: async (_userId, to, text) => {
      const { sendSMS } = await import('../../services/communication-service.js');
      await sendSMS(to, text);
    },
    queue: async (userId, to, text, at) => {
      const store = await db();
      if (!store) throw new Error('Firestore unavailable: recap not queued');
      const now = new Date().toISOString();
      await store.collection('bogle_users').doc(userId).collection('reminders').add({
        userId,
        message: text,
        scheduledFor: at.toISOString(),
        deliveryMethod: 'sms',
        deliveryAddress: to,
        status: 'pending',
        attempts: 0,
        createdAt: now,
        createdBy: 'ferni',
        personaId: 'ferni',
        kind: 'recap_text',
      });
    },
  };
}
