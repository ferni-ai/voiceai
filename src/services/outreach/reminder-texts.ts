/**
 * The guarded sender for every reminder text: deliverReminder hands each one here
 * (scheduling/reminder-text-guard.ts), whatever the flags say, and delivers it in
 * the app unless this says 'sent':
 *
 * - to the owner's own verified number (also for a reminder kept for their app,
 *   `voice:<uid>`, once texts are on for them): sendGuardedText, so STOP and texts
 *   turned off apply. One due in the owner's quiet hours (21:00 to 08:00 in the
 *   reminder's zone) is held and texted at 08:00 (Seth, 2026-10-17); one inside
 *   the guard's gap after another reminder text waits out the gap;
 * - stored as the owner's verified phone ('verified-own') but no longer matching
 *   it (they changed or removed their number): never texted;
 * - to anyone else (a reminder the caller said yes to): sendOnBehalfText, so
 *   STOP, quiet hours and the 10-minute gap apply; held in the app unless
 *   SCHEDULED_OUTREACH_THIRD_PARTY is on, like any later send to someone else.
 *
 * Installed per process by installReminderTexts: the job route, and startup
 * when the in-process scheduler runs.
 *
 * @module services/outreach/reminder-texts
 */

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isValidTimeZone, wallTimeIn, zonedWallTimeToUtc } from '../../utils/time-zone.js';
import { isQuietHour } from '../follow-through/index.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { extendReminderPromise } from '../superhuman/semantic-intelligence/promise-keeper.js';
import type { ScheduledReminder } from '../scheduling/reminder-scheduler.js';
import {
  installReminderTextGuard,
  type GuardedTextOutcome,
} from '../scheduling/reminder-text-guard.js';
import { toE164 } from './checkin-replies.js';
import {
  defaultTextDeps,
  resolveCheckinPhone,
  sendGuardedText,
  sendOnBehalfText,
  type TextDeps,
} from './guarded-text.js';

const log = createLogger({ module: 'reminder-texts' });

/** Two reminder texts within a minute: the second goes to the app, so a loop can't spam. */
export const REMINDER_TEXT_GAP_MS = 60 * 1000;

/** The text, the way a friend would put it. No em dashes or ellipses. */
export function reminderText(r: ScheduledReminder): string {
  if (r.sourceIdentityName) {
    return `It's Ferni. ${r.sourceIdentityName} wanted me to remind you: ${r.message}`;
  }
  return `It's Ferni. You asked me to remind you: ${r.message}`;
}

export interface ReminderTextDeps {
  text: TextDeps;
  sendOwn: typeof sendGuardedText;
  sendOther: typeof sendOnBehalfText;
}

const defaultDeps = (): ReminderTextDeps => ({
  text: defaultTextDeps(),
  sendOwn: sendGuardedText,
  sendOther: sendOnBehalfText,
});

/** follow-through's quiet window ends at 08:00 (right-moment.ts QUIET_END_HOUR). */
const QUIET_END_HOUR = 8;

/** When the quiet hours `now` falls in end (08:00 that day or the next), or null outside them. */
export function quietHoursEnd(now: Date, zone: string): Date | null {
  if (!isValidTimeZone(zone) || !isQuietHour(now, zone)) return null;
  const w = wallTimeIn(now, zone);
  const day = new Date(Date.UTC(w.year, w.month - 1, w.day + (w.hour >= QUIET_END_HOUR ? 1 : 0)));
  const wall = { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() };
  return zonedWallTimeToUtc({ ...wall, hour: QUIET_END_HOUR, minute: 0 }, zone);
}

/**
 * Saves a held reminder at its new time ('pending' again, so the job picks it up
 * then) and moves its promise with it, so the sweep doesn't call it missed.
 * Unsaved, it goes to the app now rather than being lost.
 */
async function holdUntil(r: ScheduledReminder, until: Date): Promise<GuardedTextOutcome> {
  try {
    const at = until.toISOString();
    await getFirestoreDb()
      ?.collection('bogle_users')
      .doc(r.userId)
      .collection('reminders')
      .doc(r.id)
      .update({ status: 'pending', scheduledFor: at, heldUntil: at });
    await extendReminderPromise(r.userId, r.id, until);
    return { holdUntil: until };
  } catch (error) {
    log.error({ error: String(error), reminderId: r.id }, 'Could not hold the reminder text');
    return 'in-app';
  }
}

const held = (r: ScheduledReminder, reason: string): GuardedTextOutcome => {
  log.info({ reminderId: r.id, reason }, 'Reminder text held; delivering in app');
  return 'in-app';
};

/** Sends one reminder text through the guarded senders, or says to deliver it in the app. */
export async function guardReminderText(
  r: ScheduledReminder,
  deps: ReminderTextDeps = defaultDeps()
): Promise<GuardedTextOutcome> {
  const userDoc = await deps.text.store.userDoc(r.userId);
  const own = await resolveCheckinPhone(r.userId, userDoc, deps.text);
  // A reminder kept for the owner's app (voice:<uid>) is texted to their own verified number.
  const to =
    toE164(r.deliveryAddress) ?? (r.deliveryAddress === `voice:${r.userId}` ? own : undefined);
  if (!to) return held(r, 'not-a-phone');

  if (to === own) {
    const now = deps.text.now();
    const morning = quietHoursEnd(now, r.timezone);
    if (morning) return holdUntil(r, morning);
    const t = { userId: r.userId, body: reminderText(r), kind: 'reminder' as const };
    const outcome = await deps.sendOwn(
      { ...t, refId: r.id, minGapMs: REMINDER_TEXT_GAP_MS },
      deps.text
    );
    if (outcome.sent) return 'sent';
    // Several due at once (08:00 after quiet hours): spaced by the guard's gap, not dropped.
    if (outcome.reason === 'recently-sent') {
      return holdUntil(r, new Date(now.getTime() + REMINDER_TEXT_GAP_MS));
    }
    return held(r, outcome.reason);
  }
  // Stored as their verified phone, which it no longer is: never text the old number.
  if (r.addressSource === 'verified-own') return held(r, 'verified-phone-changed');
  // Reaching someone else later needs the same opt-in as scheduled outreach.
  if (!flagOn('SCHEDULED_OUTREACH_THIRD_PARTY', deps.text.env)) return held(r, 'third-party-off');

  const zone = isValidTimeZone(r.timezone) ? r.timezone : undefined;
  const body = reminderText(r);
  const outcome = await deps.sendOther(
    { senderUserId: r.userId, toPhone: to, body, refId: r.id, zone },
    deps.text
  );
  return outcome.sent ? 'sent' : held(r, outcome.reason);
}

/** Install the guarded sender in this process; deliverReminder uses it when REMINDER_SMS_DEFAULT is on. */
export function installReminderTexts(): void {
  installReminderTextGuard((r) => guardReminderText(r));
}
