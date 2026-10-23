/**
 * The live senders honour a Focus hold (ENGAGEMENT-SPEC 3.3, F3) until the
 * send policy's decide() is wired: while the person's iOS Focus holds Ferni,
 * what Ferni starts on its own waits. Only for people with FOCUS_HOLD on.
 *
 * - Texts (guarded-text.ts): a check-in, follow-up, proactive text or morning
 *   brief is held in feature_held_texts until the hold's cap (held-texts.ts),
 *   one held copy per text. A reminder they timed waits only when they said
 *   reminders wait too. Anything else (a text they asked for, a code, a
 *   call result) goes.
 * - Release (held-texts.ts): the hold is read again before a held text goes;
 *   still held, it waits.
 * - Push: the caller says what started it (PushOrigin). A push nobody marks
 *   is never held, so nothing the person asked for is lost.
 *
 * The hold is read from the bogle_users doc the sender already has where it
 * can. Without a saved hold, or without the flag, nothing new is read.
 *
 * @module services/outreach/focus-send-hold
 */
import { createHash } from 'node:crypto';
import { personFlagOn } from '../../config/person-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { focusFromDoc, focusHold } from '../messaging/focus.js';
import type { PolicyCtx } from '../messaging/types.js';
import type { PushNotificationPayload } from '../push-notifications.js';
import type { TextKind } from './checkin-replies.js';
import type { GuardedText } from './guarded-text.js';
import type { HeldTextStore } from './held-texts.js';

const log = createLogger({ module: 'focus-send-hold' });

type Hold = NonNullable<PolicyCtx['focus']>;
type UserDoc = Record<string, unknown> | undefined;

/** Texts Ferni starts on its own: a Focus hold holds them. */
export const FERNI_STARTED_TEXTS: ReadonlySet<TextKind> = new Set<TextKind>([
  'checkin',
  'follow-up',
  'proactive',
  'morning-brief',
]);

/** What started a push: Ferni on its own, or a reminder the person timed. */
export type PushOrigin = 'ferni' | 'reminder';

/** FOCUS_HOLD for this person (their cohort or override, else the env); never throws. */
export type FocusFlag = (userId: string) => Promise<boolean>;
const focusFlag: FocusFlag = async (userId) => personFlagOn(userId, 'FOCUS_HOLD');

const textOrigin = (kind: TextKind): PushOrigin | undefined =>
  kind === 'reminder' ? 'reminder' : FERNI_STARTED_TEXTS.has(kind) ? 'ferni' : undefined;

/** True when `hold` holds something of `origin`: a reminder only when reminders wait too. */
function holds(hold: Hold | undefined, origin: PushOrigin | undefined): hold is Hold {
  if (!hold || !origin) return false;
  return origin === 'ferni' || !hold.remindersThrough;
}

/** The live hold saved on a bogle_users doc (messagingPrefs.focus), if any. */
export function focusInDoc(doc: UserDoc, now: Date): Hold | undefined {
  const prefs = doc?.messagingPrefs;
  const raw =
    typeof prefs === 'object' && prefs !== null ? (prefs as { focus?: unknown }).focus : undefined;
  return focusHold(focusFromDoc(raw), now);
}

/** One held copy per text: a sender that runs again while it's held rewrites the same doc. */
export const focusHeldId = (t: GuardedText): string =>
  `focus-${createHash('sha256').update(`${t.userId}|${t.kind}|${t.refId}`).digest('hex').slice(0, 32)}`;

/** What guarded-text.ts lends the hold: where held texts go, and the flag. */
export interface FocusTextDeps {
  held?: HeldTextStore;
  flagOn?: FocusFlag;
}

/**
 * Holds `t` until the hold's cap when a Focus hold holds its kind. Read from
 * `doc`, the one the sender already has, so a person with no saved hold costs
 * nothing; the flag is read only when there is one. True when held.
 */
export async function holdTextForFocus(
  t: GuardedText,
  doc: UserDoc,
  now: Date,
  deps: FocusTextDeps = {}
): Promise<boolean> {
  const hold = focusInDoc(doc, now);
  if (!holds(hold, textOrigin(t.kind)) || !(await (deps.flagOn ?? focusFlag)(t.userId)))
    return false;
  const { holdText, firestoreHeldTexts } = await import('./held-texts.js');
  await holdText(t, hold.capUntil, 'focus', deps.held ?? firestoreHeldTexts, focusHeldId(t));
  return true;
}

/**
 * Before a held text goes: is it still held? No read for a kind a hold can't
 * hold, nor (beyond the cached flag) for a person without FOCUS_HOLD. An
 * unreadable doc counts as no hold: the send re-reads it anyway.
 */
export async function stillFocusHeld(
  t: GuardedText,
  reader: { userDoc: (userId: string) => Promise<UserDoc> },
  now: Date,
  deps: FocusTextDeps = {}
): Promise<boolean> {
  const origin = textOrigin(t.kind);
  if (!origin || t.userId.startsWith('sponsored_')) return false;
  if (!(await (deps.flagOn ?? focusFlag)(t.userId))) return false;
  const doc = await reader.userDoc(t.userId).catch((error: unknown) => {
    log.warn({ kind: t.kind, refId: t.refId, error: String(error) }, 'Focus unreadable at release');
    return undefined;
  });
  return holds(focusInDoc(doc, now), origin);
}

/** A push about a reminder (data.kind 'reminder') follows the reminder rule; any other note is Ferni's. */
export const pushOriginOf = (payload: PushNotificationPayload): PushOrigin =>
  payload.data?.kind === 'reminder' ? 'reminder' : 'ferni';

export interface FocusPushDeps {
  flagOn: FocusFlag;
  userDoc: (userId: string) => Promise<UserDoc>;
  now: () => Date;
  send: (userId: string, payload: PushNotificationPayload) => Promise<boolean>;
}

const pushDeps = (): FocusPushDeps => ({
  flagOn: focusFlag,
  userDoc: async (userId) =>
    (await import('./guarded-text-store.js')).firestoreTextStore.userDoc(userId),
  now: () => new Date(),
  send: async (userId, payload) =>
    (await import('../push-notifications.js'))
      .getPushNotificationsService()
      .sendNotification(userId, payload),
});

/**
 * Sends a push (web and iPhone, push-notifications.ts) unless a Focus hold
 * holds its origin; false, not sent, when held. Reads the flag (cached), and
 * their doc only with it on. An unreadable doc: sent, since the hold isn't known.
 */
export async function pushUnlessFocusHeld(
  userId: string,
  payload: PushNotificationPayload,
  origin: PushOrigin,
  deps: FocusPushDeps = pushDeps()
): Promise<boolean> {
  if (!userId.startsWith('sponsored_') && (await deps.flagOn(userId))) {
    const doc = await deps.userDoc(userId).catch((error: unknown) => {
      log.warn({ origin, error: String(error) }, 'Focus unreadable for a push');
      return undefined;
    });
    const hold = focusInDoc(doc, deps.now());
    if (holds(hold, origin)) {
      log.info({ origin, type: payload.type, until: hold.capUntil }, 'Push held for a Focus');
      return false;
    }
  }
  return deps.send(userId, payload);
}
